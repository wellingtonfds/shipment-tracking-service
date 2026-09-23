import { ApiProperty } from '@nestjs/swagger';

export class TrackingAcceptedPresenter {
  @ApiProperty({
    example: true,
    description:
      'Indica que o evento foi aceito com persistência para processamento assíncrono',
  })
  accepted!: boolean;

  @ApiProperty({
    example: '27e4f012-023e-42b8-9a39-44056d897c15',
    description:
      'Identificador estável do evento, usado também como identificador do job',
  })
  eventId!: string;

  @ApiProperty({
    example: '2026-09-22T15:00:00.000Z',
    description: 'Instante em que a API aceitou a solicitação',
  })
  acceptedAt!: Date;

  @ApiProperty({
    example: false,
    description: 'Indica se esta solicitação repetiu um evento já aceito',
  })
  duplicate!: boolean;
}
