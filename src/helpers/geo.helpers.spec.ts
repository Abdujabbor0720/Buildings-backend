import {
  bboxOf,
  findContaining,
  pointInGeometry,
  type GeoJsonGeometry,
} from './geo.helpers';

/** Birlik kvadrat: (0,0) — (10,10). */
const SQUARE: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

/** Markazida (4,4)—(6,6) teshigi bor kvadrat. */
const WITH_HOLE: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ],
};

const TWO_PARTS: GeoJsonGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
    [
      [
        [8, 8],
        [10, 8],
        [10, 10],
        [8, 10],
        [8, 8],
      ],
    ],
  ],
};

describe('geo.helpers', () => {
  describe('pointInGeometry', () => {
    it('ichkaridagi nuqtani topadi', () => {
      expect(pointInGeometry(5, 5, SQUARE)).toBe(true);
    });

    it('tashqaridagi nuqtani rad etadi', () => {
      expect(pointInGeometry(15, 5, SQUARE)).toBe(false);
      expect(pointInGeometry(5, -1, SQUARE)).toBe(false);
    });

    /*
     * ⚠️ Teshik — ANKLAV: boshqa mahalla ichidagi hudud. Teshikka
     * tushgan obyekt tashqi mahallaga TEGISHLI EMAS, aks holda u ikki
     * marta sanalardi.
     */
    it('teshikka tushgan nuqta ichkarida HISOBLANMAYDI', () => {
      expect(pointInGeometry(5, 5, WITH_HOLE)).toBe(false);
      expect(pointInGeometry(1, 1, WITH_HOLE)).toBe(true);
    });

    it('MultiPolygon ning har bir qismini tekshiradi', () => {
      expect(pointInGeometry(1, 1, TWO_PARTS)).toBe(true);
      expect(pointInGeometry(9, 9, TWO_PARTS)).toBe(true);
      expect(pointInGeometry(5, 5, TWO_PARTS)).toBe(false);
    });

    /*
     * ⚠️ Koordinatasi yo'q obyekt — ODDIY HOL, xato emas: Excel orqali
     * yuklangan obyektga joylashuv keyinroq qo'yiladi. U shunchaki
     * hech qaysi mahallaga tegishli bo'lmaydi.
     */
    it('koordinata yoki geometriya yo‘q bo‘lsa — false', () => {
      expect(pointInGeometry(null, 5, SQUARE)).toBe(false);
      expect(pointInGeometry(5, undefined, SQUARE)).toBe(false);
      expect(pointInGeometry(5, 5, null)).toBe(false);
      expect(pointInGeometry(Number.NaN, 5, SQUARE)).toBe(false);
    });

    it('notanish geometriya turini rad etadi', () => {
      expect(
        pointInGeometry(5, 5, { type: 'Point', coordinates: [5, 5] }),
      ).toBe(false);
    });

    it('koordinata tartibi [lng, lat]', () => {
      const tall: GeoJsonGeometry = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 20],
            [0, 20],
            [0, 0],
          ],
        ],
      };
      expect(pointInGeometry(1, 15, tall)).toBe(true);
      // Teskari berilsa — tashqarida.
      expect(pointInGeometry(15, 1, tall)).toBe(false);
    });
  });

  describe('bboxOf', () => {
    it('ko‘pburchakni o‘rab turgan to‘rtburchakni qaytaradi', () => {
      expect(bboxOf(SQUARE)).toEqual([0, 0, 10, 10]);
    });

    it('MultiPolygon ning HAMMA qismini qamrab oladi', () => {
      expect(bboxOf(TWO_PARTS)).toEqual([0, 0, 10, 10]);
    });

    it('teshik chegarani kengaytirmaydi', () => {
      expect(bboxOf(WITH_HOLE)).toEqual([0, 0, 10, 10]);
    });

    it('noto‘g‘ri yoki bo‘sh geometriya — null', () => {
      expect(bboxOf(null)).toBeNull();
      expect(bboxOf({ type: 'Point', coordinates: [1, 2] })).toBeNull();
      expect(bboxOf({ type: 'Polygon' })).toBeNull();
    });
  });

  describe('findContaining', () => {
    const areas = [
      { id: 'a', geometry: TWO_PARTS },
      { id: 'b', geometry: SQUARE },
      { id: 'c', geometry: null },
    ];

    it('nuqtani o‘z ichiga olgan birinchi hududni qaytaradi', () => {
      expect(findContaining(1, 1, areas)?.id).toBe('a');
      expect(findContaining(5, 5, areas)?.id).toBe('b');
    });

    it('hech qaysi hududga tushmasa — null', () => {
      expect(findContaining(100, 100, areas)).toBeNull();
    });

    it('geometriyasi yo‘q hudud yiqitmaydi', () => {
      expect(findContaining(-5, -5, [{ id: 'c', geometry: null }])).toBeNull();
    });
  });
});
