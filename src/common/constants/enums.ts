/**
 * Domen bo‘yicha barcha sanaladigan qiymatlar (enum) shu yerda — bitta manba.
 * Bazada ular `varchar` sifatida saqlanadi: PostgreSQL enum turini o‘zgartirish
 * migratsiyada og‘riqli, qiymatlar ro‘yxati esa kengayib boradi.
 */

/** Obyektning hayot sikli — hujjat bo‘yicha holat. */
export enum ObjectStatus {
  /** Loyiha tasdiqlangan, qurilish boshlanmagan */
  NOT_STARTED = 'not_started',
  /** Qurilish ketmoqda */
  IN_PROGRESS = 'in_progress',
  /** Topshirilgan */
  COMPLETED = 'completed',
  /** Vaqtincha to‘xtatilgan */
  SUSPENDED = 'suspended',
  /** Bekor qilingan */
  CANCELLED = 'cancelled',
}

/**
 * Obyektning MUDDAT bo‘yicha sog‘lomligi — har kecha qayta hisoblanadi.
 * ⚠️ Bu `ObjectStatus` bilan chalkashmasin: status — qaror, health — o‘lchov.
 *
 * Dashboard KPI kartalari:
 *   «Reja asosida»   = ON_SCHEDULE + NOT_STARTED
 *   «Kechikayotgan»  = DELAYED
 *   «Xavfli holatda» = AT_RISK
 */
export enum ObjectHealth {
  /** Hali boshlanmagan va reja muddati ham kelmagan */
  NOT_STARTED = 'not_started',
  /** Reja asosida ketmoqda */
  ON_SCHEDULE = 'on_schedule',
  /** Muddatdan ortda qolgan */
  DELAYED = 'delayed',
  /** Jiddiy kechikish yoki yuqori risk */
  AT_RISK = 'at_risk',
  /** Topshirilgan */
  COMPLETED = 'completed',
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/** Tizim rollari. Ruxsatlar `permissions.ts` da rolga biriktiriladi. */
export enum UserRole {
  /** Tizim egasi — hamma narsa */
  SUPER_ADMIN = 'super_admin',
  /** Viloyat hokimi — ko‘rish + tasdiqlash */
  GOVERNOR = 'governor',
  /** Viloyat qurilish boshqarmasi admini */
  REGION_ADMIN = 'region_admin',
  /** Tuman mas’uli */
  DISTRICT_ADMIN = 'district_admin',
  /** Obyekt mas’uli (kurator) */
  SUPERVISOR = 'supervisor',
  /** Pudratchi vakili — faqat o‘z obyektlari */
  CONTRACTOR = 'contractor',
  /** Faqat ko‘rish */
  VIEWER = 'viewer',
}

export enum MilestoneStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  DELAYED = 'delayed',
  CANCELLED = 'cancelled',
}

export enum DelayStatus {
  OPEN = 'open',
  MITIGATING = 'mitigating',
  RESOLVED = 'resolved',
}

export enum PhotoReportStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** Foto-hisobotni AI tekshiruvi natijasi. */
export enum AiVerdict {
  /** AI tasdiqladi */
  CONFIRMED = 'confirmed',
  /** Shubhali — odam ko‘rishi kerak */
  SUSPICIOUS = 'suspicious',
  /** Rad etildi */
  REJECTED = 'rejected',
  /** Hali tekshirilmagan */
  PENDING = 'pending',
}

/**
 * Suratni MODEL tahlil qilish holati.
 *
 * ⚠️ `AiVerdict` dan ALOHIDA: `AiVerdict` — hisobotga ishonish/ishonmaslik
 * qarori (u qoidalar dvigatelidan ham keladi), bu esa model chaqiruvi
 * bajarildimi degan TEXNIK holat. Bittasiga yig‘ilsa, «model ishlamadi»
 * bilan «model shubha bildirdi» bir xil ko‘rinardi.
 */
export enum AiVisionStatus {
  /** Navbatda — hali chaqirilmagan */
  PENDING = 'pending',
  /** Muvaffaqiyatli tahlil qilindi */
  DONE = 'done',
  /** Tahlil qilib bo‘lmaydi (format mos emas, kalit yo‘q, o‘chirilgan) */
  UNAVAILABLE = 'unavailable',
  /** Xatolik — qayta urinib ko‘riladi */
  FAILED = 'failed',
}

export enum AiAnalysisType {
  /** Kechikish prognozi */
  DELAY_FORECAST = 'delay_forecast',
  /** Risk bahosi */
  RISK_SCORE = 'risk_score',
  /** Foto-hisobot tekshiruvi */
  PHOTO_CHECK = 'photo_check',
  /** Byudjet og‘ishi */
  BUDGET_DEVIATION = 'budget_deviation',
  /**
   * BITTA BOSQICH tahlili — «poydevor quyish 80% bajarildi, umumiy
   * qurilishga 12% qo‘shdi».
   *
   * ⚠️ Qolgan turlardan FARQLI: bu yozuvda `milestoneId` TO‘LDIRILADI.
   * Obyekt bo‘yicha tahlil oxirgi natijani TUR bo‘yicha oladi; bosqich
   * tahlili esa har bosqichda alohida bo‘lishi kerak, shuning uchun u
   * `objectId + type` kesimidan tashqarida saqlanadi.
   */
  MILESTONE_PROGRESS = 'milestone_progress',
}

export enum DocumentType {
  /** Loyiha hujjatlari */
  PROJECT = 'project',
  /** Shartnoma */
  CONTRACT = 'contract',
  /** Ekspertiza xulosasi */
  EXPERTISE = 'expertise',
  /** Qurilish ruxsatnomasi */
  PERMIT = 'permit',
  /** Bajarilgan ishlar dalolatnomasi */
  ACT = 'act',
  /** Smeta */
  ESTIMATE = 'estimate',
  OTHER = 'other',
}

export enum ContractorStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BLACKLISTED = 'blacklisted',
}

/** Moliyaviy harakat turi. */
export enum FundingTxType {
  /** Mablag‘ ajratildi */
  ALLOCATION = 'allocation',
  /** To‘lov amalga oshirildi */
  PAYMENT = 'payment',
  /** Qaytarildi / korrektirovka */
  ADJUSTMENT = 'adjustment',
}

export enum NotificationType {
  DEADLINE_APPROACHING = 'deadline_approaching',
  OBJECT_DELAYED = 'object_delayed',
  RISK_DETECTED = 'risk_detected',
  PHOTO_REPORT_SUBMITTED = 'photo_report_submitted',
  DOCUMENT_EXPIRING = 'document_expiring',
  FUNDING_DELAYED = 'funding_delayed',
  SYSTEM = 'system',
}

export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum ProgressSource {
  /** Qo‘lda kiritildi */
  MANUAL = 'manual',
  /** Foto-hisobotdan */
  PHOTO_REPORT = 'photo_report',
  /** Tashqi tizimdan import */
  IMPORT = 'import',
}
