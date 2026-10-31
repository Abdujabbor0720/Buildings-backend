import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CatalogsService, type CatalogName } from './catalogs.service';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from './dto/catalog.dto';

const CATALOGS: CatalogName[] = [
  'construction-types',
  'funding-sources',
  'delay-reasons',
];

@ApiTags('Kataloglar')
@ApiBearerAuth()
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Barcha kataloglar bitta so‘rovda (ilova yuklanishida)',
  })
  all() {
    return this.catalogs.all();
  }

  @Get('construction-types')
  @ApiQuery({ name: 'onlyActive', required: false, type: Boolean })
  @ApiOperation({ summary: 'Qurilish turlari' })
  types(
    @Query('onlyActive', new ParseBoolPipe({ optional: true }))
    onlyActive?: boolean,
  ) {
    return this.catalogs.listConstructionTypes(onlyActive ?? false);
  }

  @Get('funding-sources')
  @ApiQuery({ name: 'onlyActive', required: false, type: Boolean })
  @ApiOperation({ summary: 'Moliyalashtirish manbalari' })
  sources(
    @Query('onlyActive', new ParseBoolPipe({ optional: true }))
    onlyActive?: boolean,
  ) {
    return this.catalogs.listFundingSources(onlyActive ?? false);
  }

  @Get('delay-reasons')
  @ApiQuery({ name: 'onlyActive', required: false, type: Boolean })
  @ApiOperation({ summary: 'Kechikish sabablari' })
  reasons(
    @Query('onlyActive', new ParseBoolPipe({ optional: true }))
    onlyActive?: boolean,
  ) {
    return this.catalogs.listDelayReasons(onlyActive ?? false);
  }

  @Post(':catalog')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiParam({ name: 'catalog', enum: CATALOGS })
  @ApiOperation({ summary: 'Katalogga yangi yozuv qo‘shish' })
  create(
    @Param('catalog') catalog: CatalogName,
    @Body() dto: CreateCatalogItemDto,
  ) {
    return this.catalogs.create(catalog, dto);
  }

  @Patch(':catalog/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiParam({ name: 'catalog', enum: CATALOGS })
  @ApiOperation({ summary: 'Katalog yozuvini tahrirlash' })
  update(
    @Param('catalog') catalog: CatalogName,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalogs.update(catalog, id, dto);
  }

  @Delete(':catalog/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiParam({ name: 'catalog', enum: CATALOGS })
  @ApiOperation({ summary: 'Katalog yozuvini arxivlash (o‘chirilmaydi)' })
  archive(
    @Param('catalog') catalog: CatalogName,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalogs.archive(catalog, id);
  }

  @Post(':catalog/:id/restore')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiParam({ name: 'catalog', enum: CATALOGS })
  @ApiOperation({ summary: 'Arxivdan qaytarish' })
  restore(
    @Param('catalog') catalog: CatalogName,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalogs.restore(catalog, id);
  }
}
