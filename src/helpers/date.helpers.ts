import {
  EMPTY_VALUE,
  MONTHS_UZ,
  MONTHS_UZ_CAP,
  TASHKENT_UTC_OFFSET_MINUTES,
} from '../utils/constants';

/**
 * Sana formati — YAGONA manba (server tomoni).
 *
 * ⚠️ `toLocaleDateString("uz-UZ")`, `Intl.DateTimeFormat` va qo‘lda yig‘ilgan
 * `${d}.${m}.${y}` shabloni TAQIQLANGAN: natija kod yozilgan joyga emas, kod
 * ISHLAYOTGAN muhitga (Node ICU qurilishi, konteyner locale'i) bog‘liq bo‘lib
 * qoladi va bitta jadvalda ikki xil sana paydo bo‘ladi.
 *
 * UTC vs Toshkent — eng ko‘p uchraydigan xato:
 *   formatDateUz(obj.createdAt)                     // haqiqiy instant
 *   formatDateUz(obj.plannedEndDate, { utc: true }) // `date` ustuni (@Column('date'))
 */

export interface DateFormatOptions {
  /** `date` turidagi (UTC yarim tunida saqlangan) KUN uchun `true`. */
  utc?: boolean;
}

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  // `@Column('date')` TypeORM'dan "2026-12-30" ko‘rinishida keladi —
  // `new Date("2026-12-30")` uni UTC yarim tuni deb o‘qiydi, bu aynan kerakli.
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Toshkent devor-soatiga ko‘chirilgan "soxta" Date — faqat getUTC* bilan o‘qish uchun. */
function toTashkent(d: Date): Date {
  return new Date(d.getTime() + TASHKENT_UTC_OFFSET_MINUTES * 60_000);
}

function parts(value: DateInput, opts?: DateFormatOptions) {
  const d = toDate(value);
  if (!d) return null;
  const x = opts?.utc ? d : toTashkent(d);
  return {
    day: x.getUTCDate(),
    monthIndex: x.getUTCMonth(),
    year: x.getUTCFullYear(),
    hours: x.getUTCHours(),
    minutes: x.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `21-may, 2025` */
export function formatDateUz(
  value: DateInput,
  opts?: DateFormatOptions,
): string {
  const p = parts(value, opts);
  if (!p) return EMPTY_VALUE;
  return `${p.day}-${MONTHS_UZ[p.monthIndex]}, ${p.year}`;
}

/** `21-may, 2025 14:30` */
export function formatDateTimeUz(
  value: DateInput,
  opts?: DateFormatOptions,
): string {
  const p = parts(value, opts);
  if (!p) return EMPTY_VALUE;
  return `${p.day}-${MONTHS_UZ[p.monthIndex]}, ${p.year} ${pad2(p.hours)}:${pad2(p.minutes)}`;
}

/** `14:30` */
export function formatTimeUz(
  value: DateInput,
  opts?: DateFormatOptions,
): string {
  const p = parts(value, opts);
  if (!p) return EMPTY_VALUE;
  return `${pad2(p.hours)}:${pad2(p.minutes)}`;
}

/** `Yanvar, 2026` — mustaqil yorliq, shuning uchun oy nomi KATTA harf bilan. */
export function formatMonthUz(
  value: DateInput,
  opts?: DateFormatOptions,
): string {
  const p = parts(value, opts);
  if (!p) return EMPTY_VALUE;
  return `${MONTHS_UZ_CAP[p.monthIndex]}, ${p.year}`;
}

/** `21-may, 2025 — 30-iyun, 2025` */
export function formatDateRangeUz(
  from: DateInput,
  to: DateInput,
  opts?: DateFormatOptions,
): string {
  const a = formatDateUz(from, opts);
  const b = formatDateUz(to, opts);
  if (a === EMPTY_VALUE && b === EMPTY_VALUE) return EMPTY_VALUE;
  return `${a} — ${b}`;
}

/* ───────────────────────── Hisob-kitob yordamchilari ───────────────────────── */

/** Toshkent kunining boshlanishi, UTC yarim tuni sifatida (`@Column('date')` bilan taqqoslash uchun). */
export function tashkentToday(now: Date = new Date()): Date {
  const t = toTashkent(now);
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
  );
}

/** `2026-12-30` ko‘rinishidagi mashina kaliti. Ekranga CHIQARILMAYDI. */
export function toDateKey(value: DateInput): string | null {
  const d = toDate(value);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const MS_PER_DAY = 86_400_000;

/** `to − from`, to‘liq kunlarda. Ikkalasi ham UTC yarim tunida bo‘lishi kutiladi. */
export function diffInDays(from: DateInput, to: DateInput): number | null {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * MS_PER_DAY);
}
