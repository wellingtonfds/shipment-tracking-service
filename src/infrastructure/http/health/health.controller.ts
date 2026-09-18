import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CHECK_HEALTH_USE_CASE } from '../../../application/health/health.tokens.js';
import { CheckHealthUseCase } from '../../../application/health/use-cases/check-health.use-case.js';
import { HealthPresenter } from './health.presenter.js';
import { Public } from '../shared/guards/public.decorator.js';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(CHECK_HEALTH_USE_CASE)
    private readonly checkHealth: CheckHealthUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Check service health',
    description: 'Queries the database (SELECT 1) and returns the overall service state.',
  })
  @ApiResponse({ status: 200, type: HealthPresenter, description: 'Service responding (healthy or degraded)' })
  async check(): Promise<HealthPresenter> {
    const report = await this.checkHealth.execute();
    return HealthPresenter.fromReport(report);
  }
}
