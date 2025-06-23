import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseFormatterInterceptor } from './common/interceptors/response-formatter.interceptor';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/user.module';
import { MatchesModule } from './modules/matches/matches.module';
import { ConversationsModule } from './modules/conversations/conversation.module';
import { WebsocketsModule } from './websockets/websockets.module';
import { PostsModule } from './modules/posts/posts.module';
import { StoriesModule } from './modules/stories/stories.module';
import { LearningModule } from './modules/learning/learning.module';
import { LocalLearningModule } from './modules/local-learning/local-learning.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import firebaseConfig from './configs/firebase.config';
import { env } from './configs/environment';
import databaseConfig from './configs/database.config';
import * as redisStore from 'cache-manager-redis-store';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [firebaseConfig, databaseConfig],
      cache: true,
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: env.NODE_ENV === 'production' ? 50 : 1000,
      },
    ]),

    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: () => {
        const config = {
          ttl: env.CACHE_TTL,
          max: env.CACHE_MAX_ITEMS,
        };

        if (env.REDIS_URL) {
          return {
            ...config,
            store: redisStore,
            url: env.REDIS_URL,
          };
        }

        return config;
      },
    }),

    CommonModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    MatchesModule,
    ConversationsModule,
    WebsocketsModule,
    PostsModule,
    StoriesModule,
    LearningModule,
    LocalLearningModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseFormatterInterceptor,
    },
  ],
})
export class AppModule {}
