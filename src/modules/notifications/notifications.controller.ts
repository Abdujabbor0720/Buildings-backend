import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Bildirishnomalar')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Ruxsat kaliti YO‘Q: har kim faqat O‘Z bildirishnomalarini ko‘radi, id tokendan olinadi. */
  @Get()
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiOperation({ summary: 'Mening bildirishnomalarim' })
  list(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationDto,
    @Query('unreadOnly', new ParseBoolPipe({ optional: true }))
    unreadOnly?: boolean,
  ) {
    return this.notifications.list(userId, query, unreadOnly ?? false);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'O‘qilmaganlar soni (qo‘ng‘iroq ustidagi raqam)' })
  async unreadCount(@CurrentUser('id') userId: string) {
    return { count: await this.notifications.unreadCount(userId) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'O‘qilgan deb belgilash' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notifications.markRead(id, userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hammasini o‘qilgan deb belgilash' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }
}
