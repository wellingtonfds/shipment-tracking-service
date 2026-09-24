import 'reflect-metadata';
import './infrastructure/observability/telemetry.js';

const { ValidationPipe } = await import('@nestjs/common');
const { ConfigService } = await import('@nestjs/config');
const { NestFactory } = await import('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
const { Logger } = await import('nestjs-pino');
const { AppModule } = await import('./app.module.js');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;
  const prefix = config.get<string>('prefix') ?? 'api/v1';

  app.setGlobalPrefix(prefix);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const documentConfig = new DocumentBuilder()
    .setTitle('src-backend API')
    .setDescription('Backend with explicit boundaries between domain, application and infrastructure.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(
    { component: 'bootstrap', event: 'application.started', port, prefix },
    'Application started',
  );
}

await bootstrap();
