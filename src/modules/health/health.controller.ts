import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';

@ApiTags('Tizim holati')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  /**
   * ⚠️ `@RawResponse()`: monitoring tizimlari (Docker healthcheck, k8s probe,
   * uptime monitor) Terminus'ning standart shaklini kutadi — uni
   * `{success, data}` konvertiga o‘rash integratsiyani buzardi.
   */
  @Public()
  @RawResponse()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Servis va baza holati' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
    ]);
  }
}
