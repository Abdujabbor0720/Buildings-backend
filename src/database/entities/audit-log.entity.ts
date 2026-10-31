import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

/**
 * AUDIT — kim, qachon, nimani o‘zgartirdi.
 *
 * ⚠️ Davlat nazorat tizimida bu majburiy: «bu obyektning summasi kim
 * tomonidan o‘zgartirilgan» degan savolga javob bo‘lishi kerak.
 * Yozuv faqat QO‘SHILADI — o‘chirish va tahrirlash yo‘q.
 */
@Entity('audit_logs')
@Index('idx_audit_entity', ['entity', 'entityId', 'createdAt'])
@Index('idx_audit_user_date', ['userId', 'createdAt'])
export class AuditLog extends BaseEntity {
  @Column('uuid', { nullable: true, name: 'user_id' })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @ApiProperty({ example: 'object.update' })
  @Column({ length: 60 })
  action!: string;

  @ApiProperty({ example: 'ConstructionObject' })
  @Column({ length: 60 })
  entity!: string;

  @Column('uuid', { nullable: true, name: 'entity_id' })
  entityId!: string | null;

  /** Faqat O‘ZGARGAN maydonlar — butun yozuvni ikki marta saqlash dump'ni shishirardi. */
  @Column('jsonb', { nullable: true })
  changes!: Record<string, { before: unknown; after: unknown }> | null;

  @Column({ type: 'varchar', length: 60, nullable: true, name: 'ip_address' })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true, name: 'user_agent' })
  userAgent!: string | null;
}
