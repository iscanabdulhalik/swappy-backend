import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateNotificationSettingsDto } from './dto/notification.dto';

@Controller('notifications')
@UseGuards(FirebaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
    @Query('unreadOnly', ParseBoolPipe) unreadOnly = false,
  ) {
    return this.notificationsService.getNotifications(
      userId,
      limit,
      offset,
      unreadOnly,
    );
  }

  @Put(':id/read')
  async markNotificationAsRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationsService.markNotificationAsRead(
      userId,
      notificationId,
    );
  }

  @Put('read-all')
  async markAllNotificationsAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllNotificationsAsRead(userId);
  }

  @Get('settings')
  async getNotificationSettings(@CurrentUser('id') userId: string) {
    return this.notificationsService.getNotificationSettings(userId);
  }

  @Put('settings')
  async updateNotificationSettings(
    @CurrentUser('id') userId: string,
    @Body() updateSettingsDto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationsService.updateNotificationSettings(
      userId,
      updateSettingsDto,
    );
  }
}
