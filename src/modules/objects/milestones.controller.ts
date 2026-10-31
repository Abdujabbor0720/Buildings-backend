import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CalendarQueryDto,
  CreateMilestoneDto,
  ReplaceMilestonesDto,
  UpdateMilestoneDto,
} from './dto/milestone.dto';
import { MilestonesService } from './milestones.service';

@ApiTags('Bosqichlar va ish rejasi')
@ApiBearerAuth()
@Controller()
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Get('calendar')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Kalendar (ish rejasi) — oy kesimidagi bosqichlar' })
  calendar(@Query() query: CalendarQueryDto, @CurrentUser() user: AuthUser) {
    return this.milestones.calendar(query, user);
  }

  @Get('objects/:objectId/milestones')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Obyekt bosqichlari' })
  list(@Param('objectId', ParseUUIDPipe) objectId: string) {
    return this.milestones.listForObject(objectId);
  }

  @Post('objects/:objectId/milestones')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({ summary: 'Bosqich qo‘shish' })
  create(
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.milestones.create(objectId, dto);
  }

  @Put('objects/:objectId/milestones')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({
    summary: 'Butun ish rejasini almashtirish (ulushlar yig‘indisi 100%)',
  })
  replace(
    @Param('objectId', ParseUUIDPipe) objectId: string,
    @Body() dto: ReplaceMilestonesDto,
  ) {
    return this.milestones.replaceAll(objectId, dto);
  }

  @Patch('milestones/:id')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({ summary: 'Bosqichni tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.milestones.update(id, dto);
  }

  @Delete('milestones/:id')
  @RequirePermissions(PERMISSIONS.OBJECTS_UPDATE)
  @ApiOperation({ summary: 'Bosqichni o‘chirish' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.milestones.remove(id);
  }
}
