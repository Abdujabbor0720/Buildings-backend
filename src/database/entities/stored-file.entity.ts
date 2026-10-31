import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

/**
 * Yuklangan fayl metama’lumoti.
 *
 * ⚠️ Faylning O‘ZI obyekt xotirasida (DigitalOcean Spaces), bazada faqat
 * kaliti. Bazaga `bytea` sifatida yozilsa dump har kuni gigabaytlab
 * o‘sardi va backup/restore amalda imkonsiz bo‘lib qolardi.
 *
 * ⚠️ Lokal disk ISHLATILMAYDI: bir nechta server nusxasida fayl faqat
 * bittasida bo‘lardi, konteyner qayta yaratilganda esa butunlay yo‘qolardi.
 */
@Entity('files')
export class StoredFile extends BaseEntity {
  @ApiProperty({ example: 'maktab-fasad.jpg' })
  @Column({ length: 300, name: 'original_name' })
  originalName!: string;

  @Column({ length: 200, name: 'stored_name' })
  storedName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @Column({ length: 120, name: 'mime_type' })
  mimeType!: string;

  @ApiProperty({ example: 284_512, description: 'Bayt' })
  @Column('bigint')
  size!: string;

  /** Bucket ichidagi kalit: `photos/2026/10/<uuid>.jpg`. */
  @Column({ length: 500 })
  path!: string;

  /**
   * To‘g‘ridan-to‘g‘ri CDN havolasi (ochiq bucket'da).
   * ⚠️ Yopiq bucket'da BO‘SH bo‘ladi va havola har so‘rovda imzolanadi —
   * shuning uchun bu maydonga «har doim to‘la» deb tayanmang.
   */
  @ApiProperty()
  @Column({ length: 500 })
  url!: string;

  @Index()
  @Column('uuid', { nullable: true, name: 'uploaded_by_id' })
  uploadedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy!: User | null;
}
