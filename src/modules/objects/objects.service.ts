import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Repository,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { District } from '../../database/entities/district.entity';
import { resolveMahallaId } from '../geo/mahalla-assign';
import { ObjectProgressUpdate } from '../../database/entities/object-progress-update.entity';
import { Region } from '../../database/entities/region.entity';
import {
  ObjectStatus,
  ProgressSource,
  UserRole,
} from '../../common/constants/enums';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import {
  objectBriefFromRaw,
  selectObjectBrief,
  type ObjectBrief,
} from '../../common/contracts/object-brief.contract';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  diffInDays,
  tashkentToday,
  toDateKey,
} from '../../helpers/date.helpers';
import { stableString } from '../../helpers/stringify.helpers';
import { AuditService } from '../audit/audit.service';
import { ObjectHealthService } from './object-health.service';
import type { CreateObjectDto, UpdateObjectDto } from './dto/create-object.dto';
import type { AddProgressDto } from './dto/progress.dto';
import type { ObjectQueryDto } from './dto/object-query.dto';

/**
 * Ro‘yxatda saralashga RUXSAT ETILGAN ustunlar — SQL in'yeksiyasiga yo‘l qolmasin.
 *
 * ⚠️ Qiymatlar ENTITY MAYDONI nomi bilan yoziladi (`o.updatedAt`), ustun
 * nomi bilan emas (`o.updated_at`). `skip`/`take` bilan birga TypeORM
 * «distinct id» ichki so‘roviga o‘tadi va `ORDER BY` ifodasini metadata
 * bo‘yicha qayta hal qiladi; xom ustun nomi bu yerda topilmay,
 * so‘rov `Cannot read properties of undefined (reading 'databaseName')`
 * bilan yiqiladi.
 */
const SORTABLE: Record<string, string> = {
  name: 'o.name',
  code: 'o.code',
  progressPercent: 'o.progressPercent',
  plannedEndDate: 'o.plannedEndDate',
  plannedStartDate: 'o.plannedStartDate',
  delayDays: 'o.delayDays',
  riskScore: 'o.riskScore',
  totalCost: 'o.totalCost',
  createdAt: 'o.createdAt',
  updatedAt: 'o.updatedAt',
};

@Injectable()
export class ObjectsService {
  private readonly logger = new Logger(ObjectsService.name);

  constructor(
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectRepository(District)
    private readonly districts: Repository<District>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly health: ObjectHealthService,
    private readonly audit: AuditService,
  ) {}

  /* ───────────────────────── Ko‘rish doirasi ───────────────────────── */

  /**
   * ROL BO‘YICHA CHEKLOV.
   *
   * ⚠️ Bu guard emas, SO‘ROV darajasidagi cheklov: pudratchi `GET /objects`
   * ni chaqirishga HAQLI, lekin faqat o‘z obyektlarini ko‘rishi kerak.
   * Guard bu farqni ifodalay olmaydi — shuning uchun har bir o‘qish yo‘li
   * shu funksiyadan o‘tadi.
   */
  private applyScope(
    qb: SelectQueryBuilder<ConstructionObject>,
    user: AuthUser,
  ): void {
    switch (user.role) {
      case UserRole.SUPER_ADMIN:
        return;

      case UserRole.CONTRACTOR:
        // Pudratchiga biriktirilmagan hisob hech narsa ko‘rmaydi — bu
        // ATAYLAB: `contractorId` to‘ldirilmagan hisob butun viloyatni
        // ko‘rib qolgandan ko‘ra bo‘sh ro‘yxat ko‘rgani xavfsizroq.
        qb.andWhere('o.contractor_id = :scopeContractorId', {
          scopeContractorId:
            user.contractorId ?? '00000000-0000-4000-8000-000000000000',
        });
        return;

      case UserRole.DISTRICT_ADMIN:
      case UserRole.SUPERVISOR:
        if (user.districtId) {
          qb.andWhere('o.district_id = :scopeDistrictId', {
            scopeDistrictId: user.districtId,
          });
          return;
        }
        if (user.regionId)
          qb.andWhere('o.region_id = :scopeRegionId', {
            scopeRegionId: user.regionId,
          });
        return;

      default:
        if (user.regionId)
          qb.andWhere('o.region_id = :scopeRegionId', {
            scopeRegionId: user.regionId,
          });
    }
  }

  /**
   * Yozish amallari uchun — o‘qish doirasi bilan AYNI qoida.
   *
   * ⚠️ OCHIQ (public): bosqichni topshirish (`MilestonesService`) ham
   * aynan shu tekshiruvdan o‘tadi. Nusxa ko‘chirilsa, bitta yo‘lda
   * pudratchi boshqa tumandagi bosqichni topshira olardi.
   */
  assertCanWrite(object: ConstructionObject, user: AuthUser): void {
    if (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.REGION_ADMIN
    )
      return;

    if (user.role === UserRole.CONTRACTOR) {
      if (object.contractorId !== user.contractorId) {
        throw new ForbiddenException(
          'Bu obyekt sizning pudratingizga tegishli emas',
        );
      }
      return;
    }
    if (user.districtId && object.districtId !== user.districtId) {
      throw new ForbiddenException(
        'Bu obyekt sizning tumaningizga tegishli emas',
      );
    }
    if (user.regionId && object.regionId !== user.regionId) {
      throw new ForbiddenException(
        'Bu obyekt sizning viloyatingizga tegishli emas',
      );
    }
  }

  /* ───────────────────────── O‘qish ───────────────────────── */

  async list(
    query: ObjectQueryDto,
    user: AuthUser,
  ): Promise<PaginatedResult<ConstructionObject>> {
    const qb = this.baseQuery();
    this.applyScope(qb, user);
    this.applyFilters(qb, query);

    const sortColumn = SORTABLE[query.sortBy ?? ''] ?? 'o.updatedAt';
    qb.orderBy(sortColumn, query.sortOrder)
      // Ikkinchi darajali saralash MAJBURIY: teng qiymatlarda PostgreSQL
      // tartibni kafolatlamaydi va 2-sahifada 1-sahifadagi qator takrorlanardi.
      .addOrderBy('o.id', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string, user: AuthUser): Promise<ConstructionObject> {
    const qb = this.baseQuery().andWhere('o.id = :id', { id });
    this.applyScope(qb, user);

    const object = await qb.getOne();
    if (!object)
      throw new NotFoundException('Obyekt topilmadi yoki sizga ko‘rinmaydi');
    return object;
  }

  /** Kodi bo‘yicha — QR va hujjatlardagi havolalar uchun. */
  async findByCode(code: string, user: AuthUser): Promise<ConstructionObject> {
    const qb = this.baseQuery().andWhere('UPPER(o.code) = UPPER(:code)', {
      code,
    });
    this.applyScope(qb, user);

    const object = await qb.getOne();
    if (!object)
      throw new NotFoundException(`«${code}» kodli obyekt topilmadi`);
    return object;
  }

  /** Xarita nuqtalari — ro‘yxatdagi og‘ir maydonlarsiz, faqat kerakli minimum. */
  async mapPoints(
    query: ObjectQueryDto,
    user: AuthUser,
  ): Promise<
    Array<
      ObjectBrief & {
        id: string;
        code: string;
        name: string;
        lat: number;
        lng: number;
        healthStatus: string;
        progressPercent: number;
        districtName: string;
        typeName: string;
        typeColor: string;
      }
    >
  > {
    const qb = this.objects
      .createQueryBuilder('o')
      .innerJoin('o.district', 'd')
      .innerJoin('o.type', 't')
      .select('o.id', 'id')
      .addSelect('o.code', 'code')
      .addSelect('o.name', 'name')
      .addSelect('o.health_status', 'healthStatus')
      .addSelect('o.progress_percent', 'progressPercent')
      .addSelect('d.short_name', 'districtName')
      .addSelect('t.name', 'typeName')
      .addSelect('t.color', 'typeColor')
      .where('o.lat IS NOT NULL')
      .andWhere('o.lng IS NOT NULL');

    this.applyScope(qb, user);
    this.applyFilters(qb, query);
    // ⚠️ Xaritadagi nuqtani bosgan odam birinchi navbatda «bu qayerda
    // va kim javobgar» deb so‘raydi — manzil va mas'ul ko‘rsatmaning
    // O‘ZIDA bo‘lishi kerak, obyekt kartasini ochmasdan.
    // Chaqiruv `select()` dan KEYIN (`object-brief.contract.ts`).
    selectObjectBrief(qb);

    const rows = await qb.limit(5000).getRawMany<Record<string, string>>();
    return rows.map((r) => {
      const brief = objectBriefFromRaw(r);
      return {
        ...brief,
        id: r.id,
        code: r.code,
        name: r.name,
        // ⚠️ `lat`/`lng` bu yerda MAJBURIY (so'rov ularni `NOT NULL`
        // deb filtrlaydi), shuning uchun ixtiyoriy `brief` qiymati
        // ustiga aniq son yoziladi — mijozda `null` tekshiruvi
        // kerak bo'lmasin.
        lat: Number(r.lat),
        lng: Number(r.lng),
        healthStatus: r.healthStatus,
        progressPercent: Number(r.progressPercent),
        districtName: r.districtName,
        typeName: r.typeName,
        typeColor: r.typeColor,
      };
    });
  }

  /* ───────────────────────── Yozish ───────────────────────── */

  async create(
    dto: CreateObjectDto,
    user: AuthUser,
  ): Promise<ConstructionObject> {
    this.assertDatesConsistent(
      dto.plannedStartDate,
      dto.plannedEndDate,
      dto.actualStartDate,
      dto.actualEndDate,
    );

    const district = await this.districts.findOne({
      where: { id: dto.districtId },
    });
    if (!district) throw new BadRequestException('Tanlangan tuman topilmadi');

    if (
      user.role === UserRole.DISTRICT_ADMIN &&
      user.districtId &&
      user.districtId !== district.id
    ) {
      throw new ForbiddenException(
        'Faqat o‘z tumaningizda obyekt yarata olasiz',
      );
    }

    const created = await this.dataSource.transaction(async (em) => {
      const code = await this.generateCode(
        em,
        district.regionId,
        dto.plannedStartDate,
      );

      const object = em.create(ConstructionObject, {
        ...dto,
        code,
        // `regionId` tumandan OLINADI, mijozdan emas: aks holda tuman bilan
        // viloyat mos kelmaydigan yozuv paydo bo‘lishi mumkin edi.
        regionId: district.regionId,
        // ⚠️ Mahalla ham KOORDINATADAN olinadi, mijozdan emas — u
        // tanlanadigan maydon emas, joylashuvdan kelib chiqadigan fakt
        // (`mahalla-assign.ts` ga qarang). Koordinata yo‘q bo‘lsa yoki
        // tumanning chegaralari yuklanmagan bo‘lsa — `null`.
        mahallaId: await resolveMahallaId(em, district.id, dto.lng, dto.lat),
        status: dto.status ?? ObjectStatus.NOT_STARTED,
        progressPercent: dto.progressPercent ?? 0,
      });

      const saved = await em.save(object);
      await this.health.refreshOne(saved.id, em);
      return saved;
    });

    await this.audit.record({
      userId: user.id,
      action: 'object.create',
      entity: 'ConstructionObject',
      entityId: created.id,
      changes: { name: { before: null, after: created.name } },
    });

    this.logger.log(`Obyekt yaratildi: ${created.code} — ${created.name}`);
    return this.findOne(created.id, user);
  }

  async update(
    id: string,
    dto: UpdateObjectDto,
    user: AuthUser,
  ): Promise<ConstructionObject> {
    const existing = await this.objects.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Obyekt topilmadi');
    this.assertCanWrite(existing, user);

    // ⚠️ Bajarilish bu yerdan O‘ZGARTIRILMAYDI — u tarix yozadigan alohida
    // amal. Aks holda grafikda sababsiz sakrash paydo bo‘lardi.
    if (
      dto.progressPercent !== undefined &&
      dto.progressPercent !== existing.progressPercent
    ) {
      throw new BadRequestException(
        'Bajarilish foizi bu yerdan o‘zgartirilmaydi — «Bajarilishni yangilash» amalidan foydalaning',
      );
    }

    this.assertDatesConsistent(
      dto.plannedStartDate ?? existing.plannedStartDate,
      dto.plannedEndDate ?? existing.plannedEndDate,
      dto.actualStartDate ?? existing.actualStartDate,
      dto.actualEndDate ?? existing.actualEndDate,
    );

    let regionId = existing.regionId;
    if (dto.districtId && dto.districtId !== existing.districtId) {
      const district = await this.districts.findOne({
        where: { id: dto.districtId },
      });
      if (!district) throw new BadRequestException('Tanlangan tuman topilmadi');
      regionId = district.regionId;
    }

    const changes = diffFields(
      existing as unknown as Record<string, unknown>,
      dto as unknown as Record<string, unknown>,
    );

    await this.dataSource.transaction(async (em) => {
      /*
       * ⚠️ Mahalla JOYLASHUV yoki TUMAN o‘zgarganda qayta hisoblanadi.
       * Har saqlashda qayta hisoblash ham mumkin edi, lekin u nomi
       * to‘g‘rilangan obyekt uchun ham 98 ta ko‘pburchakni aylanib
       * chiqishni anglatardi.
       */
      const districtId = dto.districtId ?? existing.districtId;
      const moved =
        (dto.lat !== undefined && dto.lat !== existing.lat) ||
        (dto.lng !== undefined && dto.lng !== existing.lng) ||
        districtId !== existing.districtId;

      const patch: Record<string, unknown> = { ...dto, regionId };
      if (moved) {
        patch.mahallaId = await resolveMahallaId(
          em,
          districtId,
          dto.lng ?? existing.lng,
          dto.lat ?? existing.lat,
        );
      }

      await em.update(ConstructionObject, { id }, patch);
      await this.health.refreshOne(id, em);
    });

    if (Object.keys(changes).length > 0) {
      await this.audit.record({
        userId: user.id,
        action: 'object.update',
        entity: 'ConstructionObject',
        entityId: id,
        changes,
      });
    }

    return this.findOne(id, user);
  }

  /**
   * BAJARILISHNI YANGILASH — tarix bilan.
   * Obyektdagi `progressPercent` va `object_progress_updates` dagi qator
   * BITTA tranzaksiyada yoziladi: biri yozilib, ikkinchisi yozilmay qolsa
   * dinamika grafigi obyekt holatiga zid raqam ko‘rsatardi.
   */
  async addProgress(
    id: string,
    dto: AddProgressDto,
    user: AuthUser,
    source: ProgressSource = ProgressSource.MANUAL,
  ): Promise<ConstructionObject> {
    const object = await this.objects.findOne({ where: { id } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');
    this.assertCanWrite(object, user);

    if (object.status === ObjectStatus.CANCELLED) {
      throw new BadRequestException(
        'Bekor qilingan obyektning bajarilishi yangilanmaydi',
      );
    }

    const reportDate = dto.reportDate ?? toDateKey(tashkentToday())!;
    if ((diffInDays(reportDate, tashkentToday()) ?? 0) < 0) {
      throw new BadRequestException('Hisobot sanasi kelajakda bo‘la olmaydi');
    }

    const previous = object.progressPercent;
    if (dto.progressPercent < previous) {
      // Pasayish MUMKIN (qayta o‘lchov, ortiqcha yozilgan hajm), lekin izoh
      // MAJBURIY: «nega kamaydi» degan savol javobsiz qolmasligi kerak.
      if (!dto.note?.trim()) {
        throw new BadRequestException(
          `Bajarilish ${previous}% dan ${dto.progressPercent}% ga kamaymoqda — sababini izohda ko‘rsating`,
        );
      }
    }

    await this.dataSource.transaction(async (em) => {
      await em.insert(ObjectProgressUpdate, {
        objectId: id,
        reportDate,
        progressPercent: dto.progressPercent,
        previousPercent: previous,
        note: dto.note ?? null,
        source,
        authorId: user.id,
      });

      const patch: QueryDeepPartialEntity<ConstructionObject> = {
        progressPercent: dto.progressPercent,
      };

      // Holat avtomatik ergashadi: 0 dan chiqsa «jarayonda», 100 ga yetsa
      // «topshirilgan». Admin buni qo‘lda belgilashi shart emas.
      if (
        dto.progressPercent > 0 &&
        object.status === ObjectStatus.NOT_STARTED
      ) {
        patch.status = ObjectStatus.IN_PROGRESS;
        patch.actualStartDate = object.actualStartDate ?? reportDate;
      }
      if (dto.progressPercent >= 100) {
        patch.status = ObjectStatus.COMPLETED;
        patch.actualEndDate = object.actualEndDate ?? reportDate;
      } else if (object.status === ObjectStatus.COMPLETED) {
        // 100% dan qaytdi — «topshirilgan» belgisi ham qaytariladi.
        patch.status = ObjectStatus.IN_PROGRESS;
        patch.actualEndDate = null;
      }

      await em.update(ConstructionObject, { id }, patch);
      await this.health.refreshOne(id, em);
    });

    await this.audit.record({
      userId: user.id,
      action: 'object.progress',
      entity: 'ConstructionObject',
      entityId: id,
      changes: {
        progressPercent: { before: previous, after: dto.progressPercent },
      },
    });

    return this.findOne(id, user);
  }

  async progressHistory(
    id: string,
    user: AuthUser,
  ): Promise<ObjectProgressUpdate[]> {
    await this.findOne(id, user);
    return this.dataSource.getRepository(ObjectProgressUpdate).find({
      where: { objectId: id },
      relations: { author: true },
      order: { reportDate: 'ASC', createdAt: 'ASC' },
    });
  }

  async remove(id: string, user: AuthUser): Promise<{ message: string }> {
    const object = await this.objects.findOne({ where: { id } });
    if (!object) throw new NotFoundException('Obyekt topilmadi');
    this.assertCanWrite(object, user);

    // ⚠️ Yumshoq o‘chirish: nazorat tizimida yozuv izsiz yo‘qolmasligi kerak.
    await this.objects.softDelete(id);
    await this.audit.record({
      userId: user.id,
      action: 'object.delete',
      entity: 'ConstructionObject',
      entityId: id,
      changes: { code: { before: object.code, after: null } },
    });

    return { message: `«${object.name}» arxivga ko‘chirildi` };
  }

  async restore(id: string, user: AuthUser): Promise<{ message: string }> {
    const object = await this.objects.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!object) throw new NotFoundException('Obyekt topilmadi');
    this.assertCanWrite(object, user);

    await this.objects.restore(id);
    await this.health.refreshOne(id);
    return { message: `«${object.name}» tiklandi` };
  }

  /* ───────────────────────── Ichki yordamchilar ───────────────────────── */

  private baseQuery(): SelectQueryBuilder<ConstructionObject> {
    return this.objects
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.district', 'district')
      .leftJoinAndSelect('o.region', 'region')
      .leftJoinAndSelect('o.type', 'type')
      .leftJoinAndSelect('o.contractor', 'contractor')
      .leftJoinAndSelect('o.customer', 'customer')
      .leftJoinAndSelect('o.responsible', 'responsible')
      .leftJoinAndSelect('o.fundingSource', 'fundingSource')
      .leftJoinAndSelect('o.primaryDelayReason', 'primaryDelayReason');
  }

  private applyFilters(
    qb: SelectQueryBuilder<ConstructionObject>,
    q: ObjectQueryDto,
  ): void {
    if (q.search) {
      // Kod, nom va manzil bo‘yicha — foydalanuvchi qaysi birini yozishini
      // oldindan bilib bo‘lmaydi.
      qb.andWhere(
        // ⚠️ Ifoda `SearchIndexes` migratsiyasidagi GIN indeksi bilan
        // AYNAN bir xil bo‘lishi shart — aks holda PostgreSQL indeksdan
        // foydalanmaydi va qidiruv butun jadvalni ko‘rib chiqadi.
        `(COALESCE(o.name, '') ILIKE :search
          OR COALESCE(o.code, '') ILIKE :search
          OR COALESCE(o.address, '') ILIKE :search)`,
        { search: `%${q.search}%` },
      );
    }
    if (q.regionId)
      qb.andWhere('o.region_id = :regionId', { regionId: q.regionId });
    if (q.districtIds?.length)
      qb.andWhere('o.district_id IN (:...districtIds)', {
        districtIds: q.districtIds,
      });
    if (q.typeIds?.length)
      qb.andWhere('o.type_id IN (:...typeIds)', { typeIds: q.typeIds });
    if (q.health?.length)
      qb.andWhere('o.health_status IN (:...health)', { health: q.health });
    if (q.status?.length)
      qb.andWhere('o.status IN (:...status)', { status: q.status });
    if (q.riskLevel?.length)
      qb.andWhere('o.risk_level IN (:...riskLevel)', {
        riskLevel: q.riskLevel,
      });
    if (q.contractorId)
      qb.andWhere('o.contractor_id = :contractorId', {
        contractorId: q.contractorId,
      });
    if (q.customerId)
      qb.andWhere('o.customer_id = :customerId', { customerId: q.customerId });
    if (q.responsibleId)
      qb.andWhere('o.responsible_id = :responsibleId', {
        responsibleId: q.responsibleId,
      });
    if (q.fundingSourceId)
      qb.andWhere('o.funding_source_id = :fundingSourceId', {
        fundingSourceId: q.fundingSourceId,
      });
    if (q.delayReasonId)
      qb.andWhere('o.primary_delay_reason_id = :delayReasonId', {
        delayReasonId: q.delayReasonId,
      });

    // `year` — ANIQ topshirish yili (bitta yil tanlangan).
    if (q.year)
      qb.andWhere('EXTRACT(YEAR FROM o.planned_end_date) = :year', {
        year: q.year,
      });
    // `yearFrom`/`yearTo` — DASTUR DAVRI: obyekt davri oraliq bilan kesishadi
    // (dashboard va xarita bilan AYNI qoida).
    if (q.yearFrom)
      qb.andWhere('EXTRACT(YEAR FROM o.planned_end_date) >= :yearFrom', {
        yearFrom: q.yearFrom,
      });
    if (q.yearTo)
      qb.andWhere('EXTRACT(YEAR FROM o.planned_start_date) <= :yearTo', {
        yearTo: q.yearTo,
      });

    if (q.progressFrom !== undefined)
      qb.andWhere('o.progress_percent >= :progressFrom', {
        progressFrom: q.progressFrom,
      });
    if (q.progressTo !== undefined)
      qb.andWhere('o.progress_percent <= :progressTo', {
        progressTo: q.progressTo,
      });
    if (q.costFrom !== undefined)
      qb.andWhere('o.total_cost >= :costFrom', { costFrom: q.costFrom });
    if (q.costTo !== undefined)
      qb.andWhere('o.total_cost <= :costTo', { costTo: q.costTo });

    if (q.onlyDelayed) qb.andWhere('o.delay_days > 0');
    if (q.hasOpenDelays) qb.andWhere('o.open_delay_count > 0');

    if (q.dueWithinDays) {
      qb.andWhere(
        'o.planned_end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + :dueDays::int)',
        {
          dueDays: q.dueWithinDays,
        },
      ).andWhere('o.status != :completedStatus', {
        completedStatus: ObjectStatus.COMPLETED,
      });
    }
  }

  /**
   * OBYEKT KODI: `AND-2026-0042`.
   *
   * ⚠️ Raqam advisory lock ICHIDA olinadi. Busiz ikki parallel so‘rov
   * `MAX(seq) + 1` ni bir vaqtda o‘qib, bir xil kod yozishga urinardi va
   * biri unique indeks xatosi bilan yiqilardi.
   */
  private async generateCode(
    em: EntityManager,
    regionId: string,
    startDate: string,
  ): Promise<string> {
    const region = await em.findOne(Region, { where: { id: regionId } });
    const prefix = (region?.code ?? 'OBJ').slice(0, 3).toUpperCase();
    const year = new Date(startDate).getUTCFullYear();
    const lockKey = `${prefix}-${year}`;

    await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);

    const row = await em.query<Array<{ max: string | null }>>(
      `SELECT MAX(CAST(SPLIT_PART(code, '-', 3) AS int))::text AS max
         FROM construction_objects
        WHERE code LIKE $1`,
      [`${lockKey}-%`],
    );

    const next = Number(row[0]?.max ?? 0) + 1;
    return `${lockKey}-${String(next).padStart(4, '0')}`;
  }

  private assertDatesConsistent(
    plannedStart: string,
    plannedEnd: string,
    actualStart?: string | null,
    actualEnd?: string | null,
  ): void {
    if ((diffInDays(plannedStart, plannedEnd) ?? 0) <= 0) {
      throw new BadRequestException(
        'Reja tugash sanasi boshlanish sanasidan keyin bo‘lishi kerak',
      );
    }
    if (
      actualStart &&
      actualEnd &&
      (diffInDays(actualStart, actualEnd) ?? 0) < 0
    ) {
      throw new BadRequestException(
        'Haqiqiy tugash sanasi boshlanish sanasidan oldin bo‘la olmaydi',
      );
    }
    if (actualStart && (diffInDays(actualStart, tashkentToday()) ?? 0) < 0) {
      throw new BadRequestException(
        'Haqiqiy boshlanish sanasi kelajakda bo‘la olmaydi',
      );
    }
  }
}

/** Audit uchun — faqat HAQIQATAN o‘zgargan maydonlar. */
function diffFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const [key, after] of Object.entries(patch)) {
    if (after === undefined) continue;
    const prev = before[key];
    if (prev instanceof Date || after instanceof Date) continue;
    if (stableString(prev) !== stableString(after)) {
      changes[key] = { before: prev ?? null, after };
    }
  }
  return changes;
}
