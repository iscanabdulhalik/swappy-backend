import { Module } from '@nestjs/common';
import { WebsocketsGateway } from './websockets.gateway';
import { NotificationGateway } from './notification.gateway';
import { OnlineStatusGateway } from './online-status.gateway';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../modules/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [WebsocketsGateway, NotificationGateway, OnlineStatusGateway],
  exports: [WebsocketsGateway, NotificationGateway, OnlineStatusGateway],
})
export class WebsocketsModule {}
