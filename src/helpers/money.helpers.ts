import { EMPTY_VALUE } from '../utils/constants';

/**
 * Pul — bazada `numeric(18,2)`, TypeORM'dan STRING bo‘lib keladi.
 *
 * ⚠️ Summalarni JS'da qo‘shmaymiz: yig‘indi har doim SQL `SUM()` bilan
 * olinadi. Bu yerdagi funksiyalar faqat KO‘RSATISH uchun — hisob emas.
 * (7.4 trln so‘m float'da qo‘shilsa oxirgi tiyinlar suzib ketadi.)
 */

export type MoneyInput = string | number | null | undefined;

export function toNumber(value: MoneyInput): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** `7 400 000 000 000` — guruhlangan, uzlukli probel bilan. */
export function formatAmount(value: MoneyInput, fractionDigits = 0): string {
  if (value === null || value === undefined || value === '') return EMPTY_VALUE;
  const n = toNumber(value);
  const fixed = n.toFixed(fractionDigits);
  const [intPart, frac] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return frac ? `${grouped},${frac}` : grouped;
}

const SCALES: Array<{ limit: number; divisor: number; suffix: string }> = [
  { limit: 1e12, divisor: 1e12, suffix: 'trln' },
  { limit: 1e9, divisor: 1e9, suffix: 'mlrd' },
  { limit: 1e6, divisor: 1e6, suffix: 'mln' },
  { limit: 1e3, divisor: 1e3, suffix: 'ming' },
];

/**
 * Ixcham ko‘rinish: `7.4 trln`, `2.35 mlrd`, `450 mln`.
 * Kartalar va grafik yorliqlari uchun — hisobotda to‘liq summa ishlatiladi.
 */
export function formatCompactAmount(
  value: MoneyInput,
  maxFractionDigits = 1,
): string {
  if (value === null || value === undefined || value === '') return EMPTY_VALUE;
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  for (const s of SCALES) {
    if (abs >= s.limit) {
      const scaled = abs / s.divisor;
      // 7.40 → "7.4", 450.0 → "450"
      const txt = scaled
        .toFixed(scaled >= 100 ? 0 : maxFractionDigits)
        .replace(/\.0+$/, '')
        .replace(/(\.\d*?)0+$/, '$1');
      return `${sign}${txt} ${s.suffix}`;
    }
  }
  return `${sign}${Math.round(abs)}`;
}

/** `7.4 trln so‘m` */
export function formatMoneyUz(
  value: MoneyInput,
  maxFractionDigits = 1,
): string {
  const compact = formatCompactAmount(value, maxFractionDigits);
  return compact === EMPTY_VALUE ? EMPTY_VALUE : `${compact} so‘m`;
}

/** `7 400 000 000 000 so‘m` */
export function formatMoneyFullUz(value: MoneyInput): string {
  const amount = formatAmount(value);
  return amount === EMPTY_VALUE ? EMPTY_VALUE : `${amount} so‘m`;
}

/** Foiz — bitta kasr xonasi bilan, 0 bo‘lsa butun son. `72.8` / `100` */
export function toPercent(
  part: MoneyInput,
  total: MoneyInput,
  digits = 1,
): number {
  const t = toNumber(total);
  if (t === 0) return 0;
  return Number(((toNumber(part) / t) * 100).toFixed(digits));
}
