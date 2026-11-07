import type { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { fullName, shortName } from '../../helpers/person-name.helpers';

/**
 * OBYEKT JOYLASHUVI VA MAS'ULI — SHARTNOMA, YAGONA MANBA.
 *
 * Obyekt tizimda o‘n to‘rt xil ekranda ko‘rinadi: ro‘yxat, xarita,
 * kechikishlar, fotoarxiv, hujjatlar, kalendar, moliyalashtirish, AI
 * tahlili, pudratchi kartasi, ko‘rsatkich sahifalari… Har birida
 * «qayerda joylashgan» va «kim javobgar» degan ikki savol bir xil
 * javobni berishi kerak.
 *
 * ⚠️ MAYDON NOMLARI HAMMA ENDPOINTDA AYNI. Ilgari dashboard
 * `responsibleName` deb yuborardi, obyektlar ro‘yxati esa butun
 * `responsible` obyektini — mijozda ikkita boshqa-boshqa o‘qish
 * mantig‘i paydo bo‘lardi va bittasi, albatta, «J. Karimov» o‘rniga
 * «Jahongir Karimov» chiqarardi.
 *
 * ⚠️ `null` — XATO EMAS, MA'LUMOT TO‘LIQ EMAS. Mas'uli biriktirilmagan
 * obyekt ro‘yxatdan TUSHIB QOLMAYDI: aksincha, u eng muhim qator —
 * ekranda ochiq «biriktirilmagan» deb aytiladi.
 */
export interface ObjectBrief {
  /** Ko‘chadagi manzil. `null` — kiritilmagan. */
  address: string | null;
  /** Xarita koordinatasi. Ikkalasi ham bo‘lsagina nuqta chiziladi. */
  lat: number | null;
  lng: number | null;

  responsibleId: string | null;
  /** «J. Karimov» — jadval katagi uchun ixcham shakl. */
  responsibleName: string | null;
  /** «Karimov Jahongir» — ko‘rsatma va hujjat uchun. */
  responsibleFullName: string | null;
  responsiblePosition: string | null;
  /** Hokim uchun eng qimmat maydon: «kim javobgar» dan keyingi savol. */
  responsiblePhone: string | null;
}

/** Xom so‘rovda qo‘llaniladigan ustun taxalluslari — mijozga shu nomda boradi. */
const COLUMNS = {
  address: 'address',
  lat: 'lat',
  lng: 'lng',
  responsibleId: 'responsibleId',
  responsibleFirstName: 'responsibleFirstName',
  responsibleLastName: 'responsibleLastName',
  responsiblePosition: 'responsiblePosition',
  responsiblePhone: 'responsiblePhone',
} as const;

/**
 * XOM SO‘ROVGA (`getRawMany`) kerakli ustunlarni qo‘shadi.
 *
 * ⚠️ Mas'ul `leftJoin` bilan ulanadi, `innerJoin` bilan EMAS:
 * biriktirilmagan obyekt natijadan tushib qolmasligi kerak.
 *
 * ⚠️ Taxallus (`objResp`) ataylab o‘ziga xos: ba'zi so‘rovlarda
 * `responsible` nomi ALLAQACHON band (masalan kechikish yozuvining o‘z
 * mas'uli) va ikkalasi chalkashsa, jadvalda obyekt mas'uli o‘rniga
 * kechikishni hal qilayotgan odam chiqib qolardi.
 *
 * ⚠️⚠️ BU FUNKSIYA `.select(...)` DAN KEYIN CHAQIRILADI, OLDIN EMAS.
 * TypeORM'da `select()` butun tanlovni ALMASHTIRADI, `addSelect()` esa
 * qo‘shadi. Oldin chaqirilsa, bu yerdagi sakkizta ustun keyingi
 * `select()` bilan JIMGINA o‘chib ketadi: so‘rov xatosiz bajariladi,
 * javobda esa manzil ham, mas'ul ham `null` bo‘lib qoladi. Shuning
 * uchun chaqiruv joyi HAR DOIM: avval `select`/`addSelect` zanjiri,
 * keyin `selectObjectBrief(qb)`, keyin `getRawMany()`.
 */
export function selectObjectBrief<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  objectAlias = 'o',
  responsibleAlias = 'objResp',
): SelectQueryBuilder<T> {
  return qb
    .leftJoin(`${objectAlias}.responsible`, responsibleAlias)
    .addSelect(`${objectAlias}.address`, COLUMNS.address)
    .addSelect(`${objectAlias}.lat`, COLUMNS.lat)
    .addSelect(`${objectAlias}.lng`, COLUMNS.lng)
    .addSelect(`${responsibleAlias}.id`, COLUMNS.responsibleId)
    .addSelect(`${responsibleAlias}.first_name`, COLUMNS.responsibleFirstName)
    .addSelect(`${responsibleAlias}.last_name`, COLUMNS.responsibleLastName)
    .addSelect(`${responsibleAlias}.position`, COLUMNS.responsiblePosition)
    .addSelect(`${responsibleAlias}.phone`, COLUMNS.responsiblePhone);
}

/**
 * Xom qatordan shartnoma shaklini yig‘adi.
 *
 * ⚠️ Ism `shortName()` / `fullName()` HELPERI bilan yig‘iladi, joyida
 * emas: `getRawMany()` xom qator qaytaradi va `User.shortName` getteri
 * ISHLAMAYDI. Formulani har so‘rovda qaytadan yozsak, bitta ekranda
 * «J. Karimov», boshqasida «Jahongir Karimov» chiqib qolardi.
 */
export function objectBriefFromRaw(
  row: Record<string, unknown> | undefined,
): ObjectBrief {
  const firstName = asText(row?.[COLUMNS.responsibleFirstName]);
  const lastName = asText(row?.[COLUMNS.responsibleLastName]);
  const has = Boolean(firstName ?? lastName);
  const person = { firstName, lastName };

  return {
    address: asText(row?.[COLUMNS.address]),
    lat: asNumber(row?.[COLUMNS.lat]),
    lng: asNumber(row?.[COLUMNS.lng]),
    responsibleId: asText(row?.[COLUMNS.responsibleId]),
    responsibleName: has ? shortName(person) : null,
    responsibleFullName: has ? fullName(person) : null,
    responsiblePosition: asText(row?.[COLUMNS.responsiblePosition]),
    responsiblePhone: asText(row?.[COLUMNS.responsiblePhone]),
  };
}

/**
 * ENTITY so‘rovlari uchun (`getMany`) — `leftJoinAndSelect('o.responsible')`
 * bilan yuklangan bog‘lanishdan AYNI shaklni yig‘adi.
 *
 * ⚠️ Shakl xom so‘rov bilan BIR XIL bo‘lishi shart: mijozda bitta
 * komponent ikkala manbadan ham o‘qiydi.
 */
export function objectBriefFromEntity(
  object:
    | {
        address?: string | null;
        lat?: number | null;
        lng?: number | null;
        responsible?: {
          id?: string;
          firstName?: string | null;
          lastName?: string | null;
          position?: string | null;
          phone?: string | null;
        } | null;
      }
    | null
    | undefined,
): ObjectBrief {
  const responsible = object?.responsible ?? null;
  const has = Boolean(responsible?.firstName ?? responsible?.lastName);

  return {
    address: object?.address ?? null,
    lat: object?.lat ?? null,
    lng: object?.lng ?? null,
    responsibleId: responsible?.id ?? null,
    responsibleName: has ? shortName(responsible) : null,
    responsibleFullName: has ? fullName(responsible) : null,
    responsiblePosition: responsible?.position ?? null,
    responsiblePhone: responsible?.phone ?? null,
  };
}

/**
 * Xom qiymatni matnga keltiradi.
 *
 * ⚠️ Obyekt (`{}`) JIM `'[object Object]'` ga aylanib ketmasligi uchun
 * faqat sodda turlar o‘tkaziladi: aks holda kutilmagan shakldagi
 * javob manzil katagida tushunarsiz yozuv bo‘lib ko‘rinardi.
 */
function asText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
