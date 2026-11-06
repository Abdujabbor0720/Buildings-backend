import { fullName, shortName } from './person-name.helpers';

describe('person-name.helpers', () => {
  describe('fullName', () => {
    it('familiyani OLDIN yozadi', () => {
      expect(fullName({ firstName: 'Jahongir', lastName: 'Karimov' })).toBe('Karimov Jahongir');
    });

    it('faqat bitta qism bo‘lsa, ortiqcha bo‘sh joy qoldirmaydi', () => {
      expect(fullName({ firstName: 'Jahongir', lastName: null })).toBe('Jahongir');
      expect(fullName({ lastName: 'Karimov' })).toBe('Karimov');
    });

    it('odam yo‘q bo‘lsa bo‘sh satr', () => {
      expect(fullName(null)).toBe('');
      expect(fullName(undefined)).toBe('');
    });
  });

  describe('shortName', () => {
    it('ismni bosh harfga qisqartiradi', () => {
      expect(shortName({ firstName: 'Jahongir', lastName: 'Karimov' })).toBe('J. Karimov');
    });

    /*
     * ⚠️ Ism bo‘sh bo‘lsa NUQTA ham qo‘yilmaydi. «. Karimov» degan
     * yozuv ma’lumot to‘liq emasligini emas, tizimdagi xatolikni
     * bildirib qo‘yardi.
     */
    it('ism yo‘q bo‘lsa yolg‘iz nuqta qoldirmaydi', () => {
      expect(shortName({ firstName: '', lastName: 'Karimov' })).toBe('Karimov');
      expect(shortName({ lastName: 'Karimov' })).toBe('Karimov');
    });

    it('familiya yo‘q bo‘lsa faqat bosh harf qoladi', () => {
      expect(shortName({ firstName: 'Jahongir', lastName: null })).toBe('J.');
    });

    it('odam yo‘q bo‘lsa bo‘sh satr', () => {
      expect(shortName(null)).toBe('');
    });
  });
});
