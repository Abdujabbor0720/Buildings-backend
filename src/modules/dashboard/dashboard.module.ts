import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { PhotoReport } from '../../database/entities/photo-report.entity';
import { DelaysModule } from '../delays/delays.module';
import { GeoModule } from '../geo/geo.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConstructionObject, PhotoReport]),
    GeoModule,
    DelaysModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
