import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { District } from './district.entity';

/** Viloyat. Tizim hozircha Andijon viloyati bilan ishlaydi, lekin
 *  ko‘p viloyatli bo‘lishga TAYYOR: scope va filtrlar shu jadvalga tayanadi. */
@Entity('regions')
export class Region extends BaseEntity {
  @ApiProperty({ example: 'andijon' })
  @Index({ unique: true })
  @Column({ length: 40 })
  code!: string;

  @ApiProperty({ example: 'Andijon viloyati' })
  @Column({ length: 120 })
  name!: string;

  @ApiProperty({ example: '1703', description: 'SOATO kodi' })
  @Column({ type: 'varchar', length: 20, nullable: true })
  soato!: string | null;

  @ApiProperty({ example: 40.7821 })
  @Column('double precision', { name: 'center_lat' })
  centerLat!: number;

  @ApiProperty({ example: 72.3442 })
  @Column('double precision', { name: 'center_lng' })
  centerLng!: number;

  /** Xaritaning boshlang‘ich masshtabi — viloyat o‘lchamiga qarab. */
  @ApiProperty({ example: 9 })
  @Column('smallint', { name: 'default_zoom', default: 9 })
  defaultZoom!: number;

  /** `[minLng, minLat, maxLng, maxLat]` — xarita `fitBounds` uchun. */
  @ApiProperty({ type: [Number], example: [71.47, 40.4, 73.13, 41.06] })
  @Column('jsonb', { nullable: true })
  bbox!: number[] | null;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;

  @OneToMany(() => District, (d) => d.region)
  districts!: District[];
}
