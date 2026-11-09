#!/usr/bin/env node
/**
 * MAHALLA (MFY) CHEGARALARINI OpenStreetMap'DAN YIG'ISH.
 *
 *   node scripts/build-mahallas.mjs
 *   OSM_CACHE=./geom.json node scripts/build-mahallas.mjs
 *
 * Natija: `src/database/seeds/data/andijon-mahallas.geojson`.
 *
 * ⚠️ AVVAL `build-districts.mjs` ISHGA TUSHIRILADI. Mahalla tumanga
 * NOM bo'yicha emas, GEOMETRIYA bo'yicha biriktiriladi va tuman
 * chegarasi qo'pol bo'lsa, mahallalarning katta qismi «hech qaysi
 * tumanga tushmadi» bo'lib qoladi — aynan shunday bo'lgan edi:
 * eski faylda Xonobod shahri 6 nuqta, Andijon shahri 15 nuqta edi va
 * 300 ta mahalladan atigi 98 tasi biriktirila olgan.
 *
 * ⚠️ NOM BO'YICHA BIRIKTIRISH IMKONSIZ: OSM da mahallada tuman tegi
 * deyarli yo'q, bor bo'lsa ham imlosi har xil.
 *
 * ⚠️ VILOYATDAN TASHQARIDAGILAR TASHLANADI: so'rov to'rtburchak
 * (bbox) bo'yicha ketadi va unga Namangan/Farg'onaning chekka
 * mahallalari ham tushadi.
 *
 * Manba: OpenStreetMap, ODbL 1.0 (c) OpenStreetMap hissadorlari.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchOverpass,
  pointInPolygon,
  pointOnSurface,
  relationToPolygons,
  round,
  toGeometry,
} from './lib/osm-geo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../src/database/seeds/data');

/** Andijon viloyatini qoplaydigan to'rtburchak. */
const BBOX = '40.40,71.47,41.07,73.14';

const QUERY = `[out:json][timeout:600];
rel["boundary"="administrative"]["admin_level"="10"](${BBOX});
out geom;`;

/* ───────────────────── Tumanni aniqlash ───────────────────── */

const districts = JSON.parse(
  readFileSync(resolve(DATA, 'andijon-districts.geojson'), 'utf8'),
);

const districtShapes = districts.features.map((f) => ({
  code: f.properties.code,
  polygons:
    f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
}));

function districtAt(point) {
  for (const d of districtShapes) {
    if (d.polygons.some((rings) => pointInPolygon(point, rings))) return d.code;
  }
  return null;
}

/**
 * MAHALLA QAYSI TUMANDA — ko'pchilik ovozi bilan.
 *
 * ⚠️ Faqat ichki nuqta tekshirilsa, chegaraga tegib turgan mahalla
 * qo'shni tumanga tushib qolardi (OSM da mahalla va tuman chegaralari
 * har doim ham bir xil chiziqdan o'tmaydi). Shuning uchun ichki nuqta
 * bilan birga chegaradagi bir necha nuqta ham tekshiriladi va eng
 * ko'p ovoz olgan tuman tanlanadi.
 */
function resolveDistrict(outerRing, interior) {
  const votes = new Map();
  const cast = (code) => {
    if (code) votes.set(code, (votes.get(code) ?? 0) + 1);
  };

  // Ichki nuqta — og'irligi katta (uch ovoz).
  const inner = districtAt(interior);
  cast(inner);
  cast(inner);
  cast(inner);

  const step = Math.max(1, Math.floor((outerRing.length - 1) / 12));
  for (let i = 0; i < outerRing.length - 1; i += step) cast(districtAt(outerRing[i]));

  let best = null;
  let bestCount = 0;
  for (const [code, count] of votes) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

/* ───────────────────────── Asosiy oqim ───────────────────────── */

console.log('⬇️  OpenStreetMap dan mahalla chegaralari so‘ralmoqda…');
const osm = await fetchOverpass(QUERY);
const relations = (osm.elements ?? []).filter((e) => e.type === 'relation');
console.log(`   ${relations.length} ta relatsiya keldi`);

const features = [];
let noGeometry = 0;
let outsideRegion = 0;
const perDistrict = new Map();

for (const relation of relations) {
  const polygons = relationToPolygons(relation);
  if (!polygons) {
    noGeometry += 1;
    continue;
  }

  const outer = polygons[0][0];
  const center = pointOnSurface(outer);
  const districtCode = resolveDistrict(outer, center);
  if (!districtCode) {
    outsideRegion += 1;
    continue;
  }

  const tags = relation.tags ?? {};
  features.push({
    type: 'Feature',
    geometry: toGeometry(polygons),
    properties: {
      code: `mfy_${relation.id}`,
      // ⚠️ `name:uz` BIRINCHI: `name` ba'zi yozuvlarda ruscha keladi.
      name: tags['name:uz'] ?? tags.name ?? `MFY ${relation.id}`,
      officialName: tags.official_name ?? null,
      districtCode,
      centerLat: round(center[1]),
      centerLng: round(center[0]),
      osmId: relation.id,
    },
  });
  perDistrict.set(districtCode, (perDistrict.get(districtCode) ?? 0) + 1);
}

/* ⚠️ Tartib BARQAROR (tuman, keyin nom): aks holda har yig'ishda
   qatorlar joy almashib, git farqi butun faylni o'zgargan deb
   ko'rsatardi va haqiqiy o'zgarishni topib bo'lmasdi. */
features.sort(
  (a, b) =>
    a.properties.districtCode.localeCompare(b.properties.districtCode) ||
    a.properties.name.localeCompare(b.properties.name, 'uz'),
);

const covered = perDistrict.size;
const output = {
  type: 'FeatureCollection',
  name: 'andijon-mahallas',
  note:
    'Andijon viloyati mahallalari (MFY) chegaralari. Manba: OpenStreetMap, ' +
    'boundary=administrative + admin_level=10, Overpass API orqali olingan. ' +
    'Litsenziya: ODbL 1.0 (c) OpenStreetMap hissadorlari. ' +
    `Yigʻilgan sana: ${new Date().toISOString().slice(0, 10)}. ` +
    `Qoplama: ${features.length} ta mahalla, ${covered}/${districtShapes.length} ta tumanda. ` +
    'Faylni QOʻLDA tahrirlamang — `node scripts/build-mahallas.mjs` bilan qayta yigʻiladi.',
  features,
};

writeFileSync(
  resolve(DATA, 'andijon-mahallas.geojson'),
  `${JSON.stringify(output, null, 0)}\n`,
  'utf8',
);

console.log(`\n✅ ${features.length} ta mahalla yozildi — ${covered}/${districtShapes.length} ta tumanda chegara bor`);
for (const d of districtShapes) {
  const n = perDistrict.get(d.code) ?? 0;
  console.log(`   ${n === 0 ? '⚠️ ' : '  '} ${d.code.padEnd(14)} ${String(n).padStart(4)}`);
}
if (noGeometry > 0) console.log(`   ℹ️  ${noGeometry} ta relatsiyada yaroqli chegara yoʻq`);
if (outsideRegion > 0) console.log(`   ℹ️  ${outsideRegion} tasi viloyatdan tashqarida (bbox chekkasi)`);
