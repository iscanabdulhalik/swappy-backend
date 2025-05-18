import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseFormatterInterceptor } from './common/interceptors/response-formatter.interceptor';
import { PrismaModule } from 'prisma/prisma.module';
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
import { TestAuthService } from './common/services/test-auth.service';
import { ValidationHelper } from './common/helpers/validation.helper';
import firebaseConfig from './configs/firebase.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [firebaseConfig],
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 60 * 60 * 1000, // 1 saat
      max: 100, // En fazla 100 öğe
    }),
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
    TestAuthService,
    ValidationHelper,
  ],
  exports: [TestAuthService, ValidationHelper],
})
export class AppModule {}
