import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { DistrictStatsQueryDto } from './dto/geo-query.dto';
import { GeoService } from './geo.service';

@ApiTags('Geografiya')
@ApiBearerAuth()
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('regions')
  @ApiOperation({ summary: 'Viloyatlar ro‘yxati' })
  listRegions() {
    return this.geo.listRegions();
  }

  @Get('regions/default')
  @ApiOperation({ summary: 'Standart (birinchi faol) viloyat' })
  defaultRegion() {
    return this.geo.getDefaultRegion();
  }

  @Get('regions/:id')
  @ApiOperation({ summary: 'Bitta viloyat' })
  getRegion(@Param('id', ParseUUIDPipe) id: string) {
    return this.geo.getRegion(id);
  }

  @Get('districts')
  @ApiQuery({ name: 'regionId', required: false })
  @ApiOperation({ summary: 'Tumanlar ro‘yxati (geometriyasiz)' })
  listDistricts(@Query('regionId') regionId?: string) {
    return this.geo.listDistricts(regionId);
  }

  @Get('districts/stats')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({ summary: 'Tumanlar kesimida obyektlar statistikasi' })
  districtStats(@Query() query: DistrictStatsQueryDto) {
    return this.geo.districtStats(query);
  }

  @Get('districts/geojson')
  @RequirePermissions(PERMISSIONS.OBJECTS_VIEW)
  @ApiOperation({
    summary: 'Xarita uchun GeoJSON — chegara + jonli statistika',
  })
  geojson(@Query() query: DistrictStatsQueryDto) {
    return this.geo.districtsGeoJson(query);
  }

  @Get('districts/:id')
  @ApiOperation({ summary: 'Bitta tuman (geometriyasi bilan)' })
  getDistrict(@Param('id', ParseUUIDPipe) id: string) {
    return this.geo.getDistrict(id);
  }
}
