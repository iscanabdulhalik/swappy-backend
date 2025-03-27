import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../types/api-response.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let errorResponse: ApiErrorResponse;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse() as any;

      const errorObj: ApiErrorResponse = {
        status: 'error',
        error: {
          code: this.getErrorCode(status, errorResponse.error),
          message:
            errorResponse.message || errorResponse.error || exception.message,
        },
      };

      if (errorResponse.details) {
        errorObj.error.details = errorResponse.details;
      }

      this.logError(request, errorObj, exception, status);
      return response.status(status).json(errorObj);
    }

    // Handle unknown errors
    status = HttpStatus.INTERNAL_SERVER_ERROR;
    errorResponse = {
      status: 'error',
      error: {
        code: 'internal_server_error',
        message: 'An unexpected error occurred',
      },
    };

    this.logError(request, errorResponse, exception, status);
    return response.status(status).json(errorResponse);
  }

  private getErrorCode(status: number, error?: string): string {
    if (error) return error;

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'bad_request';
      case HttpStatus.UNAUTHORIZED:
        return 'unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'forbidden';
      case HttpStatus.NOT_FOUND:
        return 'not_found';
      case HttpStatus.CONFLICT:
        return 'conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'unprocessable_entity';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'internal_server_error';
      default:
        return 'unknown_error';
    }
  }

  private logError(
    request: Request,
    errorResponse: ApiErrorResponse,
    exception: unknown,
    status: number,
  ) {
    const message = `${request.method} ${request.url} ${status}: ${
      errorResponse.error.message
    }`;

    if (status >= 500) {
      this.logger.error(
        message,
        exception instanceof Error ? exception.stack : 'Unknown error',
      );
    } else {
      this.logger.warn(message);
    }
  }
}
