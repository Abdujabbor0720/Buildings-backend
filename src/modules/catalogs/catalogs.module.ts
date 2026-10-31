import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ConstructionType } from '../../database/entities/construction-type.entity';
import { DelayReason } from '../../database/entities/delay-reason.entity';
import { FundingSource } from '../../database/entities/funding-source.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConstructionType,
      FundingSource,
      DelayReason,
      ConstructionObject,
      ObjectDelay,
    ]),
  ],
  controllers: [CatalogsController],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class CatalogsModule {}
