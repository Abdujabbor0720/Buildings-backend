/**
 * EXCEL ORQALI OMMAVIY YUKLASH — umumiy tiplar.
 *
 * ⚠️ XATO va OGOHLANTIRISH farqi butun modulning asosi:
 *   • XATO (`errors`)        — qator YOZILMAYDI va butun yuklash to‘xtaydi;
 *   • OGOHLANTIRISH (`warnings`) — qator yoziladi, lekin odamga aytiladi.
 *
 * Mas’ul shaxs biriktirilmagani AYNAN ogohlantirish: obyekt mas’ulsiz ham
 * mavjud bo‘lishi mumkin (keyin biriktiriladi), lekin bu holat jimgina
 * o‘tib ketmasligi kerak.
 */

/** Faylning bitta qatori — foydalanuvchi yozgan XOM matn. */
export interface RawImportRow {
  /** Excel’dagi HAQIQIY qator raqami (sarlavha 1-qator) — xatoda shu ko‘rsatiladi. */
  rowNumber: number;
  values: Record<ImportColumnKey, string>;
}

export const IMPORT_COLUMNS = [
  'name',
  'districtName',
  'typeName',
  'totalCost',
  'plannedStartDate',
  'plannedEndDate',
  'address',
  'customerName',
  'contractorName',
  'responsible',
  'fundingSourceName',
  'lat',
  'lng',
  'capacity',
  'capacityUnit',
  'floors',
  'progressPercent',
  'description',
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number];

export interface ColumnSpec {
  key: ImportColumnKey;
  /** Fayldagi sarlavha — foydalanuvchi ko‘radigan matn. */
  header: string;
  required: boolean;
  /** Shablondagi izoh satri. */
  hint: string;
  /** Shablondagi namuna qiymat. */
  example: string;
  width: number;
}

/**
 * USTUNLAR — YAGONA manba.
 *
 * ⚠️ Shablonni yaratish ham, faylni o‘qish ham SHU ro‘yxatdan boradi.
 * Ikki joyda yozilsa, shablon bir xil, tahlilchi boshqa ustunni kutadigan
 * holatga tushardi — eng ko‘p uchraydigan import xatosi aynan shu.
 */
export const COLUMN_SPECS: readonly ColumnSpec[] = [
  {
    key: 'name',
    header: 'Obyekt nomi',
    required: true,
    hint: 'Kamida 5 belgi',
    example: 'Baliqchi tumani 7-son maktab',
    width: 38,
  },
  {
    key: 'districtName',
    header: 'Tuman',
    required: true,
    hint: '«Ma’lumotnoma» varag‘idagi nomlardan biri',
    example: 'Baliqchi tumani',
    width: 18,
  },
  {
    key: 'typeName',
    header: 'Qurilish turi',
    required: true,
    hint: '«Ma’lumotnoma» varag‘idagi nomlardan biri',
    example: 'Ta’lim muassasalari',
    width: 24,
  },
  {
    key: 'totalCost',
    header: 'Qiymati (so‘m)',
    required: true,
    hint: 'Faqat son. Masalan: 21500000000',
    example: '21500000000',
    width: 18,
  },
  {
    key: 'plannedStartDate',
    header: 'Reja: boshlanishi',
    required: true,
    hint: 'KK.OO.YYYY yoki Excel sana katagi',
    example: '01.03.2026',
    width: 18,
  },
  {
    key: 'plannedEndDate',
    header: 'Reja: tugashi',
    required: true,
    hint: 'Boshlanish sanasidan keyin bo‘lishi shart',
    example: '20.12.2027',
    width: 18,
  },
  {
    key: 'address',
    header: 'Manzil',
    required: false,
    hint: 'Ixtiyoriy',
    example: 'Baliqchi tumani, Yangiobod MFY',
    width: 32,
  },
  {
    key: 'customerName',
    header: 'Buyurtmachi',
    required: false,
    hint: 'Ixtiyoriy — «Ma’lumotnoma» varag‘idan',
    example: 'Viloyat xalq ta’limi boshqarmasi',
    width: 30,
  },
  {
    key: 'contractorName',
    header: 'Pudratchi',
    required: false,
    hint: 'Ixtiyoriy — «Ma’lumotnoma» varag‘idan',
    example: '“Baliqchi Yo‘l Qurilish” MChJ',
    width: 30,
  },
  {
    key: 'responsible',
    header: 'Mas’ul shaxs (email)',
    required: false,
    hint: 'Ixtiyoriy. Bo‘sh qolsa ogohlantiriladi — keyin biriktirasiz',
    example: 'baliqchi.tuman@andijon.uz',
    width: 28,
  },
  {
    key: 'fundingSourceName',
    header: 'Moliyalashtirish manbasi',
    required: false,
    hint: 'Ixtiyoriy — «Ma’lumotnoma» varag‘idan',
    example: 'Davlat budjeti',
    width: 26,
  },
  {
    key: 'lat',
    header: 'Kenglik (lat)',
    required: false,
    hint: 'Ixtiyoriy. Bo‘sh qolsa obyekt XARITADA ko‘rinmaydi',
    example: '40.8012',
    width: 14,
  },
  {
    key: 'lng',
    header: 'Uzunlik (lng)',
    required: false,
    hint: 'Ixtiyoriy. Kenglik bilan BIRGA to‘ldiriladi',
    example: '72.0145',
    width: 14,
  },
  {
    key: 'capacity',
    header: 'Quvvat',
    required: false,
    hint: 'Ixtiyoriy, butun son',
    example: '600',
    width: 12,
  },
  {
    key: 'capacityUnit',
    header: 'Quvvat birligi',
    required: false,
    hint: 'Ixtiyoriy: ishchi o‘rni, o‘quvchi o‘rni, km, m²…',
    example: 'ishchi o‘rni',
    width: 16,
  },
  {
    key: 'floors',
    header: 'Qavatlar',
    required: false,
    hint: 'Ixtiyoriy, butun son',
    example: '3',
    width: 12,
  },
  {
    key: 'progressPercent',
    header: 'Bajarilish (%)',
    required: false,
    hint: 'Ixtiyoriy, 0–100. Bo‘sh qolsa 0',
    example: '0',
    width: 14,
  },
  {
    key: 'description',
    header: 'Izoh',
    required: false,
    hint: 'Ixtiyoriy',
    example: '',
    width: 40,
  },
];

export interface RowIssue {
  rowNumber: number;
  /** Qaysi ustun — foydalanuvchi ko‘radigan sarlavha. */
  column: string | null;
  message: string;
}

export interface ImportRowPreview {
  rowNumber: number;
  name: string;
  districtName: string;
  typeName: string;
  /** Shu qator yozilishi mumkinmi (xatosi yo‘qmi). */
  ok: boolean;
}

export interface ImportReport {
  /** Fayldagi ma’lumot qatorlari soni (sarlavhasiz). */
  totalRows: number;
  /** Yozilishi mumkin bo‘lgan qatorlar. */
  validRows: number;
  /** `true` bo‘lsa hech narsa yozilmadi — faqat tekshiruv. */
  dryRun: boolean;
  /** Haqiqatan yozilgan qatorlar soni (dryRun’da 0). */
  created: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  rows: ImportRowPreview[];
}
