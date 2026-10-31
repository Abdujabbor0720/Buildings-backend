/**
 * FAYL TURINI ANIQLASH — MAZMUNI BO‘YICHA.
 *
 * ⚠️ Mijoz yuborgan `Content-Type` ga ISHONILMAYDI. Uni istalgan odam
 * o‘zgartira oladi: `.html` faylni `image/jpeg` deb yuborib bo‘ladi.
 * Fayl ochiq bucket'da turgani uchun bu saqlangan XSS / fishing sahifasiga
 * aylanardi. Shuning uchun tur faylning BIRINCHI BAYTLARIDAN aniqlanadi
 * va saqlashda AYNAN shu tur yoziladi.
 *
 * ⚠️ SVG BUTUNLAY QABUL QILINMAYDI — na foydalanuvchidan, na serverdan.
 * U ichida `<script>` saqlay oladigan yagona «rasm» formati va shu sababli
 * saqlangan XSS uchun eng qulay yo‘l. Demo suratlar ham endi PNG
 * (`seeds/placeholder-image.ts`), shuning uchun istisnoga ehtiyoj yo‘q.
 */

export type FileKind = 'image' | 'video' | 'document' | 'archive';

export interface DetectedType {
  mime: string;
  ext: string;
  kind: FileKind;
  /** Brauzerda ochiq ko‘rsatish xavfsizmi (`inline`) yoki yuklab olinadimi. */
  inline: boolean;
}

/** Imzoni tekshirish uchun yetarli bosh qism. */
export const SNIFF_BYTES = 4100;

const txt = (value: string): number[] => [...value].map((c) => c.charCodeAt(0));

interface Signature {
  /** Qidiriladigan baytlar. `null` — istalgan bayt. */
  bytes: Array<number | null>;
  offset: number;
  type: DetectedType;
  /** ISO-BMFF (mp4/mov/heic) uchun qo‘shimcha brend tekshiruvi. */
  brands?: string[];
}

const IMAGE = (mime: string, ext: string): DetectedType => ({
  mime,
  ext,
  kind: 'image',
  inline: true,
});
const VIDEO = (mime: string, ext: string): DetectedType => ({
  mime,
  ext,
  kind: 'video',
  inline: true,
});
const DOC = (mime: string, ext: string): DetectedType => ({
  mime,
  ext,
  kind: 'document',
  inline: false,
});

/** PDF brauzerda ochilishi kutiladi — yagona `inline` hujjat. */
const PDF: DetectedType = {
  mime: 'application/pdf',
  ext: '.pdf',
  kind: 'document',
  inline: true,
};

const SIGNATURES: Signature[] = [
  { offset: 0, bytes: [0xff, 0xd8, 0xff], type: IMAGE('image/jpeg', '.jpg') },
  {
    offset: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    type: IMAGE('image/png', '.png'),
  },
  { offset: 0, bytes: txt('GIF8'), type: IMAGE('image/gif', '.gif') },
  { offset: 0, bytes: [0x42, 0x4d], type: IMAGE('image/bmp', '.bmp') },
  {
    offset: 0,
    bytes: [0x1a, 0x45, 0xdf, 0xa3],
    type: VIDEO('video/webm', '.webm'),
  },
  { offset: 0, bytes: txt('%PDF'), type: PDF },
  {
    offset: 0,
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    type: DOC('application/vnd.ms-excel', '.xls'),
  },
  { offset: 0, bytes: txt('AC10'), type: DOC('application/acad', '.dwg') },
];

/** ISO-BMFF konteyneri: `....ftyp<brend>`. */
const ISO_BMFF: Array<{ brands: string[]; type: DetectedType }> = [
  { brands: ['qt  '], type: VIDEO('video/quicktime', '.mov') },
  {
    brands: ['isom', 'iso2', 'mp41', 'mp42', 'mmp4', 'avc1', 'M4V ', 'dash'],
    type: VIDEO('video/mp4', '.mp4'),
  },
  {
    brands: ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'],
    type: IMAGE('image/heic', '.heic'),
  },
];

/** OOXML (`.docx`/`.xlsx`/`.pptx`) — hammasi ZIP; farqi ichidagi nomlarda. */
const OOXML: Array<{ marker: string; type: DetectedType }> = [
  {
    marker: 'word/',
    type: DOC(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.docx',
    ),
  },
  {
    marker: 'xl/',
    type: DOC(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xlsx',
    ),
  },
  {
    marker: 'ppt/',
    type: DOC(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.pptx',
    ),
  },
];

const ZIP: DetectedType = {
  mime: 'application/zip',
  ext: '.zip',
  kind: 'archive',
  inline: false,
};

/** Tizim o‘zi yaratadigan turlar — mijoz yuklovida UCHRAMAYDI. */
const TRUSTED_ONLY: Record<string, DetectedType> = {
  'image/svg+xml': {
    mime: 'image/svg+xml',
    ext: '.svg',
    kind: 'image',
    inline: true,
  },
};

function matches(head: Buffer, sig: Signature): boolean {
  if (head.length < sig.offset + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => b === null || head[sig.offset + i] === b);
}

/**
 * Faylning boshidan turini aniqlaydi.
 *
 * @param head       faylning birinchi baytlari (kamida `SNIFF_BYTES`)
 * @param declared   mijoz aytgan MIME — faqat ZIP ichini ajratishda maslahat sifatida
 * @param trusted    server o‘zi yaratgan fayl (seed) — SVG ga ruxsat beriladi
 */
export function detectFileType(
  head: Buffer,
  declared: string | undefined,
  trusted = false,
): DetectedType | null {
  if (trusted && declared && TRUSTED_ONLY[declared])
    return TRUSTED_ONLY[declared];

  for (const sig of SIGNATURES) {
    if (matches(head, sig)) return sig.type;
  }

  // ISO-BMFF: 4-baytdan `ftyp`, keyin brend.
  if (head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1');
    for (const entry of ISO_BMFF) {
      if (entry.brands.includes(brand)) return entry.type;
    }
    // Noma’lum brend — baribir video konteyner, lekin ehtiyot uchun rad etamiz.
    return null;
  }

  // RIFF: WEBP yoki AVI.
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF') {
    const form = head.subarray(8, 12).toString('latin1');
    if (form === 'WEBP') return IMAGE('image/webp', '.webp');
    if (form === 'AVI ') return VIDEO('video/x-msvideo', '.avi');
    return null;
  }

  // ZIP: OOXML hujjatimi yoki oddiy arxivmi.
  if (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  ) {
    // ⚠️ Bosh qismdagi fayl nomlari bo‘yicha: OOXML da `[Content_Types].xml`
    // dan keyin darhol `word/`, `xl/` yoki `ppt/` papkasi keladi.
    const window = head
      .subarray(0, Math.min(head.length, SNIFF_BYTES))
      .toString('latin1');
    for (const entry of OOXML) {
      if (window.includes(entry.marker)) return entry.type;
    }
    return ZIP;
  }

  // Imzosiz formatlar: faqat sof matn (CSV/TXT) va faqat e’lon qilingan bo‘lsa.
  if (declared === 'text/csv' || declared === 'text/plain') {
    if (looksLikeText(head)) {
      return declared === 'text/csv'
        ? { mime: 'text/csv', ext: '.csv', kind: 'document', inline: false }
        : { mime: 'text/plain', ext: '.txt', kind: 'document', inline: false };
    }
  }

  return null;
}

/**
 * Sof matnmi: NUL bayt yo‘q va HTML/SVG ga o‘xshamaydi.
 * ⚠️ HTML ni matn sifatida o‘tkazib yuborish — fishing sahifasini bizning
 * domenimizda joylashtirish imkonini berardi.
 */
function looksLikeText(head: Buffer): boolean {
  if (head.includes(0)) return false;
  const start = head
    .subarray(0, 512)
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  if (start.startsWith('<')) return false;
  if (/<\s*(script|html|svg|iframe|object|embed)\b/.test(start)) return false;
  return true;
}

/** Inson o‘qiydigan ro‘yxat — xato xabarida ko‘rsatiladi. */
export const ALLOWED_SUMMARY_UZ =
  'rasm (JPG, PNG, WEBP, GIF, HEIC), video (MP4, MOV, WEBM, AVI), ' +
  'hujjat (PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV, TXT, DWG) va ZIP arxiv';
