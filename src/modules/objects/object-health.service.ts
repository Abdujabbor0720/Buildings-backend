import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import { DelayStatus } from '../../common/constants/enums';
import { evaluateObjectHealth } from '../../helpers/object-health.helpers';

export interface HealthRefreshReport {
  scanned: number;
  updated: number;
  durationMs: number;
}

/** Bir martada shuncha obyekt o‘qiladi — xotira ham, lock ham cheklangan qoladi. */
const BATCH_SIZE = 500;

/**
 * OBYEKT HOLATINI QAYTA HISOBLASH — yagona yozuvchi.
 *
 * ⚠️ `healthStatus`, `delayDays`, `riskLevel`, `riskScore`, `expectedProgress`,
 * `progressGap`, `openDelayCount`, `primaryDelayReasonId` maydonlariga
 * BOSHQA HECH QAYERDA yozilmaydi. Formula `evaluateObjectHealth()` da,
 * yozish esa shu servisda: ikkala tomoni ham bitta joyda bo‘lgani uchun
 * «dashboard bir raqamni, karta boshqa raqamni ko‘rsatyapti» holati
 * strukturaviy imkonsiz.
 *
 * Chaqiriladi:
 *   • har kecha 02:00 da (`ObjectsCron`) — kun o‘tishi bilan kechikish o‘sadi;
 *   • obyekt yaratilganda / tahrirlanganda;
 *   • bajarilish yangilanganda;
 *   • kechikish ochilganda / yopilganda.
 */
@Injectable()
export class ObjectHealthService {
  private readonly logger = new Logger(ObjectHealthService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Bitta obyekt. Tranzaksiya ichidan chaqirilsa `manager` uzatiladi. */
  async refreshOne(objectId: string, manager?: EntityManager): Promise<void> {
    await this.refreshMany([objectId], manager);
  }

  async refreshMany(
    objectIds: string[],
    manager?: EntityManager,
  ): Promise<number> {
    if (objectIds.length === 0) return 0;
    const em = manager ?? this.dataSource.manager;

    const objects = await em.find(ConstructionObject, {
      where: { id: In(objectIds) },
    });
    if (objects.length === 0) return 0;

    const delayStats = await this.loadDelayStats(
      em,
      objects.map((o) => o.id),
    );
    let updated = 0;

    for (const object of objects) {
      const stats = delayStats.get(object.id);
      const openDelayCount = stats?.openCount ?? 0;

      const result = evaluateObjectHealth({
        status: object.status,
        progressPercent: object.progressPercent,
        plannedStartDate: object.plannedStartDate,
        plannedEndDate: object.plannedEndDate,
        actualStartDate: object.actualStartDate,
        actualEndDate: object.actualEndDate,
        openDelayCount,
      });

      const next = {
        healthStatus: result.health,
        delayDays: result.delayDays,
        expectedProgress: result.expectedProgress,
        progressGap: result.progressGap,
        riskLevel: result.riskLevel,
        riskScore: result.riskScore,
        openDelayCount,
        primaryDelayReasonId: stats?.primaryReasonId ?? null,
        healthCalculatedAt: new Date(),
      };

      // Hech narsa o‘zgarmagan bo‘lsa UPDATE yubormaymiz: 195 obyektda bu
      // sezilmaydi, 50 000 da esa har kecha bekorga yoziladigan WAL bo‘lardi.
      const changed =
        object.healthStatus !== next.healthStatus ||
        object.delayDays !== next.delayDays ||
        object.expectedProgress !== next.expectedProgress ||
        object.progressGap !== next.progressGap ||
        object.riskLevel !== next.riskLevel ||
        object.riskScore !== next.riskScore ||
        object.openDelayCount !== next.openDelayCount ||
        object.primaryDelayReasonId !== next.primaryDelayReasonId;

      if (!changed) continue;

      await em.update(ConstructionObject, { id: object.id }, next);
      updated += 1;
    }

    return updated;
  }

  /** Butun bazani qayta hisoblash — tungi pass va qo‘lda «qayta hisoblash» tugmasi. */
  async refreshAll(): Promise<HealthRefreshReport> {
    const startedAt = Date.now();
    let scanned = 0;
    let updated = 0;
    let offset = 0;

    for (;;) {
      const ids = await this.dataSource
        .getRepository(ConstructionObject)
        .createQueryBuilder('o')
        .select('o.id', 'id')
        .orderBy('o.created_at', 'ASC')
        .offset(offset)
        .limit(BATCH_SIZE)
        .getRawMany<{ id: string }>();

      if (ids.length === 0) break;

      // Har bo‘lak ALOHIDA tranzaksiyada: bitta buzuq yozuv butun tungi
      // passni orqaga qaytarmasligi kerak.
      try {
        updated += await this.dataSource.transaction((em) =>
          this.refreshMany(
            ids.map((r) => r.id),
            em,
          ),
        );
      } catch (error) {
        this.logger.error(
          `Holatni qayta hisoblashda xatolik (offset=${offset})`,
          error instanceof Error ? error.stack : String(error),
        );
      }

      scanned += ids.length;
      offset += BATCH_SIZE;
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Holat qayta hisoblandi: ${updated}/${scanned} obyekt, ${durationMs}ms`,
    );
    return { scanned, updated, durationMs };
  }

  /**
   * Har obyekt uchun ochiq kechikishlar soni va ENG OG‘IR sababi.
   * «Asosiy sabab» — eng ko‘p kun yo‘qotishga sabab bo‘lgani (teng bo‘lsa
   * eng erta aniqlangani): dashboard jadvalida aynan shu ustun ko‘rinadi.
   */
  private async loadDelayStats(
    em: EntityManager,
    objectIds: string[],
  ): Promise<
    Map<string, { openCount: number; primaryReasonId: string | null }>
  > {
    const rows = await em
      .getRepository(ObjectDelay)
      .createQueryBuilder('d')
      .select('d.object_id', 'objectId')
      .addSelect('COUNT(*)', 'openCount')
      .addSelect(
        `(ARRAY_AGG(d.reason_id ORDER BY d.delay_days DESC, d.detected_at ASC))[1]`,
        'primaryReasonId',
      )
      .where('d.object_id IN (:...objectIds)', { objectIds })
      .andWhere('d.status != :resolved', { resolved: DelayStatus.RESOLVED })
      .andWhere('d.deleted_at IS NULL')
      .groupBy('d.object_id')
      .getRawMany<{
        objectId: string;
        openCount: string;
        primaryReasonId: string | null;
      }>();

    return new Map(
      rows.map((r) => [
        r.objectId,
        { openCount: Number(r.openCount), primaryReasonId: r.primaryReasonId },
      ]),
    );
  }
}
