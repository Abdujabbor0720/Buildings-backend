import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { District } from '../../database/entities/district.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import { ObjectMilestone } from '../../database/entities/object-milestone.entity';
import { ObjectProgressUpdate } from '../../database/entities/object-progress-update.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import { PhotoReportImage } from '../../database/entities/photo-report-image.entity';
import { Region } from '../../database/entities/region.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { AiModule } from '../ai/ai.module';
import { ObjectImportService } from './import/object-import.service';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';
import { ObjectHealthService } from './object-health.service';
import { ObjectsController } from './objects.controller';
import { ObjectsCron } from './objects.cron';
import { ObjectsService } from './objects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConstructionObject,
      District,
      Region,
      ObjectProgressUpdate,
      ObjectMilestone,
      ObjectDelay,
      // Bosqichni topshirish foto-hisobot yozadi — `photo-report.factory`
      // shu jadvallarga `EntityManager` orqali tegadi.
      PhotoReport,
      PhotoReportImage,
      StoredFile,
    ]),
    /*
     * ⚠️ HALQA YO‘Q: `AiModule` hech kimni import qilmaydi, shuning uchun
     * `ObjectsModule → AiModule` xavfsiz. Teskarisi (`AiModule →
     * ObjectsModule`) esa `PhotoReportsModule` orqali halqa hosil
     * qilardi — yangi bog‘lanish qo‘shishdan oldin shu yo‘nalishni
     * tekshiring.
     */
    AiModule,
  ],
  controllers: [ObjectsController, MilestonesController],
  providers: [
    ObjectsService,
    ObjectImportService,
    ObjectHealthService,
    MilestonesService,
    ObjectsCron,
  ],
  // Boshqa modullar (foto-hisobot, kechikish, dashboard) holatni qayta
  // hisoblash uchun aynan shu servisni chaqiradi — nusxa yaratilmaydi.
  exports: [ObjectsService, ObjectHealthService, MilestonesService],
})
export class ObjectsModule {}
