import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import {
  ObjectHealth,
  ObjectStatus,
  RiskLevel,
} from '../../common/constants/enums';
import { decimalTransformer, moneyTransformer } from '../transformers';
import { ConstructionType } from './construction-type.entity';
import { Contractor } from './contractor.entity';
import { Customer } from './customer.entity';
import { DelayReason } from './delay-reason.entity';
import { District } from './district.entity';
import { FundingSource } from './funding-source.entity';
import { ObjectDelay } from './object-delay.entity';
import { ObjectDocument } from './object-document.entity';
import { ObjectMilestone } from './object-milestone.entity';
import { ObjectProgressUpdate } from './object-progress-update.entity';
import { PhotoReport } from './photo-report.entity';
import { Region } from './region.entity';
import { User } from './user.entity';

/**
 * QURILISH OBYEKTI — tizimning markaziy yozuvi.
 *
 * Maydonlar uch guruhga bo‘linadi:
 *   1. FAKT       — odam kiritadi (nom, manzil, summa, reja muddatlari).
 *   2. HISOBLANGAN— `evaluateObjectHealth()` yozadi (`healthStatus`,
 *                   `delayDays`, `riskLevel`, `riskScore`, `expectedProgress`).
 *   3. KESHLANGAN — tezlik uchun takrorlangan (`regionId`, `openDelayCount`,
 *                   `lastReportAt`).
 *
 * ⚠️ 2-guruhni QO‘LDA YOZMANG. Ular `ObjectHealthService.refresh()` orqali
 * yangilanadi: bitta formula, bitta yozuvchi. Aks holda dashboard bir
 * raqamni, obyekt kartasi boshqa raqamni ko‘rsatib qolardi.
 */
@Entity('construction_objects')
// Dashboard'ning eng og‘ir so‘rovlari — tuman/holat va viloyat/holat kesimi.
@Index('idx_objects_region_health', ['regionId', 'healthStatus'])
@Index('idx_objects_district_health', ['districtId', 'healthStatus'])
@Index('idx_objects_type_health', ['typeId', 'healthStatus'])
// «Yaqin muddatda topshiriladigan» va «Muddatlar bo‘yicha» uchun.
@Index('idx_objects_planned_end', ['plannedEndDate'])
@Index('idx_objects_status', ['status'])
export class ConstructionObject extends BaseEntity {
  /** `AND-2026-0001` — hujjatlarda va qidiruvda ishlatiladigan inson o‘qiydigan kod. */
  @ApiProperty({ example: 'AND-2026-0042' })
  @Index({ unique: true })
  @Column({ length: 30 })
  code!: string;

  @ApiProperty({ example: 'Baliqchi tumani 2-son maktab' })
  @Index()
  @Column({ length: 300 })
  name!: string;

  @Column('text', { nullable: true })
  description!: string | null;

  /* ───────────────────────── Joylashuv ───────────────────────── */

  @ApiProperty({ example: 'Baliqchi tumani, Navoiy ko‘chasi 14-uy' })
  @Column({ type: 'varchar', length: 400, nullable: true })
  address!: string | null;

  @ApiProperty({ example: 40.8676 })
  @Column('double precision', { nullable: true })
  lat!: number | null;

  @ApiProperty({ example: 71.9187 })
  @Column('double precision', { nullable: true })
  lng!: number | null;

  @Index()
  @Column('uuid', { name: 'district_id' })
  districtId!: string;

  @ManyToOne(() => District, (d) => d.objects, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'district_id' })
  district!: District;

  /**
   * ⚠️ ATAYLAB TAKRORLANGAN (denormalizatsiya): tuman orqali ham olish
   * mumkin edi, lekin viloyat kesimidagi har bir dashboard so‘rovi
   * `districts` bilan JOIN talab qilardi. Tuman viloyatini almashtirmaydi,
   * shuning uchun bu qiymat eskirmaydi.
   */
  @Index()
  @Column('uuid', { name: 'region_id' })
  regionId!: string;

  @ManyToOne(() => Region, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'region_id' })
  region!: Region;

  /* ───────────────────────── Tasnif ───────────────────────── */

  @Index()
  @Column('uuid', { name: 'type_id' })
  typeId!: string;

  @ManyToOne(() => ConstructionType, (t) => t.objects, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'type_id' })
  type!: ConstructionType;

  /* ───────────────────────── Tomonlar ───────────────────────── */

  @Column('uuid', { nullable: true, name: 'customer_id' })
  customerId!: string | null;

  @ManyToOne(() => Customer, (c) => c.objects, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer | null;

  @Index()
  @Column('uuid', { nullable: true, name: 'contractor_id' })
  contractorId!: string | null;

  @ManyToOne(() => Contractor, (c) => c.objects, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'contractor_id' })
  contractor!: Contractor | null;

  /** Obyekt kuratori — «Mas’ullar» bo‘limi shu bog‘lanishdan quriladi. */
  @Index()
  @Column('uuid', { nullable: true, name: 'responsible_id' })
  responsibleId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsible_id' })
  responsible!: User | null;

  /* ───────────────────────── Moliya ───────────────────────── */

  @ApiProperty({
    example: '48500000000.00',
    description: 'Loyiha qiymati, so‘m',
  })
  @Column('numeric', {
    precision: 18,
    scale: 2,
    default: 0,
    name: 'total_cost',
    transformer: moneyTransformer,
  })
  totalCost!: string;

  @ApiProperty({ description: 'Ajratilgan mablag‘, so‘m' })
  @Column('numeric', {
    precision: 18,
    scale: 2,
    default: 0,
    name: 'funded_amount',
    transformer: moneyTransformer,
  })
  fundedAmount!: string;

  @ApiProperty({ description: 'To‘langan mablag‘, so‘m' })
  @Column('numeric', {
    precision: 18,
    scale: 2,
    default: 0,
    name: 'paid_amount',
    transformer: moneyTransformer,
  })
  paidAmount!: string;

  @Column('uuid', { nullable: true, name: 'funding_source_id' })
  fundingSourceId!: string | null;

  @ManyToOne(() => FundingSource, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'funding_source_id' })
  fundingSource!: FundingSource | null;

  /* ───────────────────────── Texnik ko‘rsatkichlar ───────────────────────── */

  @ApiProperty({ example: 600, description: 'Quvvati' })
  @Column('int', { nullable: true })
  capacity!: number | null;

  @ApiProperty({ example: 'ishchi o‘rni' })
  @Column({
    type: 'varchar',
    length: 60,
    nullable: true,
    name: 'capacity_unit',
  })
  capacityUnit!: string | null;

  @Column('double precision', { nullable: true, name: 'area_m2' })
  areaM2!: number | null;

  @Column('smallint', { nullable: true })
  floors!: number | null;

  /* ───────────────────────── Muddatlar ───────────────────────── */

  @ApiProperty({ example: '2025-03-01' })
  @Column('date', { name: 'planned_start_date' })
  plannedStartDate!: string;

  @ApiProperty({ example: '2026-12-30' })
  @Column('date', { name: 'planned_end_date' })
  plannedEndDate!: string;

  @Column('date', { nullable: true, name: 'actual_start_date' })
  actualStartDate!: string | null;

  @Column('date', { nullable: true, name: 'actual_end_date' })
  actualEndDate!: string | null;

  /* ───────────────────────── Holat (1-guruh: FAKT) ───────────────────────── */

  @ApiProperty({ enum: ObjectStatus })
  @Column({ length: 20, default: ObjectStatus.NOT_STARTED })
  status!: ObjectStatus;

  @ApiProperty({ example: 65.0, description: 'Bajarilish, %' })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    name: 'progress_percent',
    transformer: decimalTransformer,
  })
  progressPercent!: number;

  /* ───────── Holat (2-guruh: HISOBLANGAN — qo‘lda yozilmaydi) ───────── */

  @ApiProperty({ enum: ObjectHealth })
  @Index()
  @Column({
    length: 20,
    default: ObjectHealth.NOT_STARTED,
    name: 'health_status',
  })
  healthStatus!: ObjectHealth;

  @ApiProperty({
    example: 42,
    description: 'Reja muddatidan ortda qolgan kunlar',
  })
  @Column('int', { default: 0, name: 'delay_days' })
  delayDays!: number;

  @ApiProperty({
    description: 'Bugun reja bo‘yicha bo‘lishi kerak bo‘lgan bajarilish, %',
  })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    name: 'expected_progress',
    transformer: decimalTransformer,
  })
  expectedProgress!: number;

  @ApiProperty({
    description: 'expectedProgress − progressPercent. Musbat = ortda.',
  })
  @Column('numeric', {
    precision: 6,
    scale: 2,
    default: 0,
    name: 'progress_gap',
    transformer: decimalTransformer,
  })
  progressGap!: number;

  @ApiProperty({ enum: RiskLevel })
  @Index()
  @Column({ length: 20, default: RiskLevel.LOW, name: 'risk_level' })
  riskLevel!: RiskLevel;

  @ApiProperty({ example: 68, description: '0–100' })
  @Column('smallint', { default: 0, name: 'risk_score' })
  riskScore!: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'health_calculated_at' })
  healthCalculatedAt!: Date | null;

  /* ───────── Holat (3-guruh: KESHLANGAN) ───────── */

  /** Dashboard'dagi «Asosiy sabab» ustuni — eng og‘ir ochiq kechikish sababi. */
  @Column('uuid', { nullable: true, name: 'primary_delay_reason_id' })
  primaryDelayReasonId!: string | null;

  @ManyToOne(() => DelayReason, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primary_delay_reason_id' })
  primaryDelayReason!: DelayReason | null;

  /** Ochiq (hal qilinmagan) kechikish yozuvlari soni — risk formulasiga kiradi. */
  @Column('smallint', { default: 0, name: 'open_delay_count' })
  openDelayCount!: number;

  /** Oxirgi foto-hisobot vaqti — «uzoq vaqt hisobot yo‘q» ogohlantirishi uchun. */
  @Column({ type: 'timestamptz', nullable: true, name: 'last_report_at' })
  lastReportAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'cover_image_url',
  })
  coverImageUrl!: string | null;

  /* ───────────────────────── Bog‘lanishlar ───────────────────────── */

  @OneToMany(() => ObjectMilestone, (m) => m.object)
  milestones!: ObjectMilestone[];

  @OneToMany(() => ObjectProgressUpdate, (p) => p.object)
  progressUpdates!: ObjectProgressUpdate[];

  @OneToMany(() => ObjectDelay, (d) => d.object)
  delays!: ObjectDelay[];

  @OneToMany(() => PhotoReport, (p) => p.object)
  photoReports!: PhotoReport[];

  @OneToMany(() => ObjectDocument, (d) => d.object)
  documents!: ObjectDocument[];
}
