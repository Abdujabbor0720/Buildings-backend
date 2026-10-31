import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ContractorStatus } from '../../common/constants/enums';
import { decimalTransformer } from '../transformers';
import { ConstructionObject } from './construction-object.entity';

/** Pudratchi tashkilot. */
@Entity('contractors')
export class Contractor extends BaseEntity {
  @ApiProperty({ example: '“Andijon Qurilish Invest” MChJ' })
  @Index()
  @Column({ length: 200 })
  name!: string;

  @ApiProperty({ example: '301234567', description: 'STIR (INN)' })
  @Index({ unique: true })
  @Column({ length: 20 })
  inn!: string;

  @ApiProperty({ example: 'Shuhrat Mamatqulov' })
  @Column({ type: 'varchar', length: 150, nullable: true })
  director!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address!: string | null;

  @ApiProperty({ example: 'QL-2021-00418' })
  @Column({
    type: 'varchar',
    length: 60,
    nullable: true,
    name: 'license_number',
  })
  licenseNumber!: string | null;

  @ApiProperty({ description: 'Litsenziya amal qilish muddati' })
  @Column('date', { nullable: true, name: 'license_expiry' })
  licenseExpiry!: string | null;

  /**
   * 0–5 reyting. ⚠️ Qo‘lda yozilmaydi — `ContractorsService.recalculateRating()`
   * tugallangan obyektlar muddatidan va o‘rtacha kechikishdan hisoblaydi.
   * Formula bitta joyda, aks holda pudratchi tanlovi sub'yektiv bo‘lib qolardi.
   */
  @ApiProperty({ example: 4.2 })
  @Column('numeric', {
    precision: 3,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  rating!: number;

  @ApiProperty({ enum: ContractorStatus })
  @Index()
  @Column({ length: 20, default: ContractorStatus.ACTIVE })
  status!: ContractorStatus;

  @Column('smallint', { nullable: true, name: 'founded_year' })
  foundedYear!: number | null;

  @Column('int', { nullable: true, name: 'employees_count' })
  employeesCount!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'logo_url' })
  logoUrl!: string | null;

  @Column('text', { nullable: true })
  note!: string | null;

  @OneToMany(() => ConstructionObject, (o) => o.contractor)
  objects!: ConstructionObject[];
}
