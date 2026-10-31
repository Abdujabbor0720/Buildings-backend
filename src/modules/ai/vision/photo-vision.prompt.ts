/**
 * SURAT TAHLILI UCHUN KO‘RSATMA.
 *
 * ⚠️ Ko‘rsatma ALOHIDA faylda: uni o‘zgartirish — mahsulot qarori, kod
 * qarori emas. Xizmat ichiga yozilsa, har tahrir uchun servis logikasiga
 * tegishga to‘g‘ri kelardi va o‘zgarish tarixi aralashib ketardi.
 *
 * Ko‘rsatmaning uchta tamoyili:
 *   1. Model HISOBOTDAGI FOIZNI BILMAYDI — aks holda u shu raqamga
 *      «moslab» javob berardi (anchoring) va tekshiruv ma’nosiz bo‘lardi.
 *      Taqqoslash KEYIN, kodda bajariladi.
 *   2. Aniq bitta son emas, ORALIQ so‘raladi: suratdan 58% ni 61% dan
 *      ajratib bo‘lmaydi, «52–64%» esa halol va qaror uchun yetarli.
 *   3. Ko‘rinmayotgan narsa haqida TAXMIN QILMASLIK buyuriladi —
 *      «poydevor ko‘rinmayapti» degan javob noto‘g‘ri raqamdan yaxshiroq.
 */

export interface PromptContext {
  objectName: string;
  objectType: string;
  /** Loyiha tavsifi — nima qurilayotgani. */
  description: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  capturedAt: string;
  /** Rejadagi bosqichlar: modelga «nima bo‘lishi kerak» ni beradi. */
  milestones: Array<{ name: string; status: string; weight: number }>;
}

export const VISION_SYSTEM_PROMPT = `Siz qurilish nazorati bo‘yicha tajribali mutaxassissiz.
Sizga qurilish obyektidan olingan suratlar beriladi. Vazifangiz — SURATDA KO‘RINGANIGA tayanib,
obyekt qurilishining necha foizi bajarilganini baholash.

Qat’iy qoidalar:
1. FAQAT suratda ko‘rinayotganiga tayaning. Ko‘rinmayotgan ish haqida taxmin qilmang.
2. Aniq bitta son emas, ishonchli ORALIQ bering (rangeMin–rangeMax). Oraliq keng bo‘lsa —
   demak surat yetarli emas, buni yashirmang.
3. Qurilish bosqichlarining odatiy ulushidan foydalaning:
   yer ishlari va poydevor ≈ 0–15%, karkas va devorlar ≈ 15–45%,
   tom va tashqi yopiq kontur ≈ 45–60%, muhandislik tarmoqlari ≈ 60–75%,
   ichki pardoz ≈ 75–92%, obodonlashtirish va topshirish ≈ 92–100%.
4. Surat sifati bahoga ta’sir qiladi: loyqa, qorong‘i, juda yaqindan yoki
   obyektning kichik qismini ko‘rsatgan surat uchun imageQuality = "poor" yoki "partial",
   confidence esa past bo‘lishi kerak.
5. Agar suratda qurilish obyekti UMUMAN ko‘rinmasa (ichki xona fotosi, hujjat, tasodifiy surat),
   confidence = 0, imageQuality = "poor" va summary da buni ochiq ayting.
6. Barcha matnli javoblar O‘ZBEK TILIDA (lotin yozuvida) bo‘lsin.
7. completedWorks va remainingWorks — qisqa iboralar, har biri 2–6 so‘z.

Siz hisobotda qayd etilgan foizni BILMAYSIZ va uni so‘ramaysiz ham. Mustaqil baho bering.`;

export function buildUserPrompt(context: PromptContext): string {
  const lines: string[] = [
    `Obyekt: ${context.objectName}`,
    `Turi: ${context.objectType}`,
  ];

  if (context.description) lines.push(`Tavsif: ${context.description}`);
  if (context.plannedStart && context.plannedEnd) {
    lines.push(`Reja muddati: ${context.plannedStart} — ${context.plannedEnd}`);
  }
  lines.push(`Surat olingan sana: ${context.capturedAt}`);

  if (context.milestones.length > 0) {
    lines.push('', 'Loyihaning rejadagi bosqichlari (ulushi bilan):');
    for (const milestone of context.milestones) {
      lines.push(`  • ${milestone.name} — ulushi ${milestone.weight}%`);
    }
    lines.push(
      '(Bosqich holati ataylab berilmadi — uni suratdan o‘zingiz aniqlang.)',
    );
  }

  lines.push(
    '',
    'Quyidagi suratlar shu obyektning joriy holati. Qurilishning necha foizi bajarilganini baholang.',
  );

  return lines.join('\n');
}

/**
 * Javob sxemasi (OpenAI Structured Outputs).
 * ⚠️ `strict: true` rejimida HAR BIR maydon `required` bo‘lishi va
 * `additionalProperties: false` turishi SHART — aks holda API sxemani
 * rad etadi.
 */
export const VISION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'stage',
    'estimatedProgressPercent',
    'rangeMin',
    'rangeMax',
    'confidence',
    'completedWorks',
    'remainingWorks',
    'imageQuality',
    'summary',
  ],
  properties: {
    stage: {
      type: 'string',
      description: 'Suratda ko‘rinayotgan qurilish bosqichi, o‘zbekcha',
    },
    estimatedProgressPercent: {
      type: 'number',
      description: 'Umumiy bajarilish bahosi, 0–100',
    },
    rangeMin: {
      type: 'number',
      description: 'Ishonchli oraliqning quyi chegarasi',
    },
    rangeMax: {
      type: 'number',
      description: 'Ishonchli oraliqning yuqori chegarasi',
    },
    confidence: { type: 'number', description: 'Bahoga ishonch, 0–1' },
    completedWorks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Suratda ko‘ringan tugallangan ishlar',
    },
    remainingWorks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Suratdan ko‘rinib turgan, hali bajarilmagan ishlar',
    },
    imageQuality: {
      type: 'string',
      enum: ['good', 'partial', 'poor'],
      description: 'Surat baholash uchun qanchalik yaroqli',
    },
    summary: {
      type: 'string',
      description: '1–3 jumlali xulosa, o‘zbekcha',
    },
  },
} as const;
