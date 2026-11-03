import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { MilestoneStatus } from '../../common/constants/enums';
import { decimalTransformer } from '../transformers';
import { ConstructionObject } from './construction-object.entity';
import { User } from './user.entity';

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

  /**
   * SHU BOSQICHGA biriktirilgan ishchilar soni.
   *
   * ⚠️ Obyekt darajasida EMAS, bosqich darajasida: poydevorda 12 kishi,
   * tomni yopishda 5 kishi ishlaydi va «nega sekin ketyapti» degan savolga
   * javob aynan shu farqdan chiqadi. Obyektga bitta son yozilsa, u o‘rtacha
   * bo‘lib qolardi va hech narsa tushuntirmasdi.
   */
  @ApiProperty({ example: 12, nullable: true })
  @Column('smallint', { nullable: true, name: 'worker_count' })
  workerCount!: number | null;

  /* ───────────────────────── Topshirish ───────────────────────── */

  /**
   * BOSQICH TOPSHIRILGAN VAQT.
   *
   * ⚠️ `actualEnd` bilan chalkashmasin: `actualEnd` — ish QACHON tugagani
   * (odam ko‘rsatadigan sana), bu esa hisobot tizimga QACHON kelgani.
   * Ikkalasi bir xil bo‘lmaydi — maydondan kelgan hisobot ko‘pincha
   * ertasi kuni yuklanadi, va «kechikib yuklangan hisobot» aynan shu
   * ikki qiymat farqidan ko‘rinadi.
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'submitted_at' })
  submittedAt!: Date | null;

  @Column('uuid', { nullable: true, name: 'submitted_by_id' })
  submittedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submitted_by_id' })
  submittedBy!: User | null;

  /** Topshirishda yozilgan izoh — oxirgi topshiruvniki. */
  @Column('text', { nullable: true, name: 'submission_note' })
  submissionNote!: string | null;

  /**
   * Shu bosqich bo‘yicha yuborilgan foto-hisobotlar soni.
   *
   * ⚠️ ATAYLAB TAKRORLANGAN (denormalizatsiya): ro‘yxatdagi har bosqich
   * uchun alohida `COUNT(*)` so‘rovi 20 ta bosqichda 20 ta so‘rov
   * degani. Qiymat faqat `submit()` ichida oshiriladi.
   */
  @Column('smallint', { default: 0, name: 'report_count' })
  reportCount!: number;
}
