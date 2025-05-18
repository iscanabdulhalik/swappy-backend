import { registerAs } from '@nestjs/config';
import { env } from './environment';

export default registerAs('database', () => ({
  url: env.DATABASE_URL,
  logging:
    env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
}));
