/**
 * Noma'lum qiymatni audit va taqqoslash uchun BARQAROR satrga aylantiradi.
 *
 * ⚠️ `String(value)` obyektda `[object Object]` beradi — ikki boshqa
 * obyekt bir xil ko‘rinib, audit «o‘zgarish yo‘q» deb o‘tkazib yuborardi.
 */
export function stableString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[murakkab qiymat]';
  }
}
