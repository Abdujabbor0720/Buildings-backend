#!/usr/bin/env node
/**
 * TUMAN CHEGARALARINI OpenStreetMap'DAN YANGILASH.
 *
 *   node scripts/build-districts.mjs
 *   OSM_CACHE=./dgeom.json node scripts/build-districts.mjs
 *
 * Natija: `src/database/seeds/data/andijon-districts.geojson`.
 *
 * ⚠️ FAQAT GEOMETRIYA YANGILANADI. `code`, `name`, `shortName`,
 * `soato`, `kind`, `regionCode`, `centerLat/Lng` — TEGILMAYDI: ular
 * bazada ham bor va obyektlar, hisobotlar, ruxsatlar aynan `code`
 * bo'yicha bog'langan. Nomni OSM dan olish bitta imlo farqi tufayli
 * butun tumanni «yo'q» qilib qo'yardi.
 *
 * ⚠️ MOS KELMAGAN TUMAN O'CHIRILMAYDI. OSM da topilmasa, eski
 * chegara JOYIDA qoladi va hisobotda ogohlantirish bo'lib chiqadi.
 * Aks holda bitta muvaffaqiyatsiz so'rov xaritadan tuman yo'qotardi.
 *
 * NEGA KERAK: fayldagi chegaralar juda qo'pol edi (Xonobod shahri —
 * atigi 6 nuqta, Andijon shahri — 15). Mahallani tumanga biriktirish
 * aynan shu ko'pburchaklar bo'yicha bajariladi va qo'pol chegara
 * tufayli mahallalarning katta qismi «hech qaysi tumanga tushmadi»
 * bo'lib qolardi.
 *
 * Manba: OpenStreetMap, ODbL 1.0 (c) OpenStreetMap hissadorlari.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bboxOf,
  fetchOverpass,
  normalizeName,
  pointOnSurface,
  relationToPolygons,
  toGeometry,
} from './lib/osm-geo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../src/database/seeds/data');
const FILE = resolve(DATA, 'andijon-districts.geojson');

/** Andijon viloyatini qoplaydigan to'rtburchak. */
const BBOX = '40.40,71.47,41.07,73.14';

const QUERY = `[out:json][timeout:600];
rel["boundary"="administrative"]["admin_level"="6"](${BBOX});
out geom;`;

/**
 * Nomlar mos kelmaganda ishlatiladigan qo'lda moslash.
 *
 * ⚠️ Faqat OSM dagi yozilish boshqacha bo'lgan holatlar uchun. Yangi
 * qator qo'shishdan oldin OSM dagi nomni tekshiring — ehtimol u
 * o'zgargan va bu jadval keraksiz.
 */
const ALIASES = {
  andijon_sh: ['andijan', 'andijon'],
  xonobod_sh: ['xonobod', 'hanabad', 'xonabad'],
  qorgontepa: ['qurgontepa', 'kurgontepa', 'korgontepa'],
  jalaquduq: ['jalalkuduk', 'jalolquduq', 'jalaquduq'],
  /*
   * ⚠️ Boʻz tumani 2019-yilda RASMAN «Boʻston tumani» deb
   * oʻzgartirilgan (O'zR qonuni, 30.09.2019). OSM yangi nomda, bazadagi
   * `code` esa tarixiy sabablarga koʻra `boz` boʻlib qoladi: kod
   * obyektlar va hisobotlarni bogʻlaydi va uni oʻzgartirish eski
   * havolalarni uzardi.
   */
  boz: ['buz', 'boz', 'boston', 'buston'],
  ulugnor: ['ulugnor', 'ulugnar'],
  oltinkol: ['oltinkul', 'altinkul'],
  xojaobod: ['xojaobod', 'hojaobod', 'xodjaabad'],
  buloqboshi: ['buloqboshi', 'bulokboshi'],
  paxtaobod: ['paxtaobod', 'pakhtaabad'],
  shahrixon: ['shahrixon', 'shaxrixon'],
};

/** Ikki nuqta orasidagi masofa, darajada (taxminiy — faqat taqqoslash uchun). */
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * ⚠️ Nom MOS KELSA HAM markaz uzoq bo'lsa — rad etiladi. Qo'shni
 * viloyatlarda bir xil nomli tuman bo'lishi mumkin va bbox ularni ham
 * qamrab oladi; nomgina bo'yicha moslansa, Andijon tumanining o'rniga
 * boshqa viloyatning chegarasi yozilib ketardi.
 */
const MAX_CENTER_DRIFT = 0.35;

const file = JSON.parse(readFileSync(FILE, 'utf8'));

console.log('⬇️  OpenStreetMap dan tuman chegaralari so‘ralmoqda…');
const osm = await fetchOverpass(QUERY);
const relations = (osm.elements ?? []).filter(
  (e) => e.type === 'relation' && e.tags?.admin_level === '6',
);
console.log(`   ${relations.length} ta tuman darajasidagi relatsiya keldi`);

/** OSM relatsiyalari — nomi va ichki nuqtasi bilan. */
const candidates = [];
for (const relation of relations) {
  const polygons = relationToPolygons(relation);
  if (!polygons) continue;
  const names = [
    relation.tags['name:uz'],
    relation.tags.name,
    relation.tags['name:en'],
    relation.tags.official_name,
  ]
    .filter(Boolean)
    .map(normalizeName);
  candidates.push({
    relation,
    polygons,
    names: new Set(names),
    center: pointOnSurface(polygons[0][0]),
  });
}

let updated = 0;
const missed = [];

for (const feature of file.features) {
  const p = feature.properties;
  const wanted = new Set([
    normalizeName(p.name),
    normalizeName(p.shortName),
    ...(ALIASES[p.code] ?? []).map(normalizeName),
  ]);
  const storedCenter = [p.centerLng, p.centerLat];

  const match = candidates
    .filter((c) => [...c.names].some((n) => n && wanted.has(n)))
    .filter((c) => distance(c.center, storedCenter) <= MAX_CENTER_DRIFT)
    .sort((a, b) => distance(a.center, storedCenter) - distance(b.center, storedCenter))[0];

  if (!match) {
    missed.push(p.code);
    continue;
  }

  feature.geometry = toGeometry(match.polygons);
  // ⚠️ `osmId` saqlanadi: keyingi yig'ishda nom bo'yicha qidirmasdan
  // to'g'ridan-to'g'ri solishtirish mumkin bo'ladi va tekshiruv oson.
  p.osmId = match.relation.id;
  updated += 1;
}

file.bbox = bboxOf(file.features);
file.attribution =
  'OpenStreetMap hissadorlari, ODbL 1.0 — boundary=administrative, admin_level=6. ' +
  `Yangilangan: ${new Date().toISOString().slice(0, 10)}. ` +
  'Faylni QO‘LDA tahrirlamang: `node scripts/build-districts.mjs`.';

writeFileSync(FILE, `${JSON.stringify(file, null, 0)}\n`, 'utf8');

console.log(`\n✅ ${updated}/${file.features.length} ta tuman chegarasi yangilandi`);
for (const f of file.features) {
  const g = f.geometry;
  const rings = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const points = rings.reduce((s, poly) => s + poly.reduce((t, r) => t + r.length, 0), 0);
  const flag = missed.includes(f.properties.code) ? '⚠️  (eski chegara qoldi)' : '';
  console.log(`   ${f.properties.code.padEnd(14)} ${String(points).padStart(6)} nuqta ${flag}`);
}
if (missed.length > 0) {
  console.log(
    `\n⚠️  OSM da topilmadi: ${missed.join(', ')} — ular ESKI chegara bilan qoldi.`,
  );
}
