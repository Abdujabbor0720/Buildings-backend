import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Tizim sozlamasi — kalit/qiymat.
 *
 * ⚠️ Qiymat `jsonb`: sozlama turi (son, matn, ro‘yxat) vaqt o‘tib
 * o‘zgaradi va har safar migratsiya yozish shart bo‘lmasligi kerak.
 * Qaysi kalit nimani anglatishi `SettingsService.DEFAULTS` da qayd etilgan.
 */
@Entity('app_settings')
export class AppSetting extends BaseEntity {
  @ApiProperty({ example: 'dashboard.deadlineWarningDays' })
  @Index({ unique: true })
  @Column({ length: 100 })
  key!: string;

  @Column('jsonb')
  value!: unknown;

  @ApiProperty({ example: 'Muddat ogohlantirishi necha kun oldin chiqsin' })
  @Column({ type: 'varchar', length: 300, nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'dashboard' })
  @Index()
  @Column({ length: 40, default: 'general' })
  category!: string;
}
