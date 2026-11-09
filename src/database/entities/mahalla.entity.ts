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
import { District } from './district.entity';
import { ConstructionObject } from './construction-object.entity';

/**
 * MAHALLA FUQAROLAR YIG‘INI — MFY (ADM3).
 *
 * Tuman ichidagi eng kichik ma’muriy birlik. Viloyat → tuman → mahalla
 * zinapoyasining uchinchi pog‘onasi: bosh sahifada viloyat tanlanganda
 * xarita TUMANLAR kesimida, tuman tanlanganda esa MAHALLALAR kesimida
 * chiziladi — ikkalasi ham ayni shu naqsh bo‘yicha.
 *
 * `geometry` — GeoJSON `Polygon | MultiPolygon`, `jsonb` sifatida;
 * `District` bilan AYNI qoida (PostGIS ataylab ishlatilmaydi).
 *
 * ⚠️ CHEGARA QOPLAMASI TO‘LIQ EMAS. Manba — OpenStreetMap
 * (`boundary=administrative`, `admin_level=10`, ODbL); unda hozircha
 * asosan Andijon tumani va Andijon shahri qamrab olingan. Shuning uchun
 * «mahallasi yo‘q obyekt» ODDIY HOL, xato emas: xarita bunday
 * obyektlarni chegara ustida emas, NUQTA sifatida ko‘rsatadi va hech
 * biri hisobdan tushib qolmaydi.
 *
 * ⚠️ Chegaralar `npm run geo:build` bilan OpenStreetMap'dan qayta
 * yig‘iladi va `npm run geo:sync` bilan JONLI bazaga yoziladi — seed
 * prod'da ishlatilmaydi (u jadvallarni tozalaydi).
 */
@Entity('mahallas')
@Unique('uq_mahallas_district_code', ['districtId', 'code'])
@Index('idx_mahallas_district', ['districtId'])
export class Mahalla extends BaseEntity {
  /** `mfy_<osmId>` — manbadagi barqaror kalit, qayta seed qilishda mos keladi. */
  @ApiProperty({ example: 'mfy_12345678' })
  @Index()
  @Column({ length: 40 })
  code!: string;

  @ApiProperty({ example: 'Yorboshi mahallasi' })
  @Column({ length: 160 })
  name!: string;

  /** «Yorboshi mahalla fuqarolar yig‘ini» — hujjatlardagi to‘liq nom. */
  @ApiProperty({ example: 'Yorboshi mahalla fuqarolar yig‘ini' })
  @Column({
    type: 'varchar',
    length: 240,
    nullable: true,
    name: 'official_name',
  })
  officialName!: string | null;

  @ApiProperty()
  @Column('double precision', { name: 'center_lat' })
  centerLat!: number;

  @ApiProperty()
  @Column('double precision', { name: 'center_lng' })
  centerLng!: number;

  @ApiProperty({ description: 'GeoJSON Polygon/MultiPolygon' })
  @Column('jsonb', { nullable: true })
  geometry!: Record<string, unknown> | null;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;

  @Index()
  @Column('uuid', { name: 'district_id' })
  districtId!: string;

  @ManyToOne(() => District, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'district_id' })
  district!: District;

  @OneToMany(() => ConstructionObject, (o) => o.mahalla)
  objects!: ConstructionObject[];
}
