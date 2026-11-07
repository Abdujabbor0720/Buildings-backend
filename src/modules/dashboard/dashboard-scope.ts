import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { ObjectStatus } from '../../common/constants/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ConstructionObject } from '../../database/entities/construction-object.entity';

/**
 * BOSH SAHIFA DOIRASI — YAGONA MANBA.
 *
 * ⚠️ Bu fayl ataylab servisdan TASHQARIDA. Kartalardagi raqam
 * (`DashboardService`) va o‘sha kartaning batafsil sahifasi
 * (`DashboardMetricsService`) AYNI to‘plam ustida ishlashi SHART:
 * ikkita nusxa bo‘lsa, «Kechikayotgan 116» kartasini bosgan odam
 * ichkarida 114 ta obyekt ko‘rib, qaysi raqam to‘g‘ri ekanini bilmay
 * qolardi. Shuning uchun filtr ham, rol doirasi ham faqat shu yerda
 * yoziladi.
 */

/**
 * Filtrning so‘rov DTO'siga BOG‘LIQ BO‘LMAGAN shakli.
 *
 * ⚠️ `DashboardQueryDto` import QILINMAYDI: DTO sinfi dekoratorlar
 * bilan birga keladi va uni bu yerga tortish servis qatlamini
 * validatsiya qatlamiga bog‘lab qo‘yardi. Shakl bir xil bo‘lgani
 * uchun DTO bu interfeysga tabiiy tushadi.
 */
export interface DashboardScopeQuery {
  regionId?: string;
  districtIds?: string[];
  typeIds?: string[];
  yearFrom?: number;
  yearTo?: number;
  includeCompleted?: boolean;
}

/**
 * ROL DOIRASI — `o` taxallusi barcha so‘rovlarda bir xil ataladi.
 *
 * ⚠️ Foto-hisobotlar so‘rovida ham ishlatiladi (u yerda `o` — JOIN
 * qilingan obyekt), shuning uchun tipi umumiy (`ObjectLiteral`).
 */
export function applyUserScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  user: AuthUser,
): void {
  if (user.contractorId) {
    qb.andWhere('o.contractor_id = :scopeContractorId', {
      scopeContractorId: user.contractorId,
    });
    return;
  }
  if (user.districtId) {
    qb.andWhere('o.district_id = :scopeDistrictId', {
      scopeDistrictId: user.districtId,
    });
    return;
  }
  if (user.regionId) {
    qb.andWhere('o.region_id = :scopeRegionId', {
      scopeRegionId: user.regionId,
    });
  }
}

/** Filtr + rol doirasi qo‘llangan asosiy so‘rov (`o` taxallusi bilan). */
export function scopedObjects(
  repo: Repository<ConstructionObject>,
  query: DashboardScopeQuery,
  user: AuthUser,
): SelectQueryBuilder<ConstructionObject> {
  const qb = repo.createQueryBuilder('o');

  // Bekor qilinganlar HECH QACHON sanalmaydi — ular endi loyiha emas.
  qb.where('o.status != :cancelled', { cancelled: ObjectStatus.CANCELLED });
  if (!query.includeCompleted) {
    qb.andWhere('o.status != :completedFilter', {
      completedFilter: ObjectStatus.COMPLETED,
    });
  }
  if (query.regionId)
    qb.andWhere('o.region_id = :regionId', { regionId: query.regionId });
  if (query.districtIds?.length) {
    qb.andWhere('o.district_id IN (:...districtIds)', {
      districtIds: query.districtIds,
    });
  }
  if (query.typeIds?.length)
    qb.andWhere('o.type_id IN (:...typeIds)', { typeIds: query.typeIds });
  // ⚠️ Yil oralig‘i — DASTUR DAVRI, topshirish yili EMAS.
  // Obyekt davri («2025-03-01 … 2029-06-30») oraliq bilan KESISHSA,
  // u shu dasturga kiradi. Faqat `planned_end_date` bo‘yicha filtrlansa,
  // 2028-yilda topshiriladigan obyekt «2024–2027 dasturi» dan tushib
  // qolardi — holbuki unga pul aynan shu davrda ajratilgan.
  if (query.yearFrom) {
    qb.andWhere('EXTRACT(YEAR FROM o.planned_end_date) >= :yearFrom', {
      yearFrom: query.yearFrom,
    });
  }
  if (query.yearTo) {
    qb.andWhere('EXTRACT(YEAR FROM o.planned_start_date) <= :yearTo', {
      yearTo: query.yearTo,
    });
  }

  applyUserScope(qb, user);
  return qb;
}

/** Foiz — BITTA joyda yaxlitlanadi, aks holda karta va sahifa 0.1% farq qilardi. */
export function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

/**
 * `date` ustuni drayver darajasida STRING bo‘lib qaytadi
 * (`config/pg-types.ts`), shuning uchun bu yerda faqat kesish kifoya.
 * `Date` bo‘lib kelsa — mahalliy komponentlardan yig‘amiz: `toISOString()`
 * Toshkent yarim tunini bir kun orqaga surib yuborardi.
 */
export function isoDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
