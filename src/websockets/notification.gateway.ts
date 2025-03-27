import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WebsocketsGateway } from './websockets.gateway';
import { AuthenticatedSocket } from './interfaces/socket-client.interface';
import { NotificationEvents } from './events';
import { WsAuthGuard } from '../common/guards/ws-auth.guard';

@WebSocketGateway({
  namespace: '/ws/notifications',
})
export class NotificationGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(private readonly websocketsGateway: WebsocketsGateway) {}

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(NotificationEvents.SUBSCRIBE_NOTIFICATIONS)
  async handleSubscribeNotifications(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      // Subscribe the user to their notification channel
      const room = `notifications:${client.user.id}`;
      client.join(room);

      this.logger.log(`User ${client.user.id} subscribed to notifications`);
    } catch (error) {
      this.logger.error(
        `Error subscribing to notifications: ${error.message}`,
        error.stack,
      );
      client.emit(NotificationEvents.ERROR, {
        message: 'Failed to subscribe to notifications',
      });
    }
  }

  /**
   * Send a notification to a specific user
   */
  sendNotification(userId: string, notification: any) {
    this.websocketsGateway.sendToUser(
      userId,
      NotificationEvents.NEW_NOTIFICATION,
      notification,
    );
  }

  /**
   * Update notification count for a user
   */
  updateNotificationCount(userId: string, count: number) {
    this.websocketsGateway.sendToUser(
      userId,
      NotificationEvents.NOTIFICATION_COUNT_UPDATED,
      { count },
    );
  }
}
