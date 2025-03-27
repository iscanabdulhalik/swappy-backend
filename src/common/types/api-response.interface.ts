export interface ApiSuccessResponse<T> {
  status: 'success';
  data: T;
  meta?: Record<string, any>;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  status: 'error';
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | Record<string, any>;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
