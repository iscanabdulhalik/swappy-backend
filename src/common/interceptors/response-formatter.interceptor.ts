import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccessResponse } from '../types/api-response.interface';

@Injectable()
export class ResponseFormatterInterceptor<T>
  implements NestInterceptor<T, ApiSuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'status' in data) {
          return data;
        }

        const meta: Record<string, any> = {};
        if (
          data &&
          typeof data === 'object' &&
          'items' in data &&
          'meta' in data
        ) {
          const { items, meta: dataMeta, ...rest } = data;
          Object.assign(meta, dataMeta, rest);
          data = items;
        }

        return {
          status: 'success',
          data,
          ...(Object.keys(meta).length > 0 ? { meta } : {}),
        };
      }),
    );
  }
}
