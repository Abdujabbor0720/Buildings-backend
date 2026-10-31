/**
 * SURATDAN BAHOLASH NATIJASI — shartnoma (contract).
 *
 * ⚠️ Bu tur `common/contracts` da turadi, AI modulida EMAS: uni ham entity
 * (bazaga `jsonb` sifatida yoziladi), ham AI moduli, ham controller
 * ishlatadi. Entity modulga bog‘lanib qolsa, ma’lumot qatlami biznes
 * qatlamiga qarab turgan bo‘lardi.
 *
 * ⚠️ Bazadagi `jsonb` ESKI yozuvlarni ham saqlaydi. Shuning uchun yangi
 * maydon qo‘shilganda u IXTIYORIY bo‘lishi shart — aks holda eski
 * hisobotni o‘qiyotgan kod yiqilardi.
 */
export interface PhotoVisionAnalysis {
  /** Qurilishning qaysi bosqichi ko‘rinmoqda. */
  stage: string;
  /** Suratdan ko‘rinib turgan bajarilish, 0–100. */
  estimatedProgressPercent: number;
  /**
   * Baholash oralig‘i — model aniq bitta son ayta olmaydi.
   * «58%» emas, «52–64%» deyish halolroq va qaror qabul qilishga mos.
   */
  rangeMin: number;
  rangeMax: number;
  /** Modelning o‘z bahosiga ishonchi, 0–1. */
  confidence: number;
  /** Suratda KO‘RINGAN tugallangan ishlar. */
  completedWorks: string[];
  /** Suratdan ko‘rinib turgan, hali bajarilmagan ishlar. */
  remainingWorks: string[];
  /** Hisobotdagi foiz suratga mos keladimi. */
  matchesReported: boolean;
  /** Farq bo‘lsa — nima uchun. Mos bo‘lsa bo‘sh. */
  discrepancyNote: string;
  /** Surat sifati — baho ishonchliligiga bevosita ta’sir qiladi. */
  imageQuality: 'good' | 'partial' | 'poor';
  /** Foydalanuvchiga ko‘rsatiladigan 1–3 jumlali xulosa (o‘zbekcha). */
  summary: string;

  /* ── Texnik iz: natija qanday olinganini keyin tushuntirish uchun ── */
  /** Tahlilga yuborilgan suratlar soni. */
  imagesAnalyzed?: number;
  /** Chaqiruvda sarflangan tokenlar — xarajatni kuzatish uchun. */
  tokensUsed?: number;
  /** Tahlil qancha davom etdi, ms. */
  durationMs?: number;
  /** Tahlil qilib bo‘lmagan bo‘lsa — sababi. */
  unavailableReason?: string;
}
