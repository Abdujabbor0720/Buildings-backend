import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DelayStatus, RiskLevel } from '../../common/constants/enums';
import { ConstructionObject } from './construction-object.entity';
import { DelayReason } from './delay-reason.entity';
import { User } from './user.entity';

/**
 * KECHIKISH / RISK yozuvi — «Kechikishlar va risklar» bo‘limi.
 *
 * ⚠️ Bitta obyektda bir nechta ochiq sabab bo‘lishi MUMKIN va hammasi muhim:
 * «Asosiy kechikish sabablari» diagrammasi obyektlarni emas, aynan shu
 * yozuvlarni sanaydi (shuning uchun yig‘indisi obyektlar sonidan katta).
 */
@Entity('object_delays')
@Index('idx_delays_object_status', ['objectId', 'status'])
@Index('idx_delays_reason_status', ['reasonId', 'status'])
export class ObjectDelay extends BaseEntity {
  @Index()
  @Column('uuid', { name: 'object_id' })
  objectId!: string;

  @ManyToOne(() => ConstructionObject, (o) => o.delays, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject;

  @Column('uuid', { name: 'reason_id' })
  reasonId!: string;

  @ManyToOne(() => DelayReason, (r) => r.delays, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reason_id' })
  reason!: DelayReason;

  @ApiProperty({
    example: 42,
    description: 'Shu sabab keltirgan kechikish, kun',
  })
  @Column('int', { default: 0, name: 'delay_days' })
  delayDays!: number;

  @ApiProperty({ enum: RiskLevel })
  @Column({ length: 20, default: RiskLevel.MEDIUM })
  severity!: RiskLevel;

  @ApiProperty({ enum: DelayStatus })
  @Index()
  @Column({ length: 20, default: DelayStatus.OPEN })
  status!: DelayStatus;

  @Column('text', { nullable: true })
  description!: string | null;

  /** Muammoni bartaraf etish rejasi. */
  @Column('text', { nullable: true, name: 'mitigation_plan' })
  mitigationPlan!: string | null;

  @Column('date', { name: 'detected_at' })
  detectedAt!: string;

  @Column('date', { nullable: true, name: 'resolved_at' })
  resolvedAt!: string | null;

  @Column('uuid', { nullable: true, name: 'responsible_id' })
  responsibleId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsible_id' })
  responsible!: User | null;
}
