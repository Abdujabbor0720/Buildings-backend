/**
 * EXCEL KATAGIDAGI MATNNI QIYMATGA AYLANTIRISH — sof funksiyalar.
 *
 * ⚠️ Bu faylda HECH QANDAY freymvork importi yo‘q (NestJS ham, TypeORM
 * ham, ExcelJS ham). Sabab: import xatolarining aksariyati aynan shu
 * funksiyalarda tug‘iladi va ular sinovdan o‘tishi kerak. Servis bilan
 * bitta faylda bo‘lsa, testni ishga tushirish uchun butun DI daraxtini
 * ko‘tarishga to‘g‘ri kelardi.
 */

/** ExcelJS katagining qiymati — bizga kerakli shakllari. */
export type RawCellValue =
  | null
  | undefined
  | string
  | number
  | boolean
  | Date
  | { formula?: string; result?: unknown }
  | { richText?: Array<{ text?: string }> }
  | { text?: unknown }
  | { error?: unknown }
  | Record<string, unknown>;

/**
 * Katak qiymatini MATNGA aylantiradi.
 *
 * ⚠️ Formula katagi `{ formula, result }` obyekti bo‘lib keladi.
 * `String(value)` qilinса `[object Object]` chiqardi va qator jimgina
 * xato bo‘lardi. Shuning uchun NATIJA olinadi — ExcelJS formulani
 * HISOBLAMAYDI, faqat faylda saqlangan natijani o‘qiydi.
 *
 * ⚠️ Sana katagi `Date` bo‘lib keladi: ISO ko‘rinishida qaytariladi,
 * `toLocaleString` EMAS — u ishlayotgan muhitga bog‘liq (`dates.md` §3).
 */
export function cellToText(value: RawCellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(
      value.getUTCDate(),
    ).padStart(2, '0')}`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('result' in obj) return cellToText(obj.result as RawCellValue);
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText
        .map((part) => String((part as { text?: string }).text ?? ''))
        .join('');
    }
    // ⚠️ Gipermatn katagining `text` i satr bo‘lishi KAFOLATLANMAGAN —
    // `String()` ga obyekt tushsa `[object Object]` chiqardi.
    if ('text' in obj) return typeof obj.text === 'string' ? obj.text : '';
    if ('error' in obj) return '';
    return '';
  }
  return String(value).trim();
}

/**
 * ⚠️ Bo‘shliq va ajratgichlar tozalanadi: odamlar Excel’ga
 * «21 500 000 000» yoki «21,500,000,000» deb yozadi va `Number()`
 * ularni `NaN` qilardi.
 */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[\s\u00A0’']/g, '').replace(/,/g, '.');
  if (!cleaned) return null;
  // Ming ajratgich sifatida ishlatilgan nuqtalarni olib tashlaymiz:
  // «21.500.500» → 21500500, lekin «40.8012» o‘zgarmaydi.
  const normalized =
    (cleaned.match(/\./g) ?? []).length > 1
      ? cleaned.replace(/\./g, '')
      : cleaned;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[\s\u00A0]/g, '').replace(/,/g, '.');
  if (!cleaned) return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Quvvat va qavat — manfiy bo‘lolmaydi, shuning uchun 0 dan kichigi rad etiladi. */
export function parseInteger(text: string): number | null {
  const value = parseNumber(text);
  if (value === null || !Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * Sanani `YYYY-MM-DD` ga keltiradi.
 *
 * Qabul qilinadi: `2026-03-01`, `01.03.2026`, `01/03/2026`, `1-3-2026`
 * va Excel’ning sana katagi (`cellToText` uni allaqachon ISO qilgan).
 *
 * ⚠️ Oy/kun tartibi AMERIKACHA EMAS: `01.03.2026` — 1-mart, 3-yanvar
 * emas. Buni taxmin qilib bo‘lmaydi, shuning uchun shablonda format
 * aniq yozilgan (`KK.OO.YYYY`).
 */
export function parseDate(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);

  const dmy = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(raw);
  if (dmy) return validDate(+dmy[3], +dmy[2], +dmy[1]);

  return null;
}

function validDate(year: number, month: number, day: number): string | null {
  if (
    year < 1990 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // ⚠️ 31-fevral kabi sanalar `Date` tomonidan JIM surib yuboriladi —
  // qaytib tekshirmasak, foydalanuvchi boshqa sanani olgan bo‘lardi.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Katalog qidiruvi uchun kalit — registr, apostrof va qo‘sh bo‘shliq farq qilmaydi. */
export function refKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”«»"]/g, '')
    .replace(/[‘’'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
