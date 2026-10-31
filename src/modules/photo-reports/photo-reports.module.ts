import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import { PhotoReportImage } from '../../database/entities/photo-report-image.entity';
import { StoredFile } from '../../database/entities/stored-file.entity';
import { AiModule } from '../ai/ai.module';
import { FilesModule } from '../files/files.module';
import { ObjectsModule } from '../objects/objects.module';
import { PhotoReportsController } from './photo-reports.controller';
import { PhotoReportsService } from './photo-reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PhotoReport,
      PhotoReportImage,
      StoredFile,
      ConstructionObject,
    ]),
    FilesModule,
    ObjectsModule,
    AiModule,
  ],
  controllers: [PhotoReportsController],
  providers: [PhotoReportsService],
  exports: [PhotoReportsService],
})
export class PhotoReportsModule {}
