import type { ValueTransformer } from 'typeorm';

/**
 * PUL — bazada `numeric(18,2)`, kodda va API'da STRING.
 *
 * ⚠️ `number` ga aylantirilmaydi. 7.4 trln so‘m float'da qoldiqsiz sig‘adi,
 * lekin JS'dagi `+` ikki Decimal uchun jim xatolik manbai bo‘lib qoladi va
 * yig‘indi qayerda hisoblangani (SQL'dami, JS'dami) ko‘rinmay qoladi.
 * Qoida: yig‘indi FAQAT SQL `SUM()` bilan, JS faqat formatlaydi.
 *
 * ⚠️ `undefined` AYNAN `undefined` bo‘lib qaytadi, `null` ga aylantirilmaydi:
 * aks holda qiymat berilmagan maydon uchun TypeORM `NULL` yozib, ustunning
 * `DEFAULT 0` qiymatini chetlab o‘tardi va NOT NULL cheklovi buzilardi.
 */
export const moneyTransformer: ValueTransformer = {
  to: (
    value: string | number | null | undefined,
  ): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return typeof value === 'number' ? value.toFixed(2) : String(value);
  },
  from: (value: string | null): string | null =>
    value === null || value === undefined ? null : String(value),
};

/** Foiz, reyting, koeffitsiyent — kichik `numeric`, kodda `number` qulay. */
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => {
    if (value === undefined) return undefined;
    return value === null ? null : value;
  },
  from: (value: string | null): number | null =>
    value === null || value === undefined ? null : Number(value),
};
