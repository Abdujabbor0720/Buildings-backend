/**
 * OSM CHEGARALARINI GeoJSON GA AYLANTIRISH — umumiy qism.
 *
 * ⚠️ Bu mantiq IKKI skriptda kerak (`build-districts.mjs`,
 * `build-mahallas.mjs`) va nusxa ko'chirilsa, bittasidagi tuzatish
 * ikkinchisiga yetib bormasdi — chegara yig'ish esa xatoga eng moyil
 * joy: OSM relatsiyasi chegarani BO'LAKLARGA bo'lib saqlaydi va
 * ularning na tartibi, na yo'nalishi kafolatlangan.
 *
 * Manba: OpenStreetMap, ODbL 1.0 (c) OpenStreetMap hissadorlari.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Koordinata aniqligi — ~0.1 metr. Undan ortig'i faylni bekorga shishiradi. */
export const PRECISION = 6;
export const round = (v) => Number(v.toFixed(PRECISION));

/**
 * ⚠️ Bir nechta oyna: rasmiy server tez-tez «at capacity» qaytaradi va
 * bitta manzilga bog'lanib qolish skriptni ishlamaydigan qiladi.
 */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/**
 * Overpass so'rovi.
 *
 * ⚠️ `OSM_CACHE` muhit o'zgaruvchisi bilan mahalliy nusxadan o'qiydi:
 * javob bir necha megabayt va konvertatsiya qoidasini tuzatish uchun
 * har safar qayta yuklab olish ham vaqt, ham boshqalarning resursini
 * bekorga yeydi.
 */
export async function fetchOverpass(query) {
  const cache = process.env.OSM_CACHE;
  if (cache) {
    console.log(`   (mahalliy nusxadan: ${cache})`);
    return JSON.parse(readFileSync(resolve(process.cwd(), cache), 'utf8'));
  }

  let lastError = 'nomaʼlum xato';
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'buildings-geo-import/1.0',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(600_000),
        });
        if (!res.ok) {
          lastError = `${url} → HTTP ${res.status}`;
        } else {
          return await res.json();
        }
      } catch (error) {
        lastError = `${url} → ${String(error)}`;
      }
      await new Promise((r) => setTimeout(r, 15_000 * attempt));
    }
  }
  throw new Error(`Overpass javob bermadi: ${lastError}`);
}

const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/**
 * Chiziqlardan YOPIQ halqalar yig'adi.
 *
 * ⚠️ Qo'shni hududlar umumiy chiziqni BAHAM ko'radi va u bitta tomonda
 * teskari yo'nalishda bo'ladi — shuning uchun bo'laklar uchlari
 * bo'yicha ulanadi va kerak bo'lsa ag'dariladi.
 */
export function buildRings(lines) {
  const pending = lines.filter((l) => l.length >= 2).map((l) => [...l]);
  const rings = [];

  while (pending.length > 0) {
    let ring = pending.pop();
    let joined = true;
    while (joined && key(ring[0]) !== key(ring[ring.length - 1])) {
      joined = false;
      for (let i = 0; i < pending.length; i += 1) {
        const line = pending[i];
        const tail = key(ring[ring.length - 1]);
        const head = key(ring[0]);
        if (key(line[0]) === tail) ring = ring.concat(line.slice(1));
        else if (key(line[line.length - 1]) === tail)
          ring = ring.concat([...line].reverse().slice(1));
        else if (key(line[line.length - 1]) === head)
          ring = line.slice(0, -1).concat(ring);
        else if (key(line[0]) === head)
          ring = [...line].reverse().slice(0, -1).concat(ring);
        else continue;
        pending.splice(i, 1);
        joined = true;
        break;
      }
    }
    /* ⚠️ Yopilmagan halqa TASHLANMAYDI, zo'rlab yopiladi: OSM dagi bitta
       yetishmaydigan bo'lak butun hududni xaritadan o'chirib
       yuborgandan ko'ra, chekkasi bir necha metr noaniq bo'lgani
       yaxshiroq. */
    if (key(ring[0]) !== key(ring[ring.length - 1])) ring.push(ring[0]);
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Nuqta halqa ichidami (ray casting). */
export function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Nuqta ko'pburchak ichidami — teshiklar hisobga olinadi. */
export function pointInPolygon(point, rings) {
  if (!pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

export function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/**
 * HUDUDNING ICHKI NUQTASI.
 *
 * ⚠️ Og'irlik markazi (centroid) YETMAYDI: botiq (masalan, «C» shaklli)
 * hududda u ko'pburchakdan TASHQARIDA qoladi va marker qo'shni hudud
 * ustida turib qolardi. Shuning uchun markaz ichkarida ekanligi
 * tekshiriladi va bo'lmasa, eng keng gorizontal kesim o'rtasi olinadi.
 */
export function pointOnSurface(ring) {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring.slice(0, -1)) {
    cx += x;
    cy += y;
  }
  const n = ring.length - 1;
  const centroid = [cx / n, cy / n];
  if (pointInRing(centroid, ring)) return centroid;

  const ys = ring.map((p) => p[1]);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  let best = centroid;
  let width = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const span = xs[i + 1] - xs[i];
    if (span > width) {
      width = span;
      best = [(xs[i] + xs[i + 1]) / 2, y];
    }
  }
  return best;
}

/** OSM relatsiyasidan ko'pburchaklar ro'yxati (eng kattasi birinchi). */
export function relationToPolygons(relation) {
  const outerLines = [];
  const innerLines = [];
  for (const member of relation.members ?? []) {
    if (member.type !== 'way' || !member.geometry) continue;
    const line = member.geometry.map((p) => [round(p.lon), round(p.lat)]);
    if (member.role === 'inner') innerLines.push(line);
    else outerLines.push(line);
  }

  const outers = buildRings(outerLines).sort((a, b) => ringArea(b) - ringArea(a));
  const inners = buildRings(innerLines);
  if (outers.length === 0) return null;

  return outers.map((outer) => {
    const holes = inners.filter((hole) => pointInRing(hole[0], outer));
    return [outer, ...holes];
  });
}

/** `Polygon` yoki `MultiPolygon` — bittadan ko'p bo'lsa ikkinchisi. */
export function toGeometry(polygons) {
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

/** Geometriyaning chegaralovchi to'rtburchagi: `[minLng, minLat, maxLng, maxLat]`. */
export function bboxOf(features) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (c) => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      minX = Math.min(minX, c[0]);
      maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]);
      maxY = Math.max(maxY, c[1]);
      return;
    }
    if (Array.isArray(c)) c.forEach(visit);
  };
  for (const f of features) if (f.geometry) visit(f.geometry.coordinates);
  return [round(minX), round(minY), round(maxX), round(maxY)];
}

/**
 * NOMNI SOLISHTIRISH UCHUN SODDALASHTIRISH.
 *
 * ⚠️ OSM da bitta hudud nomi besh xil yoziladi: «Qoʻrgʻontepa tumani»,
 * «Qurgontepa», «Кургантепа», «Korgontepa District». Shuning uchun
 * taqqoslashdan oldin apostroflar, «tumani/shahri/district» so'zlari
 * va lotin/kirill farqlari olib tashlanadi.
 */
export function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[ʻʼ'`’‘´]/g, '')
    .replace(/̆|́/g, '')
    .replace(/ʼ/g, '')
    .replace(/\b(tumani|tuman|shahri|shahar|sh|district|city|rayon|tumanı)\b/g, '')
    .replace(/[^a-z0-9а-яё]/gi, '');
}
