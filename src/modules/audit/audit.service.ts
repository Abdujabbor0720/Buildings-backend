import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import {
  PaginatedResult,
  type PaginationDto,
} from '../../common/dto/pagination.dto';

export interface AuditFilters {
  entity?: string;
  entityId?: string;
  userId?: string;
  action?: string;
}

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: Record<string, { before: unknown; after: unknown }> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  /**
   * ⚠️ Audit yozuvi ASOSIY AMALNI YIQITMAYDI.
   * Jurnalga yozib bo‘lmagani uchun obyektni saqlashdan voz kechish —
   * foydalanuvchi uchun tushunarsiz va zararli xulq. Nosozlik logga chiqadi,
   * amal esa davom etadi.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.logs.save(
        this.logs.create({
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          changes: entry.changes ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Audit yozib bo‘lmadi: ${entry.action} ${entry.entity}#${entry.entityId ?? '-'}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async list(
    query: PaginationDto,
    filters: AuditFilters = {},
  ): Promise<PaginatedResult<AuditLog>> {
    const qb = this.logs
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user')
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (filters.entity)
      qb.andWhere('a.entity = :entity', { entity: filters.entity });
    if (filters.entityId)
      qb.andWhere('a.entity_id = :entityId', { entityId: filters.entityId });
    if (filters.userId)
      qb.andWhere('a.user_id = :userId', { userId: filters.userId });
    if (filters.action)
      qb.andWhere('a.action = :action', { action: filters.action });
    if (query.search)
      qb.andWhere('a.action ILIKE :search', { search: `%${query.search}%` });

    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResult(items, total, query.page, query.limit);
  }
}
