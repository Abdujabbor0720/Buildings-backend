import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import {
  ObjectHealth,
  ObjectStatus,
  RiskLevel,
} from '../../common/constants/enums';
import {
  objectBriefFromRaw,
  selectObjectBrief,
  type ObjectBrief,
} from '../../common/contracts/object-brief.contract';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { tashkentToday } from '../../helpers/date.helpers';
import { isoDate, pct, scopedObjects } from './dashboard-scope';
import { KpiMetric } from './dto/kpi-metric.dto';
import type { KpiMetricObjectsQueryDto } from './dto/kpi-metric.dto';
import type { DashboardQueryDto } from './dto/dashboard-query.dto';

/* ───────────────────────── Javob shakllari ───────────────────────── */

/**
 * Taqsimot qatori.
 *
 * ⚠️ `key` — ENUM QIYMATI yoki guruh kaliti, ko‘rsatiladigan matn EMAS.
 * Yorliqlar mijozda (`health.ts`): u yerda ular qorong‘i rejim ranglari
 * bilan birga turadi va bitta joyda tarjima qilinadi.
 */
export interface KpiBucket {
  key: string;
  count: number;
  /** Shu KO‘RSATKICH to‘plami ichidagi ulush. */
  percent: number;
  /** Guruhdagi loyiha qiymati, so‘m. */
  amount: string;
}

export interface KpiDistrictRow {
  districtId: string;
  code: string;
  name: string;
  shortName: string;
  count: number;
  percent: number;
  totalCost: string;
  avgProgress: number;
  delayed: number;
  atRisk: number;
}

export interface KpiTypeRow {
  typeId: string;
  code: string;
  name: string;
  color: string;
  count: number;
  percent: number;
  totalCost: string;
  avgProgress: number;
}

/**
 * Nomlangan kesim: pudratchi, moliya manbasi, kechikish sababi.
 *
 * ⚠️ `id: null` — BIRIKTIRILMAGAN guruh (pudratchisi yo‘q, sababi
 * ko‘rsatilmagan). U ro‘yxatdan TASHLANMAYDI: aynan shu qator
 * ma’lumot to‘liq emasligini ko‘rsatadi va ko‘pincha eng muhimi.
 */
export interface KpiNamedRow {
  id: string | null;
  name: string | null;
  color: string | null;
  count: number;
  percent: number;
  totalCost: string;
  avgProgress: number;
}

/** Yil yoki oy kesimi (`key` — yil raqami yoki 1–12). */
export interface KpiPeriodRow {
  key: number;
  count: number;
  amount: string;
}

export interface KpiMetricDetail {
  metric: KpiMetric;
  /** «Joriy yil yakunlanadi» uchun — qaysi yil nazarda tutilgani. */
  year: number;
  /** Filtrdagi JAMI obyekt — foizlarning maxraji (kartadagi bilan AYNI). */
  scopeTotal: number;
  count: number;
  percentOfScope: number;

  finance: {
    totalCost: string;
    fundedAmount: string;
    paidAmount: string;
    /** `totalCost − fundedAmount`, manfiy bo‘lmaydi. */
    unfunded: string;
    fundedPercent: number;
    paidPercent: number;
  };

  progress: {
    avg: number;
    /** Bugun reja bo‘yicha bo‘lishi kerak bo‘lgan o‘rtacha bajarilish. */
    expectedAvg: number;
    /** `expectedAvg − avg`. Musbat = ortda. */
    gapAvg: number;
  };

  delays: {
    delayedCount: number;
    avgDelayDays: number;
    maxDelayDays: number;
    over90: number;
    openDelays: number;
    /** Reja muddati ALLAQACHON o‘tgan obyektlar. */
    overdue: number;
    avgRiskScore: number;
  };

  /**
   * MA’LUMOT TO‘LIQLIGI — yashirilmaydi.
   *
   * ⚠️ «Mas’uli yo‘q 12 ta obyekt» degan son hisobot emas, VAZIFA:
   * xavfli obyektda javobgar bo‘lmasligi aynan shu ekranda ko‘rinishi
   * kerak, aks holda uni hech kim payqamaydi.
   */
  coverage: {
    withoutResponsible: number;
    withoutContractor: number;
    withoutCoords: number;
    /** 30 kundan beri foto-hisobot yo‘q. */
    staleReports: number;
  };

  health: KpiBucket[];
  status: KpiBucket[];
  risk: KpiBucket[];
  progressBuckets: KpiBucket[];
  byDistrict: KpiDistrictRow[];
  byType: KpiTypeRow[];
  byYear: KpiPeriodRow[];
  /** Joriy yil, 12 ta qiymat (bo‘sh oy ham qatorda turadi). */
  byMonth: KpiPeriodRow[];
  byFundingSource: KpiNamedRow[];
  /** Eng ko‘p obyektli 8 ta pudratchi. */
  byContractor: KpiNamedRow[];
  byDelayReason: KpiNamedRow[];
  generatedAt: string;
}

/** ⚠️ Joylashuv va mas'ul — `ObjectBrief` dan, hamma javob bilan AYNI shakl. */
export interface KpiMetricObject extends ObjectBrief {
  id: string;
  code: string;
  name: string;
  districtName: string;
  typeName: string;
  typeColor: string;
  plannedEndDate: string;
  daysLeft: number;
  progressPercent: number;
  expectedProgress: number;
  healthStatus: ObjectHealth;
  status: ObjectStatus;
  delayDays: number;
  riskLevel: RiskLevel;
  riskScore: number;
  totalCost: string;
  fundedAmount: string;
  contractorName: string | null;
  primaryReason: string | null;
  lastReportAt: string | null;
}

/**
 * Ro‘yxatda saralashga RUXSAT ETILGAN ustunlar — SQL in’yeksiyasiga
 * yo‘l qolmasin.
 *
 * ⚠️ Bu yerda XOM ustun nomlari (`o.planned_end_date`), entity maydoni
 * emas: ro‘yxat `getRawMany()` bilan o‘qiladi va TypeORM metadata
 * bo‘yicha qayta hal qilish bosqichiga umuman kirmaydi.
 */
const SORTABLE: Record<string, string> = {
  name: 'o.name',
  code: 'o.code',
  district: 'd.name',
  type: 't.name',
  plannedEndDate: 'o.planned_end_date',
  progressPercent: 'o.progress_percent',
  progressGap: 'o.progress_gap',
  delayDays: 'o.delay_days',
  riskScore: 'o.risk_score',
  totalCost: 'o.total_cost',
  fundedAmount: 'o.funded_amount',
};

/** Bajarilish taqsimoti — guruh kalitlari mijozdagi yorliqlar bilan juft. */
const PROGRESS_BUCKETS: ReadonlyArray<{ key: string; where: string }> = [
  { key: 'zero', where: 'o.progress_percent <= 0' },
  { key: 'q1', where: 'o.progress_percent > 0 AND o.progress_percent <= 25' },
  { key: 'q2', where: 'o.progress_percent > 25 AND o.progress_percent <= 50' },
  { key: 'q3', where: 'o.progress_percent > 50 AND o.progress_percent <= 75' },
  { key: 'q4', where: 'o.progress_percent > 75 AND o.progress_percent < 100' },
  { key: 'full', where: 'o.progress_percent >= 100' },
];

@Injectable()
export class DashboardMetricsService {
  constructor(
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
  ) {}

  /**
   * BITTA KO‘RSATKICHNING BATAFSIL KESIMI — bitta so‘rovda.
   *
   * ⚠️ Har blok uchun alohida endpoint ochilmaydi: sahifada o‘n ikkita
   * kesim bor va ular bir vaqtda ko‘rinishi kerak. So‘rovlar serverda
   * PARALLEL ketadi, mijoz esa to‘liq ekranni birdan oladi.
   */
  async detail(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<KpiMetricDetail> {
    const year = tashkentToday().getUTCFullYear();

    const [
      scopeRow,
      row,
      health,
      status,
      risk,
      progressRow,
      byDistrict,
      byType,
      byYear,
      byMonthRows,
      byFundingSource,
      byContractor,
      byDelayReason,
    ] = await Promise.all([
      // ⚠️ Maxraj METRIK PREDIKATISIZ olinadi: kartadagi foiz ham
      // filtrlangan JAMI ga nisbatan hisoblangan.
      scopedObjects(this.objects, query, user)
        .select('COUNT(o.id)', 'count')
        .getRawOne<{ count: string }>(),
      this.summaryRow(metric, query, user),
      this.groupBySimple(metric, query, user, 'o.health_status'),
      this.groupBySimple(metric, query, user, 'o.status'),
      this.groupBySimple(metric, query, user, 'o.risk_level'),
      this.progressRow(metric, query, user),
      this.byDistrict(metric, query, user),
      this.byType(metric, query, user),
      this.byYear(metric, query, user),
      this.byMonth(metric, query, user, year),
      this.byNamed(metric, query, user, 'o.fundingSource', 'fs', true),
      this.byNamed(metric, query, user, 'o.contractor', 'c', false, 8),
      this.byNamed(metric, query, user, 'o.primaryDelayReason', 'dr', true),
    ]);

    const scopeTotal = Number(scopeRow?.count ?? 0);
    const count = Number(row?.total ?? 0);

    const totalCost = String(row?.totalCost ?? '0');
    const fundedAmount = String(row?.fundedAmount ?? '0');
    const paidAmount = String(row?.paidAmount ?? '0');

    return {
      metric,
      year,
      scopeTotal,
      count,
      percentOfScope: pct(count, scopeTotal),

      finance: {
        totalCost,
        fundedAmount,
        paidAmount,
        unfunded: subtract(totalCost, fundedAmount),
        fundedPercent: ratio(fundedAmount, totalCost),
        paidPercent: ratio(paidAmount, totalCost),
      },

      progress: {
        avg: Number(row?.avgProgress ?? 0),
        expectedAvg: Number(row?.avgExpected ?? 0),
        gapAvg: Number(row?.avgGap ?? 0),
      },

      delays: {
        delayedCount: Number(row?.delayedCount ?? 0),
        avgDelayDays: Number(row?.avgDelayDays ?? 0),
        maxDelayDays: Number(row?.maxDelayDays ?? 0),
        over90: Number(row?.over90 ?? 0),
        openDelays: Number(row?.openDelays ?? 0),
        overdue: Number(row?.overdue ?? 0),
        avgRiskScore: Number(row?.avgRiskScore ?? 0),
      },

      coverage: {
        withoutResponsible: Number(row?.withoutResponsible ?? 0),
        withoutContractor: Number(row?.withoutContractor ?? 0),
        withoutCoords: Number(row?.withoutCoords ?? 0),
        staleReports: Number(row?.staleReports ?? 0),
      },

      health: withPercent(health, count),
      status: withPercent(status, count),
      risk: withPercent(risk, count),
      progressBuckets: withPercent(progressBuckets(progressRow), count),
      byDistrict: byDistrict.map((d) => ({
        ...d,
        percent: pct(d.count, count),
      })),
      byType: byType.map((t) => ({ ...t, percent: pct(t.count, count) })),
      byYear,
      byMonth: fillMonths(byMonthRows),
      byFundingSource: byFundingSource.map((r) => ({
        ...r,
        percent: pct(r.count, count),
      })),
      byContractor: byContractor.map((r) => ({
        ...r,
        percent: pct(r.count, count),
      })),
      byDelayReason: byDelayReason.map((r) => ({
        ...r,
        percent: pct(r.count, count),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * KO‘RSATKICH ICHIDAGI OBYEKTLAR — sahifalangan ro‘yxat.
   *
   * ⚠️ `GET /objects` ga YO‘NALTIRILMAYDI. U boshqa doirada ishlaydi
   * (topshirilgan va bekor qilinganlar bilan, yil oralig‘i boshqacha
   * o‘qiladi), ya’ni kartadagi 116 bilan ro‘yxatdagi son mos
   * kelmasdi. Ro‘yxat AYNI `scopedObjects` ustida quriladi.
   */
  async listObjects(
    metric: KpiMetric,
    query: KpiMetricObjectsQueryDto,
    user: AuthUser,
  ): Promise<PaginatedResult<KpiMetricObject>> {
    const countRow = await this.filtered(metric, query, user)
      .select('COUNT(o.id)', 'count')
      .getRawOne<{ count: string }>();
    const total = Number(countRow?.count ?? 0);

    const sortColumn = SORTABLE[query.sortBy ?? ''] ?? 'o.planned_end_date';

    const qb = this.filtered(metric, query, user)
      .innerJoin('o.district', 'd')
      .innerJoin('o.type', 't')
      .leftJoin('o.contractor', 'c')
      .leftJoin('o.primaryDelayReason', 'dr')
      .select('o.id', 'id')
      .addSelect('o.code', 'code')
      .addSelect('o.name', 'name')
      .addSelect('o.planned_end_date', 'plannedEndDate')
      .addSelect('(o.planned_end_date - CURRENT_DATE)', 'daysLeft')
      .addSelect('o.progress_percent', 'progressPercent')
      .addSelect('o.expected_progress', 'expectedProgress')
      .addSelect('o.health_status', 'healthStatus')
      .addSelect('o.status', 'status')
      .addSelect('o.delay_days', 'delayDays')
      .addSelect('o.risk_level', 'riskLevel')
      .addSelect('o.risk_score', 'riskScore')
      .addSelect('o.total_cost', 'totalCost')
      .addSelect('o.funded_amount', 'fundedAmount')
      .addSelect('o.last_report_at', 'lastReportAt')
      .addSelect('d.name', 'districtName')
      .addSelect('t.name', 'typeName')
      .addSelect('t.color', 'typeColor')
      .addSelect('c.name', 'contractorName')
      .addSelect('dr.name', 'primaryReason')
      .orderBy(sortColumn, query.sortOrder)
      // ⚠️ Ikkinchi darajali saralash MAJBURIY: teng qiymatlarda
      // PostgreSQL tartibni kafolatlamaydi va 2-sahifada 1-sahifadagi
      // qator takrorlanardi.
      .addOrderBy('o.id', 'ASC')
      // ⚠️ `limit/offset`, `take/skip` EMAS: javob XOM qator
      // (`getRawMany`), ya’ni TypeORM ning «distinct id» sahifalashi
      // bu yerda umuman qo‘llanmaydi va `take` jim e’tiborsiz qolardi.
      .limit(query.limit)
      .offset(query.skip);

    // ⚠️ `select()` zanjiridan KEYIN (`object-brief.contract.ts`).
    selectObjectBrief(qb);
    const rows = await qb.getRawMany<Record<string, string | null>>();

    const items: KpiMetricObject[] = rows.map((r) => {
      return {
        ...objectBriefFromRaw(r),
        id: String(r.id),
        code: String(r.code),
        name: String(r.name),
        districtName: String(r.districtName ?? ''),
        typeName: String(r.typeName ?? ''),
        typeColor: String(r.typeColor ?? ''),
        plannedEndDate: isoDate(r.plannedEndDate as unknown as string | Date),
        daysLeft: Number(r.daysLeft ?? 0),
        progressPercent: Number(r.progressPercent ?? 0),
        expectedProgress: Number(r.expectedProgress ?? 0),
        healthStatus: r.healthStatus as ObjectHealth,
        status: r.status as ObjectStatus,
        delayDays: Number(r.delayDays ?? 0),
        riskLevel: r.riskLevel as RiskLevel,
        riskScore: Number(r.riskScore ?? 0),
        totalCost: String(r.totalCost ?? '0'),
        fundedAmount: String(r.fundedAmount ?? '0'),
        contractorName: r.contractorName ?? null,
        primaryReason: r.primaryReason ?? null,
        lastReportAt: r.lastReportAt
          ? new Date(r.lastReportAt).toISOString()
          : null,
      };
    });

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  /* ───────────────────────── Ichki ───────────────────────── */

  /**
   * KO‘RSATKICH DOIRASI = bosh sahifa filtri + kartaning o‘z sharti.
   *
   * ⚠️ Shartlar `DashboardService.summary()` dagi `FILTER (WHERE …)`
   * ifodalari bilan AYNI bo‘lishi shart — kartadagi son shu yerdan
   * chiqadi.
   */
  private base(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
  ): SelectQueryBuilder<ConstructionObject> {
    const qb = scopedObjects(this.objects, query, user);

    switch (metric) {
      case KpiMetric.ON_PLAN:
        // «Reja asosida» ga hali boshlanmaganlar ham kiradi: ularning
        // reja muddati kelmagan, demak ular KECHIKMAYAPTI.
        qb.andWhere('o.health_status IN (:...kpiHealth)', {
          kpiHealth: [ObjectHealth.ON_SCHEDULE, ObjectHealth.NOT_STARTED],
        });
        break;
      case KpiMetric.DELAYED:
        qb.andWhere('o.health_status = :kpiHealth', {
          kpiHealth: ObjectHealth.DELAYED,
        });
        break;
      case KpiMetric.AT_RISK:
        qb.andWhere('o.health_status = :kpiHealth', {
          kpiHealth: ObjectHealth.AT_RISK,
        });
        break;
      case KpiMetric.COMPLETING:
        qb.andWhere('EXTRACT(YEAR FROM o.planned_end_date) = :kpiYear', {
          kpiYear: tashkentToday().getUTCFullYear(),
        });
        break;
      // ⚠️ «Jami obyektlar» va «Umumiy qiymat» — AYNI to‘plam:
      // farq faqat sarlavhadagi raqamda. Qo‘shimcha shart YO‘Q.
      case KpiMetric.TOTAL:
      case KpiMetric.COST:
        break;
    }

    return qb;
  }

  /** Doira + ro‘yxat qidiruvi (jadval uchun). */
  private filtered(
    metric: KpiMetric,
    query: KpiMetricObjectsQueryDto,
    user: AuthUser,
  ): SelectQueryBuilder<ConstructionObject> {
    const qb = this.base(metric, query, user);
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        '(o.name ILIKE :kpiSearch OR o.code ILIKE :kpiSearch OR o.address ILIKE :kpiSearch)',
        { kpiSearch: `%${search}%` },
      );
    }
    return qb;
  }

  private summaryRow(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<Record<string, string> | undefined> {
    return (
      this.base(metric, query, user)
        .select('COUNT(o.id)', 'total')
        .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
        .addSelect('COALESCE(SUM(o.funded_amount), 0)', 'fundedAmount')
        .addSelect('COALESCE(SUM(o.paid_amount), 0)', 'paidAmount')
        .addSelect(
          'COALESCE(ROUND(AVG(o.progress_percent), 1), 0)',
          'avgProgress',
        )
        .addSelect(
          'COALESCE(ROUND(AVG(o.expected_progress), 1), 0)',
          'avgExpected',
        )
        .addSelect('COALESCE(ROUND(AVG(o.progress_gap), 1), 0)', 'avgGap')
        .addSelect(
          'COUNT(o.id) FILTER (WHERE o.delay_days > 0)',
          'delayedCount',
        )
        // ⚠️ O‘rtacha kechikish FAQAT kechikkanlar bo‘yicha: nol kunlar
        // maxrajga kirsa, 200 kun kechikkan obyekt «12 kun» bo‘lib
        // ko‘rinardi.
        .addSelect(
          'COALESCE(ROUND(AVG(o.delay_days) FILTER (WHERE o.delay_days > 0)), 0)',
          'avgDelayDays',
        )
        .addSelect('COALESCE(MAX(o.delay_days), 0)', 'maxDelayDays')
        .addSelect('COUNT(o.id) FILTER (WHERE o.delay_days > 90)', 'over90')
        .addSelect('COALESCE(SUM(o.open_delay_count), 0)', 'openDelays')
        .addSelect(
          'COUNT(o.id) FILTER (WHERE o.planned_end_date < CURRENT_DATE)',
          'overdue',
        )
        .addSelect('COALESCE(ROUND(AVG(o.risk_score)), 0)', 'avgRiskScore')
        .addSelect(
          'COUNT(o.id) FILTER (WHERE o.responsible_id IS NULL)',
          'withoutResponsible',
        )
        .addSelect(
          'COUNT(o.id) FILTER (WHERE o.contractor_id IS NULL)',
          'withoutContractor',
        )
        .addSelect(
          'COUNT(o.id) FILTER (WHERE o.lat IS NULL OR o.lng IS NULL)',
          'withoutCoords',
        )
        .addSelect(
          `COUNT(o.id) FILTER (WHERE o.last_report_at IS NULL OR o.last_report_at < NOW() - INTERVAL '30 days')`,
          'staleReports',
        )
        .getRawOne<Record<string, string>>()
    );
  }

  /** Bitta ustun bo‘yicha taqsimot (holat, status, risk). */
  private async groupBySimple(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
    column: string,
  ): Promise<Array<Omit<KpiBucket, 'percent'>>> {
    const rows = await this.base(metric, query, user)
      .select(column, 'key')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'amount')
      .groupBy(column)
      .getRawMany<{ key: string; count: string; amount: string }>();

    return rows.map((r) => ({
      key: r.key,
      count: Number(r.count),
      amount: String(r.amount),
    }));
  }

  private progressRow(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<Record<string, string> | undefined> {
    const qb = this.base(metric, query, user);
    let first = true;
    for (const bucket of PROGRESS_BUCKETS) {
      const expr = `COUNT(o.id) FILTER (WHERE ${bucket.where})`;
      const amount = `COALESCE(SUM(o.total_cost) FILTER (WHERE ${bucket.where}), 0)`;
      if (first) {
        qb.select(expr, bucket.key);
        first = false;
      } else {
        qb.addSelect(expr, bucket.key);
      }
      qb.addSelect(amount, `${bucket.key}_amount`);
    }
    return qb.getRawOne<Record<string, string>>();
  }

  private async byDistrict(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<Array<Omit<KpiDistrictRow, 'percent'>>> {
    const rows = await this.base(metric, query, user)
      .innerJoin('o.district', 'd')
      .select('d.id', 'districtId')
      .addSelect('d.code', 'code')
      .addSelect('d.name', 'name')
      .addSelect('d.short_name', 'shortName')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .addSelect('COALESCE(ROUND(AVG(o.progress_percent)), 0)', 'avgProgress')
      .addSelect(
        'COUNT(o.id) FILTER (WHERE o.health_status = :districtDelayed)',
        'delayed',
      )
      .addSelect(
        'COUNT(o.id) FILTER (WHERE o.health_status = :districtAtRisk)',
        'atRisk',
      )
      .setParameters({
        districtDelayed: ObjectHealth.DELAYED,
        districtAtRisk: ObjectHealth.AT_RISK,
      })
      .groupBy('d.id')
      .addGroupBy('d.code')
      .addGroupBy('d.name')
      .addGroupBy('d.short_name')
      .orderBy('COUNT(o.id)', 'DESC')
      .addOrderBy('d.name', 'ASC')
      .getRawMany<Record<string, string>>();

    return rows.map((r) => ({
      districtId: r.districtId,
      code: r.code,
      name: r.name,
      shortName: r.shortName,
      count: Number(r.count),
      totalCost: String(r.totalCost),
      avgProgress: Number(r.avgProgress),
      delayed: Number(r.delayed),
      atRisk: Number(r.atRisk),
    }));
  }

  private async byType(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<Array<Omit<KpiTypeRow, 'percent'>>> {
    const rows = await this.base(metric, query, user)
      .innerJoin('o.type', 't')
      .select('t.id', 'typeId')
      .addSelect('t.code', 'code')
      .addSelect('t.name', 'name')
      .addSelect('t.color', 'color')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .addSelect('COALESCE(ROUND(AVG(o.progress_percent)), 0)', 'avgProgress')
      .groupBy('t.id')
      .addGroupBy('t.code')
      .addGroupBy('t.name')
      .addGroupBy('t.color')
      .orderBy('COUNT(o.id)', 'DESC')
      .addOrderBy('t.name', 'ASC')
      .getRawMany<Record<string, string>>();

    return rows.map((r) => ({
      typeId: r.typeId,
      code: r.code,
      name: r.name,
      color: r.color,
      count: Number(r.count),
      totalCost: String(r.totalCost),
      avgProgress: Number(r.avgProgress),
    }));
  }

  private async byYear(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<KpiPeriodRow[]> {
    const rows = await this.base(metric, query, user)
      .select('EXTRACT(YEAR FROM o.planned_end_date)::int', 'key')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'amount')
      .groupBy('EXTRACT(YEAR FROM o.planned_end_date)')
      .orderBy('key', 'ASC')
      .getRawMany<{ key: number; count: string; amount: string }>();

    return rows.map((r) => ({
      key: Number(r.key),
      count: Number(r.count),
      amount: String(r.amount),
    }));
  }

  private async byMonth(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
    year: number,
  ): Promise<KpiPeriodRow[]> {
    const rows = await this.base(metric, query, user)
      .select('EXTRACT(MONTH FROM o.planned_end_date)::int', 'key')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'amount')
      .andWhere('EXTRACT(YEAR FROM o.planned_end_date) = :kpiMonthYear', {
        kpiMonthYear: year,
      })
      .groupBy('EXTRACT(MONTH FROM o.planned_end_date)')
      .orderBy('key', 'ASC')
      .getRawMany<{ key: number; count: string; amount: string }>();

    return rows.map((r) => ({
      key: Number(r.key),
      count: Number(r.count),
      amount: String(r.amount),
    }));
  }

  /**
   * Nomlangan kesim (pudratchi, moliya manbasi, kechikish sababi).
   *
   * ⚠️ `leftJoin`, `innerJoin` EMAS: biriktirilmagan obyekt ro‘yxatdan
   * tushib qolmaydi, u `id: null` qatorida sanaladi.
   */
  private async byNamed(
    metric: KpiMetric,
    query: DashboardQueryDto,
    user: AuthUser,
    relation: string,
    alias: string,
    withColor: boolean,
    limit?: number,
  ): Promise<Array<Omit<KpiNamedRow, 'percent'>>> {
    const qb = this.base(metric, query, user)
      .leftJoin(relation, alias)
      .select(`${alias}.id`, 'id')
      .addSelect(`${alias}.name`, 'name')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .addSelect('COALESCE(ROUND(AVG(o.progress_percent)), 0)', 'avgProgress')
      .groupBy(`${alias}.id`)
      .addGroupBy(`${alias}.name`)
      .orderBy('COUNT(o.id)', 'DESC')
      .addOrderBy(`${alias}.name`, 'ASC');

    if (withColor) {
      qb.addSelect(`${alias}.color`, 'color').addGroupBy(`${alias}.color`);
    }
    if (limit) qb.limit(limit);

    const rows = await qb.getRawMany<Record<string, string | null>>();

    return rows.map((r) => ({
      id: r.id ?? null,
      name: r.name ?? null,
      color: withColor ? (r.color ?? null) : null,
      count: Number(r.count ?? 0),
      totalCost: String(r.totalCost ?? '0'),
      avgProgress: Number(r.avgProgress ?? 0),
    }));
  }
}

/* ───────────────────────── Sof yordamchilar ───────────────────────── */

function withPercent(
  rows: Array<Omit<KpiBucket, 'percent'>>,
  total: number,
): KpiBucket[] {
  return rows.map((r) => ({ ...r, percent: pct(r.count, total) }));
}

function progressBuckets(
  row: Record<string, string> | undefined,
): Array<Omit<KpiBucket, 'percent'>> {
  return PROGRESS_BUCKETS.map((bucket) => ({
    key: bucket.key,
    count: Number(row?.[bucket.key] ?? 0),
    amount: String(row?.[`${bucket.key}_amount`] ?? '0'),
  }));
}

/**
 * Oylar MAJBURIY to‘ldiriladi — bo‘sh oy ham qatorda turadi.
 *
 * ⚠️ Faqat mavjud oylar yuborilsa, diagramma «mart, iyun, dekabr» ni
 * yonma-yon chizib, oraliqdagi bo‘shliqni ko‘rsatmay qolardi: aynan
 * shu bo‘shliq esa «bu oylarda hech narsa topshirilmaydi» degan
 * javobning o‘zi.
 */
function fillMonths(rows: KpiPeriodRow[]): KpiPeriodRow[] {
  const byMonth = new Map(rows.map((r) => [r.key, r]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return byMonth.get(month) ?? { key: month, count: 0, amount: '0' };
  });
}

/**
 * Pul AYIRISH — satrda, ikki kasr bilan.
 *
 * ⚠️ Float ishlatilmaydi: 7.4 trln so‘mni `Number` bilan ayirish
 * oxirgi tiyinlarni yo‘qotadi. Qiymatlar `numeric(18,2)` bo‘lgani
 * uchun tiyinga aylantirib butun sonlarda hisoblaymiz.
 */
function subtract(a: string, b: string): string {
  const diff = toCents(a) - toCents(b);
  return fromCents(diff > 0n ? diff : 0n);
}

function toCents(value: string): bigint {
  const [intPart = '0', fracPart = ''] = String(value ?? '0').split('.');
  const sign = intPart.startsWith('-') ? -1n : 1n;
  const digits = intPart.replace('-', '') || '0';
  const frac = `${fracPart}00`.slice(0, 2);
  return sign * (BigInt(digits) * 100n + BigInt(frac));
}

function fromCents(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const rest = abs % 100n;
  return `${negative ? '-' : ''}${whole}.${String(rest).padStart(2, '0')}`;
}

/** `part / whole` foizi — nol maxrajda 0. */
function ratio(part: string, whole: string): number {
  const w = toCents(whole);
  if (w <= 0n) return 0;
  return Number(((Number(toCents(part)) / Number(w)) * 100).toFixed(1));
}
