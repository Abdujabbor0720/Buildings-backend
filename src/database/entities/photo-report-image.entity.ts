import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { PhotoReport } from './photo-report.entity';
import { StoredFile } from './stored-file.entity';

/** Bitta foto-hisobotdagi suratlar (bir nechta rakurs). */
@Entity('photo_report_images')
@Index('idx_photo_images_report_order', ['reportId', 'sortOrder'])
export class PhotoReportImage extends BaseEntity {
  @Column('uuid', { name: 'report_id' })
  reportId!: string;

  @ManyToOne(() => PhotoReport, (r) => r.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report!: PhotoReport;

  @Column('uuid', { name: 'file_id' })
  fileId!: string;

  @ManyToOne(() => StoredFile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file!: StoredFile;

  /** Fayl o‘chsa ham ro‘yxat buzilmasin uchun URL nusxasi. */
  @Column({ length: 500 })
  url!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  caption!: string | null;

  @Column('smallint', { default: 0, name: 'sort_order' })
  sortOrder!: number;
}
