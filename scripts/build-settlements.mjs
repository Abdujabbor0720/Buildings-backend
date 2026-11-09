#!/usr/bin/env node
/**
 * AHOLI PUNKTLARI (shahar, shaharcha, qishloq) — OpenStreetMap'dan.
 *
 *   node scripts/build-settlements.mjs
 *   OSM_CACHE=./pl.json node scripts/build-settlements.mjs
 *
 * Natija: `src/database/seeds/data/andijon-settlements.geojson`.
 *
 * ⚠️ NEGA KERAK. OSM da mahalla (MFY) chegarasi faqat Andijon shahri
 * va Andijon tumani uchun chizilgan; qolgan 14 tumanda sub-tuman
 * darajasidagi ma'muriy chegara UMUMAN YO'Q (`admin_level` 8, 9, 10
 * — relatsiya ham, chiziq ham: 0 ta). Bunday tumanda xarita bo'm-bo'sh
 * ko'pburchakka aylanib qolardi: obyekt nuqtalari bor, lekin ular
 * QAYERDA ekani bilinmasdi.
 *
 * ⚠️ BU CHEGARA EMAS, MO'LJAL. Aholi punkti — NUQTA va u ma'muriy
 * birlik sifatida ishlatilmaydi: obyektlar unga biriktirilmaydi,
 * hisobotda kesim bo'lmaydi. U faqat xaritada «Oxunboboyev»,
 * «Eshonobod» degan yozuv bo'lib turadi va hokim obyekt qayerda
 * ekanini tushunadi. Soxta chegara chizishdan ATAYLAB voz kechilgan.
 *
 * ⚠️ `suburb` OLINMAYDI: u shahar ichidagi massiv va Andijon shahrida
 * mahalla chegaralari allaqachon bor — ikkalasi bir ekranda yozuvlar
 * to'qnashuviga olib kelardi.
 *
 * Manba: OpenStreetMap, ODbL 1.0 (c) OpenStreetMap hissadorlari.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOverpass, pointInPolygon, round } from './lib/osm-geo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../src/database/seeds/data');

const BBOX = '40.40,71.47,41.07,73.14';

const QUERY = `[out:json][timeout:300];
node["place"~"^(city|town|village|hamlet)$"](${BBOX});
out body;`;

/** Xaritada yozuv o'lchamini belgilaydigan daraja. */
const RANK = { city: 1, town: 2, village: 3, hamlet: 4 };

const districts = JSON.parse(
  readFileSync(resolve(DATA, 'andijon-districts.geojson'), 'utf8'),
);
const shapes = districts.features.map((f) => ({
  code: f.properties.code,
  polygons:
    f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
}));

console.log('⬇️  OpenStreetMap dan aholi punktlari so‘ralmoqda…');
const osm = await fetchOverpass(QUERY);
const nodes = (osm.elements ?? []).filter((e) => e.type === 'node' && e.tags?.name);
console.log(`   ${nodes.length} ta nuqta keldi`);

const features = [];
const perDistrict = new Map();
let outside = 0;

for (const node of nodes) {
  const point = [round(node.lon), round(node.lat)];
  const district = shapes.find((d) =>
    d.polygons.some((rings) => pointInPolygon(point, rings)),
  );
  if (!district) {
    outside += 1;
    continue;
  }

  const tags = node.tags;
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: point },
    properties: {
      // ⚠️ `name:uz` BIRINCHI: `name` ba'zi yozuvlarda ruscha keladi.
      name: tags['name:uz'] ?? tags.name,
      kind: tags.place,
      rank: RANK[tags.place] ?? 5,
      districtCode: district.code,
      osmId: node.id,
    },
  });
  perDistrict.set(district.code, (perDistrict.get(district.code) ?? 0) + 1);
}

/* ⚠️ Tartib BARQAROR: git farqi faqat haqiqiy o'zgarishni ko'rsatsin. */
features.sort(
  (a, b) =>
    a.properties.districtCode.localeCompare(b.properties.districtCode) ||
    a.properties.rank - b.properties.rank ||
    a.properties.name.localeCompare(b.properties.name, 'uz'),
);

writeFileSync(
  resolve(DATA, 'andijon-settlements.geojson'),
  `${JSON.stringify(
    {
      type: 'FeatureCollection',
      name: 'andijon-settlements',
      note:
        'Andijon viloyati aholi punktlari (shahar, shaharcha, qishloq). ' +
        'Manba: OpenStreetMap, place=city|town|village|hamlet. ' +
        'Litsenziya: ODbL 1.0 (c) OpenStreetMap hissadorlari. ' +
        `Yigʻilgan sana: ${new Date().toISOString().slice(0, 10)}. ` +
        'BU MAʼMURIY CHEGARA EMAS — xaritadagi moʻljal yozuvlari. ' +
        'Faylni QOʻLDA tahrirlamang: `node scripts/build-settlements.mjs`.',
      features,
    },
    null,
    0,
  )}\n`,
  'utf8',
);

console.log(`\n✅ ${features.length} ta aholi punkti yozildi`);
for (const d of shapes) {
  const n = perDistrict.get(d.code) ?? 0;
  console.log(`   ${n === 0 ? '⚠️ ' : '  '} ${d.code.padEnd(14)} ${String(n).padStart(4)}`);
}
if (outside > 0) console.log(`   ℹ️  ${outside} tasi viloyatdan tashqarida (bbox chekkasi)`);
