import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { BaseRepository } from 'src/common/repositories/base.repository';
import { Notification } from '@prisma/client';
import { AppException } from 'src/common/exceptions/app-exceptions';

@Injectable()
export class NotificationRepository extends BaseRepository<Notification> {
  constructor(prisma: PrismaService) {
    super(prisma, 'Notification');
  }

  async getUserNotifications(
    userId: string,
    unreadOnly: boolean = false,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const filter: any = { userId };

    if (unreadOnly) {
      filter.isRead = false;
    }

    return this.findWithPagination(
      filter,
      page,
      pageSize,
      { createdAt: 'desc' },
      {
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
    );
  }

  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: { isRead: true },
      });

      return result.count;
    } catch (error) {
      this.logger.error(
        `Error marking all notifications as read: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error updating notifications');
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error getting unread notification count: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error counting unread notifications');
    }
  }

  async createNotification(data: {
    userId: string;
    actorId?: string;
    type: string;
    message: string;
    entityId?: string;
    entityType?: string;
  }): Promise<Notification> {
    try {
      return await this.prisma.notification.create({
        data,
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
      });
    } catch (error) {
      this.logger.error(
        `Error creating notification: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error creating notification');
    }
  }
}
