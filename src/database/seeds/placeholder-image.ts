import { deflateSync } from 'node:zlib';

/**
 * DEMO SURATLAR.
 *
 * ⚠️ RASTER PNG, SVG EMAS. Sabab texnik va muhim: foto-hisobotni AI
 * tahlil qiladi, vision modellari esa SVG ni QABUL QILMAYDI. SVG bilan
 * demo ma’lumotdagi har bir hisobot «tahlil qilib bo‘lmaydi» bo‘lib
 * qolardi va butun AI oqimini ko‘rib bo‘lmasdi.
 *
 * ⚠️ Tashqi kutubxona YO‘Q (`sharp`, `canvas` kabi): ular nativ modul,
 * ularni CI va Docker'da qurish kerak bo‘lardi. PNG formati oddiy —
 * Node'ning o‘z `zlib` i bilan to‘g‘ridan-to‘g‘ri yoziladi.
 *
 * ⚠️ Surat ATAYLAB sxematik: demo ma’lumotni haqiqiy fotodan ajratib
 * turadi. Ranglar bo‘g‘iq (beton, g‘isht, po‘lat) — to‘yingan gradientlar
 * fotoarxiv sahifasini rang namunalari to‘plamiga aylantirardi.
 */

const WIDTH = 640;
const HEIGHT = 420;

type Rgb = [number, number, number];

interface Palette {
  skyTop: Rgb;
  skyBottom: Rgb;
  ground: Rgb;
  structure: Rgb;
  structureDark: Rgb;
  crane: Rgb;
}

const PALETTES: Palette[] = [
  // beton
  {
    skyTop: [168, 186, 203],
    skyBottom: [205, 214, 222],
    ground: [124, 118, 108],
    structure: [176, 172, 165],
    structureDark: [138, 134, 128],
    crane: [196, 150, 62],
  },
  // g‘isht / loy
  {
    skyTop: [186, 190, 198],
    skyBottom: [216, 214, 208],
    ground: [118, 102, 86],
    structure: [168, 124, 92],
    structureDark: [132, 96, 70],
    crane: [190, 148, 70],
  },
  // po‘lat
  {
    skyTop: [150, 170, 190],
    skyBottom: [198, 210, 220],
    ground: [110, 112, 112],
    structure: [150, 160, 168],
    structureDark: [116, 126, 134],
    crane: [180, 146, 76],
  },
  // tuproq / o‘simlik
  {
    skyTop: [176, 192, 196],
    skyBottom: [212, 218, 212],
    ground: [108, 114, 80],
    structure: [164, 166, 148],
    structureDark: [128, 132, 112],
    crane: [188, 152, 68],
  },
  // asfalt
  {
    skyTop: [158, 168, 178],
    skyBottom: [202, 208, 214],
    ground: [92, 94, 98],
    structure: [146, 146, 150],
    structureDark: [112, 112, 118],
    crane: [184, 144, 66],
  },
  // keramika
  {
    skyTop: [182, 184, 192],
    skyBottom: [214, 212, 210],
    ground: [120, 104, 96],
    structure: [172, 142, 130],
    structureDark: [136, 110, 100],
    crane: [192, 150, 72],
  },
];

export interface PlaceholderOptions {
  title: string;
  subtitle: string;
  variant: number;
  /**
   * Bajarilish, 0–100. Suratdagi bino BALANDLIGINI belgilaydi —
   * ⚠️ shu tufayli demo surat hisobotdagi foizga MOS bo‘ladi va AI
   * tahlili mazmunli natija beradi.
   */
  progressPercent?: number;
  width?: number;
  height?: number;
}

class Canvas {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 3);
  }

  set(x: number, y: number, [r, g, b]: Rgb): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const offset = (y * this.width + x) * 3;
    this.data[offset] = r;
    this.data[offset + 1] = g;
    this.data[offset + 2] = b;
  }

  rect(x0: number, y0: number, w: number, h: number, color: Rgb): void {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) this.set(x, y, color);
    }
  }

  /** Vertikal gradient — osmon uchun. */
  gradient(y0: number, y1: number, from: Rgb, to: Rgb): void {
    const span = Math.max(1, y1 - y0);
    for (let y = y0; y < y1; y += 1) {
      const t = (y - y0) / span;
      const color: Rgb = [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
      ];
      for (let x = 0; x < this.width; x += 1) this.set(x, y, color);
    }
  }

  /** Qalinroq chiziq — kran va karkas uchun. */
  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: Rgb,
    thickness = 3,
  ): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const half = Math.floor(thickness / 2);
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      for (let dy = -half; dy <= half; dy += 1) {
        for (let dx = -half; dx <= half; dx += 1)
          this.set(x + dx, y + dy, color);
      }
    }
  }
}

export function buildPlaceholderPng(opts: PlaceholderOptions): Buffer {
  const width = opts.width ?? WIDTH;
  const height = opts.height ?? HEIGHT;
  const palette = PALETTES[Math.abs(opts.variant) % PALETTES.length];
  const progress = Math.max(0, Math.min(100, opts.progressPercent ?? 50));

  const canvas = new Canvas(width, height);
  const groundY = Math.round(height * 0.78);

  canvas.gradient(0, groundY, palette.skyTop, palette.skyBottom);
  canvas.rect(0, groundY, width, height - groundY, palette.ground);

  /*
   * Bino balandligi bajarilishga bog‘liq: 10% da faqat poydevor,
   * 100% da to‘liq bino + tom. Shu tufayli surat hisobotdagi foizni
   * HAQIQATAN aks ettiradi va AI tahlili ma’noli bo‘ladi.
   */
  const maxBody = Math.round(height * 0.52);
  const bodyHeight = Math.max(12, Math.round((maxBody * progress) / 100));
  const bodyTop = groundY - bodyHeight;

  const blocks = [
    { x: 0.1, w: 0.17, scale: 0.72 },
    { x: 0.3, w: 0.24, scale: 1 },
    { x: 0.58, w: 0.15, scale: 0.62 },
    { x: 0.76, w: 0.14, scale: 0.84 },
  ];

  for (const block of blocks) {
    const bw = Math.round(width * block.w);
    const bx = Math.round(width * block.x);
    const bh = Math.round(bodyHeight * block.scale);
    const by = groundY - bh;
    canvas.rect(bx, by, bw, bh, palette.structure);

    // Qavat chiziqlari — karkas taassurotini beradi.
    for (let floor = by + 22; floor < groundY; floor += 26) {
      canvas.rect(bx, floor, bw, 2, palette.structureDark);
    }
    // Soya tomoni
    canvas.rect(bx + bw - 6, by, 6, bh, palette.structureDark);
  }

  // Tom faqat ish deyarli tugaganda paydo bo‘ladi.
  if (progress >= 55) {
    const bx = Math.round(width * 0.3);
    const bw = Math.round(width * 0.24);
    canvas.rect(bx - 6, bodyTop - 8, bw + 12, 8, palette.structureDark);
  }

  // Kran — ish davom etayotganini ko‘rsatadi.
  if (progress < 95) {
    const craneX = Math.round(width * 0.84);
    canvas.line(
      craneX,
      groundY,
      craneX,
      Math.round(height * 0.12),
      palette.crane,
      5,
    );
    canvas.line(
      Math.round(width * 0.56),
      Math.round(height * 0.17),
      Math.round(width * 0.95),
      Math.round(height * 0.17),
      palette.crane,
      5,
    );
    canvas.line(
      craneX,
      Math.round(height * 0.24),
      Math.round(width * 0.68),
      Math.round(height * 0.17),
      palette.crane,
      3,
    );
  }

  // Panjara — maydon chegarasi.
  canvas.rect(0, groundY + 14, width, 4, palette.structureDark);

  return encodePng(canvas);
}

/**
 * Minimal PNG koderi: IHDR + IDAT + IEND, rang turi 2 (RGB), 8 bit.
 * Har skanlinedan oldin filtr bayti (0 = filtrsiz) turadi.
 */
function encodePng(canvas: Canvas): Buffer {
  const { width, height, data } = canvas;

  const raw = Buffer.allocUnsafe(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    Buffer.from(data.buffer, y * width * 3, width * 3).copy(raw, rowStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit chuqurligi
  ihdr[9] = 2; // rang turi: RGB
  ihdr[10] = 0; // siqish usuli
  ihdr[11] = 0; // filtr usuli
  ihdr[12] = 0; // interlace yo‘q

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** PNG uchun CRC-32 (IEEE 802.3). Jadval bir marta hisoblanadi. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
