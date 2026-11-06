import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { UserRole } from '../../common/constants/enums';
import { Contractor } from './contractor.entity';
import { District } from './district.entity';
import { Region } from './region.entity';
import { fullName, shortName } from '../../helpers/person-name.helpers';

/**
 * Tizim foydalanuvchisi VA mas’ul shaxs — bitta jadval.
 *
 * ⚠️ Ataylab bitta: «Mas’ullar» bo‘limidagi odam ertaga tizimga kiradi.
 * Ikki jadval bo‘lsa, bitta odam ikki joyda turib, obyektdagi mas’ul
 * tizimdagi foydalanuvchidan ajralib ketardi.
 *
 * `regionId` / `districtId` / `contractorId` — KO‘RISH DOIRASI (scope):
 * tuman admini faqat o‘z tumanini, pudratchi faqat o‘z obyektlarini ko‘radi.
 * Buni guard emas, `ObjectsService.applyScope()` qo‘llaydi.
 */
@Entity('users')
export class User extends BaseEntity {
  @ApiProperty({ example: 'hokim@andijon.uz' })
  @Index({ unique: true })
  @Column({ length: 150 })
  email!: string;

  @ApiHideProperty()
  @Exclude({ toPlainOnly: true })
  @Column({ length: 120, name: 'password_hash', select: false })
  passwordHash!: string;

  @ApiProperty({ example: 'Jahongir' })
  @Column({ length: 60, name: 'first_name' })
  firstName!: string;

  @ApiProperty({ example: 'Karimov' })
  @Column({ length: 60, name: 'last_name' })
  lastName!: string;

  @Column({ type: 'varchar', length: 60, nullable: true, name: 'middle_name' })
  middleName!: string | null;

  @ApiProperty({ example: 'Viloyat hokimi' })
  @Column({ type: 'varchar', length: 120, nullable: true })
  position!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'avatar_url' })
  avatarUrl!: string | null;

  @ApiProperty({ enum: UserRole })
  @Index()
  @Column({ length: 30, default: UserRole.VIEWER })
  role!: UserRole;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_login_at' })
  lastLoginAt!: Date | null;

  /* ───── Ko‘rish doirasi ───── */

  @Column('uuid', { nullable: true, name: 'region_id' })
  regionId!: string | null;

  @ManyToOne(() => Region, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'region_id' })
  region!: Region | null;

  @Column('uuid', { nullable: true, name: 'district_id' })
  districtId!: string | null;

  @ManyToOne(() => District, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'district_id' })
  district!: District | null;

  /** Faqat `CONTRACTOR` roli uchun — qaysi pudratchining vakili. */
  @Column('uuid', { nullable: true, name: 'contractor_id' })
  contractorId!: string | null;

  @ManyToOne(() => Contractor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contractor_id' })
  contractor!: Contractor | null;

  /*
   * ⚠️ Shakl `person-name.helpers.ts` da, bu yerda EMAS. Getter faqat
   * entity qator uchun ishlaydi; `getRawMany()` bilan o'qiydigan
   * so'rovlar (bosh sahifadagi «Kechikayotgan obyektlar») xom qator
   * oladi va getterga YETA OLMAYDI — ular o'sha helperni chaqiradi.
   * Formula ikki joyda bo'lsa, bitta ekranda «J. Karimov»,
   * boshqasida «Jahongir Karimov» chiqib qolardi.
   */
  get fullName(): string {
    return fullName(this);
  }

  /** `J. Karimov` — header va jadvallardagi ixcham ko‘rinish. */
  get shortName(): string {
    return shortName(this);
  }
}
