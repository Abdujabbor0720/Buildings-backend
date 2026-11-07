import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import { DelayStatus, RiskLevel } from '../../common/constants/enums';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { tashkentToday, toDateKey } from '../../helpers/date.helpers';
import { AuditService } from '../audit/audit.service';
import { ObjectHealthService } from '../objects/object-health.service';
import type {
  CreateDelayDto,
  DelayQueryDto,
  ResolveDelayDto,
  UpdateDelayDto,
} from './dto/delay.dto';

export interface DelayReasonBreakdown {
  reasonId: string;
  code: string;
  name: string;
  color: string;
  icon: string | null;
  /** Nechta YOZUV (obyekt emas — bitta obyektda bir nechta sabab bo‘lishi mumkin). */
  count: number;
  percent: number;
  totalDelayDays: number;
  affectedObjects: number;
}

@Injectable()
export class DelaysService {
  constructor(
    @InjectRepository(ObjectDelay)
    private readonly delays: Repository<ObjectDelay>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly health: ObjectHealthService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: DelayQueryDto,
    user: AuthUser,
  ): Promise<PaginatedResult<ObjectDelay>> {
    const qb = this.delays
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.reason', 'reason')
      .leftJoinAndSelect('d.responsible', 'responsible')
      .innerJoinAndSelect('d.object', 'o')
      .leftJoinAndSelect('o.district', 'district')
      .leftJoinAndSelect('o.type', 'type')
      // ⚠️ OBYEKT MAS'ULI (kurator) — `objectResponsible` taxallusi
      // bilan. Bu yozuvning O'Z mas'ulidan BOSHQA odam bo'lishi
      // mumkin; taxalluslar chalkashsa, jadvalda obyekt kuratori
      // o'rniga boshqa shaxs chiqib qolardi.
      .leftJoinAndSelect('o.responsible', 'objectResponsible')
      .where('o.deleted_at IS NULL');

    this.applyScope(qb, user);

    if (query.objectId)
      qb.andWhere('d.object_id = :objectId', { objectId: query.objectId });
    if (query.districtId)
      qb.andWhere('o.district_id = :districtId', {
        districtId: query.districtId,
      });
    if (query.reasonId)
      qb.andWhere('d.reason_id = :reasonId', { reasonId: query.reasonId });
    if (query.responsibleId)
      qb.andWhere('d.responsible_id = :responsibleId', {
        responsibleId: query.responsibleId,
      });
    if (query.status?.length)
      qb.andWhere('d.status IN (:...status)', { status: query.status });
    if (query.severity?.length)
      qb.andWhere('d.severity IN (:...severity)', { severity: query.severity });
    if (query.minDelayDays !== undefined) {
      qb.andWhere('d.delay_days >= :minDelayDays', {
        minDelayDays: query.minDelayDays,
      });
    }
    if (query.search) {
      qb.andWhere('(o.name ILIKE :search OR d.description ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [items, total] = await qb
      .orderBy('d.delayDays', 'DESC')
      .addOrderBy('d.detectedAt', 'DESC')
      .addOrderBy('d.id', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<ObjectDelay> {
    const delay = await this.delays.findOne({
      where: { id },
      relations: {
        reason: true,
        responsible: true,
        object: { district: true, type: true, responsible: true },
      },
    });
    if (!delay) throw new NotFoundException('Kechikish yozuvi topilmadi');
    return delay;
  }

  async create(dto: CreateDelayDto, user: AuthUser): Promise<ObjectDelay> {
    const object = await this.objects.findOne({ where: { id: dto.objectId } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');

    // ⚠️ AYNI TAKROR rad etiladi: bitta obyektda bitta sabab bo‘yicha ikkita
    // OCHIQ yozuv bo‘lsa, «asosiy kechikish sabablari» diagrammasi shu
    // obyektni ikki marta sanab, foizlarni buzib yuborardi.
    const duplicate = await this.delays.findOne({
      where: {
        objectId: dto.objectId,
        reasonId: dto.reasonId,
        status: DelayStatus.OPEN,
      },
    });
    if (duplicate) {
      throw new BadRequestException(
        'Bu obyektda shu sabab bo‘yicha ochiq yozuv allaqachon bor — uni tahrirlang yoki yoping',
      );
    }

    const created = await this.dataSource.transaction(async (em) => {
      const delay = await em.save(
        em.create(ObjectDelay, {
          ...dto,
          severity: dto.severity ?? RiskLevel.MEDIUM,
          status: DelayStatus.OPEN,
          detectedAt: dto.detectedAt ?? toDateKey(tashkentToday())!,
        }),
      );
      // Obyektning `openDelayCount` va `primaryDelayReasonId` maydonlari
      // shu yerda yangilanadi — holat servisi yagona yozuvchi.
      await this.health.refreshOne(dto.objectId, em);
      return delay;
    });

    await this.audit.record({
      userId: user.id,
      action: 'delay.create',
      entity: 'ObjectDelay',
      entityId: created.id,
      changes: { objectId: { before: null, after: dto.objectId } },
    });

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdateDelayDto,
    user: AuthUser,
  ): Promise<ObjectDelay> {
    const delay = await this.delays.findOne({ where: { id } });
    if (!delay) throw new NotFoundException('Kechikish yozuvi topilmadi');

    await this.dataSource.transaction(async (em) => {
      await em.update(ObjectDelay, { id }, dto);
      await this.health.refreshOne(delay.objectId, em);
    });

    await this.audit.record({
      userId: user.id,
      action: 'delay.update',
      entity: 'ObjectDelay',
      entityId: id,
    });

    return this.findOne(id);
  }

  /** Muammoni YOPISH — izoh majburiy. */
  async resolve(
    id: string,
    dto: ResolveDelayDto,
    user: AuthUser,
  ): Promise<ObjectDelay> {
    const delay = await this.delays.findOne({ where: { id } });
    if (!delay) throw new NotFoundException('Kechikish yozuvi topilmadi');
    if (delay.status === DelayStatus.RESOLVED) {
      throw new BadRequestException('Bu yozuv allaqachon hal qilingan');
    }

    await this.dataSource.transaction(async (em) => {
      await em.update(
        ObjectDelay,
        { id },
        {
          status: DelayStatus.RESOLVED,
          resolvedAt: dto.resolvedAt ?? toDateKey(tashkentToday())!,
          // Hal qilish izohi mavjud matnga QO‘SHILADI — eski tavsif
          // o‘chirilsa, muammo nimada bo‘lgani yo‘qolardi.
          mitigationPlan: [
            delay.mitigationPlan,
            `Hal qilindi: ${dto.resolution}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      );
      await this.health.refreshOne(delay.objectId, em);
    });

    await this.audit.record({
      userId: user.id,
      action: 'delay.resolve',
      entity: 'ObjectDelay',
      entityId: id,
      changes: {
        status: { before: delay.status, after: DelayStatus.RESOLVED },
      },
    });

    return this.findOne(id);
  }

  async remove(id: string, user: AuthUser): Promise<{ message: string }> {
    const delay = await this.delays.findOne({ where: { id } });
    if (!delay) throw new NotFoundException('Kechikish yozuvi topilmadi');

    await this.dataSource.transaction(async (em) => {
      await em.softDelete(ObjectDelay, id);
      await this.health.refreshOne(delay.objectId, em);
    });

    await this.audit.record({
      userId: user.id,
      action: 'delay.delete',
      entity: 'ObjectDelay',
      entityId: id,
    });

    return { message: 'Kechikish yozuvi o‘chirildi' };
  }

  /**
   * «ASOSIY KECHIKISH SABABLARI» — dashboard diagrammasi.
   *
   * ⚠️ YOZUVLAR sanaladi, obyektlar emas: bitta obyekt bir vaqtda ham
   * moliyalashtirish, ham material sababidan kechikishi mumkin va ikkala
   * sabab ham ko‘rinishi kerak. Shu sababli yig‘indi obyektlar sonidan
   * katta bo‘lishi NORMAL.
   */
  async reasonBreakdown(
    regionId?: string,
    onlyOpen = true,
  ): Promise<DelayReasonBreakdown[]> {
    const qb = this.delays
      .createQueryBuilder('d')
      .innerJoin('d.reason', 'r')
      .innerJoin('d.object', 'o')
      .select('r.id', 'reasonId')
      .addSelect('r.code', 'code')
      .addSelect('r.name', 'name')
      .addSelect('r.color', 'color')
      .addSelect('r.icon', 'icon')
      .addSelect('COUNT(d.id)', 'count')
      .addSelect('COALESCE(SUM(d.delay_days), 0)', 'totalDelayDays')
      .addSelect('COUNT(DISTINCT d.object_id)', 'affectedObjects')
      .where('o.deleted_at IS NULL')
      .andWhere('d.deleted_at IS NULL')
      .groupBy('r.id')
      .addGroupBy('r.code')
      .addGroupBy('r.name')
      .addGroupBy('r.color')
      .addGroupBy('r.icon')
      .addGroupBy('r.sort_order')
      .orderBy('COUNT(d.id)', 'DESC')
      .addOrderBy('r.sort_order', 'ASC');

    if (onlyOpen)
      qb.andWhere('d.status != :resolved', { resolved: DelayStatus.RESOLVED });
    if (regionId) qb.andWhere('o.region_id = :regionId', { regionId });

    const rows = await qb.getRawMany<Record<string, string>>();
    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

    return rows.map((r) => ({
      reasonId: r.reasonId,
      code: r.code,
      name: r.name,
      color: r.color,
      icon: r.icon,
      count: Number(r.count),
      percent:
        total > 0 ? Number(((Number(r.count) / total) * 100).toFixed(1)) : 0,
      totalDelayDays: Number(r.totalDelayDays),
      affectedObjects: Number(r.affectedObjects),
    }));
  }

  private applyScope(
    qb: ReturnType<Repository<ObjectDelay>['createQueryBuilder']>,
    user: AuthUser,
  ): void {
    if (user.contractorId) {
      qb.andWhere('o.contractor_id = :scopeContractorId', {
        scopeContractorId: user.contractorId,
      });
      return;
    }
    if (user.districtId) {
      qb.andWhere('o.district_id = :scopeDistrictId', {
        scopeDistrictId: user.districtId,
      });
      return;
    }
    if (user.regionId)
      qb.andWhere('o.region_id = :scopeRegionId', {
        scopeRegionId: user.regionId,
      });
  }
}
