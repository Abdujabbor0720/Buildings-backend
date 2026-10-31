import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { FundingAllocation } from '../../database/entities/funding-allocation.entity';
import { FundingTransaction } from '../../database/entities/funding-transaction.entity';
import { FundingController } from './funding.controller';
import { FundingService } from './funding.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FundingAllocation,
      FundingTransaction,
      ConstructionObject,
    ]),
  ],
  controllers: [FundingController],
  providers: [FundingService],
  exports: [FundingService],
})
export class FundingModule {}
