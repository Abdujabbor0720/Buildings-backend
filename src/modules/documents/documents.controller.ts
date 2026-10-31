import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DocumentsService } from './documents.service';
import {
  CreateDocumentDto,
  DocumentQueryDto,
  UpdateDocumentDto,
} from './dto/document.dto';

@ApiTags('Hujjatlar')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_VIEW)
  @ApiOperation({ summary: 'Hujjatlar ro‘yxati' })
  list(@Query() query: DocumentQueryDto, @CurrentUser() user: AuthUser) {
    return this.documents.list(query, user);
  }

  @Get('expiring')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_VIEW)
  @ApiOperation({ summary: 'Muddati tugayotgan hujjatlar' })
  expiring() {
    return this.documents.expiringSoon();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_VIEW)
  @ApiOperation({ summary: 'Bitta hujjat' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documents.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_MANAGE)
  @ApiOperation({ summary: 'Hujjat qo‘shish' })
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documents.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_MANAGE)
  @ApiOperation({ summary: 'Hujjatni tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_MANAGE)
  @ApiOperation({ summary: 'Hujjatni o‘chirish' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.remove(id, user);
  }
}
