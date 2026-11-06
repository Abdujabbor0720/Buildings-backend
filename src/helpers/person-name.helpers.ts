/**
 * ODAM ISMINI YOZISH — yagona manba.
 *
 * ⚠️ Shakl uch joyda kerak bo'ladi: `User` entity getteri, autentifikatsiya
 * javobi va `getRawMany()` bilan o'qiydigan so'rovlar (xom qator entity
 * emas, shuning uchun getter ISHLAMAYDI). Uchta nusxa bo'lsa, bitta ekranda
 * «J. Karimov», boshqasida «Jahongir Karimov» chiqib qolardi.
 *
 * ⚠️ Familiya OLDINDA: o'zbek rasmiy hujjatlarida tartib shunday va
 * ro'yxatlar familiya bo'yicha o'qiladi.
 */

/** «Karimov Jahongir» — to'liq ism, ro'yxat va hujjat uchun. */
export function fullName(
  person:
    { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!person) return '';
  return [person.lastName, person.firstName].filter(Boolean).join(' ');
}

/**
 * «J. Karimov» — ixcham ism, jadval katagi uchun.
 *
 * ⚠️ Ism BO'SH bo'lsa nuqta ham qo'yilmaydi: «. Karimov» degan yozuv
 * ma'lumot to'liq emasligini emas, xatolikni bildirib qo'yardi.
 */
export function shortName(
  person:
    { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!person) return '';
  const initial = person.firstName ? `${person.firstName.charAt(0)}.` : '';
  return [initial, person.lastName].filter(Boolean).join(' ');
}
