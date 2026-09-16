import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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

  const logger = new Logger('Bootstrap');
  logger.log(`API at http://localhost:${port}/${prefix}`);
  logger.log(`Swagger at http://localhost:${port}/docs`);
}

await bootstrap();
