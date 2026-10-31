import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * @Global — audit deyarli HAR modulga kerak. Har birida alohida import
 * qilinsa, yangi modul qo‘shilganda audit esdan chiqishi muqarrar edi.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
