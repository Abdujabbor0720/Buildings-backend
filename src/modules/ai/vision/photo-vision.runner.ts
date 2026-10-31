import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiVisionStatus } from '../../../common/constants/enums';
import { ConstructionObject } from '../../../database/entities/construction-object.entity';
import { ObjectMilestone } from '../../../database/entities/object-milestone.entity';
import { PhotoReport } from '../../../database/entities/photo-report.entity';
import { toDateKey } from '../../../helpers/date.helpers';
import { verifyPhotoReport } from '../../photo-reports/photo-verification.helpers';
import { PhotoVisionService, type VisionImage } from './photo-vision.service';
import { combineVerdict } from './vision-verdict.helpers';

/** Shundan ko‘p urinishdan keyin qayta urinilmaydi. */
const MAX_ATTEMPTS = 3;
/** Bitta cron ishida nechta hisobot ko‘riladi — xarajat va vaqt cheklovi. */
const BATCH_SIZE = 10;

/**
 * SURAT TAHLILI NAVBATI.
 *
 * ⚠️ Tahlil foto-hisobot yaratish SO‘ROVIDAN TASHQARIDA bajariladi.
 * Model chaqiruvi 5–30 soniya davom etadi; uni so‘rov ichida kutsak,
 * qurilish maydonidagi sekin internetda mobil ilova «yuklanmadi» deb
 * tushunib, mas’ul odam suratni qayta-qayta yuborardi.
 *
 * ⚠️ Navbat BAZADA, xotirada emas (`ai_vision_status`). Server qayta ishga
 * tushsa, xotiradagi navbat yo‘qolib, hisobot abadiy «tahlil kutmoqda»
 * holatida qolib ketardi — cron esa uni baribir topadi.
 */
@Injectable()
export class PhotoVisionRunner {
  private readonly logger = new Logger(PhotoVisionRunner.name);
  /** Ayni damda ishlanayotganlar — bitta hisobot ikki marta ketmasin. */
  private readonly inFlight = new Set<string>();

  constructor(
    @InjectRepository(PhotoReport)
    private readonly reports: Repository<PhotoReport>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectRepository(ObjectMilestone)
    private readonly milestones: Repository<ObjectMilestone>,
    private readonly vision: PhotoVisionService,
  ) {}

  /**
   * Fon rejimida tahlil qilish. Chaqiruvchi KUTMAYDI va xato ham olmaydi —
   * hisobot allaqachon saqlangan, tahlil esa uning ustiga qo‘shimcha.
   */
  schedule(reportId: string): void {
    if (!this.vision.enabled) return;
    setImmediate(() => {
      void this.run(reportId).catch((error: unknown) => {
        this.logger.error(
          `Tahlil navbati yiqildi (${reportId}): ${String(error)}`,
        );
      });
    });
  }

  /** Qo‘lda qayta tahlil — admin tugmasi. */
  async reanalyze(reportId: string): Promise<PhotoReport> {
    const report = await this.reports.findOne({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Foto-hisobot topilmadi');

    // Urinishlar sanog‘i nolga qaytadi: admin ongli ravishda bosmoqda
    // (masalan, OpenAI hisobi to‘ldirilgandan keyin).
    await this.reports.update(
      { id: reportId },
      { aiVisionStatus: AiVisionStatus.PENDING, aiAttempts: 0 },
    );
    await this.run(reportId);

    return this.reports.findOneOrFail({ where: { id: reportId } });
  }

  /**
   * ZAXIRA PASS: server qayta ishga tushgan yoki tarmoq uzilgan paytdagi
   * hisobotlarni topib, tahlil qiladi.
   */
  @Cron(CronExpression.EVERY_10_MINUTES, { timeZone: 'Asia/Tashkent' })
  async catchUp(): Promise<void> {
    if (!this.vision.enabled) return;

    const pending = await this.reports.find({
      where: {
        aiVisionStatus: In([AiVisionStatus.PENDING, AiVisionStatus.FAILED]),
      },
      order: { createdAt: 'ASC' },
      take: BATCH_SIZE,
      select: { id: true, aiAttempts: true },
    });

    const queue = pending.filter((report) => report.aiAttempts < MAX_ATTEMPTS);
    if (queue.length === 0) return;

    this.logger.log(`Tahlil navbati: ${queue.length} ta foto-hisobot`);

    // ⚠️ Ketma-ket: parallel chaqiruv OpenAI cheklovига (429) tez uriladi
    // va hammasi birdan yiqilardi.
    for (const report of queue) {
      await this.run(report.id);
    }
  }

  /* ───────────────────────── Ichki ───────────────────────── */

  private async run(reportId: string): Promise<void> {
    if (this.inFlight.has(reportId)) return;
    this.inFlight.add(reportId);

    try {
      const report = await this.reports.findOne({
        where: { id: reportId },
        relations: { images: { file: true } },
      });
      if (!report) return;
      if (report.aiVisionStatus === AiVisionStatus.DONE) return;
      if (report.aiAttempts >= MAX_ATTEMPTS) {
        await this.markUnavailable(report, 'Urinishlar soni tugadi');
        return;
      }

      const object = await this.objects.findOne({
        where: { id: report.objectId },
        relations: { type: true },
      });
      if (!object) return;

      const milestones = await this.milestones.find({
        where: { objectId: report.objectId },
        order: { sortOrder: 'ASC' },
        select: { name: true, status: true, weight: true },
      });

      const images: VisionImage[] = (report.images ?? [])
        .filter((image) => image.file)
        .map((image) => ({
          key: image.file.path,
          mimeType: image.file.mimeType,
          url: image.file.url,
        }));

      const outcome = await this.vision.analyze(
        {
          objectName: object.name,
          objectType: object.type?.name ?? 'Noma’lum',
          description: object.description ?? null,
          plannedStart: object.plannedStartDate
            ? toDateKey(new Date(object.plannedStartDate))
            : null,
          plannedEnd: object.plannedEndDate
            ? toDateKey(new Date(object.plannedEndDate))
            : null,
          capturedAt: toDateKey(report.capturedAt) ?? '',
          milestones: milestones.map((milestone) => ({
            name: milestone.name,
            status: milestone.status,
            weight: Number(milestone.weight ?? 0),
          })),
        },
        images,
      );

      if (!outcome.ok) {
        if (outcome.retryable) {
          await this.reports.update(
            { id: report.id },
            {
              aiVisionStatus: AiVisionStatus.FAILED,
              aiAttempts: report.aiAttempts + 1,
              aiAnalysis: {
                ...emptyAnalysis(),
                unavailableReason: outcome.reason,
              },
            },
          );
          this.logger.warn(`Tahlil xatosi (${report.id}): ${outcome.reason}`);
        } else {
          await this.markUnavailable(report, outcome.reason);
        }
        return;
      }

      /*
       * Ikki dvigatel natijasi birlashtiriladi. Qoidalar dvigateli QAYTA
       * ishga tushiriladi — uning natijasi hisobot yaratilganda yozilgan,
       * lekin u yerda `aiComment` ga saqlangan matn edi; bu yerda
       * STRUKTURALANGAN qiymat kerak.
       */
      const previous = await this.reports.findOne({
        where: { objectId: report.objectId },
        order: { capturedAt: 'DESC' },
        select: { progressPercent: true, capturedAt: true },
      });

      const rule = verifyPhotoReport({
        capturedAt: report.capturedAt,
        uploadedAt: report.createdAt,
        photoLat: report.lat,
        photoLng: report.lng,
        objectLat: object.lat,
        objectLng: object.lng,
        reportedProgress: report.progressPercent,
        previousProgress: previous?.progressPercent ?? object.progressPercent,
        daysSincePrevious: previous
          ? Math.max(
              1,
              Math.round(
                (report.capturedAt.getTime() - previous.capturedAt.getTime()) /
                  86_400_000,
              ),
            )
          : null,
      });

      const combined = combineVerdict({
        reportedProgress: report.progressPercent,
        ruleConfidence: rule.confidence,
        ruleVerdict: rule.verdict,
        ruleComment: rule.comment,
        vision: outcome.analysis,
      });

      await this.reports.update(
        { id: report.id },
        {
          aiVisionStatus: AiVisionStatus.DONE,
          aiVisionAt: new Date(),
          aiAttempts: report.aiAttempts + 1,
          aiModel: outcome.model,
          aiEstimatedProgress: outcome.analysis.estimatedProgressPercent,
          aiAnalysis: {
            ...outcome.analysis,
            matchesReported: combined.withinRange ?? false,
            discrepancyNote: combined.comment,
          },
          aiVerdict: combined.verdict,
          aiConfidence: combined.confidence,
          aiComment: combined.comment,
          aiCheckedAt: new Date(),
        },
      );

      this.logger.log(
        `Tahlil tayyor (${report.id}): hisobotda ${report.progressPercent}%, ` +
          `suratdan ${outcome.analysis.rangeMin}–${outcome.analysis.rangeMax}% → ${combined.verdict}`,
      );
    } finally {
      this.inFlight.delete(reportId);
    }
  }

  private async markUnavailable(
    report: PhotoReport,
    reason: string,
  ): Promise<void> {
    await this.reports.update(
      { id: report.id },
      {
        aiVisionStatus: AiVisionStatus.UNAVAILABLE,
        aiVisionAt: new Date(),
        aiAttempts: report.aiAttempts + 1,
        aiAnalysis: { ...emptyAnalysis(), unavailableReason: reason },
      },
    );
  }
}

/** Sababni saqlash uchun bo‘sh tahlil qobig‘i. */
function emptyAnalysis() {
  return {
    stage: '',
    estimatedProgressPercent: 0,
    rangeMin: 0,
    rangeMax: 0,
    confidence: 0,
    completedWorks: [],
    remainingWorks: [],
    matchesReported: false,
    discrepancyNote: '',
    imageQuality: 'poor' as const,
    summary: '',
  };
}
