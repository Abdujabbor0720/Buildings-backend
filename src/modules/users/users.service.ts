import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { User } from '../../database/entities/user.entity';
import { UserRole } from '../../common/constants/enums';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateUserDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto';

export interface ResponsibleSummary {
  user: User;
  objectCount: number;
  delayedCount: number;
  atRiskCount: number;
  avgProgress: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    private readonly audit: AuditService,
  ) {}

  async list(query: UserQueryDto): Promise<PaginatedResult<User>> {
    const qb = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.region', 'region')
      .leftJoinAndSelect('u.district', 'district')
      .leftJoinAndSelect('u.contractor', 'contractor');

    if (query.search) {
      qb.andWhere(
        '(u.first_name ILIKE :s OR u.last_name ILIKE :s OR u.email ILIKE :s OR u.position ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.role?.length)
      qb.andWhere('u.role IN (:...role)', { role: query.role });
    if (query.regionId)
      qb.andWhere('u.region_id = :regionId', { regionId: query.regionId });
    if (query.districtId)
      qb.andWhere('u.district_id = :districtId', {
        districtId: query.districtId,
      });
    if (query.contractorId)
      qb.andWhere('u.contractor_id = :contractorId', {
        contractorId: query.contractorId,
      });
    if (query.isActive !== undefined)
      qb.andWhere('u.is_active = :isActive', { isActive: query.isActive });
    if (query.onlyResponsible) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM construction_objects co WHERE co.responsible_id = u.id AND co.deleted_at IS NULL)',
      );
    }

    const [items, total] = await qb
      .orderBy('u.lastName', 'ASC')
      .addOrderBy('u.id', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id },
      relations: { region: true, district: true, contractor: true },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return user;
  }

  /**
   * «MAS’ULLAR» bo‘limi — har bir kurator va uning obyektlari kesimi.
   * ⚠️ Bitta so‘rov: har mas’ul uchun alohida `count()` yuborilsa N+1 bo‘lardi.
   */
  async responsibles(regionId?: string): Promise<ResponsibleSummary[]> {
    const qb = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.district', 'district')
      .leftJoin(
        ConstructionObject,
        'o',
        'o.responsible_id = u.id AND o.deleted_at IS NULL',
      )
      .addSelect('COUNT(o.id)', 'objectCount')
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = 'delayed')`,
        'delayedCount',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = 'at_risk')`,
        'atRiskCount',
      )
      .addSelect('COALESCE(ROUND(AVG(o.progress_percent)), 0)', 'avgProgress')
      .where('u.is_active = true')
      .groupBy('u.id')
      .addGroupBy('district.id')
      .having('COUNT(o.id) > 0')
      .orderBy('COUNT(o.id)', 'DESC');

    if (regionId)
      qb.andWhere('(u.region_id = :regionId OR u.region_id IS NULL)', {
        regionId,
      });

    const { entities, raw } =
      await qb.getRawAndEntities<Record<string, string>>();
    return entities.map((user, i) => ({
      user,
      objectCount: Number(raw[i]?.objectCount ?? 0),
      delayedCount: Number(raw[i]?.delayedCount ?? 0),
      atRiskCount: Number(raw[i]?.atRiskCount ?? 0),
      avgProgress: Number(raw[i]?.avgProgress ?? 0),
    }));
  }

  async create(dto: CreateUserDto, actor: AuthUser): Promise<User> {
    if (await this.users.findOne({ where: { email: dto.email } })) {
      throw new ConflictException(
        `«${dto.email}» email allaqachon ro‘yxatdan o‘tgan`,
      );
    }
    this.assertScopeConsistent(dto);

    const { password, ...rest } = dto;
    const user = await this.users.save(
      this.users.create({
        ...rest,
        passwordHash: await AuthService.hashPassword(password),
      }),
    );

    await this.audit.record({
      userId: actor.id,
      action: 'user.create',
      entity: 'User',
      entityId: user.id,
      changes: {
        email: { before: null, after: user.email },
        role: { before: null, after: user.role },
      },
    });

    return this.findOne(user.id);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    if (dto.email && dto.email !== user.email) {
      if (
        await this.users.findOne({ where: { email: dto.email, id: Not(id) } })
      ) {
        throw new ConflictException(`«${dto.email}» email allaqachon band`);
      }
    }
    this.assertScopeConsistent({ ...user, ...dto });

    // ⚠️ Oxirgi super-adminni o‘chirib / rolini tushirib bo‘lmaydi: aks holda
    // tizimga hech kim kira olmay qoladigan holat yuzaga kelardi.
    if (
      user.role === UserRole.SUPER_ADMIN &&
      dto.role &&
      dto.role !== UserRole.SUPER_ADMIN
    ) {
      await this.assertNotLastSuperAdmin(id);
    }
    if (user.role === UserRole.SUPER_ADMIN && dto.isActive === false) {
      await this.assertNotLastSuperAdmin(id);
    }

    await this.users.update(id, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'user.update',
      entity: 'User',
      entityId: id,
    });

    return this.findOne(id);
  }

  async resetPassword(
    id: string,
    newPassword: string,
    actor: AuthUser,
  ): Promise<{ message: string }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    await this.users.update(id, {
      passwordHash: await AuthService.hashPassword(newPassword),
    });
    await this.audit.record({
      userId: actor.id,
      action: 'user.reset-password',
      entity: 'User',
      entityId: id,
    });

    return { message: `${user.fullName} uchun parol yangilandi` };
  }

  async deactivate(id: string, actor: AuthUser): Promise<{ message: string }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (user.role === UserRole.SUPER_ADMIN)
      await this.assertNotLastSuperAdmin(id);

    const openObjects = await this.objects.count({
      where: { responsibleId: id },
    });
    if (openObjects > 0) {
      throw new BadRequestException(
        `Bu xodim ${openObjects} ta obyektga mas’ul etib biriktirilgan. Avval boshqa mas’ul tayinlang.`,
      );
    }

    await this.users.update(id, { isActive: false });
    await this.audit.record({
      userId: actor.id,
      action: 'user.deactivate',
      entity: 'User',
      entityId: id,
    });

    return { message: `${user.fullName} faolsizlantirildi` };
  }

  /** Rol bilan ko‘rish doirasi mos kelishi SHART. */
  private assertScopeConsistent(dto: {
    role?: UserRole;
    districtId?: string | null;
    contractorId?: string | null;
  }): void {
    if (dto.role === UserRole.CONTRACTOR && !dto.contractorId) {
      throw new BadRequestException(
        'Pudratchi roli uchun pudratchi tashkilot tanlanishi shart',
      );
    }
    if (dto.role !== UserRole.CONTRACTOR && dto.contractorId) {
      throw new BadRequestException(
        'Pudratchi tashkiloti faqat «Pudratchi» roli uchun belgilanadi',
      );
    }
    if (dto.role === UserRole.DISTRICT_ADMIN && !dto.districtId) {
      throw new BadRequestException(
        'Tuman admini uchun tuman tanlanishi shart',
      );
    }
  }

  private async assertNotLastSuperAdmin(excludeId: string): Promise<void> {
    const others = await this.users.count({
      where: { role: UserRole.SUPER_ADMIN, isActive: true, id: Not(excludeId) },
    });
    if (others === 0) {
      throw new BadRequestException(
        'Tizimda kamida bitta faol super-admin qolishi kerak — avval boshqasini tayinlang',
      );
    }
  }
}
