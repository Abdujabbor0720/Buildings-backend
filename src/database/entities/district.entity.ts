import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Region } from './region.entity';
import { ConstructionObject } from './construction-object.entity';

/**
 * Tuman / shahar (ADM2).
 *
 * `geometry` — GeoJSON `Polygon | MultiPolygon`, `jsonb` sifatida.
 * ⚠️ PostGIS ATAYLAB ishlatilmayapti: bizga faqat chegarani CHIZISH kerak,
 * fazoviy so‘rov (`ST_Contains`) emas. PostGIS kengaytmasi har bir muhitda
 * alohida o‘rnatishni talab qiladi va deploy'ni qiyinlashtirardi.
 */
@Entity('districts')
@Unique('uq_districts_region_code', ['regionId', 'code'])
export class District extends BaseEntity {
  @ApiProperty({ example: 'baliqchi' })
  @Index()
  @Column({ length: 40 })
  code!: string;

  @ApiProperty({ example: 'Baliqchi tumani' })
  @Column({ length: 120 })
  name!: string;

  /** Jadval va xarita yorliqlari uchun qisqa nom: «Baliqchi», «Andijon sh.» */
  @ApiProperty({ example: 'Baliqchi' })
  @Column({ length: 60, name: 'short_name' })
  shortName!: string;

  @ApiProperty({ example: '1703209' })
  @Column({ type: 'varchar', length: 20, nullable: true })
  soato!: string | null;

  @ApiProperty({ enum: ['district', 'city'], example: 'district' })
  @Column({ length: 20, default: 'district' })
  kind!: 'district' | 'city';

  @ApiProperty()
  @Column('double precision', { name: 'center_lat' })
  centerLat!: number;

  @ApiProperty()
  @Column('double precision', { name: 'center_lng' })
  centerLng!: number;

  @ApiProperty({ description: 'GeoJSON Polygon/MultiPolygon' })
  @Column('jsonb', { nullable: true })
  geometry!: Record<string, unknown> | null;

  @ApiProperty({ example: 265000, description: 'Aholi soni' })
  @Column('int', { nullable: true })
  population!: number | null;

  @ApiProperty({ example: 442.5, description: 'Maydoni, km²' })
  @Column('double precision', { name: 'area_km2', nullable: true })
  areaKm2!: number | null;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;

  @Index()
  @Column('uuid', { name: 'region_id' })
  regionId!: string;

  @ManyToOne(() => Region, (r) => r.districts, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'region_id' })
  region!: Region;

  @OneToMany(() => ConstructionObject, (o) => o.district)
  objects!: ConstructionObject[];
}
