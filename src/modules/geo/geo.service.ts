import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { District } from '../../database/entities/district.entity';
import { Region } from '../../database/entities/region.entity';
import { ObjectHealth } from '../../common/constants/enums';
import type { DistrictStatsQueryDto } from './dto/geo-query.dto';

export interface DistrictStats {
  districtId: string;
  code: string;
  name: string;
  shortName: string;
  centerLat: number;
  centerLng: number;
  total: number;
  onSchedule: number;
  delayed: number;
  atRisk: number;
  notStarted: number;
  completed: number;
  /** O‘rtacha bajarilish, % (butun songa yaxlitlangan). */
  avgProgress: number;
  totalCost: string;
  /** Xaritadagi rang — eng og‘ir holat bo‘yicha (`dominantHealth`). */
  dominantHealth: ObjectHealth;
}

/** Bitta tumanda eng og‘ir holat ustun: xarita rangi «yaxshi» ko‘rsatmasligi kerak. */
function dominantHealthOf(
  s: Omit<DistrictStats, 'dominantHealth'>,
): ObjectHealth {
  if (s.total === 0) return ObjectHealth.NOT_STARTED;
  if (s.atRisk > 0 && s.atRisk / s.total >= 0.1) return ObjectHealth.AT_RISK;
  if (s.delayed / s.total >= 0.25) return ObjectHealth.DELAYED;
  if (s.onSchedule === 0 && s.notStarted > 0) return ObjectHealth.NOT_STARTED;
  return ObjectHealth.ON_SCHEDULE;
}

@Injectable()
export class GeoService {
  constructor(
    @InjectRepository(Region) private readonly regions: Repository<Region>,
    @InjectRepository(District)
    private readonly districts: Repository<District>,
  ) {}

  listRegions(): Promise<Region[]> {
    return this.regions.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async getRegion(id: string): Promise<Region> {
    const region = await this.regions.findOne({ where: { id } });
    if (!region) throw new NotFoundException('Viloyat topilmadi');
    return region;
  }

  /** Standart viloyat — tizim bitta viloyat bilan ishlayotganda. */
  async getDefaultRegion(): Promise<Region> {
    const region = await this.regions.findOne({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
    if (!region) throw new NotFoundException('Tizimda viloyat sozlanmagan');
    return region;
  }

  /** ⚠️ `geometry` ATAYLAB tashlanadi: ro‘yxat uchun u 18 KB ortiqcha yuk. */
  listDistricts(regionId?: string): Promise<District[]> {
    const qb = this.districts
      .createQueryBuilder('d')
      .select([
        'd.id',
        'd.code',
        'd.name',
        'd.shortName',
        'd.soato',
        'd.kind',
        'd.centerLat',
        'd.centerLng',
        'd.population',
        'd.areaKm2',
        'd.regionId',
      ])
      .where('d.isActive = true')
      .orderBy('d.name', 'ASC');

    if (regionId) qb.andWhere('d.regionId = :regionId', { regionId });
    return qb.getMany();
  }

  async getDistrict(id: string): Promise<District> {
    const district = await this.districts.findOne({
      where: { id },
      relations: { region: true },
    });
    if (!district) throw new NotFoundException('Tuman topilmadi');
    return district;
  }

  /**
   * TUMANLAR KESIMIDAGI STATISTIKA — dashboard jadvali va xarita uchun.
   *
   * ⚠️ Bitta SQL so‘rov: har tuman uchun alohida `count()` yuborilsa
   * 16 ta so‘rov bo‘lardi (N+1) va filtr qo‘shilganda ularning har biri
   * takrorlanardi. `FILTER (WHERE ...)` — PostgreSQL'ning aynan shu uchun
   * mo‘ljallangan vositasi.
   */
  async districtStats(query: DistrictStatsQueryDto): Promise<DistrictStats[]> {
    const regionId = query.regionId ?? (await this.getDefaultRegion()).id;

    const qb = this.districts
      .createQueryBuilder('d')
      .leftJoin(
        ConstructionObject,
        'o',
        this.objectJoinCondition(query),
        this.objectJoinParams(query),
      )
      .select('d.id', 'districtId')
      .addSelect('d.code', 'code')
      .addSelect('d.name', 'name')
      .addSelect('d.short_name', 'shortName')
      .addSelect('d.center_lat', 'centerLat')
      .addSelect('d.center_lng', 'centerLng')
      .addSelect('COUNT(o.id)', 'total')
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :onSchedule)`,
        'onSchedule',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :delayed)`,
        'delayed',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :atRisk)`,
        'atRisk',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :notStarted)`,
        'notStarted',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.health_status = :completed)`,
        'completed',
      )
      .addSelect('COALESCE(ROUND(AVG(o.progress_percent)), 0)', 'avgProgress')
      .addSelect('COALESCE(SUM(o.total_cost), 0)', 'totalCost')
      .where('d.region_id = :regionId', { regionId })
      .andWhere('d.is_active = true')
      .setParameters({
        onSchedule: ObjectHealth.ON_SCHEDULE,
        delayed: ObjectHealth.DELAYED,
        atRisk: ObjectHealth.AT_RISK,
        notStarted: ObjectHealth.NOT_STARTED,
        completed: ObjectHealth.COMPLETED,
      })
      .groupBy('d.id')
      .addGroupBy('d.code')
      .addGroupBy('d.name')
      .addGroupBy('d.short_name')
      .addGroupBy('d.center_lat')
      .addGroupBy('d.center_lng')
      .orderBy('d.name', 'ASC');

    const rows = await qb.getRawMany<Record<string, string>>();

    return rows.map((r) => {
      const base = {
        districtId: r.districtId,
        code: r.code,
        name: r.name,
        shortName: r.shortName,
        centerLat: Number(r.centerLat),
        centerLng: Number(r.centerLng),
        total: Number(r.total),
        onSchedule: Number(r.onSchedule),
        delayed: Number(r.delayed),
        atRisk: Number(r.atRisk),
        notStarted: Number(r.notStarted),
        completed: Number(r.completed),
        avgProgress: Number(r.avgProgress),
        totalCost: String(r.totalCost),
      };
      return { ...base, dominantHealth: dominantHealthOf(base) };
    });
  }

  /**
   * Xarita uchun GeoJSON: chegara + jonli statistika BITTA javobda.
   * Frontend ikki so‘rov yuborib, ularni id bo‘yicha birlashtirmasligi kerak —
   * aks holda biri kechikkanda xarita rangsiz chizilib qolardi.
   */
  async districtsGeoJson(query: DistrictStatsQueryDto): Promise<{
    type: 'FeatureCollection';
    bbox: number[] | null;
    features: Array<{
      type: 'Feature';
      geometry: Record<string, unknown> | null;
      properties: DistrictStats & { soato: string | null; kind: string };
    }>;
  }> {
    const regionId = query.regionId ?? (await this.getDefaultRegion()).id;
    const [region, shapes, stats] = await Promise.all([
      this.getRegion(regionId),
      this.districts.find({
        where: { regionId, isActive: true },
        order: { name: 'ASC' },
      }),
      this.districtStats({ ...query, regionId }),
    ]);

    const byId = new Map(stats.map((s) => [s.districtId, s]));

    return {
      type: 'FeatureCollection',
      bbox: region.bbox,
      features: shapes.map((d) => {
        const s = byId.get(d.id);
        return {
          type: 'Feature' as const,
          geometry: d.geometry,
          properties: {
            districtId: d.id,
            code: d.code,
            name: d.name,
            shortName: d.shortName,
            soato: d.soato,
            kind: d.kind,
            centerLat: d.centerLat,
            centerLng: d.centerLng,
            total: s?.total ?? 0,
            onSchedule: s?.onSchedule ?? 0,
            delayed: s?.delayed ?? 0,
            atRisk: s?.atRisk ?? 0,
            notStarted: s?.notStarted ?? 0,
            completed: s?.completed ?? 0,
            avgProgress: s?.avgProgress ?? 0,
            totalCost: s?.totalCost ?? '0',
            dominantHealth: s?.dominantHealth ?? ObjectHealth.NOT_STARTED,
          },
        };
      }),
    };
  }

  /**
   * JOIN sharti — filtr `WHERE` ga emas, aynan `ON` ga qo‘yiladi.
   * ⚠️ `WHERE` ga qo‘yilsa, obyekti yo‘q tumanlar natijadan butunlay
   * tushib qolardi va jadvalda 16 o‘rniga 11 ta qator ko‘rinardi.
   */
  private objectJoinCondition(q: DistrictStatsQueryDto): string {
    const parts = ['o.district_id = d.id', 'o.deleted_at IS NULL'];
    if (q.year) parts.push('EXTRACT(YEAR FROM o.planned_end_date) = :year');
    // Dashboard bilan AYNI qoida: oraliq obyekt DAVRI bilan kesishadi.
    if (q.yearFrom)
      parts.push('EXTRACT(YEAR FROM o.planned_end_date) >= :yearFrom');
    if (q.yearTo)
      parts.push('EXTRACT(YEAR FROM o.planned_start_date) <= :yearTo');
    if (q.typeIds?.length) parts.push('o.type_id IN (:...typeIds)');
    if (q.health?.length) parts.push('o.health_status IN (:...health)');
    return parts.join(' AND ');
  }

  private objectJoinParams(q: DistrictStatsQueryDto): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    if (q.year) params.year = q.year;
    if (q.yearFrom) params.yearFrom = q.yearFrom;
    if (q.yearTo) params.yearTo = q.yearTo;
    if (q.typeIds?.length) params.typeIds = q.typeIds;
    if (q.health?.length) params.health = q.health;
    return params;
  }
}
