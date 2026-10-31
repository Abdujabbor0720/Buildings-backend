import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** Moliyalashtirish manbai: davlat budjeti, grant, xususiy investitsiya… */
@Entity('funding_sources')
export class FundingSource extends BaseEntity {
  @ApiProperty({ example: 'state_budget' })
  @Index({ unique: true })
  @Column({ length: 40 })
  code!: string;

  @ApiProperty({ example: 'Davlat budjeti' })
  @Column({ length: 120 })
  name!: string;

  @ApiProperty({ example: '#0EA5E9' })
  @Column({ length: 9 })
  color!: string;

  @Column('smallint', { name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;
}
