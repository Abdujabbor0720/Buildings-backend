import type { EntityManager } from 'typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { Mahalla } from '../../database/entities/mahalla.entity';
import { findContaining } from '../../helpers/geo.helpers';

/**
 * OBYEKTNI MAHALLAGA BIRIKTIRISH — koordinatasi bo‘yicha.
 *
 * ⚠️ Bular PROVAYDER emas, oddiy FUNKSIYALAR (`EntityManager` qabul
 * qiladi). `photo-report.factory.ts` bilan AYNI sabab: ularni
 * `ObjectsModule` ham, seed skripti ham chaqiradi; servis qilinganda
 * modullar aylanma bog‘liqlikka tushardi.
 *
 * ⚠️ Mahalla QO‘LDA tanlanmaydi va formada ham yo‘q. Sabab: mahalla —
 * obyektning joylashuvidan kelib chiqadigan FAKT, mustaqil qaror emas.
 * Qo‘lda tanlanadigan bo‘lsa, xaritadagi nuqta bilan hisobotdagi
 * mahalla bir-biriga mos kelmay qolardi.
 */

/**
 * Bitta nuqta qaysi mahallaga tushishini aniqlaydi.
 *
 * ⚠️ Qidiruv FAQAT o‘sha tuman ichida: mahallalar tumanni to‘liq
 * qoplamaydi va chegaradagi nuqta qo‘shni tumanning mahallasiga
 * tushib ketishi mumkin edi — natijada obyekt bir tumanda, mahallasi
 * boshqa tumanda bo‘lib qolardi.
 *
 * `null` qaytishi ODDIY HOL: koordinata yo‘q, yoki shu tumanning
 * chegaralari hali yuklanmagan (`mahalla.entity.ts` dagi izohga qarang).
 */
export async function resolveMahallaId(
  em: EntityManager,
  districtId: string,
  lng: number | null | undefined,
  lat: number | null | undefined,
): Promise<string | null> {
  if (lng === null || lng === undefined || lat === null || lat === undefined)
    return null;

  const mahallas = await em.find(Mahalla, {
    where: { districtId, isActive: true },
    select: { id: true, geometry: true },
    // ⚠️ Barqaror tartib: chegaralar kesishib qolgan taqdirda natija
    // har safar BIR XIL bo‘lishi kerak (`findContaining` birinchi
    // mosni qaytaradi).
    order: { name: 'ASC' },
  });

  const hit = findContaining(lng, lat, mahallas);
  return hit?.id ?? null;
}

/**
 * KO‘P OBYEKTNI BIRDANIGA biriktiradi — seed va qayta hisoblash uchun.
 *
 * ⚠️ Chegaralar BIR MARTA o‘qiladi va xotirada guruhlanadi. Har obyekt
 * uchun alohida so‘rov yuborilsa, 220 ta obyekt 220 ta so‘rovga
 * aylanardi; mahallalar esa jami bir necha yuzta va ular bemalol
 * xotiraga sig‘adi.
 */
export async function assignMahallasInTx(
  em: EntityManager,
  objects: ReadonlyArray<
    Pick<ConstructionObject, 'id' | 'districtId' | 'lat' | 'lng'>
  >,
): Promise<{ matched: number; unmatched: number }> {
  const mahallas = await em.find(Mahalla, {
    where: { isActive: true },
    select: { id: true, districtId: true, geometry: true },
    order: { name: 'ASC' },
  });

  const byDistrict = new Map<string, typeof mahallas>();
  for (const m of mahallas) {
    const list = byDistrict.get(m.districtId);
    if (list) list.push(m);
    else byDistrict.set(m.districtId, [m]);
  }

  let matched = 0;
  let unmatched = 0;
  const updates: Array<{ id: string; mahallaId: string }> = [];

  for (const object of objects) {
    const candidates = byDistrict.get(object.districtId);
    const hit = candidates
      ? findContaining(object.lng, object.lat, candidates)
      : null;
    if (hit) {
      matched += 1;
      updates.push({ id: object.id, mahallaId: hit.id });
    } else {
      unmatched += 1;
    }
  }

  /*
   * ⚠️ Yangilash MAHALLA BO‘YICHA guruhlanadi: har obyekt uchun alohida
   * `UPDATE` yuborilsa, seed paytida yuzlab so‘rov bo‘lardi. Bitta
   * mahallaga tushgan obyektlar bitta so‘rovda yangilanadi.
   */
  const byMahalla = new Map<string, string[]>();
  for (const u of updates) {
    const list = byMahalla.get(u.mahallaId);
    if (list) list.push(u.id);
    else byMahalla.set(u.mahallaId, [u.id]);
  }
  for (const [mahallaId, ids] of byMahalla) {
    await em.update(ConstructionObject, ids, { mahallaId });
  }

  return { matched, unmatched };
}
