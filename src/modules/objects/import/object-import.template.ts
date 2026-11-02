import { Workbook } from 'exceljs';
import { COLUMN_SPECS } from './object-import.types';
import { MAX_IMPORT_ROWS } from './object-import.parser';

export interface TemplateReferences {
  districts: string[];
  types: string[];
  customers: string[];
  contractors: string[];
  fundingSources: string[];
  responsibles: Array<{ name: string; email: string }>;
}

const INK = 'FF16222F';
const MUTED = 'FF64788F';
const BRAND = 'FF0A6CF0';
const REQUIRED_BG = 'FFD0E8FF';
const OPTIONAL_BG = 'FFEFF4F9';

/**
 * YUKLASH SHABLONI.
 *
 * ⚠️ Shablon ikki varaqdan iborat va ikkalasi ham ZARUR:
 *   «Obyektlar»     — to‘ldiriladigan jadval;
 *   «Ma’lumotnoma»  — tuman, tur, pudratchi va mas’ullarning HAQIQIY
 *                     nomlari.
 *
 * Ikkinchisisiz odam «Baliqchi tumani» deb yozadi, bazada esa «Baliqchi»
 * turadi va butun fayl xato bilan qaytadi. Ro‘yxat faylning ichida
 * bo‘lgani uchun u internetsiz ham qo‘l ostida bo‘ladi.
 */
export async function buildImportTemplate(
  refs: TemplateReferences,
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Qurilish obyektlari nazorati tizimi';
  workbook.created = new Date();

  /* ───────────────────────── 1. Obyektlar ───────────────────────── */
  const sheet = workbook.addWorksheet('Obyektlar', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  sheet.columns = COLUMN_SPECS.map((spec) => ({
    key: spec.key,
    width: spec.width,
  }));

  const header = sheet.addRow(COLUMN_SPECS.map((s) => s.header));
  header.height = 26;
  header.eachCell((cell, index) => {
    const spec = COLUMN_SPECS[index - 1];
    cell.font = { bold: true, size: 11, color: { argb: INK } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: spec.required ? REQUIRED_BG : OPTIONAL_BG },
    };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD7E4' } } };
  });

  // ⚠️ Izoh qatori jadvalning ICHIDA, alohida varaqda emas: odam
  // to‘ldirayotganda ko‘z oldida turishi kerak. Tahlilchi 2-qatordan
  // boshlab o‘qiydi va bu qator «namuna» bo‘lgani uchun o‘chiriladi…
  // — YO‘Q: tahlilchi 1-qatorni sarlavha deb oladi, 2-qator esa
  // ma’lumot. Shuning uchun izohlar sarlavha katagining IZOHIGA
  // (comment) va 2-qatordagi NAMUNA qatoriga yoziladi.
  header.eachCell((cell, index) => {
    const spec = COLUMN_SPECS[index - 1];
    cell.note = `${spec.required ? 'MAJBURIY' : 'Ixtiyoriy'}\n${spec.hint}`;
  });

  /**
   * ⚠️ Namuna qatori KATALOGDAN to‘ldiriladi, qotirib yozilgan matndan
   * emas. Ilgari u «Baliqchi» deb turardi, bazada esa «Baliqchi tumani»
   * — ya’ni SHABLONNING O‘ZIDAGI namuna xato bo‘lib, uni ko‘chirgan
   * odam darhol xatoga uchrardi.
   */
  const liveExample: Partial<Record<string, string>> = {
    districtName: refs.districts[0] ?? '',
    typeName: refs.types[0] ?? '',
    customerName: refs.customers[0] ?? '',
    contractorName: refs.contractors[0] ?? '',
    fundingSourceName: refs.fundingSources[0] ?? '',
    responsible: refs.responsibles[0]?.email ?? '',
  };
  const example = sheet.addRow(
    COLUMN_SPECS.map((spec) => liveExample[spec.key] ?? spec.example),
  );
  example.eachCell((cell) => {
    cell.font = { italic: true, size: 10, color: { argb: MUTED } };
  });

  // ⚠️ Namuna qatori O‘CHIRILISHI kerakligi aniq aytiladi, aks holda u
  // «Baliqchi tumani 7-son maktab» nomli soxta obyekt bo‘lib yuklanardi.
  const notice = sheet.addRow([]);
  notice.getCell(1).value =
    '⬆ 2-QATOR — NAMUNA. Uni o‘chiring va o‘z ma’lumotlaringizni 2-qatordan boshlab kiriting.';
  notice.getCell(1).font = {
    bold: true,
    size: 11,
    color: { argb: 'FFAC1730' },
  };
  sheet.mergeCells(
    notice.number,
    1,
    notice.number,
    Math.min(6, COLUMN_SPECS.length),
  );

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMN_SPECS.length },
  };

  /* ───────────────────────── 2. Ma’lumotnoma ───────────────────────── */
  const ref = workbook.addWorksheet('Ma’lumotnoma');
  ref.columns = [
    { width: 26 },
    { width: 30 },
    { width: 34 },
    { width: 34 },
    { width: 28 },
    { width: 34 },
  ];

  const refHeader = ref.addRow([
    'Tumanlar',
    'Qurilish turlari',
    'Buyurtmachilar',
    'Pudratchilar',
    'Moliya manbalari',
    'Mas’ullar (email)',
  ]);
  refHeader.font = { bold: true, size: 11, color: { argb: INK } };
  refHeader.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: OPTIONAL_BG },
    };
  });

  const columns: string[][] = [
    refs.districts,
    refs.types,
    refs.customers,
    refs.contractors,
    refs.fundingSources,
    refs.responsibles.map((r) => `${r.email}  —  ${r.name}`),
  ];
  const depth = Math.max(...columns.map((c) => c.length), 0);
  for (let i = 0; i < depth; i += 1) {
    ref.addRow(columns.map((column) => column[i] ?? ''));
  }

  /* ───────────────────────── 3. Yo‘riqnoma ───────────────────────── */
  const guide = workbook.addWorksheet('Yo‘riqnoma');
  guide.columns = [{ width: 4 }, { width: 110 }];
  const lines: Array<[string, string]> = [
    ['', 'OBYEKTLARNI EXCEL ORQALI YUKLASH'],
    ['', ''],
    ['1.', '«Obyektlar» varag‘idagi 2-qator — NAMUNA. Uni o‘chiring.'],
    ['2.', 'Ko‘k fonli ustunlar MAJBURIY, kulrang fonlilar ixtiyoriy.'],
    [
      '3.',
      'Tuman, tur, buyurtmachi, pudratchi va manba nomlarini «Ma’lumotnoma» varag‘idan ko‘chiring — nom AYNAN mos kelishi kerak.',
    ],
    [
      '4.',
      'Mas’ul shaxs EMAIL bilan yoziladi. Bo‘sh qoldirsangiz ham bo‘ladi — tizim ogohlantiradi va obyektni keyin biriktirasiz.',
    ],
    [
      '5.',
      'Sana: KK.OO.YYYY (masalan 01.03.2026). Excel sana katagi ham bo‘ladi.',
    ],
    [
      '6.',
      'Qiymat — faqat son, so‘mda. Bo‘shliq va vergul bilan yozsangiz ham tushuniladi.',
    ],
    [
      '7.',
      'Kenglik va uzunlik BIRGA to‘ldiriladi. Bo‘sh qolsa obyekt xaritada ko‘rinmaydi.',
    ],
    [
      '8.',
      `Bir faylda ko‘pi bilan ${MAX_IMPORT_ROWS} ta qator. Kattaroq ro‘yxatni bo‘lib yuklang.`,
    ],
    ['', ''],
    [
      '⚠',
      'YUKLASHDAN OLDIN tizim faylni TEKSHIRADI va xatolarni qator raqami bilan ko‘rsatadi.',
    ],
    [
      '⚠',
      'Bitta xato bo‘lsa ham HECH NARSA yozilmaydi — faylni tuzatib qayta yuklaysiz. Shu sababli takror yozuv paydo bo‘lmaydi.',
    ],
  ];
  for (const [mark, text] of lines) {
    const row = guide.addRow([mark, text]);
    if (!mark && text)
      row.font = { bold: true, size: 13, color: { argb: BRAND } };
    if (mark === '⚠') row.font = { bold: true, color: { argb: 'FFAC1730' } };
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
