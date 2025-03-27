import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WebsocketsGateway } from './websockets.gateway';
import { AuthenticatedSocket } from './interfaces/socket-client.interface';
import { OnlineStatusEvents } from './events';
import { WsAuthGuard } from '../common/guards/ws-auth.guard';
import { PrismaService } from 'prisma/prisma.service';

@WebSocketGateway({
  namespace: '/ws/online-status',
})
export class OnlineStatusGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OnlineStatusGateway.name);
  private readonly userStatus = new Map<string, string>(); // userId -> status

  constructor(
    private readonly websocketsGateway: WebsocketsGateway,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(OnlineStatusEvents.SET_STATUS)
  async handleSetStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { status: 'online' | 'away' | 'offline' },
  ) {
    try {
      const userId = client.user.id;
      const status = data.status;

      // Update status in memory
      this.userStatus.set(userId, status);

      // Update last active time if the user is online or away
      if (status === 'online' || status === 'away') {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            stats: {
              update: {
                lastActiveDate: new Date(),
              },
            },
          },
        });
      }

      // Get followers
      const followers = await this.prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true },
      });

      // Notify followers about status change
      followers.forEach((follower) => {
        this.websocketsGateway.sendToUser(
          follower.followerId,
          OnlineStatusEvents.FRIEND_STATUS_CHANGED,
          {
            userId,
            status,
            timestamp: new Date().toISOString(),
          },
        );
      });

      this.logger.log(`User ${userId} set status to ${status}`);
    } catch (error) {
      this.logger.error(`Error setting status: ${error.message}`, error.stack);
      client.emit(OnlineStatusEvents.ERROR, {
        message: 'Failed to set status',
      });
    }
  }

  /**
   * Get a user's online status
   */
  getUserStatus(userId: string): string {
    return this.userStatus.get(userId) || 'offline';
  }
}
