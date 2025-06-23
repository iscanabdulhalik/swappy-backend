import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WebsocketsModule } from '../../websockets/websockets.module';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationSettingsService } from './services/notification.service';
import { ValidationHelper } from '../../common/helpers/validation.helper';
import { NotificationPreferenceRepository } from './repositories/notification-repository';
import { TestAuthService } from '../../common/services/test-auth.service';

@Module({
  imports: [PrismaModule, AuthModule, WebsocketsModule],
  providers: [
    NotificationsService,
    NotificationRepository,
    NotificationPreferenceRepository,
    NotificationSettingsService,
    ValidationHelper,
    TestAuthService,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, TestAuthService],
})
export class NotificationsModule {}
