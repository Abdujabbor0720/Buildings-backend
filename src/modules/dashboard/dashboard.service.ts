import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import { ObjectHealth, ObjectStatus } from '../../common/constants/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { tashkentToday } from '../../helpers/date.helpers';
import { fullName, shortName } from '../../helpers/person-name.helpers';
import {
  DelaysService,
  type DelayReasonBreakdown,
} from '../delays/delays.service';
import { GeoService, type DistrictStats } from '../geo/geo.service';
import { applyUserScope, isoDate, pct, scopedObjects } from './dashboard-scope';
import type { DashboardQueryDto } from './dto/dashboard-query.dto';

/* ───────────────────────── Javob shakllari ───────────────────────── */

export interface CountPercent {
  count: number;
  percent: number;
}

export interface DashboardSummary {
  /** Jami obyektlar (sukut bo‘yicha faol). */
  total: number;
  /** Holatlar kesimi — yig‘indisi `total` ga TENG. */
  buckets: {
    onSchedule: number;
    notStarted: number;
    delayed: number;
    atRisk: number;
    completed: number;
  };
  /** Yuqoridagi kartalar. «Reja asosida» = onSchedule + notStarted. */
  cards: {
    onPlan: CountPercent;
    delayed: CountPercent;
    atRisk: CountPercent;
  };
  /** «Joriy yil yakunlanadi» kartasi. */
  completingThisYear: {
    year: number;
    count: number;
    /** 12 ta qiymat — kartadagi ustunchalar (sparkline). */
    byMonth: number[];
  };
  /** «Umumiy qiymat» kartasi. */
  finance: {
    totalCost: string;
    fundedAmount: string;
    paidAmount: string;
    /** Yil kesimida qiymat — kartadagi ustunchalar. */
    byYear: Array<{ year: number; amount: string; count: number }>;
  };
  avgProgress: number;
  /** Ochiq kechikish yozuvlari soni. */
  openDelays: number;
}

export interface DeadlineBucket {
  label: string;
  /**
   * ⚠️ `null` IKKI XIL guruhda uchraydi: «Muddati o‘tgan» va «2028+».
   * Shuning uchun u HOLAT BELGISI sifatida ishlatilmaydi — buning uchun
   * `overdue` bor. Ilgari mijoz `year === null` ni «muddati o‘tgan» deb
   * o‘qib, «2028+» ulushini qizil rangda chizardi.
   */
  year: number | null;
  /** Muddati ALLAQACHON o‘tgan guruh — tartibli rampadan tashqarida. */
  overdue: boolean;
  count: number;
  percent: number;
  color: string;
}

export interface TypeBreakdownItem {
  typeId: string;
  code: string;
  name: string;
  color: string;
  icon: string | null;
  count: number;
  percent: number;
  totalCost: string;
  avgProgress: number;
}

export interface TopDelayedItem {
  id: string;
  code: string;
  name: string;
  districtName: string;
  plannedEndDate: string;
  delayDays: number;
  progressPercent: number;
  healthStatus: ObjectHealth;
  primaryReason: string | null;
  primaryReasonColor: string | null;
  /**
   * OBYEKT MAS'ULI (kurator) — `ConstructionObject.responsible`.
   *
   * ⚠️ Uchta maydon ham kerak: `responsibleName` katakda ko'rinadi
   * («J. Karimov»), `responsibleFullName` va `responsiblePosition`
   * esa ko'rsatmada — ixcham ism kimligini aytadi, lavozim esa
   * «nega aynan u javob beradi» degan savolga javob beradi.
   *
   * ⚠️ `null` — mas'ul BIRIKTIRILMAGAN. Bu xatolik emas, ma'lumot
   * to'liq emasligi: kechikayotgan obyektda mas'ul yo'qligi aynan
   * ko'rinib turishi kerak.
   */
  responsibleName: string | null;
  responsibleFullName: string | null;
  responsiblePosition: string | null;
}

export interface UpcomingItem {
  id: string;
  code: string;
  name: string;
  districtName: string;
  plannedEndDate: string;
  daysLeft: number;
  progressPercent: number;
  healthStatus: ObjectHealth;
  status: ObjectStatus;
}

export interface RecentPhotoItem {
  id: string;
  objectId: string;
  objectName: string;
  districtName: string;
  capturedAt: string;
  progressPercent: number;
  aiVerdict: string;
  aiConfidence: number | null;
  imageUrl: string | null;
}

export interface DashboardPayload {
  summary: DashboardSummary;
  districts: DistrictStats[];
  byDeadline: DeadlineBucket[];
  byType: TypeBreakdownItem[];
  topDelayed: TopDelayedItem[];
  delayReasons: DelayReasonBreakdown[];
  upcoming: UpcomingItem[];
  recentPhotos: RecentPhotoItem[];
  generatedAt: string;
}

/**
 * «Muddatlar bo‘yicha» diagrammasi ranglari.
 *
 * ⚠️ Bu TARTIBLI (ordinal) qator, turkum EMAS: «joriy yil → keyingi yil →
 * undan keyin» tabiiy tartibga ega. Shuning uchun bitta rang oilasining
 * yorug‘lik pog‘onalari — yaqin muddat TO‘Qroq. Har xil ranglar berilsa,
 * o‘quvchi ularni teng turkum deb o‘qiydi va muddat yaqinligini
 * ko‘rmay qoladi.
 *
 * ⚠️ Qorong‘i rejimda tartib teskari bo‘ladi (to‘q fonda yorug‘i
 * ko‘zga tashlanadi) — buni MIJOZ hal qiladi
 * (`DEADLINE_RAMP_DARK`, `useChartColors`). Bu yerdagi qiymatlar
 * yorug‘ rejim uchun va API shartnomasini buzmaslik uchun qoladi.
 */
const DEADLINE_COLORS = ['#7A3D00', '#A85400', '#D86C00', '#FF8C1A'];

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectRepository(PhotoReport)
    private readonly photos: Repository<PhotoReport>,
    private readonly geo: GeoService,
    private readonly delays: DelaysService,
  ) {}

  /**
   * BUTUN DASHBOARD BITTA SO‘ROVDA.
   *
   * ⚠️ Sakkizta alohida endpoint chaqirilsa, sahifa sakkizta yumaloq safar
   * kutardi va bloklar bir-biridan keyin «sakrab» chiqardi. Bu yerda esa
   * so‘rovlar serverda PARALLEL ketadi va foydalanuvchi to‘liq ekranni
   * bir vaqtda oladi. Har bir blok alohida ham ochiq (pastdagi metodlar) —
   * filtr o‘zgarganda faqat kerakli qismi qayta so‘raladi.
   */
  async overview(
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<DashboardPayload> {
    const regionId = query.regionId ?? (await this.geo.getDefaultRegion()).id;
    const q: DashboardQueryDto = { ...query, regionId };

    const [
      summary,
      districts,
      byDeadline,
      byType,
      topDelayed,
      delayReasons,
      upcoming,
      recentPhotos,
    ] = await Promise.all([
      this.summary(q, user),
      this.geo.districtStats({
        regionId,
        yearFrom: query.yearFrom,
        yearTo: query.yearTo,
        typeIds: query.typeIds,
      }),
      this.byDeadline(q, user),
      this.byType(q, user),
      this.topDelayed(q, user, 5),
      this.delays.reasonBreakdown(regionId, true),
      this.upcoming(q, user, 5, 90),
      this.recentPhotos(q, user, 6),
    ]);

    return {
      summary,
      districts,
      byDeadline,
      byType,
      topDelayed,
      delayReasons,
      upcoming,
      recentPhotos,
      generatedAt: new Date().toISOString(),
    };
  }

  /** KPI kartalari — bitta so‘rovda `FILTER (WHERE …)` bilan. */
  async summary(
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<DashboardSummary> {
    const currentYear = tashkentToday().getUTCFullYear();

    const qb = this.scoped(query, user)
      .select('COUNT(o.id)', 'total')
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :onSchedule)`,
        'onSchedule',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :notStarted)`,
        'notStarted',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :delayed)`,
        'delayed',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :atRisk)`,
        'atRisk',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :completed)`,
        'completed',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE EXTRACT(YEAR FROM o.planned_end_date) = :currentYear)`,
        'completingThisYear',
      )
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .addSelect('COALESCE(SUM(o.funded_amount), 0)', 'fundedAmount')
      .addSelect('COALESCE(SUM(o.paid_amount), 0)', 'paidAmount')
      .addSelect(
        'COALESCE(ROUND(AVG(o.progress_percent), 1), 0)',
        'avgProgress',
      )
      .addSelect('COALESCE(SUM(o.open_delay_count), 0)', 'openDelays')
      .setParameters({
        onSchedule: ObjectHealth.ON_SCHEDULE,
        notStarted: ObjectHealth.NOT_STARTED,
        delayed: ObjectHealth.DELAYED,
        atRisk: ObjectHealth.AT_RISK,
        completed: ObjectHealth.COMPLETED,
        currentYear,
      });

    const [row, byMonth, byYear] = await Promise.all([
      qb.getRawOne<Record<string, string>>(),
      this.deadlinesByMonth(query, user, currentYear),
      this.costByYear(query, user),
    ]);

    const total = Number(row?.total ?? 0);
    const onSchedule = Number(row?.onSchedule ?? 0);
    const notStarted = Number(row?.notStarted ?? 0);
    const delayed = Number(row?.delayed ?? 0);
    const atRisk = Number(row?.atRisk ?? 0);
    const completed = Number(row?.completed ?? 0);

    // «Reja asosida» ga hali boshlanmaganlar ham kiradi: ularning reja
    // muddati kelmagan, demak ular KECHIKMAYAPTI.
    const onPlan = onSchedule + notStarted;

    return {
      total,
      buckets: { onSchedule, notStarted, delayed, atRisk, completed },
      cards: {
        onPlan: { count: onPlan, percent: pct(onPlan, total) },
        delayed: { count: delayed, percent: pct(delayed, total) },
        atRisk: { count: atRisk, percent: pct(atRisk, total) },
      },
      completingThisYear: {
        year: currentYear,
        count: Number(row?.completingThisYear ?? 0),
        byMonth,
      },
      finance: {
        totalCost: String(row?.totalCost ?? '0'),
        fundedAmount: String(row?.fundedAmount ?? '0'),
        paidAmount: String(row?.paidAmount ?? '0'),
        byYear,
      },
      avgProgress: Number(row?.avgProgress ?? 0),
      openDelays: Number(row?.openDelays ?? 0),
    };
  }

  /**
   * «MUDDATLAR BO‘YICHA» — joriy yil, keyingi yil va «undan keyin».
   * ⚠️ Yillar qotirib yozilmaydi: 2027-yilda bu diagramma o‘z-o‘zidan
   * 2027 / 2028 / 2029+ ga suriladi.
   */
  async byDeadline(
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<DeadlineBucket[]> {
    const base = tashkentToday().getUTCFullYear();

    const rows = await this.scoped(query, user)
      .select('EXTRACT(YEAR FROM o.planned_end_date)::int', 'year')
      .addSelect('COUNT(o.id)', 'count')
      .groupBy('EXTRACT(YEAR FROM o.planned_end_date)')
      .orderBy('year', 'ASC')
      .getRawMany<{ year: number; count: string }>();

    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
    const inYear = (y: number) =>
      rows.filter((r) => r.year === y).reduce((s, r) => s + Number(r.count), 0);
    const beyond = rows
      .filter((r) => r.year >= base + 2)
      .reduce((s, r) => s + Number(r.count), 0);
    const before = rows
      .filter((r) => r.year < base)
      .reduce((s, r) => s + Number(r.count), 0);

    const buckets: DeadlineBucket[] = [];
    // Muddati ALLAQACHON o‘tgan obyektlar bo‘lsa — ular birinchi va alohida
    // ko‘rinadi, aks holda ular jimgina «joriy yil» ichiga qo‘shilib ketardi.
    if (before > 0) {
      buckets.push({
        label: 'Muddati o‘tgan',
        year: null,
        overdue: true,
        count: before,
        percent: pct(before, total),
        color: '#B42318',
      });
    }
    buckets.push(
      {
        label: `${base}-yil`,
        year: base,
        overdue: false,
        count: inYear(base),
        percent: pct(inYear(base), total),
        color: DEADLINE_COLORS[0],
      },
      {
        label: `${base + 1}-yil`,
        year: base + 1,
        overdue: false,
        count: inYear(base + 1),
        percent: pct(inYear(base + 1), total),
        color: DEADLINE_COLORS[1],
      },
      {
        label: `${base + 2}+`,
        // ⚠️ `year: null` — bu OCHIQ guruh (2028 va undan keyin), bitta
        // yil emas. «Muddati o‘tgan» bilan chalkashmasligi uchun
        // `overdue: false`.
        year: null,
        overdue: false,
        count: beyond,
        percent: pct(beyond, total),
        color: DEADLINE_COLORS[2],
      },
    );

    return buckets.filter((b) => b.count > 0 || b.year !== null);
  }

  /** «QURILISH TURLARI BO‘YICHA». */
  async byType(
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<TypeBreakdownItem[]> {
    const rows = await this.scoped(query, user)
      .innerJoin('o.type', 't')
      .select('t.id', 'typeId')
      .addSelect('t.code', 'code')
      .addSelect('t.name', 'name')
      .addSelect('t.color', 'color')
      .addSelect('t.icon', 'icon')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .addSelect('COALESCE(ROUND(AVG(o.progress_percent)), 0)', 'avgProgress')
      .groupBy('t.id')
      .addGroupBy('t.code')
      .addGroupBy('t.name')
      .addGroupBy('t.color')
      .addGroupBy('t.icon')
      .orderBy('COUNT(o.id)', 'DESC')
      .getRawMany<Record<string, string>>();

    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
    return rows.map((r) => ({
      typeId: r.typeId,
      code: r.code,
      name: r.name,
      color: r.color,
      icon: r.icon,
      count: Number(r.count),
      percent: pct(Number(r.count), total),
      totalCost: String(r.totalCost),
      avgProgress: Number(r.avgProgress),
    }));
  }

  /** «KECHIKAYOTGAN OBYEKTLAR (TOP 5)». */
  async topDelayed(
    query: DashboardQueryDto,
    user: AuthUser,
    limit = 5,
  ): Promise<TopDelayedItem[]> {
    const rows = await this.scoped(query, user)
      .innerJoin('o.district', 'd')
      .leftJoin('o.primaryDelayReason', 'r')
      // ⚠️ `leftJoin`, `innerJoin` EMAS: mas'uli biriktirilmagan obyekt
      // ro'yxatdan TUSHIB QOLMASLIGI kerak — aksincha, u eng muhim
      // qatorlardan biri (kechikayotgan, lekin javobgari yo'q).
      .leftJoin('o.responsible', 'resp')
      .select('o.id', 'id')
      .addSelect('o.code', 'code')
      .addSelect('o.name', 'name')
      .addSelect('o.planned_end_date', 'plannedEndDate')
      .addSelect('o.delay_days', 'delayDays')
      .addSelect('o.progress_percent', 'progressPercent')
      .addSelect('o.health_status', 'healthStatus')
      .addSelect('d.short_name', 'districtName')
      .addSelect('r.name', 'primaryReason')
      .addSelect('r.color', 'primaryReasonColor')
      .addSelect('resp.first_name', 'responsibleFirstName')
      .addSelect('resp.last_name', 'responsibleLastName')
      .addSelect('resp.position', 'responsiblePosition')
      .andWhere('o.delay_days > 0')
      .orderBy('o.delay_days', 'DESC')
      .addOrderBy('o.risk_score', 'DESC')
      .addOrderBy('o.id', 'ASC')
      .limit(limit)
      .getRawMany<Record<string, string>>();

    return rows.map((r) => {
      // ⚠️ Ism `shortName()` / `fullName()` HELPERI bilan yig'iladi,
      // joyida emas: `getRawMany()` xom qator qaytaradi va
      // `User.shortName` getteri ISHLAMAYDI. Formulani bu yerda
      // qaytadan yozsak, bitta ekranda «J. Karimov», boshqasida
      // «Jahongir Karimov» chiqib qolardi.
      const person = {
        firstName: r.responsibleFirstName,
        lastName: r.responsibleLastName,
      };
      const hasResponsible = Boolean(
        r.responsibleLastName ?? r.responsibleFirstName,
      );

      return {
        id: r.id,
        code: r.code,
        name: r.name,
        districtName: r.districtName,
        plannedEndDate: isoDate(r.plannedEndDate),
        delayDays: Number(r.delayDays),
        progressPercent: Number(r.progressPercent),
        healthStatus: r.healthStatus as ObjectHealth,
        primaryReason: r.primaryReason ?? null,
        primaryReasonColor: r.primaryReasonColor ?? null,
        responsibleName: hasResponsible ? shortName(person) : null,
        responsibleFullName: hasResponsible ? fullName(person) : null,
        responsiblePosition: r.responsiblePosition ?? null,
      };
    });
  }

  /** «YAQIN MUDDATDA TOPSHIRILADIGAN OBYEKTLAR». */
  async upcoming(
    query: DashboardQueryDto,
    user: AuthUser,
    limit = 5,
    withinDays = 90,
  ): Promise<UpcomingItem[]> {
    const rows = await this.scoped(query, user)
      .innerJoin('o.district', 'd')
      .select('o.id', 'id')
      .addSelect('o.code', 'code')
      .addSelect('o.name', 'name')
      .addSelect('o.planned_end_date', 'plannedEndDate')
      .addSelect('o.progress_percent', 'progressPercent')
      .addSelect('o.health_status', 'healthStatus')
      .addSelect('o.status', 'status')
      .addSelect('(o.planned_end_date - CURRENT_DATE)', 'daysLeft')
      .addSelect('d.short_name', 'districtName')
      .andWhere('o.planned_end_date >= CURRENT_DATE')
      .andWhere('o.planned_end_date <= CURRENT_DATE + :withinDays::int', {
        withinDays,
      })
      .andWhere('o.status != :completedStatus', {
        completedStatus: ObjectStatus.COMPLETED,
      })
      .orderBy('o.planned_end_date', 'ASC')
      .addOrderBy('o.id', 'ASC')
      .limit(limit)
      .getRawMany<Record<string, string>>();

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      districtName: r.districtName,
      plannedEndDate: isoDate(r.plannedEndDate),
      daysLeft: Number(r.daysLeft),
      progressPercent: Number(r.progressPercent),
      healthStatus: r.healthStatus as ObjectHealth,
      status: r.status as ObjectStatus,
    }));
  }

  /** «SO‘NGGI FOTO-HISOBOTLAR». */
  async recentPhotos(
    query: DashboardQueryDto,
    user: AuthUser,
    limit = 6,
  ): Promise<RecentPhotoItem[]> {
    const qb = this.photos
      .createQueryBuilder('p')
      .innerJoin('p.object', 'o')
      .innerJoin('o.district', 'd')
      .leftJoin('p.images', 'img', 'img.sort_order = 0')
      .select('p.id', 'id')
      .addSelect('p.object_id', 'objectId')
      .addSelect('p.captured_at', 'capturedAt')
      .addSelect('p.progress_percent', 'progressPercent')
      .addSelect('p.ai_verdict', 'aiVerdict')
      .addSelect('p.ai_confidence', 'aiConfidence')
      .addSelect('o.name', 'objectName')
      .addSelect('d.short_name', 'districtName')
      .addSelect('img.url', 'imageUrl')
      .where('o.deleted_at IS NULL')
      .orderBy('p.captured_at', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .limit(limit);

    applyUserScope(qb, user);
    if (query.regionId)
      qb.andWhere('o.region_id = :regionId', { regionId: query.regionId });
    if (query.districtIds?.length) {
      qb.andWhere('o.district_id IN (:...districtIds)', {
        districtIds: query.districtIds,
      });
    }

    const rows = await qb.getRawMany<Record<string, string>>();
    return rows.map((r) => ({
      id: r.id,
      objectId: r.objectId,
      objectName: r.objectName,
      districtName: r.districtName,
      capturedAt: new Date(r.capturedAt).toISOString(),
      progressPercent: Number(r.progressPercent),
      aiVerdict: r.aiVerdict,
      aiConfidence: r.aiConfidence === null ? null : Number(r.aiConfidence),
      imageUrl: r.imageUrl ?? null,
    }));
  }

  /* ───────────────────────── Ichki ───────────────────────── */

  /** Joriy yilda oylar bo‘yicha topshirish rejasi — kartadagi ustunchalar. */
  private async deadlinesByMonth(
    query: DashboardQueryDto,
    user: AuthUser,
    year: number,
  ): Promise<number[]> {
    const rows = await this.scoped(query, user)
      .select('EXTRACT(MONTH FROM o.planned_end_date)::int', 'month')
      .addSelect('COUNT(o.id)', 'count')
      .andWhere('EXTRACT(YEAR FROM o.planned_end_date) = :year', { year })
      .groupBy('EXTRACT(MONTH FROM o.planned_end_date)')
      .getRawMany<{ month: number; count: string }>();

    const months = new Array<number>(12).fill(0);
    for (const r of rows) months[r.month - 1] = Number(r.count);
    return months;
  }

  private async costByYear(
    query: DashboardQueryDto,
    user: AuthUser,
  ): Promise<Array<{ year: number; amount: string; count: number }>> {
    const rows = await this.scoped(query, user)
      .select('EXTRACT(YEAR FROM o.planned_end_date)::int', 'year')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'amount')
      .addSelect('COUNT(o.id)', 'count')
      .groupBy('EXTRACT(YEAR FROM o.planned_end_date)')
      .orderBy('year', 'ASC')
      .getRawMany<{ year: number; amount: string; count: string }>();

    return rows.map((r) => ({
      year: r.year,
      amount: String(r.amount),
      count: Number(r.count),
    }));
  }

  /**
   * Filtr + rol doirasi qo‘llangan asosiy so‘rov.
   *
   * ⚠️ Mantiq `dashboard-scope.ts` da — kartalar va ularning batafsil
   * sahifalari AYNI to‘plamni ko‘rishi uchun (nusxa ko‘chirmang).
   */
  private scoped(
    query: DashboardQueryDto,
    user: AuthUser,
  ): SelectQueryBuilder<ConstructionObject> {
    return scopedObjects(this.objects, query, user);
  }
}
