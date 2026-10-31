import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { District } from '../../database/entities/district.entity';
import { Region } from '../../database/entities/region.entity';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

@Module({
  imports: [TypeOrmModule.forFeature([Region, District, ConstructionObject])],
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
