import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CHECK_HEALTH_USE_CASE } from '../../../application/ports/tokens.js';
import { CheckHealthUseCase } from '../../../application/use-cases/check-health.use-case.js';
import { HealthPresenter } from '../presenters/health.presenter.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(CHECK_HEALTH_USE_CASE)
    private readonly checkHealth: CheckHealthUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Verifica a saúde do serviço',
    description: 'Consulta o banco (SELECT 1) e devolve o estado geral do serviço.',
  })
  @ApiResponse({ status: 200, type: HealthPresenter, description: 'Serviço respondendo (healthy ou degraded)' })
  async check(): Promise<HealthPresenter> {
    const report = await this.checkHealth.execute();
    return HealthPresenter.fromReport(report);
  }
}
