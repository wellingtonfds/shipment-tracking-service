import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { HttpModule } from './infrastructure/http/http.module.js';
import configuration from './infrastructure/config/configuration.js';
import { LoggingModule } from './infrastructure/observability/logging.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, load: [configuration] }),
    LoggingModule,
    DatabaseModule,
    HttpModule,
  ],
})
export class AppModule {}
