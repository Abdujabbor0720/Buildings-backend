import {
  cellToText,
  parseDate,
  parseInteger,
  parseMoney,
  parseNumber,
} from './object-import.values';

/**
 * Qiymat tahlilchilari — import xatolarining asosiy manbai.
 *
 * Odamlar Excel’ga qanday yozsa, shunday sinaladi: bo‘shliq bilan,
 * vergul bilan, nuqta bilan, apostrof bilan.
 */
describe('parseMoney', () => {
  it('oddiy sonni o‘qiydi', () => {
    expect(parseMoney('21500000000')).toBe(21_500_000_000);
  });

  it('bo‘shliqli yozuvni o‘qiydi — odamlar shunday yozadi', () => {
    expect(parseMoney('21 500 000 000')).toBe(21_500_000_000);
    // Uzilmas bo‘shliq (Excel avtomatik qo‘yadi)
    expect(parseMoney('21 500 000')).toBe(21_500_000);
  });

  it('ming ajratgich sifatidagi NUQTALARNI tashlaydi', () => {
    expect(parseMoney('21.500.500')).toBe(21_500_500);
  });

  it('bitta nuqtani KASR deb oladi', () => {
    expect(parseMoney('1500.75')).toBe(1500.75);
  });

  it('vergulni kasr ajratgichi deb oladi', () => {
    expect(parseMoney('1500,75')).toBe(1500.75);
  });

  it('matnni rad etadi', () => {
    expect(parseMoney('yigirma milliard')).toBeNull();
    expect(parseMoney('21500000000 so‘m')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });
});

describe('parseNumber va parseInteger', () => {
  it('kasr sonni o‘qiydi', () => {
    expect(parseNumber('40.8012')).toBeCloseTo(40.8012);
    expect(parseNumber('-71.5')).toBeCloseTo(-71.5);
  });

  it('butun son talab qilinganda kasrni rad etadi', () => {
    expect(parseInteger('600')).toBe(600);
    expect(parseInteger('600.5')).toBeNull();
  });

  it('manfiy butun sonni rad etadi — qavat va quvvat manfiy bo‘lolmaydi', () => {
    expect(parseInteger('-3')).toBeNull();
  });
});

describe('parseDate', () => {
  it('ISO ko‘rinishini o‘qiydi (Excel sana katagi shunday keladi)', () => {
    expect(parseDate('2026-03-01')).toBe('2026-03-01');
  });

  it('KK.OO.YYYY ni o‘qiydi va OYNI chalkashtirmaydi', () => {
    // 01.03.2026 — 1-mart, 3-yanvar EMAS (amerikacha tartib qo‘llanmaydi)
    expect(parseDate('01.03.2026')).toBe('2026-03-01');
    expect(parseDate('1.3.2026')).toBe('2026-03-01');
  });

  it('chiziqcha va qiya chiziqni ham qabul qiladi', () => {
    expect(parseDate('20/12/2027')).toBe('2027-12-20');
    expect(parseDate('20-12-2027')).toBe('2027-12-20');
  });

  it('MAVJUD BO‘LMAGAN sanani rad etadi', () => {
    // ⚠️ `new Date(2026, 1, 31)` jimgina 3-martga suriladi —
    // tekshiruvsiz foydalanuvchi boshqa sanani olgan bo‘lardi.
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('32.01.2026')).toBeNull();
    expect(parseDate('01.13.2026')).toBeNull();
  });

  it('aqlga sig‘maydigan yilni rad etadi', () => {
    expect(parseDate('01.03.1026')).toBeNull();
    expect(parseDate('01.03.9999')).toBeNull();
  });

  it('bo‘sh va tushunarsiz qiymatni rad etadi', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('mart oyi')).toBeNull();
    expect(parseDate('2026')).toBeNull();
  });
});

describe('cellToText', () => {
  it('bo‘sh katakni bo‘sh matn qiladi', () => {
    expect(cellToText(null)).toBe('');
    expect(cellToText(undefined)).toBe('');
  });

  it('sanani ISO qiladi — mahalliy formatga TAYANMAYDI', () => {
    expect(cellToText(new Date(Date.UTC(2026, 2, 1)))).toBe('2026-03-01');
  });

  it('FORMULA katagidan natijani oladi', () => {
    // ⚠️ `String(value)` qilinса `[object Object]` chiqardi va qator
    // jimgina xato bo‘lardi.
    expect(cellToText({ formula: 'A1*2', result: 42 })).toBe('42');
  });

  it('boy matnni (rich text) birlashtiradi', () => {
    expect(
      cellToText({
        richText: [{ text: 'Baliqchi ' }, { text: 'maktabi' }],
      }),
    ).toBe('Baliqchi maktabi');
  });

  it('xato katagini bo‘sh deb oladi', () => {
    expect(cellToText({ error: '#DIV/0!' })).toBe('');
  });
});
