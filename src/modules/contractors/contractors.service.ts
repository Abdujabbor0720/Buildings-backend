import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { Contractor } from '../../database/entities/contractor.entity';
import {
  ContractorStatus,
  ObjectHealth,
  ObjectStatus,
} from '../../common/constants/enums';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import type {
  ContractorQueryDto,
  CreateContractorDto,
  UpdateContractorDto,
} from './dto/contractor.dto';

export interface ContractorStats {
  totalObjects: number;
  activeObjects: number;
  completedObjects: number;
  delayedObjects: number;
  atRiskObjects: number;
  onTimeCompleted: number;
  avgProgress: number;
  avgDelayDays: number;
  totalContractValue: string;
}

@Injectable()
export class ContractorsService {
  constructor(
    @InjectRepository(Contractor)
    private readonly contractors: Repository<Contractor>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    private readonly audit: AuditService,
  ) {}

  async list(query: ContractorQueryDto): Promise<PaginatedResult<Contractor>> {
    const qb = this.contractors
      .createQueryBuilder('c')
      .loadRelationCountAndMap('c.objectCount', 'c.objects');

    if (query.search) {
      qb.andWhere(
        '(c.name ILIKE :s OR c.inn ILIKE :s OR c.director ILIKE :s)',
        {
          s: `%${query.search}%`,
        },
      );
    }
    if (query.status?.length)
      qb.andWhere('c.status IN (:...status)', { status: query.status });
    if (query.minRating !== undefined)
      qb.andWhere('c.rating >= :minRating', { minRating: query.minRating });

    const sortable: Record<string, string> = {
      name: 'c.name',
      rating: 'c.rating',
      createdAt: 'c.createdAt',
    };
    const [items, total] = await qb
      .orderBy(sortable[query.sortBy ?? ''] ?? 'c.rating', query.sortOrder)
      .addOrderBy('c.id', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Contractor & { stats: ContractorStats }> {
    const contractor = await this.contractors.findOne({ where: { id } });
    if (!contractor) throw new NotFoundException('Pudratchi topilmadi');
    return Object.assign(contractor, { stats: await this.stats(id) });
  }

  async stats(contractorId: string): Promise<ContractorStats> {
    const row = await this.objects
      .createQueryBuilder('o')
      .select('COUNT(o.id)', 'totalObjects')
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.status = :inProgress)`,
        'activeObjects',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.status = :completed)`,
        'completedObjects',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :delayed)`,
        'delayedObjects',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :atRisk)`,
        'atRiskObjects',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.status = :completed AND o.delay_days = 0)`,
        'onTimeCompleted',
      )
      .addSelect(
        'COALESCE(ROUND(AVG(o.progress_percent), 1), 0)',
        'avgProgress',
      )
      .addSelect('COALESCE(ROUND(AVG(o.delay_days), 1), 0)', 'avgDelayDays')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalContractValue')
      .where('o.contractor_id = :contractorId', { contractorId })
      .setParameters({
        inProgress: ObjectStatus.IN_PROGRESS,
        completed: ObjectStatus.COMPLETED,
        delayed: ObjectHealth.DELAYED,
        atRisk: ObjectHealth.AT_RISK,
      })
      .getRawOne<Record<string, string>>();

    return {
      totalObjects: Number(row?.totalObjects ?? 0),
      activeObjects: Number(row?.activeObjects ?? 0),
      completedObjects: Number(row?.completedObjects ?? 0),
      delayedObjects: Number(row?.delayedObjects ?? 0),
      atRiskObjects: Number(row?.atRiskObjects ?? 0),
      onTimeCompleted: Number(row?.onTimeCompleted ?? 0),
      avgProgress: Number(row?.avgProgress ?? 0),
      avgDelayDays: Number(row?.avgDelayDays ?? 0),
      totalContractValue: String(row?.totalContractValue ?? '0'),
    };
  }

  async create(dto: CreateContractorDto, actor: AuthUser): Promise<Contractor> {
    if (await this.contractors.findOne({ where: { inn: dto.inn } })) {
      throw new ConflictException(
        `«${dto.inn}» STIR bilan pudratchi allaqachon ro‘yxatda`,
      );
    }
    const contractor = await this.contractors.save(
      this.contractors.create(dto),
    );
    await this.audit.record({
      userId: actor.id,
      action: 'contractor.create',
      entity: 'Contractor',
      entityId: contractor.id,
      changes: { name: { before: null, after: contractor.name } },
    });
    return contractor;
  }

  async update(
    id: string,
    dto: UpdateContractorDto,
    actor: AuthUser,
  ): Promise<Contractor> {
    const contractor = await this.contractors.findOne({ where: { id } });
    if (!contractor) throw new NotFoundException('Pudratchi topilmadi');

    if (dto.inn && dto.inn !== contractor.inn) {
      if (
        await this.contractors.findOne({ where: { inn: dto.inn, id: Not(id) } })
      ) {
        throw new ConflictException(`«${dto.inn}» STIR allaqachon band`);
      }
    }

    await this.contractors.update(id, dto);
    await this.audit.record({
      userId: actor.id,
      action: 'contractor.update',
      entity: 'Contractor',
      entityId: id,
    });
    return this.contractors.findOneOrFail({ where: { id } });
  }

  /**
   * ⚠️ Pudratchi O‘CHIRILMAYDI — qora ro‘yxatga olinadi yoki to‘xtatiladi.
   * Unga ishora qiluvchi obyektlar va shartnomalar bor; yozuv yo‘qolsa
   * «bu maktabni kim qurgan edi» degan savol javobsiz qolardi.
   */
  async setStatus(
    id: string,
    status: ContractorStatus,
    reason: string,
    actor: AuthUser,
  ) {
    const contractor = await this.contractors.findOne({ where: { id } });
    if (!contractor) throw new NotFoundException('Pudratchi topilmadi');

    if (status === ContractorStatus.BLACKLISTED && !reason?.trim()) {
      throw new BadRequestException('Qora ro‘yxatga olish sababi majburiy');
    }

    const activeCount = await this.objects.count({
      where: { contractorId: id, status: ObjectStatus.IN_PROGRESS },
    });

    await this.contractors.update(id, {
      status,
      note: [contractor.note, `[${status}] ${reason}`]
        .filter(Boolean)
        .join('\n'),
    });

    await this.audit.record({
      userId: actor.id,
      action: 'contractor.status',
      entity: 'Contractor',
      entityId: id,
      changes: { status: { before: contractor.status, after: status } },
    });

    return {
      message: `«${contractor.name}» holati o‘zgartirildi`,
      warning:
        activeCount > 0 && status !== ContractorStatus.ACTIVE
          ? `Diqqat: bu pudratchida ${activeCount} ta faol obyekt bor — ular avtomatik to‘xtatilmaydi.`
          : null,
    };
  }

  /**
   * REYTINGNI QAYTA HISOBLASH — formula BITTA joyda.
   *
   * Asos: tugallangan obyektlarning MUDDATIDA topshirilgani.
   *   • baza          — 3.0
   *   • muddatida     — ulushiga qarab +2.0 gacha
   *   • o‘rtacha kechikish — har 30 kun uchun −0.5 (eng ko‘pi −2.0)
   *   • ochiq xavfli obyekt — har biri uchun −0.2
   * Natija 0–5 oralig‘iga qisiladi.
   *
   * ⚠️ Qo‘lda yozib bo‘lmaydi: reyting tanlov mezoni, uni qo‘l bilan
   * ko‘tarish mumkin bo‘lsa, butun ma’nosi yo‘qolardi.
   */
  async recalculateRating(contractorId: string): Promise<number> {
    const s = await this.stats(contractorId);

    if (s.completedObjects === 0 && s.totalObjects === 0) {
      await this.contractors.update(contractorId, { rating: 0 });
      return 0;
    }

    const onTimeRatio =
      s.completedObjects > 0 ? s.onTimeCompleted / s.completedObjects : 0.5;
    const delayPenalty = Math.min(2, (s.avgDelayDays / 30) * 0.5);
    const riskPenalty = Math.min(1.5, s.atRiskObjects * 0.2);

    const raw = 3 + onTimeRatio * 2 - delayPenalty - riskPenalty;
    const rating = Number(Math.min(5, Math.max(0, raw)).toFixed(2));

    await this.contractors.update(contractorId, { rating });
    return rating;
  }

  /** Barcha pudratchilar reytingini yangilash (tungi pass). */
  async recalculateAllRatings(): Promise<{ updated: number }> {
    const ids = await this.contractors.find({ select: { id: true } });
    for (const { id } of ids) await this.recalculateRating(id);
    return { updated: ids.length };
  }
}
