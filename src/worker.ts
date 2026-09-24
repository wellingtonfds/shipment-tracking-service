import 'reflect-metadata';
import './infrastructure/observability/telemetry.js';

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('./app.module.js');

const context = await NestFactory.createApplicationContext(AppModule);
context.enableShutdownHooks();
