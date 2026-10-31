/**
 * Oy nomlari — YAGONA manba.
 * ⚠️ Bu massivni boshqa faylga NUSXA KO‘CHIRMANG: aynan nusxalangan massiv
 * bitta jadvalda ikki xil sana paydo bo‘lishining sababi bo‘lgan.
 * Imlo qat'iy: `sentabr`, `oktabr` ("sentyabr"/"oktyabr" EMAS).
 */
export const MONTHS_UZ = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
] as const;

export const MONTHS_UZ_CAP = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
] as const;

export const WEEKDAYS_UZ = [
  'Yakshanba',
  'Dushanba',
  'Seshanba',
  'Chorshanba',
  'Payshanba',
  'Juma',
  'Shanba',
] as const;

export const WEEKDAYS_UZ_SHORT = [
  'Yak',
  'Du',
  'Se',
  'Cho',
  'Pay',
  'Ju',
  'Sha',
] as const;

/** Butun tizim Asia/Tashkent (+5, DST yo‘q). */
export const TASHKENT_UTC_OFFSET_MINUTES = 5 * 60;

/** Bo‘sh / yaroqsiz sana o‘rniga ko‘rsatiladigan belgi. */
export const EMPTY_VALUE = '—';
