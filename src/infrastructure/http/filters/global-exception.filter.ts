import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DomainError } from '../../../domain/errors/domain.error.js';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  timestamp: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private readonly statusByCode: Record<string, HttpStatus> = {
    CLIENTE_NOT_FOUND: HttpStatus.NOT_FOUND,
    CLIENTE_EMAIL_IN_USE: HttpStatus.CONFLICT,
  };

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildBody(exception, request.url);

    if (body.statusCode >= 500) {
      this.logger.error(body.message, exception instanceof Error ? exception.stack : undefined);
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof DomainError) {
      return {
        statusCode: this.statusByCode[exception.code] ?? HttpStatus.UNPROCESSABLE_ENTITY,
        code: exception.code,
        message: exception.message,
        path,
        timestamp,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return {
        statusCode: status,
        code: typeof body === 'object' && body !== null && 'code' in body ? String((body as Record<string, unknown>).code) : exception.name,
        message: typeof body === 'object' && body !== null && 'message' in body ? String((body as Record<string, unknown>).message) : exception.message,
        path,
        timestamp,
      };
    }

    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR', message: 'Internal server error', path, timestamp };
  }
}
