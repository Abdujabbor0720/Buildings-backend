import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ObjectDelay } from './object-delay.entity';

/**
 * Kechikish sababi — TOIFA, erkin matn emas.
 *
 * ⚠️ Toifa bo‘lmasa «bu yil obyektlar eng ko‘p nima sababdan kechikdi»
 * degan savolga javob bo‘lmaydi: erkin matnni guruhlab bo‘lmaydi.
 * Erkin izoh `ObjectDelay.description` da alohida turadi.
 */
@Entity('delay_reasons')
export class DelayReason extends BaseEntity {
  @ApiProperty({ example: 'funding' })
  @Index({ unique: true })
  @Column({ length: 40 })
  code!: string;

  @ApiProperty({ example: 'Moliyalashtirish kechikishi' })
  @Column({ length: 150 })
  name!: string;

  @ApiProperty({ example: '#EF4444' })
  @Column({ length: 9 })
  color!: string;

  @ApiProperty({ example: 'banknote' })
  @Column({ type: 'varchar', length: 40, nullable: true })
  icon!: string | null;

  @Column('smallint', { name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;

  @OneToMany(() => ObjectDelay, (d) => d.reason)
  delays!: ObjectDelay[];
}
