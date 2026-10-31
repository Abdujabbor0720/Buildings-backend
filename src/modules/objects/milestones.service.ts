import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectMilestone } from '../../database/entities/object-milestone.entity';
import { MilestoneStatus } from '../../common/constants/enums';
import {
  diffInDays,
  tashkentToday,
  toDateKey,
} from '../../helpers/date.helpers';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type {
  CalendarQueryDto,
  CreateMilestoneDto,
  ReplaceMilestonesDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';

export interface CalendarItem {
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

@Injectable()
export class MilestonesService {
  constructor(
    @InjectRepository(ObjectMilestone)
    private readonly milestones: Repository<ObjectMilestone>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listForObject(objectId: string): Promise<ObjectMilestone[]> {
    await this.assertObjectExists(objectId);
    return this.milestones.find({
      where: { objectId },
      order: { sortOrder: 'ASC', plannedStart: 'ASC' },
    });
  }

  async create(
    objectId: string,
    dto: CreateMilestoneDto,
  ): Promise<ObjectMilestone> {
    await this.assertObjectExists(objectId);
    this.assertDates(dto.plannedStart, dto.plannedEnd);

    const existing = await this.milestones.find({ where: { objectId } });
    const totalWeight =
      existing.reduce((sum, m) => sum + Number(m.weight), 0) + dto.weight;
    if (totalWeight > 100 + WEIGHT_TOLERANCE) {
      throw new BadRequestException(
        `Bosqich ulushlari yig‘indisi 100% dan oshdi (${totalWeight.toFixed(1)}%). Avval mavjud bosqichlarni kamaytiring.`,
      );
    }

    return this.milestones.save(
      this.milestones.create({
        ...dto,
        objectId,
        sortOrder: dto.sortOrder ?? existing.length,
        status: dto.status ?? MilestoneStatus.PLANNED,
      }),
    );
  }

  async update(id: string, dto: UpdateMilestoneDto): Promise<ObjectMilestone> {
    const milestone = await this.milestones.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException('Bosqich topilmadi');

    this.assertDates(
      dto.plannedStart ?? milestone.plannedStart,
      dto.plannedEnd ?? milestone.plannedEnd,
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
    return this.milestones.save(milestone);
  }

  /** Butun rejani almashtirish — ulushlar yig‘indisi ANIQ 100 bo‘lishi shart. */
  async replaceAll(
    objectId: string,
    dto: ReplaceMilestonesDto,
  ): Promise<ObjectMilestone[]> {
    await this.assertObjectExists(objectId);

    const total = dto.milestones.reduce((sum, m) => sum + Number(m.weight), 0);
    if (Math.abs(total - 100) > WEIGHT_TOLERANCE) {
      throw new BadRequestException(
        `Bosqich ulushlari yig‘indisi aniq 100% bo‘lishi kerak, hozir ${total.toFixed(1)}%`,
      );
    }
    dto.milestones.forEach((m) =>
      this.assertDates(m.plannedStart, m.plannedEnd),
    );

    return this.dataSource.transaction(async (em) => {
      // ⚠️ Eskisi o‘chirilib, yangisi yoziladi — BITTA tranzaksiyada.
      // Ikki alohida amalda bo‘lsa, ikkinchisi yiqilganda obyekt
      // bosqichsiz qolib ketardi.
      await em.delete(ObjectMilestone, { objectId });
      const rows = dto.milestones.map((m, index) =>
        em.create(ObjectMilestone, {
          ...m,
          objectId,
          sortOrder: m.sortOrder ?? index,
          status: m.status ?? MilestoneStatus.PLANNED,
        }),
      );
      return em.save(rows);
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    const milestone = await this.milestones.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException('Bosqich topilmadi');
    await this.milestones.delete(id);
    return { message: `«${milestone.name}» bosqichi o‘chirildi` };
  }

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
