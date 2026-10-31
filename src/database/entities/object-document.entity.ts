import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DocumentType } from '../../common/constants/enums';
import { ConstructionObject } from './construction-object.entity';
import { StoredFile } from './stored-file.entity';
import { User } from './user.entity';

/**
 * Obyekt hujjati: loyiha, shartnoma, ekspertiza, ruxsatnoma, dalolatnoma…
 *
 * ⚠️ `expiryDate` — bo‘sh qoldirilmasin: ruxsatnoma muddati tugagani
 * «Hujjatlar» bo‘limida emas, ogohlantirishda ko‘rinishi kerak
 * (`NotificationType.DOCUMENT_EXPIRING`).
 */
@Entity('object_documents')
@Index('idx_documents_object_type', ['objectId', 'type'])
export class ObjectDocument extends BaseEntity {
  @Index()
  @Column('uuid', { nullable: true, name: 'object_id' })
  objectId!: string | null;

  @ManyToOne(() => ConstructionObject, (o) => o.documents, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'object_id' })
  object!: ConstructionObject | null;

  @ApiProperty({ enum: DocumentType })
  @Column({ length: 30, default: DocumentType.OTHER })
  type!: DocumentType;

  @ApiProperty({ example: 'Loyiha-smeta hujjatlari' })
  @Column({ length: 300 })
  title!: string;

  @ApiProperty({ example: '№ 142/2025' })
  @Column({ type: 'varchar', length: 80, nullable: true })
  number!: string | null;

  @Column('date', { nullable: true, name: 'issued_date' })
  issuedDate!: string | null;

  @Column('date', { nullable: true, name: 'expiry_date' })
  expiryDate!: string | null;

  @Column('uuid', { nullable: true, name: 'file_id' })
  fileId!: string | null;

  @ManyToOne(() => StoredFile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'file_id' })
  file!: StoredFile | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url!: string | null;

  @Column('uuid', { nullable: true, name: 'uploaded_by_id' })
  uploadedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy!: User | null;

  @Column('text', { nullable: true })
  note!: string | null;
}
