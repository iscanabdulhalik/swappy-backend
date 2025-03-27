import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseFormatterInterceptor } from './common/interceptors/response-formatter.interceptor';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import firebaseConfig from './configs/firebase.config';
import { UsersModule } from './modules/users/user.module';
import { MatchesModule } from './modules/matches/matches.module';
import { ConversationsModule } from './modules/conversations/conversation.module';
import { WebsocketsModule } from './websockets/websockets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [firebaseConfig],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ConversationsModule,
    MatchesModule,
    WebsocketsModule,
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
