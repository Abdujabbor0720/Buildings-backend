import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { cellToText } from './object-import.values';
import {
  COLUMN_SPECS,
  IMPORT_COLUMNS,
  type ImportColumnKey,
  type RawImportRow,
} from './object-import.types';

/**
 * EXCEL FAYLNI XOM QATORLARGA AYLANTIRISH.
 *
 * ⚠️ Bu yerda HECH QANDAY biznes tekshiruvi yo‘q — faqat «katakda nima
 * yozilgan» degan savolga javob. Tekshiruv `object-import.service.ts` da,
 * chunki u katalogga (tuman, tur, pudratchi) murojaat qiladi va bu yerga
 * bazani olib kirish tahlilchini sinab bo‘lmaydigan qilardi.
 */

/**
 * ⚠️ QATOR CHEGARASI. Chegarasiz: bitta 5 MB fayl ichida yuz minglab
 * qator bo‘lishi mumkin va ularning har biri uchun katalogdan qidiruv
 * ketadi — bitta so‘rov butun serverni band qilib qo‘yardi.
 */
export const MAX_IMPORT_ROWS = 500;

/** Faylning o‘zi uchun chegara — tahlildan OLDIN tekshiriladi. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Sarlavhani solishtirish uchun soddalashtirish — apostrof va bo‘shliqlar farq qilmaydi. */
function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’'`]/g, '')
    .replace(/[^a-z0-9а-яёўқғҳ%()]+/gi, ' ')
    .trim();
}

const HEADER_TO_KEY = new Map<string, ImportColumnKey>(
  COLUMN_SPECS.map((spec) => [normalizeHeader(spec.header), spec.key]),
);

export interface ParseResult {
  rows: RawImportRow[];
  /** Faylda topilmagan MAJBURIY ustun sarlavhalari. */
  missingColumns: string[];
}

/**
 * Buferni qatorlarga aylantiradi.
 *
 * @throws BadRequestException — fayl ochilmasa yoki varaq bo‘sh bo‘lsa.
 */
export async function parseImportWorkbook(
  buffer: Buffer,
): Promise<ParseResult> {
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new BadRequestException(
      `Fayl juda katta: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. Chegara — 5 MB`,
    );
  }

  const workbook = new Workbook();
  try {
    // ⚠️ `as never`: ExcelJS tipi global `Buffer` ni kutadi, Node 22 da
    // esa `Buffer<ArrayBufferLike>` keladi — ish vaqtida bir xil obyekt.
    await workbook.xlsx.load(buffer as never);
  } catch {
    // ⚠️ Asl xato matni foydalanuvchiga BERILMAYDI: u ichki yo‘llarni
    // va kutubxona versiyasini oshkor qiladi.
    throw new BadRequestException(
      'Faylni o‘qib bo‘lmadi. U haqiqiy .xlsx faylmi? (.xls va .csv qo‘llanmaydi)',
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('Faylda birorta varaq yo‘q');

  // ───── Sarlavha qatori ─────
  const headerRow = sheet.getRow(1);
  const columnAt = new Map<number, ImportColumnKey>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = HEADER_TO_KEY.get(normalizeHeader(cellToText(cell.value)));
    if (key && ![...columnAt.values()].includes(key))
      columnAt.set(colNumber, key);
  });

  const found = new Set(columnAt.values());
  const missingColumns = COLUMN_SPECS.filter(
    (s) => s.required && !found.has(s.key),
  ).map((s) => s.header);
  if (missingColumns.length > 0) return { rows: [], missingColumns };

  // ───── Ma’lumot qatorlari ─────
  const rows: RawImportRow[] = [];
  let overflow = false;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= MAX_IMPORT_ROWS) {
      overflow = true;
      return;
    }

    const values = Object.fromEntries(
      IMPORT_COLUMNS.map((k) => [k, '']),
    ) as Record<ImportColumnKey, string>;
    let hasAny = false;
    for (const [colNumber, key] of columnAt) {
      const text = cellToText(row.getCell(colNumber).value).trim();
      values[key] = text;
      if (text) hasAny = true;
    }

    // ⚠️ Butunlay bo‘sh qator O‘TKAZIB YUBORILADI, xato sifatida emas:
    // Excel’da jadval ostida ko‘rinmas bo‘sh qatorlar qolishi odatiy hol
    // va ular uchun «Obyekt nomi bo‘sh» deb baqirish faylni tuzatib
    // bo‘lmaydigan qilardi.
    if (!hasAny) return;

    rows.push({ rowNumber, values });
  });

  if (overflow) {
    throw new BadRequestException(
      `Faylda ${MAX_IMPORT_ROWS} tadan ko‘p qator bor. Uni bo‘lib yuklang.`,
    );
  }
  if (rows.length === 0) {
    throw new BadRequestException(
      'Faylda ma’lumot qatori topilmadi (sarlavhadan keyin bo‘sh)',
    );
  }

  return { rows, missingColumns: [] };
}
