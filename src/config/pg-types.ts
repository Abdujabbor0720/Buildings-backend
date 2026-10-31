import { types } from 'pg';

/**
 * PostgreSQL `date` USTUNI STRING BO‘LIB QAYTADI.
 *
 * ⚠️ Sukut bo‘yicha `node-pg` `date` ni JS `Date` ga aylantiradi va buni
 * MAHALLIY YARIM TUN deb o‘qiydi. Toshkent (+5) da `2026-10-30` qiymati
 * `2026-10-30T00:00+05:00` bo‘ladi, `toISOString()` esa uni `2026-10-29`
 * ga suradi — ya’ni sana BIR KUN ORQAGA ketadi.
 *
 * Buni har bir `getRawMany()` da qo‘lda to‘g‘rilash mumkin emas: bitta
 * unutilgan joy jadvalda noto‘g‘ri muddat ko‘rsatadi. Shuning uchun turni
 * DRAYVER DARAJASIDA o‘chiramiz — `date` hech qachon `Date` ga aylanmaydi.
 *
 * `timestamptz` (1184) va `timestamp` (1114) TEGILMAYDI: ular haqiqiy
 * instant va `Date` bo‘lib qolishi kerak.
 */
export function configurePgTypes(): void {
  const DATE_OID = 1082;
  types.setTypeParser(DATE_OID, (value: string) => value);
}
