import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { District } from '../../database/entities/district.entity';
import { Mahalla } from '../../database/entities/mahalla.entity';
import { Region } from '../../database/entities/region.entity';
import { ObjectHealth } from '../../common/constants/enums';
import { bboxOf, bboxOfPoints, unionBbox } from '../../helpers/geo.helpers';
import type { DistrictStatsQueryDto } from './dto/geo-query.dto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  objectBriefFromRaw,
  selectObjectBrief,
} from '../../common/contracts/object-brief.contract';

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

/**
 * Mahalla chegaralari va obyekt nuqtalarini birga o‘rab turgan chegara.
 *
 * ⚠️ IKKALASI HAM hisobga olinadi: chegarasiz mahallada turgan obyekt
 * faqat nuqta bo‘lib ko‘rinadi va u ko‘rinish tashqarisida qolsa,
 * jadvaldagi son bilan xaritadagi manzara mos kelmay qolardi.
 */
function dataBbox(
  shapes: ReadonlyArray<{ geometry: unknown }>,
  points: ReadonlyArray<{ lat: number; lng: number }>,
): [number, number, number, number] | null {
  let box = bboxOfPoints(points);
  for (const s of shapes) box = unionBbox(box, bboxOf(s.geometry));
  return box;
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

/** Xaritadagi mo‘ljal yozuvi: shahar, shaharcha yoki qishloq. */
export interface Settlement {
  name: string;
  /** `city | town | village | hamlet` — yozuv o‘lchami shunga qarab. */
  kind: string;
  /** 1 — shahar … 4 — eng kichik qishloq. */
  rank: number;
  lat: number;
  lng: number;
}

/**
 * AHOLI PUNKTLARI — fayldan, BIR MARTA.
 *
 * ⚠️ Bazada jadval YO‘Q va kerak ham emas: bu ma’muriy birlik emas,
 * xaritadagi MO‘LJAL yozuvi. Obyekt unga biriktirilmaydi, hisobotda
 * kesim bo‘lmaydi — faqat «bu nuqta qayerda» degan savolga javob
 * beradi. Jadval ochilsa, migratsiya, seed va sinxronlash kerak
 * bo‘lardi, foyda esa o‘sha-o‘sha.
 *
 * ⚠️ Fayl BIR MARTA o‘qiladi va xotirada qoladi (425 ta nuqta,
 * ~40 KB): har so‘rovda diskdan o‘qish tuman xaritasini sekinlashtirardi.
 *
 * ⚠️ Fayl YO‘Q bo‘lsa xizmat YIQILMAYDI — bo‘sh ro‘yxat qaytadi.
 * Mo‘ljal yozuvi — qulaylik, u tufayli butun xarita ishlamay
 * qolishi mumkin emas.
 */
let settlementCache: Map<string, Settlement[]> | null = null;

function loadSettlements(): Map<string, Settlement[]> {
  if (settlementCache) return settlementCache;

  const byDistrict = new Map<string, Settlement[]>();
  try {
    const file = join(
      __dirname,
      '..',
      '..',
      'database',
      'seeds',
      'data',
      'andijon-settlements.geojson',
    );
    const geo = JSON.parse(readFileSync(file, 'utf8')) as {
      features: Array<{
        geometry: { coordinates: [number, number] };
        properties: {
          name: string;
          kind: string;
          rank: number;
          districtCode: string;
        };
      }>;
    };
    for (const f of geo.features) {
      const list = byDistrict.get(f.properties.districtCode) ?? [];
      list.push({
        name: f.properties.name,
        kind: f.properties.kind,
        rank: f.properties.rank,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      });
      byDistrict.set(f.properties.districtCode, list);
    }
  } catch {
    /* Fayl yo‘q yoki buzuq — mo‘ljalsiz ishlaymiz. */
  }

  settlementCache = byDistrict;
  return byDistrict;
}

@Injectable()
export class GeoService {
  constructor(
    @InjectRepository(Region) private readonly regions: Repository<Region>,
    @InjectRepository(District)
    private readonly districts: Repository<District>,
    @InjectRepository(Mahalla)
    private readonly mahallas: Repository<Mahalla>,
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
  /**
   * ⚠️ Bog‘lanish KALITI parametr: tuman kesimida `o.district_id = d.id`,
   * mahalla kesimida esa `o.mahalla_id = m.id`. Qolgan filtrlar
   * (yil, tur, holat) IKKALASIDA HAM bir xil bo‘lishi shart — ikki
   * nusxa bo‘lsa, yil filtri bir xaritada ishlab, ikkinchisida
   * ishlamay qolardi.
   */
  private objectJoinCondition(
    q: DistrictStatsQueryDto,
    on = 'o.district_id = d.id',
  ): string {
    const parts = [on, 'o.deleted_at IS NULL'];
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

  /**
   * MAHALLALAR KESIMIDAGI STATISTIKA — tuman xaritasi va jadvali uchun.
   *
   * ⚠️ Tuzilishi `districtStats` bilan AYNI (`DistrictStats`): mijozda
   * bitta jadval va bitta xarita komponenti ikkala darajani ham
   * chizadi. Javob shakli farq qilsa, mahalla uchun butun boshqa
   * ekran yozishga to‘g‘ri kelardi.
   *
   * ⚠️ Mahallasi aniqlanmagan obyektlar bu ro‘yxatga KIRMAYDI — ular
   * `mahallasGeoJson` javobidagi `unassigned` da alohida qaytadi va
   * xaritada nuqta bo‘lib chiziladi. Ularni «Boshqa» degan soxta
   * mahallaga yig‘ish xaritada chizib bo‘lmaydigan yozuv bo‘lardi.
   */
  async mahallaStats(
    districtId: string,
    query: DistrictStatsQueryDto,
  ): Promise<DistrictStats[]> {
    const qb = this.mahallas
      .createQueryBuilder('m')
      .leftJoin(
        ConstructionObject,
        'o',
        this.objectJoinCondition(query, 'o.mahalla_id = m.id'),
        this.objectJoinParams(query),
      )
      .select('m.id', 'districtId')
      .addSelect('m.code', 'code')
      .addSelect('m.name', 'name')
      .addSelect('m.name', 'shortName')
      .addSelect('m.center_lat', 'centerLat')
      .addSelect('m.center_lng', 'centerLng')
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
      .where('m.district_id = :districtId', { districtId })
      .andWhere('m.is_active = true')
      .setParameters({
        onSchedule: ObjectHealth.ON_SCHEDULE,
        delayed: ObjectHealth.DELAYED,
        atRisk: ObjectHealth.AT_RISK,
        notStarted: ObjectHealth.NOT_STARTED,
        completed: ObjectHealth.COMPLETED,
      })
      .groupBy('m.id')
      .addGroupBy('m.code')
      .addGroupBy('m.name')
      .addGroupBy('m.center_lat')
      .addGroupBy('m.center_lng')
      .orderBy('m.name', 'ASC');

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
   * TUMAN XARITASI — mahalla chegaralari + obyekt nuqtalari, BITTA javobda.
   *
   * ⚠️ Javobda UCHTA narsa birga keladi va ularni ajratib yubormaslik
   * kerak (`districtsGeoJson` bilan AYNI sabab): mijoz uch so‘rov
   * yuborib, natijani o‘zi birlashtirsa, biri kechikkanda xarita
   * yarim chizilgan holda turib qolardi.
   *
   *   • `features` — mahalla chegaralari, statistikasi bilan;
   *   • `objects`  — tumandagi HAR BIR obyekt nuqtasi;
   *   • `district` — tumanning o‘z chegarasi va `bbox` i (xarita shunga
   *     moslanadi).
   *
   * ⚠️ `objects` ichida mahallasi bor obyektlar ham bor. Sabab: mahalla
   * chegarasi — rang, nuqta esa AYNIQSA JOY. Hokim «bu mahallada 3 ta
   * obyekt» degan rangni ko‘rgach, ularning qayerdaligini ham
   * ko‘rishi kerak.
   */
  async mahallasGeoJson(districtId: string, query: DistrictStatsQueryDto) {
    const district = await this.getDistrict(districtId);
    const [shapes, stats, objects] = await Promise.all([
      this.mahallas.find({
        where: { districtId, isActive: true },
        order: { name: 'ASC' },
      }),
      this.mahallaStats(districtId, query),
      this.districtObjectPoints(districtId, query),
    ]);

    const byId = new Map(stats.map((s) => [s.districtId, s]));

    return {
      type: 'FeatureCollection' as const,
      district: {
        id: district.id,
        code: district.code,
        name: district.name,
        shortName: district.shortName,
        centerLat: district.centerLat,
        centerLng: district.centerLng,
        geometry: district.geometry,
      },
      /*
       * ⚠️ `bbox` — MA'LUMOT turgan joy (mahalla chegaralari + obyekt
       * nuqtalari), tumanning butun konturi EMAS.
       *
       * Sabab amaliy: mahalla qoplamasi tumanni to'liq egallamaydi va
       * xarita butun tumanga moslansa, ellikdan ortiq mahalla
       * markazdagi kichik dog'ga qisilib, bir-birining ustiga
       * tushardi — na chegara, na raqam o'qilardi. Ma'lumotga
       * moslanganda esa ular butun kartani egallaydi.
       *
       * Tumanning o'z konturi baribir chiziladi (`district.geometry`)
       * va ko'rinish chetidan chiqib ketgani «bu — tumanning bir
       * qismi» degan ma'noni beradi.
       *
       * Mahalla ham, obyekt ham bo'lmasa — tumanning o'ziga moslanadi.
       */
      bbox: dataBbox(shapes, objects) ?? bboxOf(district.geometry),
      /*
       * MO‘LJAL YOZUVLARI — chegarasi yo‘q tuman uchun HAYOTIY.
       *
       * ⚠️ OSM da mahalla chegarasi faqat ikki tumanda bor; qolgan
       * o‘n to‘rttasida xarita bo‘m-bo‘sh ko‘pburchak bo‘lib
       * qolardi. Qishloq nomlari obyekt qayerda ekanini aytadi va
       * buning uchun soxta chegara chizish SHART EMAS.
       */
      settlements: loadSettlements().get(district.code) ?? [],
      /* Qoplama o‘lchovi — ekranda ochiq aytiladi: mahallasi aniqlanmagan
         obyekt «yo‘qolgan» emas, chegarasi hali yuklanmagan. */
      coverage: {
        mahallas: shapes.length,
        withMahalla: objects.filter((o) => o.mahallaId).length,
        withoutMahalla: objects.filter((o) => !o.mahallaId).length,
      },
      objects,
      features: shapes.map((m) => {
        const s = byId.get(m.id);
        return {
          type: 'Feature' as const,
          geometry: m.geometry,
          properties: {
            districtId: m.id,
            code: m.code,
            name: m.name,
            shortName: m.name,
            officialName: m.officialName,
            centerLat: m.centerLat,
            centerLng: m.centerLng,
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

  /** Tumandagi obyektlar — xaritaga nuqta qilib qo‘yish uchun eng kichik to‘plam. */
  private async districtObjectPoints(
    districtId: string,
    query: DistrictStatsQueryDto,
  ) {
    const qb = this.districts.manager
      .createQueryBuilder(ConstructionObject, 'o')
      .select('o.id', 'id')
      .addSelect('o.code', 'code')
      .addSelect('o.name', 'name')
      .addSelect('o.lat', 'lat')
      .addSelect('o.lng', 'lng')
      .addSelect('o.health_status', 'healthStatus')
      .addSelect('o.progress_percent', 'progressPercent')
      .addSelect('o.mahalla_id', 'mahallaId')
      .where('o.district_id = :districtId', { districtId })
      .andWhere('o.deleted_at IS NULL')
      .andWhere('o.lat IS NOT NULL AND o.lng IS NOT NULL');

    if (query.yearFrom)
      qb.andWhere('EXTRACT(YEAR FROM o.planned_end_date) >= :yearFrom');
    if (query.yearTo)
      qb.andWhere('EXTRACT(YEAR FROM o.planned_start_date) <= :yearTo');
    if (query.year)
      qb.andWhere('EXTRACT(YEAR FROM o.planned_end_date) = :year');
    if (query.typeIds?.length) qb.andWhere('o.type_id IN (:...typeIds)');
    if (query.health?.length) qb.andWhere('o.health_status IN (:...health)');
    qb.setParameters(this.objectJoinParams(query));
    // ⚠️ Mahalla xaritasidagi nuqta ham obyekt: uni bosgan odam
    // manzilni va mas'ulni ko‘rishi kerak. Chaqiruv `select()`
    // zanjiridan KEYIN (`object-brief.contract.ts`).
    selectObjectBrief(qb);

    const rows = await qb
      .orderBy('o.name', 'ASC')
      .getRawMany<Record<string, string>>();
    return rows.map((r) => ({
      ...objectBriefFromRaw(r),
      id: r.id,
      code: r.code,
      name: r.name,
      // ⚠️ So‘rov `lat/lng IS NOT NULL` bilan filtrlangan — bu yerda
      // ular aniq son, `ObjectBrief` dagi ixtiyoriy qiymat emas.
      lat: Number(r.lat),
      lng: Number(r.lng),
      healthStatus: r.healthStatus as ObjectHealth,
      progressPercent: Number(r.progressPercent),
      mahallaId: r.mahallaId ?? null,
    }));
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
