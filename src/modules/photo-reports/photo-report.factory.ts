import { BadRequestException } from '@nestjs/common';
import { In, type EntityManager } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import { PhotoReportImage } from '../../database/entities/photo-report-image.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { PhotoReportStatus } from '../../common/constants/enums';
import { verifyPhotoReport } from './photo-verification.helpers';

/**
 * FOTO-HISOBOT YOZISH — ikkala yo‘l uchun YAGONA funksiya.
 *
 * Hisobot ikki joydan tug‘iladi:
 *   • «Fotoarxiv → hisobot yuborish» (`PhotoReportsService.create`);
 *   • «Ish rejasi → bosqichni topshirish» (`MilestonesService.submit`).
 *
 * ⚠️ Bu SERVIS emas, oddiy funksiya va u `EntityManager` qabul qiladi.
 * Sabab modul bog‘lanishida: `PhotoReportsModule` allaqachon
 * `ObjectsModule` ni import qiladi, teskari import esa HALQA hosil
 * qilardi. Funksiya esa DI grafiga umuman kirmaydi.
 *
 * ⚠️ Nusxa ko‘chirish ATAYLAB yo‘q: tekshiruv qoidalari (surat qachon va
 * qayerda olingani, bajarilish sakrashi) faqat shu yerda qo‘llanadi.
 * Ikkinchi nusxa bo‘lsa, bosqich topshirilganda ular jimgina tushib
 * qolardi — ya’ni tekshiruvni chetlab o‘tishning eng oson yo‘li
 * «boshqa tugmani bosish» bo‘lardi.
 */
export interface PhotoReportDraft {
  object: ConstructionObject;
  fileIds: string[];
  /** Hisobotda qayd etilgan OBYEKT bajarilishi, %. */
  progressPercent: number;
  capturedAt: Date;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  authorId: string | null;
  /** Bosqich topshirilayotgan bo‘lsa — uning id si. */
  milestoneId?: string | null;
  /** Bosqichning O‘Z bajarilishi, % (obyektniki emas). */
  milestonePercent?: number | null;
}

export async function createPhotoReportInTx(
  em: EntityManager,
  draft: PhotoReportDraft,
): Promise<PhotoReport> {
  const files = await em.find(StoredFile, { where: { id: In(draft.fileIds) } });
  if (files.length !== draft.fileIds.length) {
    throw new BadRequestException(
      'Ba’zi fayllar topilmadi — suratlarni qaytadan yuklang',
    );
  }

  const now = new Date();
  const previous = await em.findOne(PhotoReport, {
    where: {
      objectId: draft.object.id,
      status: PhotoReportStatus.APPROVED,
    },
    order: { capturedAt: 'DESC' },
  });

  const verification = verifyPhotoReport({
    capturedAt: draft.capturedAt,
    uploadedAt: now,
    photoLat: draft.lat ?? null,
    photoLng: draft.lng ?? null,
    objectLat: draft.object.lat,
    objectLng: draft.object.lng,
    reportedProgress: draft.progressPercent,
    previousProgress: previous?.progressPercent ?? draft.object.progressPercent,
    daysSincePrevious: previous
      ? Math.max(
          1,
          Math.round(
            (draft.capturedAt.getTime() - previous.capturedAt.getTime()) /
              86_400_000,
          ),
        )
      : null,
  });

  const report = await em.save(
    em.create(PhotoReport, {
      objectId: draft.object.id,
      milestoneId: draft.milestoneId ?? null,
      milestonePercent: draft.milestonePercent ?? null,
      capturedAt: draft.capturedAt,
      lat: draft.lat ?? null,
      lng: draft.lng ?? null,
      progressPercent: draft.progressPercent,
      note: draft.note ?? null,
      status: PhotoReportStatus.PENDING,
      aiVerdict: verification.verdict,
      aiConfidence: verification.confidence,
      aiComment: verification.comment,
      aiCheckedAt: now,
      authorId: draft.authorId,
    }),
  );

  await em.save(
    draft.fileIds.map((fileId, index) => {
      const file = files.find((f) => f.id === fileId)!;
      return em.create(PhotoReportImage, {
        reportId: report.id,
        fileId,
        url: file.url,
        sortOrder: index,
      });
    }),
  );

  // «Oxirgi hisobot» belgisi — «uzoq vaqt hisobot yo‘q» ogohlantirishi
  // aynan shu maydondan hisoblanadi.
  await em.update(
    ConstructionObject,
    { id: draft.object.id },
    { lastReportAt: now },
  );

  return report;
}
