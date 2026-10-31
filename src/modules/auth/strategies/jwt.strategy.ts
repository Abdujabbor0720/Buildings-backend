import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { permissionsForRole } from '../../../common/constants/permissions';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  /**
   * ⚠️ Token'dagi ma’lumotga KO‘R-KO‘RONA ishonmaymiz: foydalanuvchi bazadan
   * qayta o‘qiladi. Aks holda bloklangan xodim token muddati tugaguncha
   * (30 daqiqa) tizimda ishlab yuraverardi, roli o‘zgargani esa umuman
   * e'tiborga olinmasdi.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findOne({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        firstName: true,
        lastName: true,
        regionId: true,
        districtId: true,
        contractorId: true,
      },
    });

    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi');
    if (!user.isActive)
      throw new UnauthorizedException('Foydalanuvchi hisobi faol emas');

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: permissionsForRole(user.role),
      regionId: user.regionId,
      districtId: user.districtId,
      contractorId: user.contractorId,
      fullName: [user.lastName, user.firstName].filter(Boolean).join(' '),
    };
  }
}
