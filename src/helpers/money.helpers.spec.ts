import { fromCents, sumAmounts, toCents } from './money.helpers';

/**
 * ⚠️ Bu yerda sinaladigan narsa — ANIQLIK. Obyekt qiymatlari
 * milliardlarda o‘lchanadi va `Number` bilan hisoblanganda yig‘indi
 * bir necha so‘mga «suzib» ketadi; hokim esa ikki ekranda ikki xil
 * raqam ko‘radi.
 */
describe('money.helpers', () => {
  it('satrni tiyinga aylantiradi', () => {
    expect(toCents('0')).toBe(0n);
    expect(toCents('1234.56')).toBe(123456n);
    expect(toCents('1234.5')).toBe(123450n);
    expect(toCents('1234')).toBe(123400n);
    expect(toCents('-10.25')).toBe(-1025n);
  });

  it('bo‘sh va yaroqsiz qiymat — nol', () => {
    expect(toCents(null)).toBe(0n);
    expect(toCents(undefined)).toBe(0n);
    expect(toCents('')).toBe(0n);
  });

  it('teskari aylantirish — ikki xona bilan', () => {
    expect(fromCents(123456n)).toBe('1234.56');
    expect(fromCents(5n)).toBe('0.05');
    expect(fromCents(0n)).toBe('0.00');
    expect(fromCents(-1025n)).toBe('-10.25');
  });

  it('yig‘indi — satr konkatenatsiyasi EMAS', () => {
    // ⚠️ `'100' + '200'` JavaScript'da `'100200'` beradi: aynan shu
    // jim xatolikni yopish uchun bu funksiya bor.
    expect(sumAmounts(['100.00', '200.00'])).toBe('300.00');
    expect(sumAmounts([])).toBe('0.00');
    expect(sumAmounts(['0.01', '0.02', null, undefined])).toBe('0.03');
  });

  it('milliardlarda aniqlikni yo‘qotmaydi', () => {
    // `Number` bilan bu yig‘indi 2^53 dan oshadi va xato beradi.
    const big = '92233720368.54';
    expect(sumAmounts([big, big])).toBe('184467440737.08');
  });

  it('tuman qiymati — 200 ta obyekt yig‘indisi', () => {
    const values = Array.from({ length: 200 }, () => '1234567890.12');
    expect(sumAmounts(values)).toBe('246913578024.00');
  });
});
