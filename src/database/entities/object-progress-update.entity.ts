import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ProgressSource } from '../../common/constants/enums';
import { decimalTransformer } from '../transformers';
import { ConstructionObject } from './construction-object.entity';
import { User } from './user.entity';

/**
 * Bajarilish o‘zgarishi — APPEND-ONLY tarix.
 *
 * ⚠️ Qator TAHRIRLANMAYDI va O‘CHIRILMAYDI. «Bajarilish 65% dan 40% ga
 * tushdi» degan savolga javob faqat shu jadvaldan chiqadi; yozuvni
 * to‘g‘rilashga ruxsat berilsa, raqam har hafta jimgina qayta yozilib,
 * dinamika grafigi ma’nosiz bo‘lib qolardi.
 */
@Entity('object_progress_updates')
@Index('idx_progress_object_date', ['objectId', 'reportDate'])
export class ObjectProgressUpdate extends BaseEntity {
  @Index()
  @Column('uuid', { name: 'object_id' })
  objectId!: string;

  @ManyToOne(() => ConstructionObject, (o) => o.progressUpdates, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject;

  @ApiProperty({ example: '2026-10-29' })
  @Column('date', { name: 'report_date' })
  reportDate!: string;

  @ApiProperty({ example: 65 })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    name: 'progress_percent',
    transformer: decimalTransformer,
  })
  progressPercent!: number;

  @ApiProperty({
    example: 61,
    description: 'Oldingi qiymat — delta shu yerdan ko‘rinadi',
  })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    name: 'previous_percent',
    transformer: decimalTransformer,
  })
  previousPercent!: number;

  @Column('text', { nullable: true })
  note!: string | null;

  @ApiProperty({ enum: ProgressSource })
  @Column({ length: 20, default: ProgressSource.MANUAL })
  source!: ProgressSource;

  @Column('uuid', { nullable: true, name: 'author_id' })
  authorId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author!: User | null;
}
