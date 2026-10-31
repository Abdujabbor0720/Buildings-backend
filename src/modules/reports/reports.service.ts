import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workbook, type Worksheet } from 'exceljs';
import { Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import { DelayStatus, ObjectStatus } from '../../common/constants/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { formatDateUz, formatMonthUz } from '../../helpers/date.helpers';
import {
  HEALTH_LABELS_UZ,
  RISK_LABELS_UZ,
  STATUS_LABELS_UZ,
} from '../../helpers/object-health.helpers';
import { GeoService } from '../geo/geo.service';

export interface ProgressTimelinePoint {
  month: string;
  label: string;
  avgProgress: number;
  updates: number;
  completed: number;
}

/** Excel sarlavha uslubi — barcha varaqlarda BITTA joydan. */
const HEADER_FILL = 'FF1E3A8A';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectRepository(ObjectDelay)
    private readonly delays: Repository<ObjectDelay>,
    private readonly geo: GeoService,
  ) {}

  /**
   * BAJARILISH DINAMIKASI — oylar kesimida.
   * `generate_series` ishlatiladi: hisobot yozilmagan oy ham nol bilan
   * qatorda turishi kerak, aks holda grafikda oylar «sakrab» ketardi.
   */
  async progressTimeline(
    months = 12,
    regionId?: string,
  ): Promise<ProgressTimelinePoint[]> {
    const rows = await this.objects.query<
      Array<{
        month: Date;
        avg_progress: string;
        updates: string;
        completed: string;
      }>
    >(
      `WITH series AS (
         SELECT generate_series(
                  date_trunc('month', CURRENT_DATE) - ($1::int - 1) * INTERVAL '1 month',
                  date_trunc('month', CURRENT_DATE),
                  INTERVAL '1 month'
                )::date AS month
       )
       SELECT s.month,
              COALESCE(ROUND(AVG(p.progress_percent), 1), 0)::text AS avg_progress,
              COUNT(p.id)::text                                    AS updates,
              COUNT(DISTINCT o.id) FILTER (
                WHERE o.actual_end_date IS NOT NULL
                  AND date_trunc('month', o.actual_end_date) = s.month
              )::text                                              AS completed
         FROM series s
         LEFT JOIN object_progress_updates p
                ON date_trunc('month', p.report_date) = s.month
               AND p.deleted_at IS NULL
         LEFT JOIN construction_objects o
                ON o.id = p.object_id
               AND o.deleted_at IS NULL
               AND ($2::uuid IS NULL OR o.region_id = $2::uuid)
        GROUP BY s.month
        ORDER BY s.month ASC`,
      [months, regionId ?? null],
    );

    return rows.map((r) => ({
      month: new Date(r.month).toISOString().slice(0, 7),
      label: formatMonthUz(r.month, { utc: true }),
      avgProgress: Number(r.avg_progress),
      updates: Number(r.updates),
      completed: Number(r.completed),
    }));
  }

  /** Umumiy hisobot — «Hisobotlar» bo‘limining birinchi ekrani. */
  async summary(regionId?: string): Promise<{
    byStatus: Array<{
      status: ObjectStatus;
      label: string;
      count: number;
      totalCost: string;
    }>;
    byDistrict: Awaited<ReturnType<GeoService['districtStats']>>;
    timeline: ProgressTimelinePoint[];
    delaysByStatus: Array<{ status: DelayStatus; count: number }>;
  }> {
    const statusQb = this.objects
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .groupBy('o.status');
    if (regionId) statusQb.andWhere('o.region_id = :regionId', { regionId });

    const delayQb = this.delays
      .createQueryBuilder('d')
      .innerJoin('d.object', 'o')
      .select('d.status', 'status')
      .addSelect('COUNT(d.id)', 'count')
      .where('o.deleted_at IS NULL')
      .groupBy('d.status');
    if (regionId) delayQb.andWhere('o.region_id = :regionId', { regionId });

    const [statusRows, byDistrict, timeline, delayRows] = await Promise.all([
      statusQb.getRawMany<{
        status: ObjectStatus;
        count: string;
        totalCost: string;
      }>(),
      this.geo.districtStats({ regionId }),
      this.progressTimeline(12, regionId),
      delayQb.getRawMany<{ status: DelayStatus; count: string }>(),
    ]);

    return {
      byStatus: statusRows.map((r) => ({
        status: r.status,
        label: STATUS_LABELS_UZ[r.status] ?? r.status,
        count: Number(r.count),
        totalCost: String(r.totalCost),
      })),
      byDistrict,
      timeline,
      delaysByStatus: delayRows.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
    };
  }

  /* ───────────────────────── Excel eksporti ───────────────────────── */

  async exportObjects(user: AuthUser, regionId?: string): Promise<Buffer> {
    const qb = this.objects
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.district', 'd')
      .leftJoinAndSelect('o.type', 't')
      .leftJoinAndSelect('o.contractor', 'c')
      .leftJoinAndSelect('o.responsible', 'r')
      .leftJoinAndSelect('o.primaryDelayReason', 'dr')
      .orderBy('d.name', 'ASC')
      .addOrderBy('o.name', 'ASC');

    if (regionId) qb.andWhere('o.region_id = :regionId', { regionId });
    if (user.districtId)
      qb.andWhere('o.district_id = :did', { did: user.districtId });
    else if (user.regionId)
      qb.andWhere('o.region_id = :rid', { rid: user.regionId });
    if (user.contractorId)
      qb.andWhere('o.contractor_id = :cid', { cid: user.contractorId });

    const objects = await qb.getMany();

    const workbook = this.newWorkbook();
    const sheet = workbook.addWorksheet('Obyektlar', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    this.setHeader(sheet, [
      { header: 'Kod', key: 'code', width: 16 },
      { header: 'Obyekt nomi', key: 'name', width: 44 },
      { header: 'Tuman', key: 'district', width: 18 },
      { header: 'Turi', key: 'type', width: 22 },
      { header: 'Pudratchi', key: 'contractor', width: 30 },
      { header: 'Mas’ul', key: 'responsible', width: 24 },
      { header: 'Reja boshlanishi', key: 'plannedStart', width: 18 },
      { header: 'Reja muddati', key: 'plannedEnd', width: 18 },
      { header: 'Bajarilish, %', key: 'progress', width: 14 },
      { header: 'Reja bo‘yicha, %', key: 'expected', width: 16 },
      { header: 'Holati', key: 'health', width: 18 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Kechikish, kun', key: 'delayDays', width: 15 },
      { header: 'Asosiy sabab', key: 'reason', width: 28 },
      { header: 'Risk', key: 'risk', width: 12 },
      { header: 'Loyiha qiymati, so‘m', key: 'totalCost', width: 22 },
      { header: 'Ajratilgan, so‘m', key: 'funded', width: 20 },
      { header: 'To‘langan, so‘m', key: 'paid', width: 20 },
    ]);

    for (const o of objects) {
      sheet.addRow({
        code: o.code,
        name: o.name,
        district: o.district?.shortName ?? '—',
        type: o.type?.name ?? '—',
        contractor: o.contractor?.name ?? '—',
        responsible: o.responsible
          ? `${o.responsible.lastName} ${o.responsible.firstName}`
          : '—',
        // ⚠️ Sana `formatDateUz` orqali — Excel ham foydalanuvchi ko‘radigan
        // joy, u yerda ham formati bitta bo‘lishi kerak.
        plannedStart: formatDateUz(o.plannedStartDate, { utc: true }),
        plannedEnd: formatDateUz(o.plannedEndDate, { utc: true }),
        progress: o.progressPercent,
        expected: o.expectedProgress,
        health: HEALTH_LABELS_UZ[o.healthStatus],
        status: STATUS_LABELS_UZ[o.status],
        delayDays: o.delayDays,
        reason: o.primaryDelayReason?.name ?? '—',
        risk: RISK_LABELS_UZ[o.riskLevel],
        totalCost: Number(o.totalCost),
        funded: Number(o.fundedAmount),
        paid: Number(o.paidAmount),
      });
    }

    this.formatNumbers(sheet, ['totalCost', 'funded', 'paid'], '#,##0');
    this.formatNumbers(sheet, ['progress', 'expected'], '0.0"%"');
    sheet.autoFilter = {
      from: 'A1',
      to: { row: 1, column: sheet.columnCount },
    };

    return this.toBuffer(workbook);
  }

  async exportDistricts(regionId?: string): Promise<Buffer> {
    const stats = await this.geo.districtStats({ regionId });
    const workbook = this.newWorkbook();
    const sheet = workbook.addWorksheet('Tumanlar kesimida', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    this.setHeader(sheet, [
      { header: '#', key: 'index', width: 6 },
      { header: 'Tuman', key: 'name', width: 26 },
      { header: 'Jami', key: 'total', width: 10 },
      { header: 'Reja asosida', key: 'onSchedule', width: 15 },
      { header: 'Kechikayotgan', key: 'delayed', width: 16 },
      { header: 'Xavfli', key: 'atRisk', width: 12 },
      { header: 'Boshlanmagan', key: 'notStarted', width: 15 },
      { header: 'O‘rtacha bajarilish, %', key: 'avgProgress', width: 22 },
      { header: 'Umumiy qiymat, so‘m', key: 'totalCost', width: 24 },
    ]);

    stats.forEach((s, i) => {
      sheet.addRow({
        index: i + 1,
        name: s.name,
        total: s.total,
        onSchedule: s.onSchedule,
        delayed: s.delayed,
        atRisk: s.atRisk,
        notStarted: s.notStarted,
        avgProgress: s.avgProgress,
        totalCost: Number(s.totalCost),
      });
    });

    // Jami qatori — hisobotni chop etganda pastda yakun turishi kerak.
    const totalRow = sheet.addRow({
      index: '',
      name: 'JAMI',
      total: stats.reduce((s, r) => s + r.total, 0),
      onSchedule: stats.reduce((s, r) => s + r.onSchedule, 0),
      delayed: stats.reduce((s, r) => s + r.delayed, 0),
      atRisk: stats.reduce((s, r) => s + r.atRisk, 0),
      notStarted: stats.reduce((s, r) => s + r.notStarted, 0),
      avgProgress: stats.length
        ? Number(
            (
              stats.reduce((s, r) => s + r.avgProgress, 0) / stats.length
            ).toFixed(1),
          )
        : 0,
      totalCost: stats.reduce((s, r) => s + Number(r.totalCost), 0),
    });
    totalRow.font = { bold: true };

    this.formatNumbers(sheet, ['totalCost'], '#,##0');
    return this.toBuffer(workbook);
  }

  async exportDelays(regionId?: string): Promise<Buffer> {
    const qb = this.delays
      .createQueryBuilder('d')
      .innerJoinAndSelect('d.object', 'o')
      .leftJoinAndSelect('o.district', 'dist')
      .innerJoinAndSelect('d.reason', 'r')
      .leftJoinAndSelect('d.responsible', 'resp')
      .where('o.deleted_at IS NULL')
      .orderBy('d.delayDays', 'DESC');
    if (regionId) qb.andWhere('o.region_id = :regionId', { regionId });

    const delays = await qb.getMany();

    const workbook = this.newWorkbook();
    const sheet = workbook.addWorksheet('Kechikishlar', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    this.setHeader(sheet, [
      { header: 'Obyekt', key: 'object', width: 44 },
      { header: 'Tuman', key: 'district', width: 18 },
      { header: 'Sabab', key: 'reason', width: 30 },
      { header: 'Kechikish, kun', key: 'days', width: 15 },
      { header: 'Jiddiylik', key: 'severity', width: 14 },
      { header: 'Holati', key: 'status', width: 14 },
      { header: 'Aniqlangan', key: 'detected', width: 18 },
      { header: 'Hal qilingan', key: 'resolved', width: 18 },
      { header: 'Mas’ul', key: 'responsible', width: 24 },
      { header: 'Izoh', key: 'description', width: 60 },
    ]);

    const statusLabels: Record<DelayStatus, string> = {
      [DelayStatus.OPEN]: 'Ochiq',
      [DelayStatus.MITIGATING]: 'Bartaraf etilmoqda',
      [DelayStatus.RESOLVED]: 'Hal qilingan',
    };

    for (const d of delays) {
      sheet.addRow({
        object: d.object?.name ?? '—',
        district: d.object?.district?.shortName ?? '—',
        reason: d.reason?.name ?? '—',
        days: d.delayDays,
        severity: RISK_LABELS_UZ[d.severity],
        status: statusLabels[d.status],
        detected: formatDateUz(d.detectedAt, { utc: true }),
        resolved: formatDateUz(d.resolvedAt, { utc: true }),
        responsible: d.responsible
          ? `${d.responsible.lastName} ${d.responsible.firstName}`
          : '—',
        description: d.description ?? '',
      });
    }

    return this.toBuffer(workbook);
  }

  /* ───────────────────────── Excel yordamchilari ───────────────────────── */

  private newWorkbook(): Workbook {
    const workbook = new Workbook();
    workbook.creator = 'Qurilish obyektlari nazorati tizimi';
    workbook.created = new Date();
    return workbook;
  }

  private setHeader(
    sheet: Worksheet,
    columns: Array<{ header: string; key: string; width: number }>,
  ): void {
    sheet.columns = columns;
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
    header.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    header.height = 28;
  }

  private formatNumbers(
    sheet: Worksheet,
    keys: string[],
    format: string,
  ): void {
    for (const key of keys) {
      const column = sheet.getColumn(key);
      column.numFmt = format;
      column.alignment = { horizontal: 'right' };
    }
  }

  private async toBuffer(workbook: Workbook): Promise<Buffer> {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
