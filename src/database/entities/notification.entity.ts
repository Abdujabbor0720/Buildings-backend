import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import {
  NotificationSeverity,
  NotificationType,
} from '../../common/constants/enums';
import { ConstructionObject } from './construction-object.entity';
import { User } from './user.entity';

/**
 * Bildirishnoma (header'dagi qo‘ng‘iroq).
 *
 * ⚠️ `userId = null` — BARCHAGA tegishli e'lon. O‘qilganlik belgisi
 * shaxsiy bo‘lgani uchun bunday yozuvlar har bir foydalanuvchi uchun
 * ko‘paytirilmaydi, balki `notification_reads` orqali belgilanadi — hozircha
 * sodda yo‘l: tizimli e'lonlar har bir mas’ulga alohida yoziladi.
 */
@Entity('notifications')
@Index('idx_notifications_user_read', ['userId', 'isRead', 'createdAt'])
export class Notification extends BaseEntity {
  @Index()
  @Column('uuid', { nullable: true, name: 'user_id' })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @ApiProperty({ enum: NotificationType })
  @Column({ length: 40 })
  type!: NotificationType;

  @ApiProperty({ enum: NotificationSeverity })
  @Column({ length: 20, default: NotificationSeverity.INFO })
  severity!: NotificationSeverity;

  @ApiProperty({ example: 'Muddat yaqinlashmoqda' })
  @Column({ length: 200 })
  title!: string;

  @Column('text')
  body!: string;

  @Column('uuid', { nullable: true, name: 'object_id' })
  objectId!: string | null;

  @ManyToOne(() => ConstructionObject, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject | null;

  @Column({ default: false, name: 'is_read' })
  isRead!: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'read_at' })
  readAt!: Date | null;
}
