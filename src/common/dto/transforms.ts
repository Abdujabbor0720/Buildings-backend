import type { TransformFnParams } from 'class-transformer';

/**
 * DTO uchun `@Transform()` yordamchilari — YAGONA joy.
 *
 * ⚠️ Har bir DTO faylida alohida `const trim = ...` yozilgan edi: o‘n beshta
 * nusxa, har biri biroz boshqacha. Bundan tashqari `TransformFnParams.value`
 * tipi `any`, shuning uchun inline callback `no-unsafe-return` beradi —
 * bu yerdagi funksiyalar `unknown` qaytarib, tip xavfsizligini tiklaydi.
 */

/** Matnni tozalaydi, matn bo‘lmasa tegmaydi. */
export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : (value as unknown);

/** Tozalaydi va kichik harfga o‘tkazadi (email, kod). */
export const trimLower = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : (value as unknown);

/** Bo‘sh satr → `undefined`, aks holda son. */
export const toNumber = ({ value }: TransformFnParams): unknown =>
  value === undefined || value === null || value === ''
    ? undefined
    : Number(value);

/** Berilmagan bo‘lsa `fallback` qaytaradigan son konvertori. */
export const toNumberWithDefault =
  (fallback: number) =>
  ({ value }: TransformFnParams): unknown =>
    value === undefined || value === null || value === ''
      ? fallback
      : Number(value);

/** `'true' | '1' | true` → `true`; berilmagan bo‘lsa `undefined`. */
export const toOptionalBoolean = ({ value }: TransformFnParams): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
};

/** `'true' | '1' | true` → `true`; aks holda `false`. */
export const toBoolean = ({ value }: TransformFnParams): unknown =>
  value === true || value === 'true' || value === '1';

/**
 * `?health=delayed,at_risk` → `['delayed', 'at_risk']`.
 * Query'da massiv ikki xil keladi (`a=1&a=2` yoki `a=1,2`) — ikkalasi ham
 * qo‘llab-quvvatlanadi.
 */
export const toArray = ({ value }: TransformFnParams): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

/** Pul: son bo‘lsa ikki kasrli satrga, aks holda tegmaydi. */
export const toMoneyString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'number' ? value.toFixed(2) : (value as unknown);

/** `'ASC' | 'DESC'` ga normallashtirish. */
export const toUpperCase = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.toUpperCase() : (value as unknown);
