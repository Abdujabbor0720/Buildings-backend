import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ConstructionObject } from './construction-object.entity';

/**
 * BUYURTMACHI tashkilot — obyektni kim buyurtma qilgan
 * (hokimlik, vazirlik boshqarmasi, «Ta'lim» DUK…).
 *
 * ⚠️ Pudratchi bilan chalkashmasin: buyurtmachi PUL BERADI va qabul qiladi,
 * pudratchi QURADI. Ikkisi bitta jadvalga qo‘shilsa «kim kimga da’vo qiladi»
 * degan savol javobsiz qolardi.
 */
@Entity('customers')
export class Customer extends BaseEntity {
  @ApiProperty({ example: 'Andijon viloyati hokimligi' })
  @Index()
  @Column({ length: 200 })
  name!: string;

  @ApiProperty({ example: 'Davlat organi' })
  @Column({ type: 'varchar', length: 80, nullable: true })
  type!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  inn!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  head!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address!: string | null;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;

  @OneToMany(() => ConstructionObject, (o) => o.customer)
  objects!: ConstructionObject[];
}
