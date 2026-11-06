import { AiAnalysis } from './ai-analysis.entity';
import { AppSetting } from './app-setting.entity';
import { AuditLog } from './audit-log.entity';
import { ConstructionObject } from './construction-object.entity';
import { ConstructionType } from './construction-type.entity';
import { Contractor } from './contractor.entity';
import { Customer } from './customer.entity';
import { DelayReason } from './delay-reason.entity';
import { District } from './district.entity';
import { Mahalla } from './mahalla.entity';
import { FundingAllocation } from './funding-allocation.entity';
import { FundingSource } from './funding-source.entity';
import { FundingTransaction } from './funding-transaction.entity';
import { Notification } from './notification.entity';
import { ObjectDelay } from './object-delay.entity';
import { ObjectDocument } from './object-document.entity';
import { ObjectMilestone } from './object-milestone.entity';
import { ObjectProgressUpdate } from './object-progress-update.entity';
import { PhotoReport } from './photo-report.entity';
import { PhotoReportImage } from './photo-report-image.entity';
import { RefreshToken } from './refresh-token.entity';
import { Region } from './region.entity';
import { StoredFile } from './stored-file.entity';
import { User } from './user.entity';

/** DataSource uchun entity ro‘yxati (glob emas — kompilyatsiyadan keyin ham ishlaydi). */
export const ENTITIES = [
  Region,
  District,
  Mahalla,
  ConstructionType,
  FundingSource,
  DelayReason,
  Contractor,
  Customer,
  User,
  RefreshToken,
  StoredFile,
  ConstructionObject,
  ObjectMilestone,
  ObjectProgressUpdate,
  ObjectDelay,
  PhotoReport,
  PhotoReportImage,
  ObjectDocument,
  FundingAllocation,
  FundingTransaction,
  Notification,
  AiAnalysis,
  AuditLog,
  AppSetting,
];
