/**
 * DETERMINISTIK TASODIF (mulberry32).
 *
 * ⚠️ `Math.random()` ATAYLAB ishlatilmaydi: seed har safar BOSHQA ma'lumot
 * bergan bo‘lsa, «dashboard'da raqam o‘zgarib ketdi» degan xatoni
 * takrorlab bo‘lmasdi. Bitta urug‘ (seed) — bitta natija.
 */
export class Rng {
  private state: number;

  constructor(seed = 20261030) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] — butun son. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** [min, max] — kasrli, `digits` xonagacha. */
  float(min: number, max: number, digits = 2): number {
    return Number((this.next() * (max - min) + min).toFixed(digits));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: bo‘sh ro‘yxat');
    return items[this.int(0, items.length - 1)];
  }

  /** Og‘irlikka qarab tanlash: `{ a: 3, b: 1 }` → `a` uch barobar ko‘p chiqadi. */
  weighted<T extends string>(weights: Record<T, number>): T {
    const entries = Object.entries(weights) as Array<[T, number]>;
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.next() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /** Fisher–Yates — nusxa qaytaradi, kirishga tegmaydi. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
