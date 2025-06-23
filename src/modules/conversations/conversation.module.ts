import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WebsocketsModule } from '../../websockets/websockets.module';
import { TestAuthService } from '../../common/services/test-auth.service';

@Module({
  imports: [PrismaModule, AuthModule, WebsocketsModule],
  providers: [ConversationsService, ConversationsGateway, TestAuthService],
  controllers: [ConversationsController],
  exports: [ConversationsService, TestAuthService],
})
export class ConversationsModule {}
