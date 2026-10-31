import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { MilestoneStatus } from '../../common/constants/enums';
import { decimalTransformer } from '../transformers';
import { ConstructionObject } from './construction-object.entity';

/**
 * Qurilish BOSQICHI — «Kalendar (ish rejasi)» bo‘limining asosi.
 *
 * `weight` — bosqichning umumiy bajarilishdagi ulushi (foizda).
 * ⚠️ Bitta obyekt bo‘yicha `weight` yig‘indisi 100 bo‘lishi kerak; buni
 * `MilestonesService` tranzaksiya ichida tekshiradi. Aks holda bosqichlardan
 * hisoblangan bajarilish obyektdagi `progressPercent` bilan mos kelmasdi.
 */
@Entity('object_milestones')
@Index('idx_milestones_object_order', ['objectId', 'sortOrder'])
@Index('idx_milestones_planned_end', ['plannedEnd'])
export class ObjectMilestone extends BaseEntity {
  @Index()
  @Column('uuid', { name: 'object_id' })
  objectId!: string;

  @ManyToOne(() => ConstructionObject, (o) => o.milestones, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject;

  @ApiProperty({ example: 'Poydevor ishlari' })
  @Column({ length: 200 })
  name!: string;

  @Column('text', { nullable: true })
  description!: string | null;

  @ApiProperty({ example: '2025-03-01' })
  @Column('date', { name: 'planned_start' })
  plannedStart!: string;

  @ApiProperty({ example: '2025-05-15' })
  @Column('date', { name: 'planned_end' })
  plannedEnd!: string;

  @Column('date', { nullable: true, name: 'actual_start' })
  actualStart!: string | null;

  @Column('date', { nullable: true, name: 'actual_end' })
  actualEnd!: string | null;

  @ApiProperty({ example: 100 })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    name: 'progress_percent',
    transformer: decimalTransformer,
  })
  progressPercent!: number;

  @ApiProperty({ example: 15, description: 'Umumiy bajarilishdagi ulushi, %' })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  weight!: number;

  @ApiProperty({ enum: MilestoneStatus })
  @Index()
  @Column({ length: 20, default: MilestoneStatus.PLANNED })
  status!: MilestoneStatus;

  @Column('smallint', { default: 0, name: 'sort_order' })
  sortOrder!: number;
}
