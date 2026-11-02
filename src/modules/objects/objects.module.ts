import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { District } from '../../database/entities/district.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import { ObjectMilestone } from '../../database/entities/object-milestone.entity';
import { ObjectProgressUpdate } from '../../database/entities/object-progress-update.entity';
import { Region } from '../../database/entities/region.entity';
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
    ]),
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
