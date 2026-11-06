/**
 * FAZOVIY YORDAMCHILAR — nuqta qaysi chegara ichida.
 *
 * ⚠️ PostGIS ATAYLAB ishlatilmaydi (`district.entity.ts` dagi izohga
 * qarang): chegaralar `jsonb` da saqlanadi va `ST_Contains` yo'q.
 * Shuning uchun «bu obyekt qaysi mahallada» degan savolga javob
 * DASTUR KODIDA hisoblanadi va natija `construction_objects.mahalla_id`
 * ga YOZIB QO'YILADI — har hisobotda qaytadan hisoblash 220 ta obyekt
 * × 98 ta ko'pburchakni har so'rovda aylanib chiqishni anglatardi.
 *
 * ⚠️ Bu fayl SOF: NestJS, TypeORM va hech qanday I/O yo'q. Sabab
 * amaliy — Jest moduli NestJS servislarini yuklay olmaydi (ESM),
 * shuning uchun tizimdagi butun mantiq shu shaklda testlanadi.
 */

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

/** `[lng, lat]` — GeoJSON tartibi (`lat, lng` EMAS). */
export type Position = [number, number];
type Ring = Position[];

/**
 * Nuqta halqa ichidami — NUR TASHLASH (ray casting) usuli.
 *
 * ⚠️ Chegaradagi nuqta uchun natija KAFOLATLANMAYDI (u «ichkarida» ham,
 * «tashqarida» ham bo'lishi mumkin). Bu bizning holatda muhim emas:
 * ikkita qo'shni mahalla chegarasiga aniq tushgan bino baribir
 * ikkalasidan biriga tegishli bo'ladi va qaysi biri ekani hisobotni
 * o'zgartirmaydi. Muhimi — u IKKALASIGA BIRDAN tushmasligi, buni esa
 * `findContaining` birinchi mosni qaytarib ta'minlaydi.
 */
function pointInRing(point: Position, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    // Nur gorizontal va o'ngga qarab tashlanadi: faqat `y` ni KESIB
    // o'tadigan qirralar hisobga olinadi.
    const crosses = yi > y !== yj > y;
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Nuqta bitta ko'pburchak ichidami.
 *
 * ⚠️ TESHIKLAR hisobga olinadi: GeoJSON `Polygon` ning birinchi halqasi
 * tashqi chegara, qolganlari esa TESHIK. Teshikka tushgan nuqta
 * ko'pburchakda EMAS — anklav (boshqa mahalla ichidagi hudud) aynan
 * shunday yoziladi.
 */
function pointInPolygon(point: Position, rings: Ring[]): boolean {
  if (rings.length === 0 || !pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

/**
 * Nuqta GeoJSON geometriyasi ichidami (`Polygon` yoki `MultiPolygon`).
 *
 * ⚠️ Geometriya `unknown` sifatida qabul qilinadi va ICHKARIDA
 * tekshiriladi. Sabab: u bazadan `jsonb` bo'lib keladi va TypeORM uni
 * `Record<string, unknown>` deb biladi — qat'iy tur talab qilinsa,
 * har chaqiruv joyida xavfli `as` yozishga to'g'ri kelardi.
 */
export function pointInGeometry(
  lng: number | null | undefined,
  lat: number | null | undefined,
  geometry: unknown,
): boolean {
  if (lng === null || lng === undefined || lat === null || lat === undefined)
    return false;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (!geometry || typeof geometry !== 'object') return false;

  const { type, coordinates } = geometry as Partial<GeoJsonGeometry>;
  if (!Array.isArray(coordinates)) return false;

  const point: Position = [lng, lat];

  if (type === 'Polygon') {
    return pointInPolygon(point, coordinates as Ring[]);
  }

  if (type === 'MultiPolygon') {
    return (coordinates as Ring[][]).some((rings) =>
      pointInPolygon(point, rings),
    );
  }

  return false;
}

/**
 * Nuqtani O'Z ICHIGA OLGAN birinchi hududni qaytaradi.
 *
 * ⚠️ BIRINCHI mos keluvchi — «eng kichigi» yoki «eng aniq mos
 * keluvchisi» EMAS. Ma'muriy chegaralar kesishmaydi, shuning uchun
 * amalda farq yo'q; kesishib qolgan taqdirda esa natija RO'YXAT
 * TARTIBIGA bog'liq bo'lib qoladi va shu sababli chaqiruvchi tartibni
 * barqaror (nom bo'yicha) berishi kerak.
 */
export function findContaining<T extends { geometry: unknown }>(
  lng: number | null | undefined,
  lat: number | null | undefined,
  areas: readonly T[],
): T | null {
  for (const area of areas) {
    if (pointInGeometry(lng, lat, area.geometry)) return area;
  }
  return null;
}

/**
 * Geometriyani O‘RAB TURGAN to‘rtburchak: `[minLng, minLat, maxLng, maxLat]`.
 *
 * ⚠️ Xarita AYNAN shunga moslanadi (`fitBounds`). Mijoz tomonida
 * hisoblash ham mumkin edi, lekin u holda butun chegara JSON'i
 * brauzerga yetib borguncha xarita «butun dunyo» ko‘rinishida turib,
 * keyin sakrab joyiga tushardi.
 *
 * Geometriya bo‘sh yoki noto‘g‘ri bo‘lsa — `null`.
 */
export function bboxOf(
  geometry: unknown,
): [number, number, number, number] | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const { type, coordinates } = geometry as Partial<GeoJsonGeometry>;
  if (!Array.isArray(coordinates)) return null;

  const polygons: Ring[][] =
    type === 'Polygon'
      ? [coordinates as Ring[]]
      : type === 'MultiPolygon'
        ? (coordinates as Ring[][])
        : [];
  if (polygons.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const rings of polygons) {
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/** Ikki chegarani birlashtiradi; ikkalasi ham bo‘sh bo‘lsa — `null`. */
export function unionBbox(
  a: [number, number, number, number] | null,
  b: [number, number, number, number] | null,
): [number, number, number, number] | null {
  if (!a) return b;
  if (!b) return a;
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

/**
 * Nuqtalar to‘plamini o‘rab turgan chegara.
 *
 * ⚠️ BITTA nuqta ham chegara beradi (en va bo‘yi nol) — chaqiruvchi
 * uni `unionBbox` bilan boshqasiga qo‘shadi yoki xarita o‘zi
 * minimal masshtab qo‘yadi. `null` qaytarish «nuqta yo‘q» degani.
 */
export function bboxOfPoints(
  points: ReadonlyArray<{ lat: number; lng: number }>,
): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  if (!Number.isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
}
