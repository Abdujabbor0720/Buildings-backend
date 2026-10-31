import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type EntityManager } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { FundingAllocation } from '../../database/entities/funding-allocation.entity';
import { FundingTransaction } from '../../database/entities/funding-transaction.entity';
import { FundingTxType } from '../../common/constants/enums';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import type {
  CreateTransactionDto,
  FundingQueryDto,
  UpsertAllocationDto,
} from './dto/funding.dto';

export interface FundingSummary {
  totalCost: string;
  totalPlanned: string;
  totalAllocated: string;
  totalPaid: string;
  /** `totalCost − totalAllocated` — hali ajratilmagan qism. */
  remainingToAllocate: string;
  /** `totalAllocated − totalPaid` — ajratilgan, lekin to‘lanmagan. */
  remainingToPay: string;
  allocationPercent: number;
  paymentPercent: number;
  byYear: Array<{
    year: number;
    planned: string;
    allocated: string;
    paid: string;
  }>;
  bySource: Array<{
    sourceId: string;
    name: string;
    color: string;
    planned: string;
    allocated: string;
    paid: string;
    percent: number;
  }>;
}

@Injectable()
export class FundingService {
  constructor(
    @InjectRepository(FundingAllocation)
    private readonly allocations: Repository<FundingAllocation>,
    @InjectRepository(FundingTransaction)
    private readonly transactions: Repository<FundingTransaction>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /* ───────────────────────── O‘qish ───────────────────────── */

  async listAllocations(
    query: FundingQueryDto,
    user: AuthUser,
  ): Promise<PaginatedResult<FundingAllocation>> {
    const qb = this.allocations
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.object', 'o')
      .leftJoinAndSelect('o.district', 'district')
      .innerJoinAndSelect('a.source', 'source')
      .where('o.deleted_at IS NULL');

    this.applyScope(qb, user);
    if (query.objectId)
      qb.andWhere('a.object_id = :objectId', { objectId: query.objectId });
    if (query.sourceId)
      qb.andWhere('a.source_id = :sourceId', { sourceId: query.sourceId });
    if (query.districtId)
      qb.andWhere('o.district_id = :districtId', {
        districtId: query.districtId,
      });
    if (query.year) qb.andWhere('a.year = :year', { year: query.year });
    if (query.search)
      qb.andWhere('o.name ILIKE :s', { s: `%${query.search}%` });

    const [items, total] = await qb
      .orderBy('a.year', 'DESC')
      .addOrderBy('o.name', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async listTransactions(
    query: FundingQueryDto,
    user: AuthUser,
  ): Promise<PaginatedResult<FundingTransaction>> {
    const qb = this.transactions
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.object', 'o')
      .leftJoinAndSelect('o.district', 'district')
      .leftJoinAndSelect('t.allocation', 'allocation')
      .leftJoinAndSelect('allocation.source', 'source')
      .leftJoinAndSelect('t.createdBy', 'createdBy')
      .where('o.deleted_at IS NULL');

    this.applyScope(qb, user);
    if (query.objectId)
      qb.andWhere('t.object_id = :objectId', { objectId: query.objectId });
    if (query.districtId)
      qb.andWhere('o.district_id = :districtId', {
        districtId: query.districtId,
      });
    if (query.type) qb.andWhere('t.type = :type', { type: query.type });
    if (query.year)
      qb.andWhere('EXTRACT(YEAR FROM t.occurred_at) = :year', {
        year: query.year,
      });

    const [items, total] = await qb
      .orderBy('t.occurredAt', 'DESC')
      .addOrderBy('t.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  /** «Moliyalashtirish» bo‘limining yuqori qismidagi umumiy ko‘rsatkichlar. */
  async summary(regionId?: string, year?: number): Promise<FundingSummary> {
    const objectQb = this.objects
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .where('o.deleted_at IS NULL');
    if (regionId) objectQb.andWhere('o.region_id = :regionId', { regionId });

    const allocQb = this.allocations
      .createQueryBuilder('a')
      .innerJoin('a.object', 'o')
      .select('COALESCE(SUM(a.planned_amount), 0)', 'planned')
      .addSelect('COALESCE(SUM(a.allocated_amount), 0)', 'allocated')
      .addSelect('COALESCE(SUM(a.paid_amount), 0)', 'paid')
      .where('o.deleted_at IS NULL');
    if (regionId) allocQb.andWhere('o.region_id = :regionId', { regionId });
    if (year) allocQb.andWhere('a.year = :year', { year });

    const byYearQb = this.allocations
      .createQueryBuilder('a')
      .innerJoin('a.object', 'o')
      .select('a.year', 'year')
      .addSelect('COALESCE(SUM(a.planned_amount), 0)', 'planned')
      .addSelect('COALESCE(SUM(a.allocated_amount), 0)', 'allocated')
      .addSelect('COALESCE(SUM(a.paid_amount), 0)', 'paid')
      .where('o.deleted_at IS NULL')
      .groupBy('a.year')
      .orderBy('a.year', 'ASC');
    if (regionId) byYearQb.andWhere('o.region_id = :regionId', { regionId });

    const bySourceQb = this.allocations
      .createQueryBuilder('a')
      .innerJoin('a.object', 'o')
      .innerJoin('a.source', 's')
      .select('s.id', 'sourceId')
      .addSelect('s.name', 'name')
      .addSelect('s.color', 'color')
      .addSelect('COALESCE(SUM(a.planned_amount), 0)', 'planned')
      .addSelect('COALESCE(SUM(a.allocated_amount), 0)', 'allocated')
      .addSelect('COALESCE(SUM(a.paid_amount), 0)', 'paid')
      .where('o.deleted_at IS NULL')
      .groupBy('s.id')
      .addGroupBy('s.name')
      .addGroupBy('s.color')
      .orderBy('COALESCE(SUM(a.allocated_amount), 0)', 'DESC');
    if (regionId) bySourceQb.andWhere('o.region_id = :regionId', { regionId });
    if (year) bySourceQb.andWhere('a.year = :year', { year });

    const [objRow, allocRow, byYear, bySourceRows] = await Promise.all([
      objectQb.getRawOne<{ totalCost: string }>(),
      allocQb.getRawOne<{ planned: string; allocated: string; paid: string }>(),
      byYearQb.getRawMany<{
        year: number;
        planned: string;
        allocated: string;
        paid: string;
      }>(),
      bySourceQb.getRawMany<Record<string, string>>(),
    ]);

    const totalCost = String(objRow?.totalCost ?? '0');
    const totalPlanned = String(allocRow?.planned ?? '0');
    const totalAllocated = String(allocRow?.allocated ?? '0');
    const totalPaid = String(allocRow?.paid ?? '0');
    const allocatedSum = bySourceRows.reduce(
      (s, r) => s + Number(r.allocated),
      0,
    );

    return {
      totalCost,
      totalPlanned,
      totalAllocated,
      totalPaid,
      remainingToAllocate: (Number(totalCost) - Number(totalAllocated)).toFixed(
        2,
      ),
      remainingToPay: (Number(totalAllocated) - Number(totalPaid)).toFixed(2),
      allocationPercent: percent(totalAllocated, totalCost),
      paymentPercent: percent(totalPaid, totalAllocated),
      byYear: byYear.map((r) => ({
        year: Number(r.year),
        planned: String(r.planned),
        allocated: String(r.allocated),
        paid: String(r.paid),
      })),
      bySource: bySourceRows.map((r) => ({
        sourceId: r.sourceId,
        name: r.name,
        color: r.color,
        planned: String(r.planned),
        allocated: String(r.allocated),
        paid: String(r.paid),
        percent:
          allocatedSum > 0
            ? Number(((Number(r.allocated) / allocatedSum) * 100).toFixed(1))
            : 0,
      })),
    };
  }

  /* ───────────────────────── Yozish ───────────────────────── */

  /** Yillik reja — obyekt × manba × yil bo‘yicha YAGONA qator. */
  async upsertAllocation(
    dto: UpsertAllocationDto,
    user: AuthUser,
  ): Promise<FundingAllocation> {
    const object = await this.objects.findOne({ where: { id: dto.objectId } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');

    const existing = await this.allocations.findOne({
      where: { objectId: dto.objectId, sourceId: dto.sourceId, year: dto.year },
    });

    if (existing) {
      await this.allocations.update(existing.id, {
        plannedAmount: dto.plannedAmount,
        note: dto.note ?? existing.note,
      });
    } else {
      await this.allocations.save(this.allocations.create(dto));
    }

    await this.audit.record({
      userId: user.id,
      action: existing
        ? 'funding.allocation.update'
        : 'funding.allocation.create',
      entity: 'FundingAllocation',
      entityId: existing?.id ?? null,
      changes: {
        plannedAmount: {
          before: existing?.plannedAmount ?? null,
          after: dto.plannedAmount,
        },
      },
    });

    return this.allocations.findOneOrFail({
      where: { objectId: dto.objectId, sourceId: dto.sourceId, year: dto.year },
      relations: { source: true },
    });
  }

  /**
   * MOLIYAVIY HARAKAT — append-only daftar qatori.
   *
   * ⚠️ Yozuvdan keyin `allocations` va `construction_objects` dagi yig‘indilar
   * DAFTARDAN qayta hisoblanadi (`recomputeFromLedger`), ularga mustaqil
   * `increment` qilinmaydi. Shu tufayli yig‘indi har doim daftarga teng:
   * bitta yozuv yiqilsa yoki ikki marta yuborilsa ham, haqiqat manbai bitta.
   */
  async createTransaction(
    dto: CreateTransactionDto,
    user: AuthUser,
  ): Promise<FundingTransaction> {
    const object = await this.objects.findOne({ where: { id: dto.objectId } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');

    const amount = Number(dto.amount);
    if (dto.type !== FundingTxType.ADJUSTMENT && amount <= 0) {
      throw new BadRequestException(
        'Summa musbat bo‘lishi kerak. Qaytarish yoki tuzatish uchun «ADJUSTMENT» turini tanlang.',
      );
    }
    if (amount === 0)
      throw new BadRequestException('Summa noldan farqli bo‘lishi kerak');

    if (dto.allocationId) {
      const allocation = await this.allocations.findOne({
        where: { id: dto.allocationId },
      });
      if (!allocation) throw new BadRequestException('Yillik reja topilmadi');
      if (allocation.objectId !== dto.objectId) {
        throw new BadRequestException('Yillik reja boshqa obyektga tegishli');
      }
    }

    const created = await this.dataSource.transaction(async (em) => {
      const tx = await em.save(
        em.create(FundingTransaction, { ...dto, createdById: user.id }),
      );
      await this.recomputeFromLedger(dto.objectId, em);
      return tx;
    });

    await this.audit.record({
      userId: user.id,
      action: `funding.${dto.type}`,
      entity: 'FundingTransaction',
      entityId: created.id,
      changes: { amount: { before: null, after: dto.amount } },
    });

    return this.transactions.findOneOrFail({
      where: { id: created.id },
      relations: { allocation: { source: true }, createdBy: true },
    });
  }

  /**
   * YIG‘INDILARNI DAFTARDAN QAYTA HISOBLASH — yagona yozuvchi.
   * `allocations.allocated_amount`, `allocations.paid_amount`,
   * `objects.funded_amount`, `objects.paid_amount` SHU YERDA va faqat
   * shu yerda yoziladi.
   */
  async recomputeFromLedger(
    objectId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager ?? this.dataSource.manager;

    // 1) Har bir yillik reja bo‘yicha — unga bog‘langan harakatlardan.
    await em.query(
      `UPDATE funding_allocations a
          SET allocated_amount = COALESCE(t.allocated, 0),
              paid_amount      = COALESCE(t.paid, 0),
              updated_at       = NOW()
         FROM (
              SELECT allocation_id,
                     SUM(amount) FILTER (WHERE type IN ('allocation', 'adjustment')) AS allocated,
                     SUM(amount) FILTER (WHERE type = 'payment')                     AS paid
                FROM funding_transactions
               WHERE object_id = $1 AND allocation_id IS NOT NULL AND deleted_at IS NULL
               GROUP BY allocation_id
         ) t
        WHERE a.id = t.allocation_id`,
      [objectId],
    );

    // Bog‘langan harakati qolmagan rejalar nolga tushiriladi — aks holda
    // yagona harakat o‘chirilganda eski yig‘indi osilib qolardi.
    await em.query(
      `UPDATE funding_allocations a
          SET allocated_amount = 0, paid_amount = 0, updated_at = NOW()
        WHERE a.object_id = $1
          AND NOT EXISTS (
              SELECT 1 FROM funding_transactions t
               WHERE t.allocation_id = a.id AND t.deleted_at IS NULL
          )`,
      [objectId],
    );

    // 2) Obyekt darajasi — BARCHA harakatlardan (rejaga bog‘lanmagani ham).
    await em.query(
      `UPDATE construction_objects o
          SET funded_amount = COALESCE(t.allocated, 0),
              paid_amount   = COALESCE(t.paid, 0),
              updated_at    = NOW()
         FROM (
              SELECT object_id,
                     SUM(amount) FILTER (WHERE type IN ('allocation', 'adjustment')) AS allocated,
                     SUM(amount) FILTER (WHERE type = 'payment')                     AS paid
                FROM funding_transactions
               WHERE object_id = $1 AND deleted_at IS NULL
               GROUP BY object_id
         ) t
        WHERE o.id = t.object_id`,
      [objectId],
    );
  }

  async objectFunding(objectId: string): Promise<{
    allocations: FundingAllocation[];
    transactions: FundingTransaction[];
  }> {
    const [allocations, transactions] = await Promise.all([
      this.allocations.find({
        where: { objectId },
        relations: { source: true },
        order: { year: 'ASC' },
      }),
      this.transactions.find({
        where: { objectId },
        relations: { allocation: { source: true }, createdBy: true },
        order: { occurredAt: 'DESC' },
      }),
    ]);
    return { allocations, transactions };
  }

  private applyScope(
    qb: { andWhere: (c: string, p?: Record<string, unknown>) => unknown },
    user: AuthUser,
  ): void {
    if (user.contractorId)
      qb.andWhere('o.contractor_id = :cid', { cid: user.contractorId });
    else if (user.districtId)
      qb.andWhere('o.district_id = :did', { did: user.districtId });
    else if (user.regionId)
      qb.andWhere('o.region_id = :rid', { rid: user.regionId });
  }
}

function percent(part: string, total: string): number {
  const t = Number(total);
  if (t <= 0) return 0;
  return Number(((Number(part) / t) * 100).toFixed(1));
}
