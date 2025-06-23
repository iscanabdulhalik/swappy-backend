// src/websockets/websockets.gateway.ts
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
import { WsAuthGuard } from '../common/guards/ws-auth.guard';
import {
  AuthenticatedSocket,
  SocketClient,
} from './interfaces/socket-client.interface';
import { CommonEvents } from './events';

interface ConnectionState {
  socket: Socket;
  authTimeout?: NodeJS.Timeout;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authStartTime: number;
  disconnectRequested: boolean;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket', 'polling'], // Support both for better compatibility
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
})
@Injectable()
export class WebsocketsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketsGateway.name);
  private readonly clients: Map<string, SocketClient> = new Map();
  private readonly connections: Map<string, ConnectionState> = new Map();

  // Configuration
  private readonly AUTH_TIMEOUT_MS =
    process.env.NODE_ENV === 'production' ? 30000 : 60000;
  private readonly MAX_CONNECTIONS_PER_USER = 5;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly prisma: PrismaService,
    private readonly wsAuthGuard: WsAuthGuard,
  ) {
    this.startHeartbeatMonitor();
  }

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    // Configure Socket.IO server settings
    server.engine.generateId = () => {
      // Generate more unique IDs
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    };
  }

  async handleConnection(client: Socket) {
    const connectionId = client.id;
    const clientIp = this.getClientIp(client);

    this.logger.log(`Client connecting: ${connectionId} from ${clientIp}`);

    try {
      // Initialize connection state
      const connectionState: ConnectionState = {
        socket: client,
        isAuthenticated: false,
        isAuthenticating: false,
        authStartTime: Date.now(),
        disconnectRequested: false,
      };

      this.connections.set(connectionId, connectionState);

      // Set authentication timeout
      connectionState.authTimeout = setTimeout(() => {
        this.handleAuthTimeout(connectionId);
      }, this.AUTH_TIMEOUT_MS);

      // Set up event handlers
      this.setupClientEventHandlers(client, connectionState);

      // Send initial connection acknowledgment
      client.emit(CommonEvents.CONNECT, {
        connectionId,
        timestamp: new Date().toISOString(),
        authTimeoutMs: this.AUTH_TIMEOUT_MS,
      });
    } catch (error) {
      this.logger.error(
        `Error during connection setup for ${connectionId}: ${error.message}`,
        error.stack,
      );
      this.safeDisconnectClient(client, 'connection_setup_failed');
    }
  }

  private setupClientEventHandlers(
    client: Socket,
    connectionState: ConnectionState,
  ) {
    const connectionId = client.id;

    // Authentication handler
    client.on(CommonEvents.AUTHENTICATE, async (data: any) => {
      await this.handleAuthentication(client, connectionState, data);
    });

    // Heartbeat handler
    client.on('heartbeat', () => {
      this.handleHeartbeat(connectionId);
    });

    // Graceful disconnect handler
    client.on('graceful_disconnect', () => {
      this.handleGracefulDisconnect(connectionId);
    });

    // Error handler
    client.on('error', (error: any) => {
      this.logger.error(`Socket error for ${connectionId}: ${error.message}`);
    });

    // Connection recovery handler
    client.on('reconnect_attempt', () => {
      this.logger.log(`Reconnection attempt from ${connectionId}`);
    });
  }

  private async handleAuthentication(
    client: Socket,
    connectionState: ConnectionState,
    data: any,
  ) {
    const connectionId = client.id;

    // Prevent multiple authentication attempts
    if (connectionState.isAuthenticating) {
      this.logger.warn(`Multiple authentication attempts from ${connectionId}`);
      return;
    }

    if (connectionState.isAuthenticated) {
      this.logger.debug(`Client ${connectionId} already authenticated`);
      client.emit(CommonEvents.AUTHENTICATED, { success: true });
      return;
    }

    connectionState.isAuthenticating = true;

    try {
      // Clear authentication timeout
      if (connectionState.authTimeout) {
        clearTimeout(connectionState.authTimeout);
        connectionState.authTimeout = undefined;
      }

      // Extract token from data
      const token = this.extractTokenFromAuthData(data);

      if (!token) {
        throw new UnauthorizedException('Authentication token is required');
      }

      // Verify token and get user
      const user = await this.authenticateWithToken(token);

      // Check connection limits per user
      await this.enforceConnectionLimits(user.id, connectionId);

      // Set up authenticated client
      (client as AuthenticatedSocket).user = user;
      connectionState.isAuthenticated = true;

      // Store client information
      this.clients.set(connectionId, {
        socketId: connectionId,
        userId: user.id,
        conversationIds: [],
      });

      // Update user online status
      await this.updateUserOnlineStatus(user.id, true);

      // Send authentication success
      client.emit(CommonEvents.AUTHENTICATED, {
        success: true,
        userId: user.id,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Client authenticated: ${connectionId} (User: ${user.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Authentication failed for ${connectionId}: ${error.message}`,
        error.stack,
      );

      connectionState.isAuthenticated = false;

      client.emit(CommonEvents.ERROR, {
        message: 'Authentication failed',
        code: 'authentication_failed',
      });

      // Disconnect after a short delay to allow error message delivery
      setTimeout(() => {
        this.safeDisconnectClient(client, 'authentication_failed');
      }, 1000);
    } finally {
      connectionState.isAuthenticating = false;
    }
  }

  private extractTokenFromAuthData(data: any): string | null {
    if (typeof data === 'string') {
      return data;
    }

    if (typeof data === 'object' && data !== null) {
      return data.token || data.idToken || data.accessToken || null;
    }

    return null;
  }

  private async authenticateWithToken(token: string): Promise<any> {
    // Handle test authentication in development/test
    if (token.startsWith('test_') && process.env.NODE_ENV !== 'production') {
      const parts = token.split('_');
      if (parts.length !== 3) {
        throw new UnauthorizedException('Invalid test token format');
      }

      const [, testSecret, testUserId] = parts;
      const user = await this.validateTestAuth(testSecret, testUserId);

      if (!user) {
        throw new UnauthorizedException('Invalid test credentials');
      }

      return user;
    }

    // Handle Firebase authentication
    try {
      const decodedToken = await this.firebaseAdmin.verifyIdToken(token);

      const user = await this.prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
        select: {
          id: true,
          firebaseUid: true,
          email: true,
          displayName: true,
          isActive: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found in database');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('User account is deactivated');
      }

      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        `Token verification failed: ${error.message}`,
      );
    }
  }

  private async validateTestAuth(
    testSecret: string,
    testUserId: string,
  ): Promise<any> {
    // This should use your TestAuthService
    const expectedSecret = process.env.TEST_AUTH_SECRET;
    if (!expectedSecret || testSecret !== expectedSecret) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: testUserId },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        displayName: true,
        isActive: true,
      },
    });

    return user?.isActive ? user : null;
  }

  private async enforceConnectionLimits(
    userId: string,
    newConnectionId: string,
  ): Promise<void> {
    const userConnections = Array.from(this.clients.entries())
      .filter(([_, client]) => client.userId === userId)
      .map(([socketId, _]) => socketId);

    if (userConnections.length >= this.MAX_CONNECTIONS_PER_USER) {
      // Disconnect oldest connection
      const oldestConnectionId = userConnections[0];
      const oldestSocket = this.server.sockets.sockets.get(oldestConnectionId);

      if (oldestSocket) {
        this.logger.log(
          `Disconnecting oldest connection ${oldestConnectionId} for user ${userId} due to connection limit`,
        );
        this.safeDisconnectClient(oldestSocket, 'connection_limit_exceeded');
      }
    }
  }

  private handleAuthTimeout(connectionId: string): void {
    const connectionState = this.connections.get(connectionId);

    if (
      !connectionState ||
      connectionState.isAuthenticated ||
      connectionState.disconnectRequested
    ) {
      return;
    }

    this.logger.warn(`Authentication timeout for client ${connectionId}`);

    const client = connectionState.socket;
    if (client && client.connected) {
      client.emit(CommonEvents.ERROR, {
        message: 'Authentication timeout',
        code: 'authentication_timeout',
      });

      this.safeDisconnectClient(client, 'authentication_timeout');
    }
  }

  private handleHeartbeat(connectionId: string): void {
    const connectionState = this.connections.get(connectionId);
    if (connectionState) {
      // Update last heartbeat time
      (connectionState as any).lastHeartbeat = Date.now();
    }
  }

  private handleGracefulDisconnect(connectionId: string): void {
    const connectionState = this.connections.get(connectionId);
    if (connectionState) {
      connectionState.disconnectRequested = true;
      this.safeDisconnectClient(connectionState.socket, 'graceful_disconnect');
    }
  }

  handleDisconnect(client: Socket) {
    const connectionId = client.id;
    const connectionState = this.connections.get(connectionId);
    const clientData = this.clients.get(connectionId);

    this.logger.log(`Client disconnecting: ${connectionId}`);

    try {
      // Clear timeouts
      if (connectionState?.authTimeout) {
        clearTimeout(connectionState.authTimeout);
      }

      // Update user online status if was authenticated
      if (clientData?.userId) {
        this.updateUserOnlineStatus(clientData.userId, false).catch((error) => {
          this.logger.error(
            `Failed to update offline status: ${error.message}`,
          );
        });

        this.logger.log(
          `User ${clientData.userId} disconnected (${connectionId})`,
        );
      }

      // Clean up connection tracking
      this.connections.delete(connectionId);
      this.clients.delete(connectionId);

      // Clean up auth guard tracking
      this.wsAuthGuard.onClientDisconnect(connectionId);
    } catch (error) {
      this.logger.error(
        `Error during disconnect cleanup: ${error.message}`,
        error.stack,
      );
    }
  }

  private safeDisconnectClient(client: Socket, reason: string): void {
    try {
      if (client && client.connected) {
        client.emit('disconnect_reason', { reason });
        client.disconnect(true);
      }
    } catch (error) {
      this.logger.error(`Error during safe disconnect: ${error.message}`);
    }
  }

  private async updateUserOnlineStatus(
    userId: string,
    isOnline: boolean,
  ): Promise<void> {
    try {
      const updateData = isOnline
        ? { lastActiveDate: new Date() }
        : { lastActiveDate: new Date() }; // Update last seen time on both connect and disconnect

      await this.prisma.userStats.update({
        where: { userId },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update user online status: ${error.message}`,
      );
    }
  }

  private getClientIp(client: Socket): string {
    return (
      (client.handshake.headers['x-forwarded-for'] as string) ||
      (client.handshake.headers['x-real-ip'] as string) ||
      client.handshake.address ||
      'unknown'
    );
  }

  private startHeartbeatMonitor(): void {
    setInterval(() => {
      this.checkClientHeartbeats();
    }, this.HEARTBEAT_INTERVAL);
  }

  private checkClientHeartbeats(): void {
    const now = Date.now();
    const timeoutThreshold = this.HEARTBEAT_INTERVAL * 3; // 90 seconds timeout

    for (const [connectionId, connectionState] of this.connections.entries()) {
      const lastHeartbeat =
        (connectionState as any).lastHeartbeat || connectionState.authStartTime;

      if (
        now - lastHeartbeat > timeoutThreshold &&
        connectionState.isAuthenticated
      ) {
        this.logger.warn(
          `Client ${connectionId} failed heartbeat check, disconnecting`,
        );
        this.safeDisconnectClient(connectionState.socket, 'heartbeat_timeout');
      }
    }
  }

  // Public methods for external use
  getUserSockets(userId: string): Socket[] {
    const userClients = Array.from(this.clients.entries())
      .filter(([_, client]) => client.userId === userId)
      .map(([socketId, _]) => this.server.sockets.sockets.get(socketId))
      .filter(
        (socket): socket is Socket => socket !== undefined && socket.connected,
      );

    return userClients;
  }

  sendToUser(userId: string, event: string, payload: any): void {
    const sockets = this.getUserSockets(userId);
    if (sockets.length === 0) {
      this.logger.debug(`No connected sockets found for user ${userId}`);
      return;
    }

    sockets.forEach((socket) => {
      try {
        socket.emit(event, payload);
      } catch (error) {
        this.logger.error(
          `Failed to send event to socket ${socket.id}: ${error.message}`,
        );
      }
    });
  }

  sendToConversation(
    conversationId: string,
    event: string,
    payload: any,
    excludeUserId?: string,
  ): void {
    const room = `conversation:${conversationId}`;

    try {
      if (excludeUserId) {
        const excludeSockets = this.getUserSockets(excludeUserId).map(
          (s) => s.id,
        );
        this.server.to(room).except(excludeSockets).emit(event, payload);
      } else {
        this.server.to(room).emit(event, payload);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send to conversation ${conversationId}: ${error.message}`,
      );
    }
  }

  addToConversation(socketId: string, conversationId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket && socket.connected) {
        const room = `conversation:${conversationId}`;
        socket.join(room);

        // Track conversation membership
        if (!client.conversationIds.includes(conversationId)) {
          client.conversationIds.push(conversationId);
        }

        this.logger.debug(
          `Socket ${socketId} joined conversation ${conversationId}`,
        );
      }
    }
  }

  removeFromConversation(socketId: string, conversationId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        const room = `conversation:${conversationId}`;
        socket.leave(room);

        // Update conversation membership
        client.conversationIds = client.conversationIds.filter(
          (id) => id !== conversationId,
        );

        this.logger.debug(
          `Socket ${socketId} left conversation ${conversationId}`,
        );
      }
    }
  }

  // Health and monitoring methods
  getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    authenticatingConnections: number;
    connectionsPerUser: Record<string, number>;
    timestamp: string;
  } {
    const authenticatedConnections = Array.from(
      this.connections.values(),
    ).filter((conn) => conn.isAuthenticated).length;

    const authenticatingConnections = Array.from(
      this.connections.values(),
    ).filter((conn) => conn.isAuthenticating).length;

    const connectionsPerUser: Record<string, number> = {};
    Array.from(this.clients.values()).forEach((client) => {
      connectionsPerUser[client.userId] =
        (connectionsPerUser[client.userId] || 0) + 1;
    });

    return {
      totalConnections: this.connections.size,
      authenticatedConnections,
      authenticatingConnections,
      connectionsPerUser,
      timestamp: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const stats = this.getConnectionStats();
      const authStats = this.wsAuthGuard.getAuthenticationStats();

      return {
        status: 'healthy',
        details: {
          connections: stats,
          authentication: authStats,
          server: {
            engine: this.server.engine.clientsCount,
            sockets: this.server.sockets.sockets.size,
          },
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Graceful shutdown
  async gracefulShutdown(): Promise<void> {
    this.logger.log('Starting graceful WebSocket shutdown...');

    // Notify all clients about shutdown
    this.server.emit('server_shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString(),
    });

    // Wait a bit for messages to be delivered
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Close all connections
    for (const [connectionId, connectionState] of this.connections.entries()) {
      this.safeDisconnectClient(connectionState.socket, 'server_shutdown');
    }

    // Close the server
    this.server.close();

    this.logger.log('WebSocket gateway shutdown complete');
  }
}
