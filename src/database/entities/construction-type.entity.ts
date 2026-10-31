import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ConstructionObject } from './construction-object.entity';

/**
 * Qurilish turi: «Ta'lim muassasalari», «Sog‘liqni saqlash», …
 *
 * ⚠️ Rang KATALOGDA saqlanadi, frontendda emas. Yangi tur qo‘shilganda
 * dashboard diagrammasi va xarita afsonasi rangni o‘z-o‘zidan oladi —
 * aks holda har ekranda alohida `switch` yozilib, bir turi ikki xil rangda
 * ko‘rinib qolardi.
 */
@Entity('construction_types')
export class ConstructionType extends BaseEntity {
  @ApiProperty({ example: 'education' })
  @Index({ unique: true })
  @Column({ length: 40 })
  code!: string;

  @ApiProperty({ example: 'Ta’lim muassasalari' })
  @Column({ length: 120 })
  name!: string;

  /** HEX rang — diagramma, xarita va yorliqlar uchun yagona manba. */
  @ApiProperty({ example: '#2563EB' })
  @Column({ length: 9 })
  color!: string;

  /** `lucide-react` ikonka nomi. */
  @ApiProperty({ example: 'graduation-cap' })
  @Column({ type: 'varchar', length: 40, nullable: true })
  icon!: string | null;

  @Column('smallint', { name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;

  @OneToMany(() => ConstructionObject, (o) => o.type)
  objects!: ConstructionObject[];
}
