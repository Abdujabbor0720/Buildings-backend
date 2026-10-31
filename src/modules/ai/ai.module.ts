import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAnalysis } from '../../database/entities/ai-analysis.entity';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectMilestone } from '../../database/entities/object-milestone.entity';
import { ObjectProgressUpdate } from '../../database/entities/object-progress-update.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { PhotoVisionRunner } from './vision/photo-vision.runner';
import { PhotoVisionService } from './vision/photo-vision.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiAnalysis,
      ConstructionObject,
      ObjectProgressUpdate,
      ObjectMilestone,
      PhotoReport,
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, PhotoVisionService, PhotoVisionRunner],
  exports: [AiService, PhotoVisionService, PhotoVisionRunner],
})
export class AiModule {}
