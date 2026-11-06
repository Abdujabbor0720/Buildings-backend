/**
 * Barcha entity'lar BITTA joydan eksport qilinadi.
 * `data-source.ts` va `TypeOrmModule.forFeature()` shu ro‘yxatdan o‘qiydi —
 * yangi jadval qo‘shilganda uni ikki joyda ro‘yxatga olish esdan chiqmaydi.
 */
export { BaseEntity } from './base.entity';
export { Region } from './region.entity';
export { District } from './district.entity';
export { Mahalla } from './mahalla.entity';
export { ConstructionType } from './construction-type.entity';
export { FundingSource } from './funding-source.entity';
export { DelayReason } from './delay-reason.entity';
export { Contractor } from './contractor.entity';
export { Customer } from './customer.entity';
export { User } from './user.entity';
export { RefreshToken } from './refresh-token.entity';
export { StoredFile } from './stored-file.entity';
export { ConstructionObject } from './construction-object.entity';
export { ObjectMilestone } from './object-milestone.entity';
export { ObjectProgressUpdate } from './object-progress-update.entity';
export { ObjectDelay } from './object-delay.entity';
export { PhotoReport } from './photo-report.entity';
export { PhotoReportImage } from './photo-report-image.entity';
export { ObjectDocument } from './object-document.entity';
export { FundingAllocation } from './funding-allocation.entity';
export { FundingTransaction } from './funding-transaction.entity';
export { Notification } from './notification.entity';
export { AiAnalysis } from './ai-analysis.entity';
export { AuditLog } from './audit-log.entity';
export { AppSetting } from './app-setting.entity';
