import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const context = await NestFactory.createApplicationContext(AppModule);
context.enableShutdownHooks();
