import { Module } from '@nestjs/common';
import { WebsocketsGateway } from './websockets.gateway';
import { NotificationGateway } from './notification.gateway';
import { OnlineStatusGateway } from './online-status.gateway';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../modules/auth/auth.module';
import { WsAuthGuard } from '../common/guards/ws-auth.guard';
import { TestAuthService } from '../common/services/test-auth.service';
import { ValidationHelper } from '../common/helpers/validation.helper';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    WebsocketsGateway,
    NotificationGateway,
    OnlineStatusGateway,
    WsAuthGuard,
    TestAuthService,
    ValidationHelper,
  ],
  exports: [
    WebsocketsGateway,
    NotificationGateway,
    OnlineStatusGateway,
    WsAuthGuard,
  ],
})
export class WebsocketsModule {}
