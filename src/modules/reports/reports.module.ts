import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import { GeoModule } from '../geo/geo.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConstructionObject, ObjectDelay]),
    GeoModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
