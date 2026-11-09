import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { District } from '../../database/entities/district.entity';
import { Mahalla } from '../../database/entities/mahalla.entity';
import { Region } from '../../database/entities/region.entity';
import { ObjectHealth } from '../../common/constants/enums';
import {
  bboxOf,
  bboxOfPoints,
  pointInGeometry,
  unionBbox,
  type GeoJsonGeometry,
} from '../../helpers/geo.helpers';
import { sumAmounts } from '../../helpers/money.helpers';
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

/**
 * Nomlarni TAQQOSLASH uchun soddalashtirish.
 *
 * ⚠️ Faqat solishtirish uchun — ekranga HECH QACHON chiqmaydi.
 * OSM da bitta qishloq nomi bir necha xil yoziladi: apostrof turlari
 * (`ʻ ʼ ’`), bo‘sh joy, «qishlog‘i» qo‘shimchasi. Oddiy `===`
 * bilan taqqoslash ularning hech birini ushlamasdi.
 */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ʻʼ'`’‘´]/g, '')
    .replace(/\s+/g, '')
    .replace(/(qishlogi|qishloq|shaharchasi|mahallasi|massivi)$/u, '');
}

/**
 * AHOLI PUNKTI MAYDONLARIDAN KO‘RSATKICH KO‘PBURCHAKLARI.
 *
 * ⚠️ Son BAZADA guruhlanmaydi, XOTIRADA hisoblanadi — sabab shundaki,
 * obyekt aholi punktiga BIRIKTIRILMAGAN: `construction_objects` da
 * `mahalla_id` bor, `locality_id` esa yo‘q va bo‘lishi ham shart emas.
 * Aholi punkti — ma’muriy birlik emas, XARITA qatlami; u hisobotda
 * kesim bo‘lmaydi. Jadval ochilsa, migratsiya, sinxronlash va
 * «qaysi raqam to‘g‘ri» degan ikkinchi haqiqat manbai paydo bo‘lardi.
 *
 * ⚠️ Narx hisobi: bitta tumanda ~200 obyekt va ~20 maydon, ya’ni
 * eng yomon holatda bir necha ming nuqta-ko‘pburchak tekshiruvi —
 * bu bitta SQL so‘rovidan ham arzon.
 *
 * ⚠️ Obyekt BIR MARTA sanaladi: birinchi mos maydonda to‘xtaladi
 * (`findContaining` bilan AYNI qoida). Maydonlar kesishib qolsa ham
 * yig‘indi tumanning umumiy sonidan oshib ketmaydi.
 */
function buildLocalityFeatures(
  localities: readonly Locality[],
  objects: ReadonlyArray<{
    lat: number;
    lng: number;
    healthStatus: ObjectHealth;
    progressPercent: number;
    totalCost: string;
  }>,
) {
  const buckets = new Map<string, typeof objects>();
  for (const object of objects) {
    for (const locality of localities) {
      if (!pointInGeometry(object.lng, object.lat, locality.geometry)) continue;
      const list = buckets.get(locality.code);
      if (list) (list as Array<(typeof objects)[number]>).push(object);
      else buckets.set(locality.code, [object]);
      break;
    }
  }

  return localities.map((locality) => {
    const inside = buckets.get(locality.code) ?? [];
    const count = (health: ObjectHealth) =>
      inside.filter((o) => o.healthStatus === health).length;

    const base = {
      /*
       * ⚠️ `districtId` — MAYDON kaliti, tuman id si EMAS. Nomi
       * shunday, chunki shakl `DistrictStats` bilan AYNI bo‘lishi
       * kerak: bitta xarita komponenti va bitta jadval uch darajani
       * ham chizadi. Mahalla tomonida ham shunday (`mahallaStats`)
       * va bosilganda nima qilish kerakligini CHAQIRUVCHI hal
       * qiladi — `dashboard` sahifasidagi izohga qarang.
       */
      districtId: locality.code,
      code: locality.code,
      name: locality.name,
      shortName: locality.name,
      officialName: null as string | null,
      centerLat: locality.centerLat,
      centerLng: locality.centerLng,
      total: inside.length,
      onSchedule: count(ObjectHealth.ON_SCHEDULE),
      delayed: count(ObjectHealth.DELAYED),
      atRisk: count(ObjectHealth.AT_RISK),
      notStarted: count(ObjectHealth.NOT_STARTED),
      completed: count(ObjectHealth.COMPLETED),
      avgProgress:
        inside.length === 0
          ? 0
          : Math.round(
              inside.reduce((sum, o) => sum + o.progressPercent, 0) /
                inside.length,
            ),
      totalCost: sumAmounts(inside.map((o) => o.totalCost)),
    };

    return {
      type: 'Feature' as const,
      geometry: locality.geometry,
      properties: { ...base, dominantHealth: dominantHealthOf(base) },
    };
  });
}

/**
 * AHOLI PUNKTI MAYDONI — tuman kesimidagi ko‘rsatkich ko‘pburchagi.
 *
 * ⚠️ BU MAHALLA (MFY) CHEGARASI EMAS. Mahalla fuqarolar yig‘inlarining
 * rasmiy chegaralari davlat kadastrida bor, lekin ochiq ma’lumot
 * sifatida e’lon qilinmagan: OSM da ular faqat IKKI tumanda — Andijon
 * shahri va Andijon tumanida — chizilgan. Qolgan o‘n to‘rt tumanda
 * mahalla chegarasi YO‘Q.
 *
 * ⚠️ Soxta chegara CHIZILMAYDI. Uning o‘rniga OSM da o‘lchangan
 * HAQIQIY qatlam olinadi: qishloq va shaharchalarning yashash
 * maydonlari. Ular ma’muriy birlik emas, lekin real va aniq —
 * «bu qishloq shu yerda va unda 3 ta obyekt bor» degan gap to‘g‘ri
 * bo‘lib qoladi.
 *
 * ⚠️ Ekrandagi atama ham shunga mos: «mahallalar kesimida» EMAS,
 * «aholi punktlari kesimida». Qaysi qatlam ishlatilgani javobda
 * ochiq aytiladi (`coverage.layer`).
 */
export interface Locality {
  code: string;
  name: string;
  /** `city | town | village | hamlet | quarter | residential`. */
  kind: string;
  centerLat: number;
  centerLng: number;
  geometry: GeoJsonGeometry;
}

/**
 * ⚠️ Fayl BIR MARTA o‘qiladi (`loadSettlements` bilan AYNI sabab):
 * u bir necha yuz ko‘pburchakdan iborat va har so‘rovda qayta
 * tahlil qilinsa, tuman xaritasi sezilarli sekinlashardi.
 *
 * ⚠️ Fayl YO‘Q bo‘lsa xizmat YIQILMAYDI — bo‘sh ro‘yxat qaytadi va
 * tuman avvalgidek bitta ko‘pburchak bo‘lib chiziladi.
 */
let localityCache: Map<string, Locality[]> | null = null;

function loadLocalities(): Map<string, Locality[]> {
  if (localityCache) return localityCache;

  const byDistrict = new Map<string, Locality[]>();
  try {
    const file = join(
      __dirname,
      '..',
      '..',
      'database',
      'seeds',
      'data',
      'andijon-localities.geojson',
    );
    const geo = JSON.parse(readFileSync(file, 'utf8')) as {
      features: Array<{
        geometry: GeoJsonGeometry;
        properties: {
          code: string;
          name: string;
          kind: string;
          districtCode: string;
          centerLat: number;
          centerLng: number;
        };
      }>;
    };
    for (const f of geo.features) {
      if (!f.geometry) continue;
      const list = byDistrict.get(f.properties.districtCode) ?? [];
      list.push({
        code: f.properties.code,
        name: f.properties.name,
        kind: f.properties.kind,
        centerLat: f.properties.centerLat,
        centerLng: f.properties.centerLng,
        geometry: f.geometry,
      });
      byDistrict.set(f.properties.districtCode, list);
    }
  } catch {
    /* Fayl yo‘q yoki buzuq — tuman bitta ko‘pburchak bo‘lib chiziladi. */
  }

  localityCache = byDistrict;
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
    const [shapes, stats, objects, regionStats] = await Promise.all([
      this.mahallas.find({
        where: { districtId, isActive: true },
        order: { name: 'ASC' },
      }),
      this.mahallaStats(districtId, query),
      this.districtObjectPoints(districtId, query),
      /* ⚠️ TUMANNING O‘Z YIG‘INDISI — xaritada tumanning o‘zi ham
         ko‘rsatkich ko‘pburchagi bo‘lgani uchun kerak (sanoq belgisi,
         nom yorlig‘i, ko‘rsatma). Alohida so‘rov yozilmaydi: viloyat
         kesimidagi AYNI funksiya chaqiriladi, aks holda tuman
         xaritasidagi son viloyat xaritasidagi sondan farq qilib
         qolishi mumkin edi. */
      this.districtStats({ ...query, regionId: district.regionId }),
    ]);

    const byId = new Map(stats.map((s) => [s.districtId, s]));

    /*
     * MO‘LJAL YOZUVLARI — chegarasi yo‘q tuman uchun HAYOTIY.
     *
     * ⚠️ OSM da mahalla chegarasi faqat ikki tumanda bor; qolgan
     * o‘n to‘rttasida xarita bo‘m-bo‘sh ko‘pburchak bo‘lib qolardi.
     * Qishloq nomlari obyekt qayerda ekanini aytadi va buning uchun
     * soxta chegara chizish SHART EMAS.
     *
     * ⚠️ `bbox` dan OLDIN hisoblanadi: yozuvlar ham ko‘rinish
     * chegarasiga kiradi (pastga qarang).
     */
    const totals =
      regionStats.find((d) => d.districtId === district.id) ?? null;

    /*
     * QAYSI QATLAM CHIZILADI.
     *
     * ⚠️ Birinchi navbatda MAHALLA (MFY): u ma'muriy birlik va obyekt
     * unga `mahalla_id` bilan BIRIKTIRILGAN — ya'ni xaritadagi son
     * bilan hisobotdagi son bitta manbadan keladi.
     *
     * ⚠️ Mahalla chegarasi yo'q tumanda (o'n to'rttasida) — AHOLI
     * PUNKTI MAYDONLARI: OSM da o'lchangan qishloq va shaharchalarning
     * yashash hududlari. Ular ma'muriy birlik EMAS va shunday deb
     * atalmaydi ham (`coverage.layer` javobda ochiq turadi), lekin
     * real: tuman kesimi bo'm-bo'sh ko'pburchak bo'lib qolmaydi.
     *
     * ⚠️ BITTA maydon qatlam HISOBLANMAYDI (`>= 2`). Xonobod shahri
     * kabi tumanda OSM da butun shahar bitta ko'pburchak bo'lib
     * chizilgan: u tumanning o'z konturini TAKRORLAR va ekranda bir
     * xil ikki shakl ustma-ust tushib, «kesim» degan ma'noni
     * yo'qotardi.
     */
    const localities =
      shapes.length > 0 ? [] : (loadLocalities().get(district.code) ?? []);
    const localityFeatures =
      localities.length >= 2 ? buildLocalityFeatures(localities, objects) : [];
    const layer: 'mahalla' | 'locality' | 'none' =
      shapes.length > 0
        ? 'mahalla'
        : localityFeatures.length > 0
          ? 'locality'
          : 'none';

    /*
     * ⚠️ TAKRORLANGAN MO‘LJAL YOZUVI OLIB TASHLANADI. Aholi punkti
     * maydoni chizilganda uning nomi ko‘pburchakning O‘ZIDA yoziladi;
     * o‘sha qishloqning mo‘ljal yozuvi ham qolsa, xaritada
     * «O‘rmonbek» degan so‘z IKKI MARTA, bir-birining yonida
     * turardi.
     *
     * ⚠️ Taqqoslash NORMALLASHTIRILGAN nom bo‘yicha: OSM da bitta joy
     * «Qo‘rg‘oncha», «Qurgoncha» va «Кургонча» bo‘lib yozilgan
     * bo‘lishi mumkin.
     */
    const drawnNames = new Set(
      localityFeatures.map((f) => normalizeName(f.properties.name)),
    );
    const settlements = (loadSettlements().get(district.code) ?? []).filter(
      (place) =>
        layer !== 'locality' || !drawnNames.has(normalizeName(place.name)),
    );

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
        /* ⚠️ Mahalla chegarasi yo‘q tumanda xarita AYNAN shu raqamlar
           bilan chiziladi: tuman ko‘pburchagi viloyat kesimidagi
           tumanlar kabi sanoq belgisi va ko‘rsatma oladi. */
        stats: totals,
      },
      /*
       * KO'RINISH CHEGARASI — HAR DOIM TUMANNING O'ZI.
       *
       * ⚠️ «Tuman kesimi» degani ekranda TUMAN turishi degani: hokim
       * tumanni tanlaganda xarita o'sha tumanga kattalashadi va
       * boshqa hech narsa ko'rinmaydi.
       *
       * ⚠️ Ilgari bu yerda MA'LUMOT chegarasi olinardi (mahalla
       * konturlari + obyekt nuqtalari) va natija shu edi: Baliqchi
       * tumanida mahalla chegarasi yo'q, shuning uchun xarita o'nta
       * obyekt to'dasiga moslanib, tumanning o'z konturi va qishloq
       * nomlari ko'rinish TASHQARISIGA chiqib ketgan edi — ekranda
       * bir chetda rangli nuqtalar, boshqa chetda konturning bir
       * bo'lagi suzib turardi.
       *
       * ⚠️ Tuman tashqarisidagi obyekt ham QO'SHILADI: koordinatasi
       * xato kiritilgan obyekt ko'rinish tashqarisida qolsa,
       * jadvaldagi son bilan xaritadagi manzara mos kelmay qolardi.
       * Yozuvlar ham shunday — chizilgan narsa ko'rinish ichida
       * bo'lishi shart.
       */
      bbox:
        unionBbox(
          unionBbox(bboxOf(district.geometry), bboxOfPoints(objects)),
          bboxOfPoints(settlements),
        ) ?? dataBbox(shapes, objects),
      settlements,
      /* Qoplama o‘lchovi — ekranda ochiq aytiladi: mahallasi aniqlanmagan
         obyekt «yo‘qolgan» emas, chegarasi hali yuklanmagan. */
      coverage: {
        /*
         * ⚠️ QAYSI QATLAM CHIZILGANI JAVOBDA OCHIQ TURADI. Ekrandagi
         * sarlavha ham, izoh ham shunga qarab yoziladi: aholi punkti
         * maydonini «mahalla» deb atash — hokimga ma'muriy chegara
         * ko'rsatganday bo'lardi, holbuki u boshqa narsa.
         */
        layer,
        mahallas: shapes.length,
        localities: localityFeatures.length,
        withMahalla: objects.filter((o) => o.mahallaId).length,
        withoutMahalla: objects.filter((o) => !o.mahallaId).length,
      },
      objects,
      features:
        layer === 'locality'
          ? localityFeatures
          : shapes.map((m) => {
              const s = byId.get(m.id);
              return {
                type: 'Feature' as const,
                geometry: m.geometry as GeoJsonGeometry | null,
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
      /* ⚠️ Qiymat ham olinadi: aholi punkti maydonining ko‘rsatmasi
         «Umumiy qiymat» qatorini ko‘rsatadi va u xotirada, SHU
         nuqtalardan yig‘iladi — mahalla uchun esa bazada guruhlanadi
         (`mahallaStats`). Ikkala yo‘l ham AYNI maydondan oziqlanadi. */
      .addSelect('o.total_cost', 'totalCost')
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
      /* ⚠️ `numeric` — pg uni SATR qaytaradi va shundayligicha
         qoldiriladi: `Number()` katta summada aniqlikni yo‘qotadi. */
      totalCost: String(r.totalCost ?? '0'),
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
