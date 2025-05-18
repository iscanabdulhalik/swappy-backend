import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException, Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../modules/auth/firebase/firebase-admin.service';
import { PrismaService } from 'prisma/prisma.service';
import {
  AuthenticatedSocket,
  SocketClient,
} from './interfaces/socket-client.interface';
import { CommonEvents } from './events';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/',
})
@Injectable()
export class WebsocketsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketsGateway.name);
  private readonly clients: Map<string, SocketClient> = new Map();

  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    // Websocket connection requires authentication within 10 seconds
    const timeout = setTimeout(() => {
      this.handleDisconnect(client);
      client.disconnect(true);
    }, 10000);

    client.on(CommonEvents.AUTHENTICATE, async (token: string) => {
      clearTimeout(timeout);
      try {
        // Verify Firebase token
        const decodedToken = await this.firebaseAdmin.verifyIdToken(token);

        // Find the user in our database
        const user = await this.prisma.user.findUnique({
          where: { firebaseUid: decodedToken.uid },
        });

        if (!user) {
          throw new UnauthorizedException('User not found');
        }

        // Store user in socket instance
        (client as AuthenticatedSocket).user = user;

        // Store client in the map
        this.clients.set(client.id, {
          socketId: client.id,
          userId: user.id,
          conversationIds: [],
        });

        // Update user online status
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            stats: {
              update: {
                lastActiveDate: new Date(),
              },
            },
          },
        });

        // Notify client of successful authentication
        client.emit(CommonEvents.AUTHENTICATED, {
          success: true,
          userId: user.id,
        });

        this.logger.log(
          `Client authenticated: ${client.id} (User ID: ${user.id})`,
        );
      } catch (error) {
        this.logger.error(
          `Authentication failed for client ${client.id}`,
          error.stack,
        );
        client.emit(CommonEvents.ERROR, { message: 'Authentication failed' });
        client.disconnect(true);
      }
    });
  }

  handleDisconnect(client: Socket) {
    const clientData = this.clients.get(client.id);

    if (clientData) {
      this.logger.log(
        `Client disconnected: ${client.id} (User ID: ${clientData.userId})`,
      );

      // Remove client from the map
      this.clients.delete(client.id);

      // Update user's last active date (for "last seen" functionality)
      this.prisma.user
        .update({
          where: { id: clientData.userId },
          data: {
            stats: {
              update: {
                lastActiveDate: new Date(),
              },
            },
          },
        })
        .catch((error) => {
          this.logger.error(
            `Failed to update last active date for user ${clientData.userId}`,
            error.stack,
          );
        });
    } else {
      this.logger.log(`Unknown client disconnected: ${client.id}`);
    }
  }

  getUserSockets(userId: string): Socket[] {
    const userClients = Array.from(this.clients.entries())
      .filter(([_, client]) => client.userId === userId)
      .map(([socketId, _]) => this.server.sockets.sockets.get(socketId))
      .filter((socket) => socket !== undefined);

    return userClients;
  }

  sendToUser(userId: string, event: string, payload: any) {
    const sockets = this.getUserSockets(userId);
    sockets.forEach((socket) => socket.emit(event, payload));
  }

  sendToConversation(
    conversationId: string,
    event: string,
    payload: any,
    excludeUserId?: string,
  ) {
    const room = `conversation:${conversationId}`;

    if (excludeUserId) {
      // Send to all in the room except the excluded user
      this.server
        .to(room)
        .except(this.getUserSockets(excludeUserId).map((s) => s.id))
        .emit(event, payload);
    } else {
      // Send to all in the room
      this.server.to(room).emit(event, payload);
    }
  }

  addToConversation(socketId: string, conversationId: string) {
    const client = this.clients.get(socketId);
    if (client) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        const room = `conversation:${conversationId}`;
        socket.join(room);

        // Track conversation membership for this client
        if (!client.conversationIds.includes(conversationId)) {
          client.conversationIds.push(conversationId);
          this.clients.set(socketId, client);
        }
      }
    }
  }

  removeFromConversation(socketId: string, conversationId: string) {
    const client = this.clients.get(socketId);
    if (client) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        const room = `conversation:${conversationId}`;
        socket.leave(room);

        // Update conversation membership for this client
        client.conversationIds = client.conversationIds.filter(
          (id) => id !== conversationId,
        );
        this.clients.set(socketId, client);
      }
    }
  }
}
