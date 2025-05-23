import { Injectable, Logger } from '@nestjs/common';
import { NotificationGateway } from '../../websockets/notification.gateway';
import { UpdateNotificationSettingsDto } from './dto/notification.dto';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationSettingsService } from './services/notification.service';
import { ValidationHelper } from 'src/common/helpers/validation.helper';
import { AppException } from 'src/common/exceptions/app-exceptions';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationSettingsService: NotificationSettingsService,
    private readonly notificationGateway: NotificationGateway,
    private readonly validationHelper: ValidationHelper,
    private readonly prisma: PrismaService,
  ) {}

  async getNotifications(
    userId: string,
    limit = 20,
    offset = 0,
    unreadOnly = false,
  ) {
    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Calculate page from offset/limit
      const page = Math.floor(offset / limit) + 1;

      // Get paginated notifications
      const result = await this.notificationRepository.getUserNotifications(
        userId,
        unreadOnly,
        page,
        limit,
      );

      // Get unread count
      const unreadCount =
        await this.notificationRepository.getUnreadCount(userId);

      // Update notification counter in real-time
      this.notificationGateway.updateNotificationCount(userId, unreadCount);

      return {
        items: result.data,
        total: result.total,
        unreadCount,
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error getting notifications: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving notifications');
    }
  }

  async markNotificationAsRead(userId: string, notificationId: string) {
    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Check if notification exists and belongs to user
      const notification =
        await this.notificationRepository.findById(notificationId);

      if (!notification) {
        throw AppException.notFound('not_found', 'Notification not found');
      }

      if (notification.userId !== userId) {
        throw AppException.forbidden(
          'You do not have permission to access this notification',
        );
      }

      // Already read?
      if (notification.isRead) {
        return notification;
      }

      // Mark as read
      const updated = await this.notificationRepository.update(notificationId, {
        isRead: true,
      });

      // Update notification counter in real-time
      const unreadCount =
        await this.notificationRepository.getUnreadCount(userId);
      this.notificationGateway.updateNotificationCount(userId, unreadCount);

      return updated;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error marking notification as read: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error updating notification');
    }
  }

  async markAllNotificationsAsRead(userId: string) {
    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Mark all as read
      await this.notificationRepository.markAllAsRead(userId);

      // Update notification counter in real-time
      this.notificationGateway.updateNotificationCount(userId, 0);

      return { success: true };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error marking all notifications as read: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error updating notifications');
    }
  }

  async createNotification(data: {
    userId: string;
    actorId?: string;
    type: string;
    message: string;
    entityId?: string;
    entityType?: string;
  }) {
    try {
      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId: data.userId },
        include: {
          notificationPreferences: {
            where: {
              type: data.type as any,
            },
          },
        },
      });

      if (
        userSettings &&
        !userSettings.emailNotifications &&
        !userSettings.pushNotifications
      ) {
        this.logger.log(
          `Kullanıcı ${data.userId} için bildirimler devre dışı, bildirim oluşturulmadı`,
        );
        return null;
      }

      const preference = userSettings?.notificationPreferences?.[0];
      if (preference && !preference.emailEnabled && !preference.pushEnabled) {
        this.logger.log(
          `Kullanıcı ${data.userId} için ${data.type} türünde bildirimler devre dışı`,
        );
        return null;
      }

      const notification =
        await this.notificationRepository.createNotification(data);

      if (!preference || preference.pushEnabled) {
        this.notificationGateway.sendNotification(data.userId, {
          ...notification,
          isNew: true,
        });

        const unreadCount = await this.notificationRepository.getUnreadCount(
          data.userId,
        );
        this.notificationGateway.updateNotificationCount(
          data.userId,
          unreadCount,
        );
      }

      return notification;
    } catch (error) {
      this.logger.error(
        `Bildirim oluşturma hatası: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get notification settings
   */
  async getNotificationSettings(userId: string) {
    return this.notificationSettingsService.getNotificationSettings(userId);
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(
    userId: string,
    updateSettingsDto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationSettingsService.updateNotificationSettings(
      userId,
      updateSettingsDto,
    );
  }
}
