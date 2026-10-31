import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { Contractor } from '../../database/entities/contractor.entity';
import { ContractorsController } from './contractors.controller';
import { ContractorsService } from './contractors.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contractor, ConstructionObject])],
  controllers: [ContractorsController],
  providers: [ContractorsService],
  exports: [ContractorsService],
})
export class ContractorsModule {}
