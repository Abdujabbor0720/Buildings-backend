import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { PERMISSIONS } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AiService } from './ai.service';

@ApiTags('AI tahlil')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiQuery({ name: 'regionId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({
    summary: 'AI tahlil bosh ekrani',
    description:
      'Natijalar shaffof qoidalar dvigateli (`rule-engine-v1`) tomonidan hisoblanadi — har bir xulosa o‘z kirish ma’lumotlarini `details` ichida olib yuradi.',
  })
  overview(
    @Query('regionId') regionId?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.ai.overview(regionId, Math.min(limit ?? 10, 50));
  }

  @Get('objects/:objectId')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Obyekt bo‘yicha oxirgi tahlillar' })
  forObject(@Param('objectId', ParseUUIDPipe) objectId: string) {
    return this.ai.forObject(objectId);
  }

  @Post('objects/:objectId/analyze')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obyektni hozir tahlil qilish' })
  analyze(@Param('objectId', ParseUUIDPipe) objectId: string) {
    return this.ai.analyzeObject(objectId);
  }

  @Post('run')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Barcha faol obyektlarni tahlil qilish' })
  run() {
    return this.ai.runNow();
  }
}
