import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WebsocketsModule } from '../../websockets/websockets.module';

@Module({
  imports: [PrismaModule, AuthModule, WebsocketsModule],
  providers: [ConversationsService, ConversationsGateway],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
