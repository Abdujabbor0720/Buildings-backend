import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @ApiOperation({ summary: 'O‘zgarishlar jurnali' })
  list(
    @Query() query: PaginationDto,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
  ) {
    return this.audit.list(query, { entity, entityId, userId, action });
  }
}
