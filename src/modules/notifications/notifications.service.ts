import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { NotificationGateway } from '../../websockets/notification.gateway';
import { UpdateNotificationSettingsDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Get user's notifications
   */
  async getNotifications(
    userId: string,
    limit = 20,
    offset = 0,
    unreadOnly = false,
  ) {
    const where: any = {
      userId,
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          },
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    // Update notification counter in real-time
    const unreadCount = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    this.notificationGateway.updateNotificationCount(userId, unreadCount);

    return {
      items: notifications,
      total,
      unreadCount,
    };
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(userId: string, notificationId: string) {
    // Check if notification exists and belongs to user
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException({
        error: 'notification_not_found',
        message: 'Notification not found',
      });
    }

    // Mark as read
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    // Update notification counter in real-time
    const unreadCount = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    this.notificationGateway.updateNotificationCount(userId, unreadCount);

    return updated;
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsAsRead(userId: string) {
    // Mark all as read
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    // Update notification counter in real-time
    this.notificationGateway.updateNotificationCount(userId, 0);

    return { success: true };
  }

  /**
   * Get notification settings
   */
  async getNotificationSettings(userId: string) {
    // Get user settings
    const userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!userSettings) {
      throw new NotFoundException({
        error: 'settings_not_found',
        message: 'User settings not found',
      });
    }

    // TODO: Implement actual notification preferences
    // For now, return default settings
    return {
      emailEnabled: userSettings.emailNotifications,
      pushEnabled: userSettings.pushNotifications,
      preferences: {
        NEW_MESSAGE: { email: true, push: true },
        NEW_MATCH: { email: true, push: true },
        MATCH_REQUEST: { email: true, push: true },
        CORRECTION: { email: true, push: true },
        MENTION: { email: true, push: true },
        COMMENT: { email: true, push: true },
        LIKE: { email: false, push: true },
        FOLLOW: { email: false, push: true },
        SYSTEM: { email: true, push: true },
      },
    };
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    // Get user settings
    const userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!userSettings) {
      throw new NotFoundException({
        error: 'settings_not_found',
        message: 'User settings not found',
      });
    }

    // Update email and push settings
    const data: any = {};

    if (dto.emailEnabled !== undefined) {
      data.emailNotifications = dto.emailEnabled;
    }

    if (dto.pushEnabled !== undefined) {
      data.pushNotifications = dto.pushEnabled;
    }

    // Update user settings
    await this.prisma.userSettings.update({
      where: { id: userSettings.id },
      data,
    });

    // TODO: Store notification preferences in a dedicated table
    // For now, return updated settings
    return {
      emailEnabled: data.emailNotifications ?? userSettings.emailNotifications,
      pushEnabled: data.pushNotifications ?? userSettings.pushNotifications,
      preferences: dto.preferences || {
        NEW_MESSAGE: { email: true, push: true },
        NEW_MATCH: { email: true, push: true },
        MATCH_REQUEST: { email: true, push: true },
        CORRECTION: { email: true, push: true },
        MENTION: { email: true, push: true },
        COMMENT: { email: true, push: true },
        LIKE: { email: false, push: true },
        FOLLOW: { email: false, push: true },
        SYSTEM: { email: true, push: true },
      },
    };
  }
}
