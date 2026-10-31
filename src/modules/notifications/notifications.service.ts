import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { Notification } from '../../database/entities/notification.entity';
import { ObjectDocument } from '../../database/entities/object-document.entity';
import { User } from '../../database/entities/user.entity';
import {
  NotificationSeverity,
  NotificationType,
  ObjectHealth,
  ObjectStatus,
  UserRole,
} from '../../common/constants/enums';
import {
  PaginatedResult,
  type PaginationDto,
} from '../../common/dto/pagination.dto';
import { formatDateUz } from '../../helpers/date.helpers';

/** Muddat ogohlantirishi shuncha kun oldin chiqadi. */
const DEADLINE_WARNING_DAYS = 30;
/** Hisobot kelmaganlik ogohlantirishi shuncha kundan keyin. */
const STALE_REPORT_DAYS = 21;
/** Bildirishnomalar shuncha kundan keyin tozalanadi. */
const RETENTION_DAYS = 90;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(ConstructionObject)
    private readonly objects: Repository<ConstructionObject>,
    @InjectRepository(ObjectDocument)
    private readonly documents: Repository<ObjectDocument>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async list(
    userId: string,
    query: PaginationDto,
    unreadOnly = false,
  ): Promise<PaginatedResult<Notification>> {
    const qb = this.notifications
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.object', 'object')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (unreadOnly) qb.andWhere('n.is_read = false');

    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResult(items, total, query.page, query.limit);
  }

  /** Header'dagi qo‘ng‘iroq ustidagi raqam. */
  unreadCount(userId: string): Promise<number> {
    return this.notifications.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notifications.findOne({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Bildirishnoma topilmadi');

    if (!notification.isRead) {
      await this.notifications.update(id, { isRead: true, readAt: new Date() });
    }
    return this.notifications.findOneOrFail({ where: { id } });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notifications.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  /**
   * ⚠️ TAKROR YOZILMAYDI: bitta obyekt bo‘yicha bitta turdagi o‘qilmagan
   * bildirishnoma faqat BITTA bo‘ladi. Busiz tungi pass har kuni yangisini
   * yozib, qo‘ng‘iroq ostida bir xil xabar 30 marta turardi.
   */
  private async pushUnique(params: {
    userIds: string[];
    type: NotificationType;
    severity: NotificationSeverity;
    title: string;
    body: string;
    objectId?: string | null;
  }): Promise<number> {
    if (params.userIds.length === 0) return 0;

    const existing = await this.notifications.find({
      where: {
        userId: In(params.userIds),
        type: params.type,
        objectId: params.objectId ?? IsNull(),
        isRead: false,
      },
      select: { userId: true },
    });
    const already = new Set(existing.map((n) => n.userId));
    const fresh = params.userIds.filter((id) => !already.has(id));
    if (fresh.length === 0) return 0;

    await this.notifications.save(
      fresh.map((userId) =>
        this.notifications.create({
          userId,
          type: params.type,
          severity: params.severity,
          title: params.title,
          body: params.body,
          objectId: params.objectId ?? null,
        }),
      ),
    );
    return fresh.length;
  }

  /** Obyekt bo‘yicha xabardor qilinadiganlar: mas’ul + tuman admini + viloyat darajasi. */
  private async recipientsFor(object: ConstructionObject): Promise<string[]> {
    const users = await this.users.find({
      where: [
        { id: object.responsibleId ?? undefined, isActive: true },
        {
          districtId: object.districtId,
          role: UserRole.DISTRICT_ADMIN,
          isActive: true,
        },
        {
          regionId: object.regionId,
          role: UserRole.REGION_ADMIN,
          isActive: true,
        },
      ].filter((w) => w.id !== undefined || w.role !== undefined),
      select: { id: true },
    });
    return [...new Set(users.map((u) => u.id))];
  }

  /**
   * TUNGI PASS — ogohlantirishlarni shakllantirish.
   * 02:30 — obyekt holati qayta hisoblangandan (02:00) KEYIN: aks holda
   * kechagi holat asosida xabar yuborilardi.
   */
  @Cron('30 2 * * *', {
    name: 'notifications-generate',
    timeZone: 'Asia/Tashkent',
  })
  async generateDaily(): Promise<{ created: number }> {
    let created = 0;
    try {
      created += await this.notifyApproachingDeadlines();
      created += await this.notifyAtRisk();
      created += await this.notifyExpiringDocuments();
      created += await this.notifyStaleReports();
      this.logger.log(`Bildirishnomalar shakllantirildi: ${created} ta`);
    } catch (error) {
      this.logger.error(
        'Bildirishnoma passi yiqildi',
        error instanceof Error ? error.stack : String(error),
      );
    }
    return { created };
  }

  private async notifyApproachingDeadlines(): Promise<number> {
    const objects = await this.objects
      .createQueryBuilder('o')
      .where(
        'o.planned_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + :days::int',
        {
          days: DEADLINE_WARNING_DAYS,
        },
      )
      .andWhere('o.status NOT IN (:...done)', {
        done: [ObjectStatus.COMPLETED, ObjectStatus.CANCELLED],
      })
      .andWhere('o.progress_percent < 95')
      .getMany();

    let count = 0;
    for (const object of objects) {
      count += await this.pushUnique({
        userIds: await this.recipientsFor(object),
        type: NotificationType.DEADLINE_APPROACHING,
        severity: NotificationSeverity.WARNING,
        title: 'Topshirish muddati yaqinlashmoqda',
        body: `«${object.name}» ${formatDateUz(object.plannedEndDate, { utc: true })} da topshirilishi kerak, bajarilish ${object.progressPercent}%.`,
        objectId: object.id,
      });
    }
    return count;
  }

  private async notifyAtRisk(): Promise<number> {
    const objects = await this.objects.find({
      where: { healthStatus: ObjectHealth.AT_RISK },
    });

    let count = 0;
    for (const object of objects) {
      count += await this.pushUnique({
        userIds: await this.recipientsFor(object),
        type: NotificationType.RISK_DETECTED,
        severity: NotificationSeverity.CRITICAL,
        title: 'Obyekt xavfli holatda',
        body: `«${object.name}» ${object.delayDays} kun kechikmoqda (bajarilish ${object.progressPercent}%). Zudlik bilan chora ko‘rish talab etiladi.`,
        objectId: object.id,
      });
    }
    return count;
  }

  private async notifyExpiringDocuments(): Promise<number> {
    const docs = await this.documents
      .createQueryBuilder('doc')
      .innerJoinAndSelect('doc.object', 'o')
      .where('doc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30')
      .getMany();

    let count = 0;
    for (const doc of docs) {
      if (!doc.object) continue;
      count += await this.pushUnique({
        userIds: await this.recipientsFor(doc.object),
        type: NotificationType.DOCUMENT_EXPIRING,
        severity: NotificationSeverity.WARNING,
        title: 'Hujjat muddati tugamoqda',
        body: `«${doc.title}» hujjatining amal qilish muddati ${formatDateUz(doc.expiryDate, { utc: true })} da tugaydi.`,
        objectId: doc.objectId,
      });
    }
    return count;
  }

  private async notifyStaleReports(): Promise<number> {
    const objects = await this.objects
      .createQueryBuilder('o')
      .where('o.status = :inProgress', { inProgress: ObjectStatus.IN_PROGRESS })
      .andWhere(
        "(o.last_report_at IS NULL OR o.last_report_at < NOW() - :days * INTERVAL '1 day')",
        {
          days: STALE_REPORT_DAYS,
        },
      )
      .getMany();

    let count = 0;
    for (const object of objects) {
      count += await this.pushUnique({
        userIds: await this.recipientsFor(object),
        type: NotificationType.SYSTEM,
        severity: NotificationSeverity.INFO,
        title: 'Uzoq vaqt foto-hisobot yo‘q',
        body: `«${object.name}» bo‘yicha ${STALE_REPORT_DAYS} kundan beri foto-hisobot yuborilmagan.`,
        objectId: object.id,
      });
    }
    return count;
  }

  /** Eski o‘qilgan bildirishnomalarni tozalash. */
  @Cron(CronExpression.EVERY_WEEK, {
    name: 'notifications-cleanup',
    timeZone: 'Asia/Tashkent',
  })
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const result = await this.notifications.delete({
      isRead: true,
      createdAt: LessThan(cutoff),
    });
    if (result.affected)
      this.logger.log(`Eski bildirishnomalar tozalandi: ${result.affected} ta`);
  }
}
