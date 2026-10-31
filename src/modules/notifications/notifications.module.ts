import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConstructionObject } from '../../database/entities/construction-object.entity';
import { Notification } from '../../database/entities/notification.entity';
import { ObjectDocument } from '../../database/entities/object-document.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      ConstructionObject,
      ObjectDocument,
      User,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
