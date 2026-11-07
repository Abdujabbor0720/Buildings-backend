import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AiAnalysis } from '../../database/entities/ai-analysis.entity';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectMilestone } from '../../database/entities/object-milestone.entity';
import { ObjectProgressUpdate } from '../../database/entities/object-progress-update.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import {
  MilestoneStatus,
  ObjectStatus,
  ProgressSource,
} from '../../common/constants/enums';
import {
  diffInDays,
  tashkentToday,
  toDateKey,
} from '../../helpers/date.helpers';
import { planProgress } from '../../helpers/milestone-plan.helpers';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AiService } from '../ai/ai.service';
import { PhotoVisionRunner } from '../ai/vision/photo-vision.runner';
import { createPhotoReportInTx } from '../photo-reports/photo-report.factory';
import { ObjectHealthService } from './object-health.service';
import { ObjectsService } from './objects.service';
import {
  objectBriefFromRaw,
  selectObjectBrief,
  type ObjectBrief,
} from '../../common/contracts/object-brief.contract';
import type {
  CalendarQueryDto,
  CreateMilestoneDto,
  ReplaceMilestonesDto,
  SubmitMilestoneDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';

/** ⚠️ Joylashuv va mas'ul — `ObjectBrief` dan (hamma javob bilan AYNI shakl). */
export interface CalendarItem extends ObjectBrief {
  id: string;
  objectId: string;
  objectName: string;
  objectCode: string;
  districtName: string;
  typeColor: string;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  actualEnd: string | null;
  progressPercent: number;
  status: MilestoneStatus;
  /** Muddati o‘tgan va tugallanmagan. */
  isOverdue: boolean;
  overdueDays: number;
}

/** Ulushlar yig‘indisidagi ruxsat etilgan og‘ish — yaxlitlash xatosi uchun. */
const WEIGHT_TOLERANCE = 0.01;

/**
 * Hisoblangan va saqlangan foiz shundan kam farq qilsa — yozuv yozilmaydi.
 *
 * ⚠️ Busiz `0.004%` lik yaxlitlash changi har topshirishda yangi tarix
 * qatori hosil qilardi va «bajarilish dinamikasi» grafigi ma’nosiz
 * zinapoyalar bilan to‘lib ketardi.
 */
const PROGRESS_EPSILON = 0.01;

/** Bosqich topshirilganda qaytadigan natija. */
export interface MilestoneSubmissionResult {
  milestone: ObjectMilestone;
  report: PhotoReport;
  /** Obyekt bajarilishi o‘zgargan bo‘lsa — oldingi va yangi qiymat. */
  objectProgress: { previous: number; current: number } | null;
  /** Shu topshiruvdan keyin darhol hisoblangan AI xulosasi. */
  analysis: AiAnalysis | null;
}

@Injectable()
export class MilestonesService {
  private readonly logger = new Logger(MilestonesService.name);

  constructor(
    @InjectRepository(ObjectMilestone)
    private readonly milestones: Repository<ObjectMilestone>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly objectsService: ObjectsService,
    private readonly health: ObjectHealthService,
    private readonly audit: AuditService,
    private readonly ai: AiService,
    private readonly vision: PhotoVisionRunner,
  ) {}

  async listForObject(objectId: string): Promise<ObjectMilestone[]> {
    await this.assertObjectExists(objectId);
    return this.milestones.find({
      where: { objectId },
      relations: { submittedBy: true },
      order: { sortOrder: 'ASC', plannedStart: 'ASC' },
    });
  }

  async create(
    objectId: string,
    dto: CreateMilestoneDto,
    actor: AuthUser,
  ): Promise<ObjectMilestone> {
    const object = await this.loadWritableObject(objectId, actor);
    this.assertDates(dto.plannedStart, dto.plannedEnd);

    const existing = await this.milestones.find({ where: { objectId } });
    const totalWeight =
      existing.reduce((sum, m) => sum + Number(m.weight), 0) + dto.weight;
    if (totalWeight > 100 + WEIGHT_TOLERANCE) {
      throw new BadRequestException(
        `Bosqich ulushlari yig‘indisi 100% dan oshdi (${totalWeight.toFixed(1)}%). Avval mavjud bosqichlarni kamaytiring.`,
      );
    }

    return this.dataSource.transaction(async (em) => {
      const created = await em.save(
        em.create(ObjectMilestone, {
          ...dto,
          objectId,
          sortOrder: dto.sortOrder ?? existing.length,
          status: dto.status ?? MilestoneStatus.PLANNED,
        }),
      );
      await this.syncObjectProgress(em, object, actor.id, {
        source: ProgressSource.MANUAL,
        note: `Ish rejasiga «${created.name}» bosqichi qo‘shildi`,
      });
      return created;
    });
  }

  async update(
    id: string,
    dto: UpdateMilestoneDto,
    actor: AuthUser,
  ): Promise<ObjectMilestone> {
    const milestone = await this.milestones.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException('Bosqich topilmadi');
    const object = await this.loadWritableObject(milestone.objectId, actor);

    this.assertDates(
      dto.plannedStart ?? toDateKey(milestone.plannedStart)!,
      dto.plannedEnd ?? toDateKey(milestone.plannedEnd)!,
    );

    if (dto.weight !== undefined) {
      const siblings = await this.milestones.find({
        where: { objectId: milestone.objectId },
      });
      const total =
        siblings
          .filter((m) => m.id !== id)
          .reduce((sum, m) => sum + Number(m.weight), 0) + dto.weight;
      if (total > 100 + WEIGHT_TOLERANCE) {
        throw new BadRequestException(
          `Bosqich ulushlari yig‘indisi 100% dan oshdi (${total.toFixed(1)}%)`,
        );
      }
    }

    Object.assign(milestone, dto);
    milestone.status = deriveStatus(milestone);

    return this.dataSource.transaction(async (em) => {
      const saved = await em.save(ObjectMilestone, milestone);
      await this.syncObjectProgress(em, object, actor.id, {
        source: ProgressSource.MANUAL,
        note: `«${saved.name}» bosqichi tahrirlandi`,
      });
      return saved;
    });
  }

  /** Butun rejani almashtirish — ulushlar yig‘indisi ANIQ 100 bo‘lishi shart. */
  async replaceAll(
    objectId: string,
    dto: ReplaceMilestonesDto,
    actor: AuthUser,
  ): Promise<ObjectMilestone[]> {
    const object = await this.loadWritableObject(objectId, actor);

    const total = dto.milestones.reduce((sum, m) => sum + Number(m.weight), 0);
    if (Math.abs(total - 100) > WEIGHT_TOLERANCE) {
      throw new BadRequestException(
        `Bosqich ulushlari yig‘indisi aniq 100% bo‘lishi kerak, hozir ${total.toFixed(1)}%`,
      );
    }
    dto.milestones.forEach((m) =>
      this.assertDates(m.plannedStart, m.plannedEnd),
    );

    /*
     * ⚠️ TOPSHIRILGAN BOSQICH O‘CHIRILMAYDI. Unga foto-hisobot va AI
     * tahlili bog‘langan; rejani qaytadan yozish ularni yetim qoldirardi
     * va «qurilish 60% edi, reja tahrirlangach 0% bo‘lib qoldi» holati
     * yuzaga kelardi. Shuning uchun bunday bosqich bo‘lsa, butun
     * almashtirish RAD ETILADI — har bosqich alohida tahrirlanadi.
     */
    const submitted = await this.milestones.find({
      where: { objectId },
      order: { sortOrder: 'ASC' },
    });
    const locked = submitted.filter((m) => m.reportCount > 0);
    if (locked.length > 0) {
      throw new BadRequestException(
        `Topshirilgan bosqichlar bor (${locked
          .map((m) => `«${m.name}»`)
          .join(
            ', ',
          )}) — butun rejani almashtirib bo‘lmaydi. Bosqichlarni alohida tahrirlang.`,
      );
    }

    return this.dataSource.transaction(async (em) => {
      // ⚠️ Eskisi o‘chirilib, yangisi yoziladi — BITTA tranzaksiyada.
      // Ikki alohida amalda bo‘lsa, ikkinchisi yiqilganda obyekt
      // bosqichsiz qolib ketardi.
      await em.delete(ObjectMilestone, { objectId });
      const rows = await em.save(
        dto.milestones.map((m, index) =>
          em.create(ObjectMilestone, {
            ...m,
            objectId,
            sortOrder: m.sortOrder ?? index,
            status: m.status ?? MilestoneStatus.PLANNED,
          }),
        ),
      );
      await this.syncObjectProgress(em, object, actor.id, {
        source: ProgressSource.MANUAL,
        note: `Ish rejasi yangilandi — ${rows.length} ta bosqich`,
      });
      return rows;
    });
  }

  async remove(id: string, actor: AuthUser): Promise<{ message: string }> {
    const milestone = await this.milestones.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException('Bosqich topilmadi');
    const object = await this.loadWritableObject(milestone.objectId, actor);

    /*
     * ⚠️ TOPSHIRILGAN BOSQICH O‘CHIRILMAYDI — BEKOR QILINADI.
     * Unga biriktirilgan suratlar bajarilgan ishning dalili; qator
     * yo‘qolsa, ular «qaysi bosqichga tegishli» ekanini yo‘qotardi.
     */
    if (milestone.reportCount > 0) {
      throw new BadRequestException(
        `«${milestone.name}» bosqichi bo‘yicha ${milestone.reportCount} ta foto-hisobot bor — uni o‘chirib bo‘lmaydi. Holatini «bekor qilingan» ga o‘zgartiring.`,
      );
    }

    await this.dataSource.transaction(async (em) => {
      await em.delete(ObjectMilestone, { id });
      await this.syncObjectProgress(em, object, actor.id, {
        source: ProgressSource.MANUAL,
        note: `«${milestone.name}» bosqichi rejadan olib tashlandi`,
      });
    });
    return { message: `«${milestone.name}» bosqichi o‘chirildi` };
  }

  /* ═══════════════════ BOSQICHNI TOPSHIRISH ═══════════════════ */

  /**
   * BOSQICHNI TOPSHIRISH — «poydevor quyildi», «tom yopildi».
   *
   * Bitta amalda TO‘RT natija beradi:
   *   1. foto-hisobot yoziladi (surat MAJBURIY — `SubmitMilestoneDto`);
   *   2. bosqich foizi va holati yangilanadi;
   *   3. obyekt bajarilishi REJADAN qayta hisoblanadi (`planProgress`);
   *   4. AI shu bosqich va umumiy natija bo‘yicha xulosa chiqaradi.
   *
   * ⚠️ 1–3 BITTA TRANZAKSIYADA. Ilgarigi kabi ketma-ket bajarilsa,
   * surat yozilib bosqich yangilanmay qolishi mumkin edi: arxivda
   * «topshirildi» surati turardi, ish rejasida esa bosqich hamon
   * «rejalashtirilgan» bo‘lardi.
   *
   * ⚠️ AI tranzaksiyadan KEYIN: u hisobotga ta’sir qilmaydi, faqat
   * izohlaydi. Tahlil yiqilsa topshiruv baribir saqlanishi kerak.
   */
  async submit(
    id: string,
    dto: SubmitMilestoneDto,
    actor: AuthUser,
  ): Promise<MilestoneSubmissionResult> {
    const milestone = await this.milestones.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException('Bosqich topilmadi');
    if (milestone.status === MilestoneStatus.CANCELLED) {
      throw new BadRequestException(
        'Bekor qilingan bosqich topshirilmaydi — avval holatini tiklang',
      );
    }

    const object = await this.loadWritableObject(milestone.objectId, actor);
    if (object.status === ObjectStatus.CANCELLED) {
      throw new BadRequestException(
        'Bekor qilingan obyekt bo‘yicha topshiruv qabul qilinmaydi',
      );
    }

    const percent = dto.progressPercent ?? 100;
    const previousPercent = Number(milestone.progressPercent);
    if (percent < previousPercent && !dto.note?.trim()) {
      throw new BadRequestException(
        `Bosqich bajarilishi ${previousPercent}% dan ${percent}% ga kamaymoqda — sababini izohda ko‘rsating`,
      );
    }

    const now = new Date();
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : now;
    if (Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException('Surat olingan vaqt noto‘g‘ri');
    }

    const todayKey = toDateKey(tashkentToday())!;
    const actualEnd = dto.actualEnd ?? todayKey;
    if ((diffInDays(actualEnd, todayKey) ?? 0) < 0) {
      throw new BadRequestException('Tugash sanasi kelajakda bo‘la olmaydi');
    }

    /*
     * Hisobotga OBYEKTNING natijaviy foizi yoziladi, bosqichniki emas.
     * ⚠️ Moderator hisobotni tasdiqlaganda aynan shu raqam obyektga
     * qo‘llanadi; bosqich foizi yozilsa, «poydevor 100%» tasdiqlanishi
     * butun obyektni 100% qilib qo‘yardi.
     */
    const siblings = await this.milestones.find({
      where: { objectId: milestone.objectId },
    });
    const projected =
      planProgress(
        siblings.map((m) =>
          m.id === id ? { ...m, progressPercent: percent } : m,
        ),
      ) ?? Number(object.progressPercent);

    const result = await this.dataSource.transaction(async (em) => {
      const report = await createPhotoReportInTx(em, {
        object,
        fileIds: dto.fileIds,
        progressPercent: projected,
        capturedAt,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        note: dto.note ?? null,
        authorId: actor.id,
        milestoneId: milestone.id,
        milestonePercent: percent,
      });

      const patch: QueryDeepPartialEntity<ObjectMilestone> = {
        progressPercent: percent,
        submittedAt: now,
        submittedById: actor.id,
        submissionNote: dto.note ?? null,
        reportCount: milestone.reportCount + 1,
      };
      if (dto.workerCount !== undefined) patch.workerCount = dto.workerCount;
      // Birinchi topshiruv bosqichning haqiqiy boshlanishini ham belgilaydi.
      if (!milestone.actualStart) patch.actualStart = actualEnd;
      patch.actualEnd = percent >= 100 ? actualEnd : null;
      patch.status = deriveStatus({
        ...milestone,
        progressPercent: percent,
        actualEnd: percent >= 100 ? actualEnd : null,
      });

      await em.update(ObjectMilestone, { id }, patch);

      const objectProgress = await this.syncObjectProgress(
        em,
        object,
        actor.id,
        {
          source: ProgressSource.PHOTO_REPORT,
          note: `«${milestone.name}» bosqichi topshirildi — ${percent}%`,
        },
      );

      const saved = await em.findOneOrFail(ObjectMilestone, {
        where: { id },
        relations: { submittedBy: true },
      });
      return { milestone: saved, report, objectProgress };
    });

    // Surat tahlili navbatga qo‘yiladi — javob kutilmaydi (5–30 soniya).
    this.vision.schedule(result.report.id);

    let analysis: AiAnalysis | null = null;
    try {
      analysis = await this.ai.analyzeMilestone(id);
    } catch (error) {
      // ⚠️ Tahlil yiqilsa TOPSHIRUV BARIBIR O‘TADI: AI izohlaydi, fakt
      // yozmaydi. Aks holda model nosozligi maydondagi ishni to‘xtatardi.
      this.logger.warn(`Bosqich tahlili yiqildi: ${id} — ${String(error)}`);
    }

    await this.audit.record({
      userId: actor.id,
      action: 'milestone.submit',
      entity: 'ObjectMilestone',
      entityId: id,
      changes: {
        progressPercent: { before: previousPercent, after: percent },
        photos: { before: null, after: dto.fileIds.length },
      },
    });

    return { ...result, analysis };
  }

  /* ═══════════════════ Ichki yordamchilar ═══════════════════ */

  /**
   * ISH REJASIDAN OBYEKT BAJARILISHINI QAYTA HISOBLASH.
   *
   * ⚠️ Reja bo‘lsa — bajarilish undan KELIB CHIQADI, qo‘lda kiritilmaydi.
   * «Qurilish necha foiz» degan savolga ikkita javob bo‘lmasligi kerak:
   * bosqichlar yig‘indisi bir raqamni, qo‘lda kiritilgan maydon boshqa
   * raqamni ko‘rsatsa, qaysi biri to‘g‘ri ekanini hech kim ayta olmasdi.
   *
   * Reja yo‘q bo‘lsa hech narsa qilinmaydi — eski (qo‘lda) qiymat qoladi.
   */
  private async syncObjectProgress(
    em: EntityManager,
    object: ConstructionObject,
    actorId: string,
    meta: { source: ProgressSource; note: string },
  ): Promise<{ previous: number; current: number } | null> {
    if (object.status === ObjectStatus.CANCELLED) return null;

    const rows = await em.find(ObjectMilestone, {
      where: { objectId: object.id },
    });
    const computed = planProgress(rows);
    if (computed === null) return null;

    // ⚠️ Keshlangan emas, BAZADAGI joriy qiymat: shu tranzaksiya ichida
    // boshqa amal uni allaqachon o‘zgartirgan bo‘lishi mumkin.
    const current = await em.findOne(ConstructionObject, {
      where: { id: object.id },
      select: {
        id: true,
        progressPercent: true,
        status: true,
        actualStartDate: true,
        actualEndDate: true,
      },
    });
    if (!current) return null;

    const previous = Number(current.progressPercent);
    if (Math.abs(computed - previous) < PROGRESS_EPSILON) return null;

    const reportDate = toDateKey(tashkentToday())!;
    await em.insert(ObjectProgressUpdate, {
      objectId: object.id,
      reportDate,
      progressPercent: computed,
      previousPercent: previous,
      note: meta.note,
      source: meta.source,
      authorId: actorId,
    });

    /*
     * Holat avtomatik ergashadi — `ObjectsService.addProgress` bilan AYNI
     * qoida. Ikki joyda boshqacha yozilsa, bosqich orqali 100% ga yetgan
     * obyekt «topshirilgan» bo‘lmay qolardi.
     */
    const patch: QueryDeepPartialEntity<ConstructionObject> = {
      progressPercent: computed,
    };
    if (computed > 0 && current.status === ObjectStatus.NOT_STARTED) {
      patch.status = ObjectStatus.IN_PROGRESS;
      patch.actualStartDate = current.actualStartDate ?? reportDate;
    }
    if (computed >= 100) {
      patch.status = ObjectStatus.COMPLETED;
      patch.actualEndDate = current.actualEndDate ?? reportDate;
    } else if (current.status === ObjectStatus.COMPLETED) {
      patch.status = ObjectStatus.IN_PROGRESS;
      patch.actualEndDate = null;
    }

    await em.update(ConstructionObject, { id: object.id }, patch);
    await this.health.refreshOne(object.id, em);

    return { previous, current: computed };
  }

  /** Obyektni yuklaydi va YOZISH huquqini tekshiradi — bitta joyda. */
  private async loadWritableObject(
    objectId: string,
    actor: AuthUser,
  ): Promise<ConstructionObject> {
    const object = await this.objects.findOne({ where: { id: objectId } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');
    this.objectsService.assertCanWrite(object, actor);
    return object;
  }

  /* ═══════════════════ Kalendar ═══════════════════ */

  /**
   * KALENDAR (ish rejasi) — tanlangan oydagi barcha bosqichlar.
   * Oy bilan KESISHGANI olinadi (boshi yoki oxiri oy ichida, yoki oyni
   * butunlay qamragani): faqat «oy ichida boshlanganlar» olinsa, 3 oylik
   * bosqich o‘rtadagi oyda kalendardan yo‘qolardi.
   */
  async calendar(
    query: CalendarQueryDto,
    user: AuthUser,
  ): Promise<CalendarItem[]> {
    const today = tashkentToday();
    const year = query.year ?? today.getUTCFullYear();
    const month = query.month ?? today.getUTCMonth() + 1;

    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = toDateKey(new Date(Date.UTC(year, month, 0)))!;

    const qb = this.milestones
      .createQueryBuilder('m')
      .innerJoin('m.object', 'o')
      .innerJoin('o.district', 'd')
      .innerJoin('o.type', 't')
      .select([
        'm.id AS "id"',
        'm.object_id AS "objectId"',
        'm.name AS "name"',
        'm.planned_start AS "plannedStart"',
        'm.planned_end AS "plannedEnd"',
        'm.actual_end AS "actualEnd"',
        'm.progress_percent AS "progressPercent"',
        'm.status AS "status"',
        'o.name AS "objectName"',
        'o.code AS "objectCode"',
        'd.short_name AS "districtName"',
        't.color AS "typeColor"',
      ])
      .where('m.planned_start <= :to AND m.planned_end >= :from', { from, to })
      .andWhere('o.deleted_at IS NULL')
      .orderBy('m.planned_end', 'ASC')
      .addOrderBy('o.name', 'ASC');

    if (query.districtId)
      qb.andWhere('o.district_id = :districtId', {
        districtId: query.districtId,
      });
    if (query.objectId)
      qb.andWhere('m.object_id = :objectId', { objectId: query.objectId });
    if (user.districtId)
      qb.andWhere('o.district_id = :userDistrictId', {
        userDistrictId: user.districtId,
      });
    else if (user.regionId)
      qb.andWhere('o.region_id = :userRegionId', {
        userRegionId: user.regionId,
      });
    if (user.contractorId)
      qb.andWhere('o.contractor_id = :userContractorId', {
        userContractorId: user.contractorId,
      });

    // ⚠️ Kalendar katagidagi bosqich ham OBYEKTGA tegishli: «qayerda
    // va kim javobgar» savoli bu ekranda ham beriladi. Chaqiruv
    // `select()` dan KEYIN (`object-brief.contract.ts`).
    selectObjectBrief(qb);

    const rows = await qb.getRawMany<Record<string, string>>();

    return rows.map((r) => {
      // `getRawMany` ustunni SATR qaytaradi — enum bilan taqqoslashdan
      // oldin aniq cast qilinadi.
      const status = r.status as MilestoneStatus;
      const done = status === MilestoneStatus.DONE;
      const overdueDays = done
        ? 0
        : Math.max(0, diffInDays(r.plannedEnd, today) ?? 0);
      return {
        ...objectBriefFromRaw(r),
        id: r.id,
        objectId: r.objectId,
        objectName: r.objectName,
        objectCode: r.objectCode,
        districtName: r.districtName,
        typeColor: r.typeColor,
        name: r.name,
        plannedStart: toDateKey(r.plannedStart)!,
        plannedEnd: toDateKey(r.plannedEnd)!,
        actualEnd: r.actualEnd ? toDateKey(r.actualEnd) : null,
        progressPercent: Number(r.progressPercent),
        status,
        isOverdue: overdueDays > 0,
        overdueDays,
      };
    });
  }

  private async assertObjectExists(objectId: string): Promise<void> {
    const exists = await this.objects.exists({ where: { id: objectId } });
    if (!exists) throw new NotFoundException('Obyekt topilmadi');
  }

  private assertDates(start: string, end: string): void {
    if ((diffInDays(start, end) ?? 0) < 0) {
      throw new BadRequestException(
        'Bosqich tugash sanasi boshlanish sanasidan oldin bo‘la olmaydi',
      );
    }
  }
}

/** Holat sanalar va bajarilishdan KELIB CHIQADI — qo‘lda belgilash shart emas. */
function deriveStatus(m: ObjectMilestone): MilestoneStatus {
  if (m.status === MilestoneStatus.CANCELLED) return MilestoneStatus.CANCELLED;
  if (m.progressPercent >= 100 || m.actualEnd) return MilestoneStatus.DONE;
  const overdue = (diffInDays(m.plannedEnd, tashkentToday()) ?? 0) > 0;
  if (overdue) return MilestoneStatus.DELAYED;
  if (m.progressPercent > 0 || m.actualStart)
    return MilestoneStatus.IN_PROGRESS;
  return MilestoneStatus.PLANNED;
}
