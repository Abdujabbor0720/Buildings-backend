import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { ObjectDelay } from '../../database/entities/object-delay.entity';
import { ObjectsModule } from '../objects/objects.module';
import { DelaysController } from './delays.controller';
import { DelaysService } from './delays.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ObjectDelay, ConstructionObject]),
    ObjectsModule,
  ],
  controllers: [DelaysController],
  providers: [DelaysService],
  exports: [DelaysService],
})
export class DelaysModule {}
