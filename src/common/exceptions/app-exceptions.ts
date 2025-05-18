import { HttpException, HttpStatus } from '@nestjs/common';

export type AppErrorCode =
  // Kullanıcı hatalar
  | 'user_not_found'
  | 'user_already_exists'
  | 'invalid_credentials'

  // Eşleşme hataları
  | 'match_not_found'
  | 'match_exists'
  | 'not_in_match'

  // Konuşma hataları
  | 'conversation_not_found'
  | 'not_participant'
  | 'message_not_found'

  // Dil hataları
  | 'language_not_found'
  | 'invalid_languages'
  | 'native_language_required'

  // Yetkilendirme hatalar
  | 'unauthorized'
  | 'forbidden'
  | 'access_denied'

  // Genel hatalar
  | 'bad_request'
  | 'not_found'
  | 'conflict'
  | 'internal_error'
  | 'validation_error'
  | 'service_unavailable';

export interface AppErrorDetail {
  field?: string;
  message: string;
}

export class AppException extends HttpException {
  constructor(
    statusCode: HttpStatus,
    errorCode: AppErrorCode,
    message: string,
    details?: AppErrorDetail[] | Record<string, any>,
  ) {
    super(
      {
        status: 'error',
        error: {
          code: errorCode,
          message: message,
          details: details,
        },
      },
      statusCode,
    );
  }

  /**
   * Not Found exception
   */
  static notFound(errorCode: AppErrorCode, message: string): AppException {
    return new AppException(HttpStatus.NOT_FOUND, errorCode, message);
  }

  /**
   * Bad Request exception
   */
  static badRequest(
    errorCode: AppErrorCode,
    message: string,
    details?: AppErrorDetail[] | Record<string, any>,
  ): AppException {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      errorCode,
      message,
      details,
    );
  }

  /**
   * Unauthorized exception
   */
  static unauthorized(message: string = 'Unauthorized'): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, 'unauthorized', message);
  }

  /**
   * Forbidden exception
   */
  static forbidden(message: string = 'Forbidden'): AppException {
    return new AppException(HttpStatus.FORBIDDEN, 'forbidden', message);
  }

  /**
   * Conflict exception
   */
  static conflict(errorCode: AppErrorCode, message: string): AppException {
    return new AppException(HttpStatus.CONFLICT, errorCode, message);
  }

  /**
   * Internal Server Error
   */
  static internal(message: string = 'Internal server error'): AppException {
    return new AppException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'internal_error',
      message,
    );
  }

  /**
   * Validation Error
   */
  static validation(
    details: AppErrorDetail[] | Record<string, any>,
  ): AppException {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      'validation_error',
      'Validation failed',
      details,
    );
  }

  /**
   * Service Unavailable
   */
  static serviceUnavailable(
    message: string = 'Service temporarily unavailable',
  ): AppException {
    return new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      'service_unavailable',
      message,
    );
  }
}
