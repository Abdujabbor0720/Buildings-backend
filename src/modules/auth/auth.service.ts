import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, LessThan, Repository } from 'typeorm';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { User } from '../../database/entities/user.entity';
import { permissionsForRole } from '../../common/constants/permissions';
import { fullName, shortName } from '../../helpers/person-name.helpers';
import type {
  AuthResponseDto,
  AuthTokensDto,
  AuthUserDto,
} from './dto/auth-response.dto';
import type { JwtPayload } from './jwt-payload.interface';

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** Parol xeshlash narxi. 12 — 2026-yil uchun oqilona muvozanat (~250ms). */
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return hash(plain, BCRYPT_ROUNDS);
  }

  /** Refresh token bazada OCHIQ saqlanmaydi — faqat SHA-256 izi. */
  private static fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async login(
    email: string,
    password: string,
    ctx: RequestContext,
  ): Promise<AuthResponseDto> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();

    // ⚠️ «Email topilmadi» va «parol xato» AYNI xabar bilan qaytadi:
    // farqlansa, tizimda qaysi email borligini tashqaridan aniqlab bo‘lardi.
    const invalid = new UnauthorizedException('Email yoki parol noto‘g‘ri');
    if (!user) {
      // Vaqt bo‘yicha hujumni (timing attack) yopish uchun baribir xeshlaymiz.
      await compare(
        password,
        '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv',
      );
      throw invalid;
    }
    if (!(await compare(password, user.passwordHash))) throw invalid;
    if (!user.isActive)
      throw new UnauthorizedException(
        'Hisobingiz faol emas, administratorga murojaat qiling',
      );

    await this.users.update(user.id, { lastLoginAt: new Date() });
    this.logger.log(`Tizimga kirdi: ${user.email} (${user.role})`);

    const tokens = await this.issueTokens(user, ctx);
    return { user: AuthService.toAuthUser(user), tokens };
  }

  async refresh(
    refreshToken: string,
    ctx: RequestContext,
  ): Promise<AuthResponseDto> {
    const record = await this.tokens.findOne({
      where: {
        tokenHash: AuthService.fingerprint(refreshToken),
        revokedAt: IsNull(),
      },
      relations: { user: true },
    });

    if (!record) throw new UnauthorizedException('Refresh token yaroqsiz');
    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'Refresh token muddati tugagan, qaytadan kiring',
      );
    }
    if (!record.user?.isActive)
      throw new UnauthorizedException('Foydalanuvchi faol emas');

    // ROTATSIYA: eski token darhol bekor qilinadi. O‘g‘irlangan token bir
    // marta ishlatilsa, haqiqiy foydalanuvchi keyingi so‘rovda chiqib ketadi
    // va o‘g‘irlanganlik fakti ko‘rinadi.
    await this.tokens.update(record.id, { revokedAt: new Date() });

    const tokens = await this.issueTokens(record.user, ctx);
    return { user: AuthService.toAuthUser(record.user), tokens };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.tokens.update(
      { tokenHash: AuthService.fingerprint(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return { message: 'Tizimdan chiqildi' };
  }

  /** Barcha qurilmalardan chiqish. */
  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.tokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return { message: 'Barcha qurilmalardan chiqildi' };
  }

  async changePassword(
    userId: string,
    current: string,
    next: string,
  ): Promise<{ message: string }> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :userId', { userId })
      .getOne();

    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi');
    if (!(await compare(current, user.passwordHash))) {
      throw new BadRequestException('Joriy parol noto‘g‘ri');
    }
    if (await compare(next, user.passwordHash)) {
      throw new BadRequestException('Yangi parol eskisidan farq qilishi kerak');
    }

    await this.users.update(userId, {
      passwordHash: await AuthService.hashPassword(next),
    });
    // Parol o‘zgargach barcha sessiyalar yopiladi — bu parol almashtirishning
    // asosiy MAQSADI (o‘g‘rini chiqarib yuborish).
    await this.logoutAll(userId);

    return {
      message: 'Parol muvaffaqiyatli o‘zgartirildi. Qaytadan tizimga kiring.',
    };
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi');
    return AuthService.toAuthUser(user);
  }

  /** Muddati o‘tgan tokenlarni tozalash (cron chaqiradi). */
  async purgeExpiredTokens(): Promise<number> {
    const result = await this.tokens.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }

  private async issueTokens(
    user: User,
    ctx: RequestContext,
  ): Promise<AuthTokensDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      regionId: user.regionId,
      districtId: user.districtId,
      contractorId: user.contractorId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      // `expiresIn` ning tipi `ms` kutubxonasining shablon-literal birlashmasi
      // (`"30m"`, `"7d"`...). Qiymat .env dan keladi va Joi uni allaqachon
      // tekshirgan, shuning uchun bu yerda aniq cast qilinadi.
      expiresIn: this.config.getOrThrow<string>(
        'jwt.accessTtl',
      ) as JwtSignOptions['expiresIn'],
    });

    const refreshToken = randomBytes(48).toString('hex');
    const ttlDays = parseTtlDays(
      this.config.getOrThrow<string>('jwt.refreshTtl'),
    );
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

    await this.tokens.insert({
      tokenHash: AuthService.fingerprint(refreshToken),
      userId: user.id,
      expiresAt,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
      ipAddress: ctx.ip?.slice(0, 60) ?? null,
    });

    const decoded = this.jwt.decode<{ exp: number }>(accessToken);
    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    };
  }

  static toAuthUser(user: User): AuthUserDto {
    // ⚠️ Shakl `person-name.helpers.ts` dan — bu yerda qaytadan
    // yozilmaydi (`user.entity.ts` dagi izohga qarang).
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: fullName(user),
      shortName: shortName(user),
      position: user.position,
      avatarUrl: user.avatarUrl,
      role: user.role,
      permissions: permissionsForRole(user.role),
      regionId: user.regionId,
      districtId: user.districtId,
      contractorId: user.contractorId,
    };
  }
}

/** `30d` / `12h` / `45m` → kunlarda. */
function parseTtlDays(ttl: string): number {
  const match = /^(\d+)\s*([dhm])$/i.exec(ttl.trim());
  if (!match) return 30;
  const value = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case 'd':
      return value;
    case 'h':
      return value / 24;
    case 'm':
      return value / 1440;
    default:
      return 30;
  }
}
