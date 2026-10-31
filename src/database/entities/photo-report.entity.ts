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
  AiVerdict,
  AiVisionStatus,
  PhotoReportStatus,
} from '../../common/constants/enums';
import { decimalTransformer } from '../transformers';
import { ConstructionObject } from './construction-object.entity';
import { PhotoReportImage } from './photo-report-image.entity';
import type { PhotoVisionAnalysis } from '../../common/contracts/photo-vision.contract';
import { User } from './user.entity';

/**
 * FOTO-HISOBOT — obyektdagi ishning tasdig‘i.
 *
 * ⚠️ `capturedAt`, `lat`, `lng` — SURATNING o‘zidan (EXIF / mobil ilova),
 * yuklangan vaqtdan emas: «o‘tgan oygi suratni bugun yuklash» aynan shu
 * uch maydon orqali ushlanadi.
 *
 * AI tekshiruvi (`aiVerdict`) hisobotni TASDIQLAMAYDI, faqat BAHOLAYDI:
 * yakuniy qaror `status` da va uni odam qo‘yadi (`photos.moderate`).
 */
@Entity('photo_reports')
@Index('idx_photo_reports_object_date', ['objectId', 'capturedAt'])
// Navbatni tanlaydigan cron shu indeksdan foydalanadi.
@Index('idx_photo_reports_vision_queue', ['aiVisionStatus', 'createdAt'])
export class PhotoReport extends BaseEntity {
  @Index()
  @Column('uuid', { name: 'object_id' })
  objectId!: string;

  @ManyToOne(() => ConstructionObject, (o) => o.photoReports, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject;

  @ApiProperty({ description: 'Surat olingan vaqt (yuklangan vaqt EMAS)' })
  @Column({ type: 'timestamptz', name: 'captured_at' })
  capturedAt!: Date;

  @Column('double precision', { nullable: true })
  lat!: number | null;

  @Column('double precision', { nullable: true })
  lng!: number | null;

  @ApiProperty({
    example: 65,
    description: 'Hisobotda qayd etilgan bajarilish, %',
  })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    default: 0,
    name: 'progress_percent',
    transformer: decimalTransformer,
  })
  progressPercent!: number;

  @Column('text', { nullable: true })
  note!: string | null;

  @ApiProperty({ enum: PhotoReportStatus })
  @Index()
  @Column({ length: 20, default: PhotoReportStatus.PENDING })
  status!: PhotoReportStatus;

  /* ───────────────────────── AI tekshiruvi ───────────────────────── */

  @ApiProperty({ enum: AiVerdict })
  @Index()
  @Column({ length: 20, default: AiVerdict.PENDING, name: 'ai_verdict' })
  aiVerdict!: AiVerdict;

  @ApiProperty({ example: 0.94, description: '0–1 ishonch darajasi' })
  @Column('numeric', {
    precision: 4,
    scale: 3,
    nullable: true,
    name: 'ai_confidence',
    transformer: decimalTransformer,
  })
  aiConfidence!: number | null;

  @Column('text', { nullable: true, name: 'ai_comment' })
  aiComment!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'ai_checked_at' })
  aiCheckedAt!: Date | null;

  /* ─────────────── Suratdan baholash (model) ───────────────
     ⚠️ Yuqoridagi `ai*` maydonlar QOIDALAR dvigateli natijasi: surat qachon
     va qayerda olingani. Quyidagilar — modelning SURAT ICHIGA qarab
     bergan bahosi. Ikkalasi birga yakuniy qarorni beradi. */

  @ApiProperty({
    example: 58.5,
    nullable: true,
    description:
      'Model suratdan baholagan bajarilish, % (hisobotdagi raqam EMAS)',
  })
  @Column('numeric', {
    precision: 5,
    scale: 2,
    nullable: true,
    name: 'ai_estimated_progress',
    transformer: decimalTransformer,
  })
  aiEstimatedProgress!: number | null;

  /** To‘liq tahlil: bosqich, bajarilgan va qolgan ishlar, izohlar. */
  @Column('jsonb', { nullable: true, name: 'ai_analysis' })
  aiAnalysis!: PhotoVisionAnalysis | null;

  @Column({ type: 'varchar', length: 80, nullable: true, name: 'ai_model' })
  aiModel!: string | null;

  @ApiProperty({ enum: AiVisionStatus })
  @Column({
    type: 'varchar',
    length: 20,
    default: AiVisionStatus.PENDING,
    name: 'ai_vision_status',
  })
  aiVisionStatus!: AiVisionStatus;

  @Column({ type: 'timestamptz', nullable: true, name: 'ai_vision_at' })
  aiVisionAt!: Date | null;

  /** Urinishlar soni — cheksiz qayta urinishning oldini oladi. */
  @Column('smallint', { default: 0, name: 'ai_attempts' })
  aiAttempts!: number;

  /* ───────────────────────── Odamlar ───────────────────────── */

  @Column('uuid', { nullable: true, name: 'author_id' })
  authorId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author!: User | null;

  @Column('uuid', { nullable: true, name: 'reviewed_by_id' })
  reviewedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy!: User | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'reviewed_at' })
  reviewedAt!: Date | null;

  @Column('text', { nullable: true, name: 'reject_reason' })
  rejectReason!: string | null;

  @OneToMany(() => PhotoReportImage, (i) => i.report, { cascade: ['insert'] })
  images!: PhotoReportImage[];
}
