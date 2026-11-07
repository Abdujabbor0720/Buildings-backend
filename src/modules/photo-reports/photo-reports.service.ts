import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import {
  AiVerdict,
  PhotoReportStatus,
  ProgressSource,
} from '../../common/constants/enums';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { ObjectsService } from '../objects/objects.service';
import { PhotoVisionRunner } from '../ai/vision/photo-vision.runner';
import { createPhotoReportInTx } from './photo-report.factory';
import { verifyPhotoReport } from './photo-verification.helpers';
import type {
  CreatePhotoReportDto,
  PhotoReportQueryDto,
  ReviewPhotoReportDto,
} from './dto/photo-report.dto';

@Injectable()
export class PhotoReportsService {
  constructor(
    @InjectRepository(PhotoReport)
    private readonly reports: Repository<PhotoReport>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly objectsService: ObjectsService,
    private readonly audit: AuditService,
    private readonly vision: PhotoVisionRunner,
  ) {}

  async list(
    query: PhotoReportQueryDto,
    user: AuthUser,
  ): Promise<PaginatedResult<PhotoReport>> {
    const qb = this.reports
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.object', 'o')
      .leftJoinAndSelect('o.district', 'district')
      .leftJoinAndSelect('o.type', 'type')
      // ⚠️ Obyekt mas'uli — suratni kim tasdiqlagani (`reviewedBy`) va
      // kim yuborgani (`author`) dan BOSHQA shaxs: u obyektning
      // kuratori. Uchalasi bir ekranda ko'rinadi, shuning uchun
      // taxalluslar ataylab farq qiladi.
      .leftJoinAndSelect('o.responsible', 'objectResponsible')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoinAndSelect('p.author', 'author')
      .leftJoinAndSelect('p.reviewedBy', 'reviewedBy')
      .where('o.deleted_at IS NULL');

    if (user.contractorId)
      qb.andWhere('o.contractor_id = :cid', { cid: user.contractorId });
    else if (user.districtId)
      qb.andWhere('o.district_id = :did', { did: user.districtId });
    else if (user.regionId)
      qb.andWhere('o.region_id = :rid', { rid: user.regionId });

    if (query.objectId)
      qb.andWhere('p.object_id = :objectId', { objectId: query.objectId });
    if (query.districtId)
      qb.andWhere('o.district_id = :districtId', {
        districtId: query.districtId,
      });
    if (query.authorId)
      qb.andWhere('p.author_id = :authorId', { authorId: query.authorId });
    if (query.status?.length)
      qb.andWhere('p.status IN (:...status)', { status: query.status });
    if (query.aiVerdict?.length)
      qb.andWhere('p.ai_verdict IN (:...aiVerdict)', {
        aiVerdict: query.aiVerdict,
      });
    if (query.dateFrom)
      qb.andWhere('p.captured_at >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo)
      qb.andWhere('p.captured_at < (:dateTo::date + 1)', {
        dateTo: query.dateTo,
      });
    if (query.search)
      qb.andWhere('(o.name ILIKE :s OR p.note ILIKE :s)', {
        s: `%${query.search}%`,
      });

    const [items, total] = await qb
      .orderBy('p.capturedAt', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<PhotoReport> {
    const report = await this.reports.findOne({
      where: { id },
      relations: {
        images: true,
        author: true,
        reviewedBy: true,
        object: { district: true, type: true },
      },
      order: { images: { sortOrder: 'ASC' } },
    });
    if (!report) throw new NotFoundException('Foto-hisobot topilmadi');
    return report;
  }

  /**
   * Foto-hisobot yaratish + AVTOMATIK TEKSHIRUV.
   *
   * ⚠️ Hisobot `pending` holatida tug‘iladi: AI «tasdiqladi» desa ham,
   * obyekt bajarilishi AVTOMAT o‘zgarmaydi. Progress faqat odam tasdiqlagach
   * yoziladi (`review`) — aks holda soxta hisobot bilan bajarilish foizini
   * istalgan raqamga ko‘tarib qo‘yish mumkin bo‘lardi.
   */
  async create(
    dto: CreatePhotoReportDto,
    user: AuthUser,
  ): Promise<PhotoReport> {
    const object = await this.objects.findOne({ where: { id: dto.objectId } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');

    /*
     * ⚠️ Hisobot yozish mantig‘i `photo-report.factory.ts` da — bosqichni
     * topshirish yo‘li ham AYNAN shu funksiyani chaqiradi. Ikki nusxa
     * bo‘lsa, surat tekshiruvi (vaqt, joylashuv, sakrash) bitta yo‘ldan
     * jimgina tushib qolardi.
     */
    const created = await this.dataSource.transaction((em) =>
      createPhotoReportInTx(em, {
        object,
        fileIds: dto.fileIds,
        progressPercent: dto.progressPercent,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        note: dto.note ?? null,
        authorId: user.id,
      }),
    );

    /*
     * ⚠️ SURAT TAHLILI SHU YERDA KUTILMAYDI. Model chaqiruvi 5–30 soniya
     * oladi; uni so‘rov ichiga qo‘ysak, qurilish maydonidagi sekin
     * internetda ilova «javob kelmadi» deb hisoblab, mas’ul odam suratni
     * qayta-qayta yuborardi. Natija tayyor bo‘lgach hisobot yangilanadi.
     */
    this.vision.schedule(created.id);

    await this.audit.record({
      userId: user.id,
      action: 'photo-report.create',
      entity: 'PhotoReport',
      entityId: created.id,
      changes: { aiVerdict: { before: null, after: created.aiVerdict } },
    });

    return this.findOne(created.id);
  }

  /** Moderatsiya — yakuniy qarorni ODAM qabul qiladi. */
  async review(
    id: string,
    dto: ReviewPhotoReportDto,
    user: AuthUser,
  ): Promise<PhotoReport> {
    const report = await this.reports.findOne({
      where: { id },
      relations: { object: true },
    });
    if (!report) throw new NotFoundException('Foto-hisobot topilmadi');
    if (report.status !== PhotoReportStatus.PENDING) {
      throw new BadRequestException('Bu hisobot allaqachon ko‘rib chiqilgan');
    }
    if (dto.status === PhotoReportStatus.REJECTED && !dto.reason?.trim()) {
      throw new BadRequestException('Rad etish sababi majburiy');
    }

    await this.reports.update(id, {
      status: dto.status,
      reviewedById: user.id,
      reviewedAt: new Date(),
      rejectReason:
        dto.status === PhotoReportStatus.REJECTED ? (dto.reason ?? null) : null,
    });

    // Tasdiqlangan hisobot bajarilishni yangilaydi — TARIX bilan
    // (`ObjectsService.addProgress`), shuning uchun grafikda manbasi ko‘rinadi.
    if (
      dto.status === PhotoReportStatus.APPROVED &&
      dto.applyProgress !== false &&
      report.progressPercent !== report.object.progressPercent
    ) {
      await this.objectsService.addProgress(
        report.objectId,
        {
          progressPercent: report.progressPercent,
          reportDate: report.capturedAt.toISOString().slice(0, 10),
          note: `Foto-hisobot asosida (${report.id.slice(0, 8)})`,
        },
        user,
        ProgressSource.PHOTO_REPORT,
      );
    }

    await this.audit.record({
      userId: user.id,
      action: `photo-report.${dto.status}`,
      entity: 'PhotoReport',
      entityId: id,
      changes: {
        status: { before: PhotoReportStatus.PENDING, after: dto.status },
      },
    });

    return this.findOne(id);
  }

  /** Tekshiruvni qayta ishga tushirish (qoidalar o‘zgargandan keyin). */
  async recheck(id: string): Promise<PhotoReport> {
    const report = await this.reports.findOne({
      where: { id },
      relations: { object: true },
    });
    if (!report) throw new NotFoundException('Foto-hisobot topilmadi');

    const previous = await this.reports.findOne({
      where: { objectId: report.objectId, status: PhotoReportStatus.APPROVED },
      order: { capturedAt: 'DESC' },
    });

    const verification = verifyPhotoReport({
      capturedAt: report.capturedAt,
      uploadedAt: report.createdAt,
      photoLat: report.lat,
      photoLng: report.lng,
      objectLat: report.object.lat,
      objectLng: report.object.lng,
      reportedProgress: report.progressPercent,
      previousProgress: previous?.progressPercent ?? 0,
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

    await this.reports.update(id, {
      aiVerdict: verification.verdict,
      aiConfidence: verification.confidence,
      aiComment: verification.comment,
      aiCheckedAt: new Date(),
    });

    return this.findOne(id);
  }

  async remove(id: string, user: AuthUser): Promise<{ message: string }> {
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Foto-hisobot topilmadi');

    await this.reports.softDelete(id);
    await this.audit.record({
      userId: user.id,
      action: 'photo-report.delete',
      entity: 'PhotoReport',
      entityId: id,
    });

    return { message: 'Foto-hisobot o‘chirildi' };
  }

  /** Fotoarxiv statistikasi — bo‘lim sarlavhasidagi raqamlar. */
  async stats(regionId?: string): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    aiConfirmed: number;
    aiSuspicious: number;
  }> {
    const qb = this.reports
      .createQueryBuilder('p')
      .innerJoin('p.object', 'o')
      .select('COUNT(p.id)', 'total')
      .addSelect(`COUNT(p.id) FILTER (WHERE p.status = :pending)`, 'pending')
      .addSelect(`COUNT(p.id) FILTER (WHERE p.status = :approved)`, 'approved')
      .addSelect(`COUNT(p.id) FILTER (WHERE p.status = :rejected)`, 'rejected')
      .addSelect(
        `COUNT(p.id) FILTER (WHERE p.ai_verdict = :confirmed)`,
        'aiConfirmed',
      )
      .addSelect(
        `COUNT(p.id) FILTER (WHERE p.ai_verdict = :suspicious)`,
        'aiSuspicious',
      )
      .where('o.deleted_at IS NULL')
      .setParameters({
        pending: PhotoReportStatus.PENDING,
        approved: PhotoReportStatus.APPROVED,
        rejected: PhotoReportStatus.REJECTED,
        confirmed: AiVerdict.CONFIRMED,
        suspicious: AiVerdict.SUSPICIOUS,
      });

    if (regionId) qb.andWhere('o.region_id = :regionId', { regionId });

    const row = await qb.getRawOne<Record<string, string>>();
    return {
      total: Number(row?.total ?? 0),
      pending: Number(row?.pending ?? 0),
      approved: Number(row?.approved ?? 0),
      rejected: Number(row?.rejected ?? 0),
      aiConfirmed: Number(row?.aiConfirmed ?? 0),
      aiSuspicious: Number(row?.aiSuspicious ?? 0),
    };
  }
}
