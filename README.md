# Qurilish obyektlari nazorati tizimi — Backend

Andijon viloyati hokimligi uchun qurilish obyektlarini monitoring qilish
platformasining server qismi.

**Stek:** TypeScript · NestJS 12 · PostgreSQL 18 · TypeORM 0.3

---

## 1. Tez ishga tushirish

```bash
npm install
npm run db:setup      # rol + baza + pg_trgm + migratsiya + demo ma'lumot
npm run start:dev
```

`db:setup` `sudo -u postgres` ni chaqiradi (rol va kengaytma yaratish uchun)
va parol so‘raydi. Qo‘lda qilmoqchi bo‘lsangiz:

```bash
sudo -u postgres psql \
  -c "CREATE ROLE buildings LOGIN PASSWORD 'buildings';" \
  -c "CREATE DATABASE buildings_db OWNER buildings;"
sudo -u postgres psql -d buildings_db -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

cp .env.example .env
npm run migration:run
npm run seed
```

- API: `http://localhost:3333/api/v1`
- Swagger: `http://localhost:3333/api/v1/docs`
- Health: `http://localhost:3333/api/v1/health`

⚠️ **Seed suratlarni DigitalOcean Spaces'ga yuklaydi**, shuning uchun
`.env` da `DO_*` kalitlari to‘ldirilgan bo‘lishi kerak (§4.8). Sozlanmasa
seed aniq xato bilan to‘xtaydi — jimgina yarim ishlab qolmaydi.
`OPENAI_API_KEY` esa IXTIYORIY: bo‘sh bo‘lsa suratni AI tahlil qilish
o‘chadi, qolgan hamma narsa ishlayveradi (§4.6).

### Kirish ma’lumotlari (seed yaratadi)

| Rol | Email | Parol |
|---|---|---|
| Viloyat hokimi | `hokim@andijon.uz` | `Hokim2026!` |
| Bosh administrator | `admin@shaffofqurilish.uz` | `Admin2026!` |
| Qurilish boshqarmasi | `q.boshqarma@andijon.uz` | `Boshqarma2026!` |
| Tuman mas’uli | `baliqchi.tuman@andijon.uz` | `Tuman2026!` |
| Kurator | `k.sobirov@andijon.uz` | `Masul2026!` |
| Pudratchi vakili | `pudrat1@aqi.uz` | `Pudrat2026!` |
| Kuzatuvchi | `kuzatuvchi@andijon.uz` | `Kuzat2026!` |

> ⚠️ Bu parollar FAQAT demo uchun. Prod'da `JWT_*` sirlari bilan birga
> albatta almashtiriladi (`openssl rand -hex 32`).

---

## 2. Buyruqlar

| Buyruq | Nima qiladi |
|---|---|
| `npm run start:dev` | Watch rejimida ishga tushirish |
| `npm run build` / `start:prod` | Prod uchun yig‘ish va ishga tushirish |
| `npm run typecheck` | Tiplarni tekshirish |
| `npm test` | Birlik testlari |
| `npm run migration:generate -- src/database/migrations/Nom` | Entity o‘zgarishidan migratsiya yasash |
| `npm run migration:run` / `migration:revert` | Migratsiyani qo‘llash / orqaga qaytarish |
| `npm run seed` | Demo ma’lumotni qayta yozish (avval tozalaydi) |
| `npm run db:reset` | Sxemani tashlab, qaytadan qurish va seed |
| `npm run db:setup` | Noldan: rol, baza, kengaytma, migratsiya, seed |

---

## 3. Arxitektura

```
src/
├─ common/          Umumiy qatlam: guard, filter, interceptor, DTO, enum, ruxsatlar
├─ config/          Konfiguratsiya, Joi validatsiyasi, TypeORM DataSource, pg turlari
├─ database/
│  ├─ entities/     24 ta jadval (bitta ro‘yxat: `entity-list.ts`)
│  ├─ migrations/   Sxema tarixi — `synchronize` HECH QACHON yoqilmaydi
│  └─ seeds/        Generator + `data/*.json` (ma’lumot KODDA emas, JSON'da)
├─ helpers/         Sof funksiyalar: sana, pul, obyekt holati formulasi
├─ utils/           Doimiylar (oy nomlari va h.k.)
└─ modules/         Domen modullari (har biri: controller + service + dto)
```

### Modullar

`auth` · `users` · `geo` · `catalogs` · `contractors` · `customers` ·
`objects` (+ bosqichlar, bajarilish) · `delays` · `files` · `photo-reports` ·
`documents` · `funding` · `notifications` · `ai` · `dashboard` · `reports` ·
`settings` · `audit` · `health`

---

## 4. Asosiy qarorlar

Quyidagilar ataylab shunday — «soddalashtirib» o‘zgartirishdan oldin sababini o‘qing.

### 4.1. Obyekt holati — formula BITTA joyda

`helpers/object-health.helpers.ts` → `evaluateObjectHealth()`.
Uni tungi cron ham, obyekt servisi ham, seed ham chaqiradi. Ikkita nusxa
bo‘lsa dashboard bir raqamni, obyekt kartasi boshqa raqamni ko‘rsatardi.

**`delayDays` — «muddat o‘tdimi» EMAS.** U ikkitasining kattasi:

- `overdueDays` — reja muddati o‘tgan kunlar;
- `scheduleSlipDays` — reja egri chizig‘idan necha kun ortda qolingani
  (`progressGap × davomiylik / 100`).

Sabab: muddati hali kelmagan, lekin bajarilishi rejadan ancha ortda qolgan
obyekt ham kechikayotgan hisoblanishi kerak. Faqat muddatga qaralsa, tizim
muammoni u yuz bergandan KEYIN ko‘rsatardi.

Holatlar o‘zaro inkor, yig‘indisi = jami:

| Holat | Shart |
|---|---|
| `not_started` | Boshlanmagan, reja boshlanish sanasi hali kelmagan |
| `on_schedule` | `delayDays < 7` (shovqin chegarasi) |
| `delayed` | `delayDays ≥ 7` |
| `at_risk` | `delayDays ≥ 30`, yoki muddati o‘tgan va bajarilish < 50%, yoki ≥ 3 ochiq muammo |
| `completed` | Topshirilgan |

Dashboard kartasi **«Reja asosida» = `on_schedule` + `not_started`**.

### 4.2. Yil oralig‘i — DASTUR DAVRI

`yearFrom`/`yearTo` obyektning **davri bilan kesishishini** tekshiradi,
topshirish yilini emas. 2028-yilda topshiriladigan obyekt «2024–2027
dasturi» dan tushib qolmasligi kerak — unga pul aynan shu davrda ajratilgan.

### 4.3. Pul — `numeric(18,2)`, API'da string

JS `number` ga aylantirilmaydi. Yig‘indi **faqat SQL `SUM()`** bilan
olinadi; frontend faqat formatlaydi.

### 4.4. Append-only jadvallar

`object_progress_updates`, `funding_transactions`, `audit_logs` —
tahrirlanmaydi va o‘chirilmaydi. Xato yozuv teskari (kompensatsiya)
qatori bilan to‘g‘rilanadi. Moliyaviy yig‘indilar har doim daftardan
qayta hisoblanadi (`recomputeFromLedger`).

### 4.5. Sana formati

Foydalanuvchi ko‘radigan har bir sana — `21-may, 2025` ko‘rinishida,
yagona manba `helpers/date.helpers.ts`. `toLocaleDateString`,
`Intl.DateTimeFormat` va qo‘lda yig‘ilgan shablonlar taqiqlangan: natija
kod ishlayotgan muhitga bog‘liq bo‘lib qoladi.

PostgreSQL `date` ustuni drayver darajasida **string** bo‘lib qaytadi
(`config/pg-types.ts`) — `Date` ga aylantirilsa Toshkent yarim tuni
`toISOString()` da bir kun orqaga suriladi.

### 4.6. AI — IKKI MUSTAQIL TEKSHIRUV

Foto-hisobotni bir-birini almashtirmaydigan ikkita tekshiruv baholaydi.

**1) Qoidalar dvigateli — METAMA’LUMOT** (`rule-engine-v1`,
`modules/photo-reports/photo-verification.helpers.ts`). Surat qachon
olingan, obyektdan qancha uzoqda, foiz qanchaga sakragan. Suratning
ichiga qaramaydi. Neyron tarmoq EMAS va interfeys buni yashirmaydi:
har xulosa kirish ma’lumotlarini `details` ichida olib yuradi.

**2) Model — SURATNING O‘ZI** (`modules/ai/vision/`). Suratga qarab
qurilishning necha foizi haqiqatan bajarilganini baholaydi.

| Fayl | Vazifasi |
|---|---|
| `photo-vision.prompt.ts` | ko‘rsatma va javob sxemasi (mahsulot qarori, kod emas) |
| `photo-vision.service.ts` | OpenAI chaqiruvi, javobni tozalash, xatoni tasniflash |
| `photo-vision.runner.ts` | navbat, cron, qayta urinish |
| `vision-verdict.helpers.ts` | ikki natijani birlashtirish (testlar bilan) |

Asosiy qarorlar:

- **Model hisobotdagi foizni BILMAYDI.** Aks holda u shu raqamga moslab
  javob berardi (anchoring) va tekshiruv ma’nosiz bo‘lardi. Taqqoslash
  keyin, kodda bajariladi.
- **Aniq bitta son emas, ORALIQ.** Suratdan 58% ni 61% dan ajratib
  bo‘lmaydi; «52–64%» halol va qaror uchun yetarli. Hisobotdagi foiz
  oraliqqa tushsa — e’tiroz yo‘q.
- **Tahlil so‘rov ichida KUTILMAYDI.** Model 5–30 soniya javob beradi;
  so‘rovni ushlab tursak, qurilish maydonidagi sekin internetda ilova
  «javob kelmadi» deb hisoblab, odam suratni qayta-qayta yuborardi.
  Navbat BAZADA (`ai_vision_status`), xotirada emas — server qayta ishga
  tushsa ham hisobot yo‘qolmaydi, cron uni topadi (har 10 daqiqada).
- **Xato TASNIFLANADI.** 429 va 5xx — qayta uriniladi; «kalit yaroqsiz»,
  «kredit tugagan», «format mos emas» — QAYTA URINILMAYDI va sabab
  foydalanuvchiga ko‘rsatiladi. Aks holda tizim har 10 daqiqada bir xil
  xatoni takrorlab turardi.
- **Sifatsiz surat qarorga ta’sir qilmaydi.** Loyqa suratga tayanib
  hisobotni rad etish — eng yomoni: ish qilgan odam ayblanib qolardi.
- **Kam ko‘rsatish oshirib yozishdan yumshoq jazolanadi** — ehtiyotkorlik
  firibgarlik emas.
- **Yakuniy qarorni ODAM qabul qiladi** (`photos.moderate`). Model faqat
  ishonchni pasaytiradi va «ko‘rib chiqilsin» deb belgilaydi.

Kalit bo‘lmasa yoki `AI_VISION_ENABLED=false` bo‘lsa, modul jim o‘chadi
va qoidalar dvigateli ishlayveradi — fayl yuklash va hisobot yaratish
hech qanday ta’sirlanmaydi.

### 4.7. Ruxsatlar

`common/constants/permissions.ts` — rol → ruxsatlar jadvali. Guard'lar
**global**: endpoint sukut bo‘yicha YOPIQ, ochiqlari `@Public()` bilan
aniq belgilanadi.

Ro‘yxatlarda ruxsatdan tashqari **ko‘rish doirasi** ham bor
(`ObjectsService.applyScope`): pudratchi faqat o‘z obyektlarini, tuman
mas’uli faqat o‘z tumanini ko‘radi.

### 4.8. FAYL SAQLASH — DigitalOcean Spaces

⚠️ **Lokal `uploads/` papkasi YO‘Q va qaytarilmaydi.** Fayl ilova diskida
saqlansa: bir nechta server nusxasida u faqat bittasida bo‘lardi,
konteyner qayta yaratilganda yo‘qolardi, zaxira nusxa esa ilova diskiga
bog‘lanib qolardi.

| Nima | Qiymat |
|---|---|
| Chegara | **100 MB** (`UPLOAD_MAX_MB`) |
| Rasm | JPG, PNG, WEBP, GIF, HEIC, BMP |
| Video | MP4, MOV, WEBM, AVI |
| Hujjat | PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV, TXT, DWG, ZIP |

**Xavfsizlik qarorlari:**

- **Tur MAZMUNDAN aniqlanadi** (`storage/file-type.helpers.ts`), mijoz
  yuborgan `Content-Type` dan EMAS. HTML faylni `image/jpeg` deb yuborib
  bo‘ladi; fayl ochiq bucket'da turgani uchun bu saqlangan XSS yoki
  fishing sahifasiga aylanardi. Obyektga ANIQLANGAN tur yoziladi.
- **SVG BUTUNLAY qabul qilinmaydi** — ichida `<script>` saqlay oladigan
  yagona «rasm» formati. Demo suratlar ham PNG.
- **Faqat rasm, video va PDF `inline`**; qolgani `attachment` bilan
  saqlanadi va brauzerda sahifa sifatida ochilmaydi.
- **Nom mijozdan olinmaydi** — kalit `UUID`, kengaytma aniqlangan turdan.
- **Hajm ikki bosqichda**: `Content-Length` bo‘yicha DARHOL (413, bayt
  uzatilmasdan) va oqim davomida bayt sanog‘i bilan.

**Oqim bilan yuklash:** fayl na xotiraga, na diskka to‘liq yig‘ilmaydi.
`SpacesStorageEngine` birinchi 4 KB dan turni aniqlaydi (mos kelmasa
qolgan 99 MB umuman yuborilmaydi), keyin `@aws-sdk/lib-storage` bilan
8 MB lik bo‘laklarda Spaces'ga uzatadi. `memoryStorage` bilan to‘rtta
parallel 100 MB lik yuklov ~400 MB uyum talab qilardi.

**Havola:** bucket ochiq bo‘lsa (`DO_BUCKET_PUBLIC_BASE_URL`) — fayl
to‘g‘ridan-to‘g‘ri CDN'dan beriladi va serverimizdan o‘tmaydi.
`GET /files/:storedName` esa 302 bilan o‘sha manzilga yo‘naltiradi
(eski havolalar ishlayversin). Bucket yopiq bo‘lsa — har so‘rovda
muddatli imzolangan havola (`DO_SIGNED_URL_TTL`).

### 4.9. Tungi passlar (Asia/Tashkent)

| Vaqt | Nima |
|---|---|
| 02:00 | Obyektlar holatini qayta hisoblash (kechikish kun o‘tishi bilan o‘sadi) |
| 02:30 | Bildirishnomalar (holat yangilangandan KEYIN) |
| 03:00 | AI tahlil (ikkalasidan keyin) |
| Haftada | Eski bildirishnomalarni tozalash |

---

## 5. API shartnomasi

Barcha javoblar bitta konvertda:

```jsonc
{ "success": true, "data": …, "meta": { /* sahifalashda */ }, "timestamp": "…" }
```

Xatolar:

```jsonc
{
  "success": false,
  "statusCode": 400,
  "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] },
  "path": "/api/v1/objects",
  "timestamp": "…"
}
```

Xato xabarlari **o‘zbekcha** — ular to‘g‘ridan-to‘g‘ri foydalanuvchiga
ko‘rsatiladi.

---

## 6. Demo ma’lumot

`src/database/seeds/data/` ichida — **JSON fayllarda, kodda emas**:

| Fayl | Nima |
|---|---|
| `andijon-districts.geojson` | 16 ta tuman/shahar chegarasi (geoBoundaries, CC BY 3.0 IGO) |
| `distribution.json` | Taqsimot mo‘ljallari: 195 obyekt, 142/38/15, 87/68/40 … |
| `object-templates.json` | Obyekt nomi shablonlari, narx va quvvat oraliqlari |
| `featured-objects.json` | Maketdagi aniq qatorlar (TOP-5, foto-hisobotlar) |
| `construction-types.json`, `funding-sources.json`, `delay-reasons.json` | Kataloglar |
| `customers.json`, `contractors.json`, `users.json` | Tashkilotlar va foydalanuvchilar |

Generator (`object-generator.ts`) bajarilish foizini **mo‘ljallangan
kechikishdan teskari hisoblaydi** va natijani haqiqiy formula bilan
tekshirib to‘g‘rilaydi — shu tufayli seed'dan keyin dashboard raqamlari
mo‘ljalga ANIQ tushadi. Seed oxirida o‘zini tekshiradi va mos kelmagan
ko‘rsatkichni ko‘rsatadi.

Suratlar — generatsiya qilingan SVG (`placeholder-image.ts`): repozitoriy
rasmlar bilan shishmasligi va seed internetga chiqmasligi uchun.

---

## 7. Migratsiya yaratishda ⚠️

`pg_trgm` indekslari **ataylab** `COALESCE(ustun, '')` ifodasi ustida
qurilgan (`SearchIndexes` migratsiyasi). Sabab: TypeORM `migration:generate`
bazadagi USTUN indekslarini entity metadata bilan solishtiradi va o‘zi
bilmaganini oddiy B-tree bilan almashtirib yuboradi — qidiruv esa jimgina
sekinlashadi. Ifoda indekslarini u ko‘rmaydi.

Shuning uchun qidiruv SO‘ROVLARI ham aynan shu ifoda bilan yoziladi:

```ts
`COALESCE(o.name, '') ILIKE :search`   // ✅ indeks ishlaydi
`o.name ILIKE :search`                 // ❌ butun jadval ko‘rib chiqiladi
```

`migration:generate` dan keyin natija bo‘sh bo‘lishi kerak
(«No changes in database schema were found»). Bo‘sh bo‘lmasa — entity
va migratsiya ajralib ketgan.

---

## 8. Deploy

### 8.1. Bazani tayyorlash (bir marta, serverda)

```bash
sudo DB_USERNAME=buildings \
     DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')" \
     DB_NAME=buildings_db \
     bash scripts/provision-db.sh
```

Skript rolni yaratadi (bor bo'lsa parolini yangilaydi), bazani va
`pg_trgm` kengaytmasini o'rnatadi, so'ng **parol haqiqatan ishlashini
tekshiradi**.

⚠️ `scripts/setup-db.sh` — faqat LOKAL ishlab chiqish uchun: uning
oxirida `npm run seed` bor va u jadvallarni `TRUNCATE` qiladi.

⚠️ `pg_trgm` ni oddiy foydalanuvchi o'rnata olmaydi. Busiz
`SearchIndexes` migratsiyasi «permission denied to create extension»
bilan yiqiladi — shuning uchun u superuser orqali oldindan qo'yiladi.

### 8.2. Build va start

Tayyor nginx namunasi: **`deploy/nginx.example.conf`** (izohlar bilan).

```bash
npm ci --include=dev && npm run build && npm run migration:run   # build
npm run start:prod                                               # start
```

⚠️ **`npm run seed` deployga QO'YILMAYDI** — u jadvallarni `TRUNCATE`
qiladi. Faqat bir marta, qo'lda.

⚠️ **Nginx `client_max_body_size` — 110M.** Standart qiymat 1 MB va
usiz 100 MB lik fayl Node'ga yetib bormasdan, proksi darajasida `413`
oladi. Ilova jurnalida esa hech narsa ko'rinmaydi — shuning uchun bu
xatoning sababini topish qiyin.

⚠️ **Muhit o'zgaruvchilari majburiy.** `Joi` ularni tekshiradi va
yetishmasa server ATAYLAB ishga tushmaydi (§1). Yarim sozlangan holatda
ishlagan server eng yomoni: xato runtime'da, so'rov o'rtasida chiqadi.

---

## 9. Keyingi bosqich uchun eslatmalar

- Fayllar DigitalOcean Spaces‘da (§4.8) — lokal `uploads/` papkasi yo‘q,
  shuning uchun bir nechta instansiya muammosiz ishlaydi.
- `pg_trgm` indekslari qidiruv uchun (`SearchIndexes` migratsiyasi).
- Rate limit global (`THROTTLE_*`), login alohida qattiqroq: 10/min.
