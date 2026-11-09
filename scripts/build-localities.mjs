#!/usr/bin/env node
/**
 * AHOLI PUNKTI MAYDONLARI — tuman kesimidagi KO'RSATKICH KO'PBURCHAKLARI.
 *
 *   node scripts/build-localities.mjs
 *   OSM_CACHE=./loc.json node scripts/build-localities.mjs
 *
 * Natija: `src/database/seeds/data/andijon-localities.geojson`.
 *
 * ⚠️ BU MFY (MAHALLA) CHEGARASI EMAS va shunday deb ATALMAYDI.
 * Mahalla fuqarolar yig'inlarining rasmiy chegaralari Kadastr
 * agentligida bor (9008 ta mahalla xatlovdan o'tgan), lekin ochiq
 * ma'lumot sifatida e'lon qilinmagan: OSM da ular faqat IKKI tumanda
 * — Andijon shahri va Andijon tumanida — chizilgan. Qolgan o'n to'rt
 * tumanda mahalla chegarasi YO'Q va uni O'YLAB CHIQARISH mumkin emas:
 * hokimga soxta ma'muriy chegara ko'rsatish — eng yomon natija.
 *
 * ⚠️ SHUNING UCHUN BU YERDA BOSHQA, HAQIQIY QATLAM OLINADI: OSM da
 * chizilgan QISHLOQ VA SHAHARCHALARNING YASHASH MAYDONLARI
 * (`landuse=residential`, `place=village|town|hamlet|...`). Bular
 * ham real, ham o'lchangan: ularni xaritada ko'rsatish «bu qishloq
 * shu yerda va unda 3 ta obyekt bor» degan to'g'ri gapni aytadi.
 *
 * ⚠️ AVVAL `build-districts.mjs` ISHGA TUSHIRILADI: maydon tumanga
 * NOM bo'yicha emas, GEOMETRIYA bo'yicha biriktiriladi.
 *
 * Manba: OpenStreetMap, ODbL 1.0 (c) OpenStreetMap hissadorlari.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRings,
  fetchOverpass,
  pointInPolygon,
  pointOnSurface,
  relationToPolygons,
  ringArea,
  round,
  toGeometry,
} from './lib/osm-geo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../src/database/seeds/data');

/** Andijon viloyatini qoplaydigan to'rtburchak. */
const BBOX = '40.40,71.47,41.07,73.14';

/*
 * ⚠️ `place` MAYDONLARI ham olinadi: ba'zi qishloqlar `landuse` siz,
 * faqat `place=village` ko'pburchagi bilan chizilgan. Ikkalasi bir
 * joyda bo'lsa, kattasi qoldiriladi (pastga qarang).
 */
const QUERY = `[out:json][timeout:900];
(
  way["landuse"="residential"]["name"](${BBOX});
  relation["landuse"="residential"]["name"](${BBOX});
  way["place"~"^(city|town|village|hamlet|suburb|quarter|neighbourhood)$"]["name"](${BBOX});
  relation["place"~"^(city|town|village|hamlet|suburb|quarter|neighbourhood)$"]["name"](${BBOX});
);
out geom;`;

/* ───────────────────── Tumanni aniqlash ───────────────────── */

const districts = JSON.parse(
  readFileSync(resolve(DATA, 'andijon-districts.geojson'), 'utf8'),
).features;

function districtOf(point) {
  for (const feature of districts) {
    const g = feature.geometry;
    if (!g) continue;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polygons) {
      if (pointInPolygon(point, rings)) return feature.properties.code;
    }
  }
  return null;
}

/* ───────────────────── Element → ko'pburchak ───────────────────── */

function elementToPolygons(element) {
  if (element.type === 'relation') return relationToPolygons(element);
  if (!Array.isArray(element.geometry) || element.geometry.length < 4) return null;
  const line = element.geometry.map((p) => [round(p.lon), round(p.lat)]);
  const rings = buildRings([line]);
  if (rings.length === 0) return null;
  return rings.sort((a, b) => ringArea(b) - ringArea(a)).map((ring) => [ring]);
}

/*
 * ───────────────── AXLATNI AJRATISH ─────────────────
 *
 * ⚠️ `landuse=residential` har doim ham QISHLOQ emas. OSM da shu teg
 * bilan bitta hovli ham, zavod yotoqxonasi ham, kottej posyolkasi ham
 * chizilgan va ba'zilariga EGASINING ISMI yozib qo'yilgan: Asaka
 * tumanida «Marufjo Maxmudjonovich» va «Umidjon Ulugbek ogli» degan
 * ikkita «aholi punkti» aynan shunday paydo bo'lgan edi — ekranda
 * ikki piksellik dog' bo'lib, xaritani «faqat nuqtalar» holiga
 * keltirgan.
 */

/** Eng kichik o'lcham: ~400 m. Haqiqiy qishloq bundan kichik emas. */
const MIN_SPAN = 0.004;

/** Ism-sharifga o'xshagan nom — bu joy nomi emas, EGASI. */
const PERSON_NAME = /(\bo['ʻʼ’]?g['ʻʼ’]?li\b|\bogli\b|\bqizi\b|vich\b|ovna\b|evna\b)/i;

function spanOf(polygons) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rings of polygons)
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  return Math.max(maxX - minX, maxY - minY);
}

/**
 * ⚠️ `place=*` tegi bor maydon O'LCHAMIGA QARAMAY qoladi: unga teg
 * qo'ygan odam «bu — qishloq» deb ataylab belgilagan, demak u kichik
 * bo'lsa ham aholi punkti. Filtr faqat nom bilan chizilgan
 * `landuse=residential` uchun kerak.
 */
function isPlausibleLocality(tags, polygons) {
  if (PERSON_NAME.test(String(tags.name))) return false;
  if (tags.place) return true;
  return spanOf(polygons) >= MIN_SPAN;
}

/** Qanday turdagi maydon ekani — yozuv o'lchami shunga qarab. */
function kindOf(tags) {
  const place = tags.place;
  if (place === 'city') return 'city';
  if (place === 'town') return 'town';
  if (place === 'village') return 'village';
  if (place === 'hamlet') return 'hamlet';
  if (place) return 'quarter';
  return 'residential';
}

/* ───────────────────────────── Asosiy ───────────────────────────── */

console.log('🏘️  Aholi punkti maydonlari — OpenStreetMap\n');
const osm = await fetchOverpass(QUERY);
console.log(`   OSM dan ${osm.elements.length} ta element keldi`);

const features = [];
let skippedNoGeometry = 0;
let skippedOutside = 0;
let skippedJunk = 0;

for (const element of osm.elements) {
  const name = element.tags?.name;
  if (!name) continue;

  const polygons = elementToPolygons(element);
  if (!polygons || polygons.length === 0) {
    skippedNoGeometry += 1;
    continue;
  }

  if (!isPlausibleLocality(element.tags, polygons)) {
    skippedJunk += 1;
    continue;
  }

  const centre = pointOnSurface(polygons[0][0]);
  if (!centre) {
    skippedNoGeometry += 1;
    continue;
  }

  const districtCode = districtOf(centre);
  if (!districtCode) {
    skippedOutside += 1;
    continue;
  }

  features.push({
    type: 'Feature',
    geometry: toGeometry(polygons),
    properties: {
      code: `loc_${element.type[0]}${element.id}`,
      name: String(name).trim(),
      kind: kindOf(element.tags),
      districtCode,
      centerLat: round(centre[1]),
      centerLng: round(centre[0]),
      area: Number(ringArea(polygons[0][0]).toExponential(4)),
    },
  });
}

/*
 * ⚠️ ICHMA-ICH TUSHGAN MAYDONLAR OLIB TASHLANADI.
 *
 * Bitta qishloq ko'pincha IKKI marta chizilgan bo'ladi: `place=village`
 * ko'pburchagi va uning ichida `landuse=residential`. Ikkalasi ham
 * qolsa, kichigi kattasining ustida turib, rang va sonni ikki marta
 * ko'rsatardi — «bu yerda 3 ta obyekt» yozuvi ikki joyda chiqardi.
 * Markazi boshqa maydon ichiga tushadigan KICHIK maydon tashlanadi.
 */
features.sort((a, b) => b.properties.area - a.properties.area);
const kept = [];
let skippedNested = 0;
for (const feature of features) {
  const point = [feature.properties.centerLng, feature.properties.centerLat];
  const inside = kept.some((other) => {
    if (other.properties.districtCode !== feature.properties.districtCode) return false;
    const g = other.geometry;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polygons.some((rings) => pointInPolygon(point, rings));
  });
  if (inside) skippedNested += 1;
  else kept.push(feature);
}

kept.sort((a, b) =>
  a.properties.districtCode === b.properties.districtCode
    ? a.properties.name.localeCompare(b.properties.name, 'uz')
    : a.properties.districtCode.localeCompare(b.properties.districtCode),
);

/* `area` faqat saralash uchun kerak edi — faylga yozilmaydi. */
for (const feature of kept) delete feature.properties.area;

const out = { type: 'FeatureCollection', features: kept };
writeFileSync(
  resolve(DATA, 'andijon-localities.geojson'),
  `${JSON.stringify(out)}\n`,
);

const byDistrict = new Map();
for (const f of kept) {
  byDistrict.set(
    f.properties.districtCode,
    (byDistrict.get(f.properties.districtCode) ?? 0) + 1,
  );
}

console.log(`\n✅ ${kept.length} ta maydon yozildi`);
console.log(
  `   tashlandi: ${skippedOutside} ta viloyatdan tashqarida, ` +
    `${skippedJunk} ta juda kichik/ism-sharif, ` +
    `${skippedNested} ta ichma-ich, ${skippedNoGeometry} ta geometriyasiz`,
);
for (const code of districts.map((d) => d.properties.code)) {
  console.log(`   ${code.padEnd(12)} ${String(byDistrict.get(code) ?? 0).padStart(4)}`);
}
