import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DomainError } from '../../../../domain/shared/errors/domain.error.js';
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
    CUSTOMER_NOT_FOUND: HttpStatus.NOT_FOUND,
    CUSTOMER_EMAIL_IN_USE: HttpStatus.CONFLICT,
    USER_NOT_FOUND: HttpStatus.NOT_FOUND,
    USER_EMAIL_IN_USE: HttpStatus.CONFLICT,
    USER_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
    USER_CUSTOMER_LINK_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
    INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
    FORBIDDEN: HttpStatus.FORBIDDEN,
    SHIPMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
    SHIPMENT_CARGO_CODE_IN_USE: HttpStatus.CONFLICT,
    SHIPMENT_CONFLICT: HttpStatus.CONFLICT,
    IDEMPOTENCY_KEY_CONFLICT: HttpStatus.CONFLICT,
    SHIPMENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
    SHIPMENT_INVALID_DATES: HttpStatus.UNPROCESSABLE_ENTITY,
    SHIPMENT_INVALID_TRANSITION: HttpStatus.UNPROCESSABLE_ENTITY,
    SHIPMENT_HANDLER_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
    SHIPMENT_HANDLER_INACTIVE: HttpStatus.UNPROCESSABLE_ENTITY,
    CUSTOMER_SCOPE_MISSING: HttpStatus.FORBIDDEN,
    GEOCODING_INVALID_ADDRESS: HttpStatus.BAD_REQUEST,
    GEOCODING_RESULT_NOT_FOUND: HttpStatus.NOT_FOUND,
    GEOCODING_PROVIDER_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  };

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildBody(exception, request.url);

    if (body.statusCode >= 500) {
      this.logger.error(
        body.message,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof DomainError) {
      return {
        statusCode:
          this.statusByCode[exception.code] ?? HttpStatus.UNPROCESSABLE_ENTITY,
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
        code:
          typeof body === 'object' && body !== null && 'code' in body
            ? String((body as Record<string, unknown>).code)
            : exception.name,
        message:
          typeof body === 'object' && body !== null && 'message' in body
            ? String((body as Record<string, unknown>).message)
            : exception.message,
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      path,
      timestamp,
    };
  }
}
