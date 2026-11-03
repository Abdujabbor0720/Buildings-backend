import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAnalysis } from '../../database/entities/ai-analysis.entity';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectMilestone } from '../../database/entities/object-milestone.entity';
import { ObjectProgressUpdate } from '../../database/entities/object-progress-update.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import {
  AiAnalysisType,
  MilestoneStatus,
  ObjectStatus,
  RiskLevel,
} from '../../common/constants/enums';
import { tashkentToday, toDateKey } from '../../helpers/date.helpers';
import { planProgress } from '../../helpers/milestone-plan.helpers';
import {
  analyzeAll,
  analyzeMilestone as runMilestoneAnalysis,
  type AnalysisInput,
  type MilestoneAnalysisInput,
} from './ai-engine.helpers';

export const AI_MODEL_NAME = 'rule-engine-v1';

export interface AiOverview {
  /** Eng yuqori riskli obyektlar. */
  topRisks: Array<{
    objectId: string;
    objectName: string;
    districtName: string;
    score: number;
    riskLevel: RiskLevel;
    summary: string;
  }>;
  /** Risk darajalari bo‘yicha taqsimot. */
  distribution: Array<{ level: RiskLevel; count: number; percent: number }>;
  /** Eng ko‘p uchragan tavsiyalar. */
  commonRecommendations: Array<{ text: string; count: number }>;
  analyzedObjects: number;
  lastRunAt: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AiAnalysis)
    private readonly analyses: Repository<AiAnalysis>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectRepository(ObjectProgressUpdate)
    private readonly progress: Repository<ObjectProgressUpdate>,
    @InjectRepository(ObjectMilestone)
    private readonly milestones: Repository<ObjectMilestone>,
    @InjectRepository(PhotoReport)
    private readonly photos: Repository<PhotoReport>,
  ) {}

  /** Bitta obyekt bo‘yicha oxirgi tahlillar. */
  async forObject(objectId: string): Promise<AiAnalysis[]> {
    const object = await this.objects.findOne({ where: { id: objectId } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');

    // Har tur bo‘yicha FAQAT oxirgisi: tarix bazada qoladi, lekin
    // ekranda eski prognoz yangisi yonida turib chalkashtirmasligi kerak.
    const rows = await this.analyses
      .createQueryBuilder('a')
      .distinctOn(['a.type'])
      .where('a.object_id = :objectId', { objectId })
      // ⚠️ Bosqich tahlillari CHETDA qoladi: ular `type` bo‘yicha bitta
      // guruhga tushib, tasodifiy bitta bosqich butun obyekt tahlili
      // o‘rniga ko‘rinib qolardi. Ular `forMilestones()` dan olinadi.
      .andWhere('a.milestone_id IS NULL')
      .orderBy('a.type', 'ASC')
      .addOrderBy('a.createdAt', 'DESC')
      .getMany();

    return rows;
  }

  /** Obyektni shu yerda va hozir tahlil qilish. */
  async analyzeObject(objectId: string): Promise<AiAnalysis[]> {
    const object = await this.objects.findOne({ where: { id: objectId } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');

    const input = await this.buildInput(object);
    const results = analyzeAll(input, tashkentToday());

    const saved = await this.analyses.save(
      results.map((r) =>
        this.analyses.create({
          objectId,
          type: r.type,
          score: r.score,
          riskLevel: r.riskLevel,
          summary: r.summary,
          recommendations: r.recommendations,
          details: r.details,
          model: AI_MODEL_NAME,
        }),
      ),
    );

    return saved;
  }

  /* ═════════════════ BOSQICHLAR (ish rejasi) ═════════════════ */

  /** Obyektdagi HAR BOSQICH bo‘yicha oxirgi tahlil. */
  async forMilestones(objectId: string): Promise<AiAnalysis[]> {
    return this.analyses
      .createQueryBuilder('a')
      .distinctOn(['a.milestone_id'])
      .where('a.object_id = :objectId', { objectId })
      .andWhere('a.milestone_id IS NOT NULL')
      .orderBy('a.milestone_id', 'ASC')
      .addOrderBy('a.createdAt', 'DESC')
      .getMany();
  }

  /**
   * BITTA BOSQICHNI TAHLIL QILISH.
   *
   * ⚠️ Obyekt bajarilishi BOSQICHLARDAN hisoblanadi (`weight × percent`),
   * obyektdagi keshlangan ustundan EMAS. Sabab: topshirish va tahlil
   * bitta so‘rovda ketma-ket boradi va kesh hali yangilanmagan bo‘lishi
   * mumkin — u paytda AI topshirishdan OLDINGI foizni aytib yuborardi.
   */
  async analyzeMilestone(milestoneId: string): Promise<AiAnalysis> {
    const milestone = await this.milestones.findOne({
      where: { id: milestoneId },
      relations: { object: true },
    });
    if (!milestone) throw new NotFoundException('Bosqich topilmadi');

    const siblings = await this.milestones.find({
      where: { objectId: milestone.objectId },
    });
    const active = siblings.filter(
      (m) => m.status !== MilestoneStatus.CANCELLED,
    );
    /*
     * ⚠️ Hisob `planProgress()` dan — `MilestonesService` ham AYNAN shu
     * funksiyani chaqiradi. Ikki nusxa bo‘lsa, topshirishdan keyin
     * obyekt kartasi bir foizni, AI xulosasi boshqa foizni aytardi.
     */
    const objectProgress =
      planProgress(siblings) ?? Number(milestone.object.progressPercent);

    /*
     * Modelning SURATDAN bergan oxirgi bahosi — shu bosqich bo‘yicha.
     * Bo‘lmasa `null` va tahlil bu omilni umuman eslatmaydi: «ma’lumot
     * yo‘q» ni «0%» deb ko‘rsatish eng xavfli xato bo‘lardi.
     */
    const lastVision = await this.photos.findOne({
      where: { milestoneId },
      order: { createdAt: 'DESC' },
      select: { id: true, aiEstimatedProgress: true, createdAt: true },
    });

    const input: MilestoneAnalysisInput = {
      milestoneName: milestone.name,
      objectName: milestone.object.name,
      weight: Number(milestone.weight),
      milestonePercent: Number(milestone.progressPercent),
      plannedStart: toDateKey(milestone.plannedStart)!,
      plannedEnd: toDateKey(milestone.plannedEnd)!,
      actualEnd: milestone.actualEnd ? toDateKey(milestone.actualEnd) : null,
      cancelled: milestone.status === MilestoneStatus.CANCELLED,
      workerCount: milestone.workerCount,
      reportCount: milestone.reportCount,
      aiEstimatedProgress: lastVision?.aiEstimatedProgress ?? null,
      objectProgress,
      objectExpectedProgress: Number(milestone.object.expectedProgress),
      totalMilestones: active.length,
      doneMilestones: active.filter(
        (m) => Number(m.progressPercent) >= 100 || m.actualEnd !== null,
      ).length,
    };

    const result = runMilestoneAnalysis(input, tashkentToday());

    return this.analyses.save(
      this.analyses.create({
        objectId: milestone.objectId,
        milestoneId: milestone.id,
        type: result.type,
        score: result.score,
        riskLevel: result.riskLevel,
        summary: result.summary,
        recommendations: result.recommendations,
        details: result.details,
        model: AI_MODEL_NAME,
      }),
    );
  }

  /** Obyektning HAMMA bosqichini tahlil qilish — «Ish rejasi» tugmasi. */
  async analyzeObjectMilestones(objectId: string): Promise<AiAnalysis[]> {
    const rows = await this.milestones.find({
      where: { objectId },
      order: { sortOrder: 'ASC' },
    });
    const out: AiAnalysis[] = [];
    for (const row of rows) {
      // ⚠️ Bittasi yiqilsa qolganlari baribir tahlil qilinadi — aks
      // holda bitta buzuq bosqich butun rejani tahlilsiz qoldirardi.
      try {
        out.push(await this.analyzeMilestone(row.id));
      } catch (error) {
        this.logger.warn(
          `Bosqich tahlili yiqildi: ${row.id} — ${String(error)}`,
        );
      }
    }
    return out;
  }

  /**
   * TANLANGAN OBYEKTLARNI tahlil qilish.
   *
   * ⚠️ Tanlov MAJBURIY va yuqori chegarali. «Hammasini tahlil qilish»
   * alohida yo‘lda (`runNow`) qoladi, chunki u butun bazani aylanadi va
   * `settings.manage` ruxsatini talab qiladi — tasodifan bosilib
   * qolmasligi kerak.
   */
  async analyzeMany(
    objectIds: string[],
    withMilestones: boolean,
  ): Promise<{
    analyzed: number;
    failed: number;
    milestones: number;
    results: Array<{ objectId: string; ok: boolean; message?: string }>;
  }> {
    const results: Array<{
      objectId: string;
      ok: boolean;
      message?: string;
    }> = [];
    let analyzed = 0;
    let failed = 0;
    let milestones = 0;

    for (const objectId of objectIds) {
      try {
        await this.analyzeObject(objectId);
        if (withMilestones) {
          milestones += (await this.analyzeObjectMilestones(objectId)).length;
        }
        analyzed += 1;
        results.push({ objectId, ok: true });
      } catch (error) {
        failed += 1;
        results.push({
          objectId,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { analyzed, failed, milestones, results };
  }

  /** «AI tahlil» bo‘limining bosh ekrani. */
  async overview(regionId?: string, limit = 10): Promise<AiOverview> {
    const qb = this.analyses
      .createQueryBuilder('a')
      .distinctOn(['a.object_id'])
      .innerJoin('a.object', 'o')
      .innerJoin('o.district', 'd')
      .select('a.object_id', 'objectId')
      .addSelect('a.score', 'score')
      .addSelect('a.risk_level', 'riskLevel')
      .addSelect('a.summary', 'summary')
      .addSelect('a.created_at', 'createdAt')
      .addSelect('o.name', 'objectName')
      .addSelect('d.short_name', 'districtName')
      .where('a.type = :type', { type: AiAnalysisType.RISK_SCORE })
      .andWhere('a.milestone_id IS NULL')
      .andWhere('o.deleted_at IS NULL')
      .orderBy('a.object_id', 'ASC')
      .addOrderBy('a.created_at', 'DESC');

    if (regionId) qb.andWhere('o.region_id = :regionId', { regionId });

    const latest = await qb.getRawMany<Record<string, string>>();

    const counts: Record<RiskLevel, number> = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.CRITICAL]: 0,
    };
    for (const r of latest) counts[r.riskLevel as RiskLevel] += 1;
    const total = latest.length;

    const recommendations = await this.topRecommendations(regionId);
    const lastRun = latest.reduce<string | null>((max, r) => {
      const t = new Date(r.createdAt).toISOString();
      return max === null || t > max ? t : max;
    }, null);

    return {
      topRisks: latest
        .sort((a, b) => Number(b.score) - Number(a.score))
        .slice(0, limit)
        .map((r) => ({
          objectId: r.objectId,
          objectName: r.objectName,
          districtName: r.districtName,
          score: Number(r.score),
          riskLevel: r.riskLevel as RiskLevel,
          summary: r.summary,
        })),
      distribution: (Object.keys(counts) as RiskLevel[]).map((level) => ({
        level,
        count: counts[level],
        percent:
          total > 0 ? Number(((counts[level] / total) * 100).toFixed(1)) : 0,
      })),
      commonRecommendations: recommendations,
      analyzedObjects: total,
      lastRunAt: lastRun,
    };
  }

  /**
   * HAMMA FAOL OBYEKTNI TAHLIL QILISH — tungi pass (03:00).
   * 02:00 (holat) va 02:30 (bildirishnoma) dan KEYIN: tahlil yangilangan
   * holatga tayanishi kerak.
   */
  @Cron('0 3 * * *', { name: 'ai-analysis', timeZone: 'Asia/Tashkent' })
  async analyzeAllObjects(): Promise<{ analyzed: number; failed: number }> {
    const objects = await this.objects.find({
      where: [
        { status: ObjectStatus.IN_PROGRESS },
        { status: ObjectStatus.NOT_STARTED },
      ],
    });

    let analyzed = 0;
    let failed = 0;

    for (const object of objects) {
      try {
        await this.analyzeObject(object.id);
        analyzed += 1;
      } catch (error) {
        // ⚠️ Bitta obyekt yiqilsa qolganlari baribir tahlil qilinadi.
        failed += 1;
        this.logger.warn(
          `AI tahlil yiqildi: ${object.code} — ${String(error)}`,
        );
      }
    }

    this.logger.log(
      `AI tahlil yakunlandi: ${analyzed} ta obyekt, ${failed} ta xatolik`,
    );
    return { analyzed, failed };
  }

  /** Tugma orqali — hokim «hozir tahlil qil» desa. */
  async runNow(): Promise<{ analyzed: number; failed: number }> {
    return this.analyzeAllObjects();
  }

  private async buildInput(object: ConstructionObject): Promise<AnalysisInput> {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const recent = await this.progress
      .createQueryBuilder('p')
      .select('p.report_date', 'date')
      .addSelect('p.progress_percent', 'percent')
      .where('p.object_id = :objectId', { objectId: object.id })
      .andWhere('p.report_date >= :since', { since: toDateKey(since) })
      .orderBy('p.report_date', 'ASC')
      .getRawMany<{ date: string | Date; percent: string }>();

    return {
      objectName: object.name,
      progressPercent: object.progressPercent,
      expectedProgress: object.expectedProgress,
      plannedStartDate: object.plannedStartDate,
      plannedEndDate: object.plannedEndDate,
      delayDays: object.delayDays,
      openDelayCount: object.openDelayCount,
      totalCost: Number(object.totalCost),
      fundedAmount: Number(object.fundedAmount),
      paidAmount: Number(object.paidAmount),
      recentProgress: recent.map((r) => ({
        date: toDateKey(r.date)!,
        percent: Number(r.percent),
      })),
      lastReportAt: object.lastReportAt,
    };
  }

  /**
   * Eng ko‘p takrorlangan tavsiyalar.
   *
   * ⚠️ XOM SQL ataylab: `recommendations` — `jsonb` massivi va uni yoyish
   * uchun `LATERAL jsonb_array_elements_text(...)` kerak. QueryBuilder'ning
   * `innerJoin()` metodi birinchi argumentni JADVAL NOMI deb olib, uni
   * qo‘shtirnoqqa oladi va `relation "LATERAL ..." does not exist` xatosi
   * chiqadi. Shu sababli bu yerda so‘rov to‘g‘ridan-to‘g‘ri yoziladi.
   */
  private async topRecommendations(
    regionId?: string,
  ): Promise<Array<{ text: string; count: number }>> {
    const rows = await this.analyses.query<
      Array<{ text: string; count: string }>
    >(
      `SELECT rec.value AS text, COUNT(*)::text AS count
         FROM ai_analyses a
         JOIN construction_objects o ON o.id = a.object_id
        CROSS JOIN LATERAL jsonb_array_elements_text(a.recommendations) AS rec(value)
        WHERE a.recommendations IS NOT NULL
          AND a.deleted_at IS NULL
          AND o.deleted_at IS NULL
          AND a.created_at > NOW() - INTERVAL '7 days'
          AND ($1::uuid IS NULL OR o.region_id = $1::uuid)
        GROUP BY rec.value
        ORDER BY COUNT(*) DESC
        LIMIT 5`,
      [regionId ?? null],
    );

    return rows.map((row) => ({ text: row.text, count: Number(row.count) }));
  }
}
