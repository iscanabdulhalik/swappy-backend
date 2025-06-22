// src/common/guards/ws-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { FirebaseAdminService } from 'src/modules/auth/firebase/firebase-admin.service';
import { PrismaService } from 'prisma/prisma.service';
import { TestAuthService } from '../services/test-auth.service';

interface AuthenticatedSocket {
  user?: any;
  handshake: {
    headers: Record<string, string>;
    auth?: Record<string, any>;
    query?: Record<string, string>;
  };
  authenticated?: boolean;
  authenticationPromise?: Promise<boolean>;
  disconnect: (close?: boolean) => void;
  id: string;
}

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);
  private readonly authenticatingClients = new Map<string, Promise<boolean>>();

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly prismaService: PrismaService,
    private readonly testAuthService: TestAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();

    try {
      // Check if already authenticated
      if (client.authenticated && client.user) {
        return true;
      }

      // Check if authentication is already in progress for this client
      const existingAuth = this.authenticatingClients.get(client.id);
      if (existingAuth) {
        this.logger.debug(
          `Waiting for existing authentication for client: ${client.id}`,
        );
        return await existingAuth;
      }

      // Start new authentication process
      const authPromise = this.authenticateClient(client);
      this.authenticatingClients.set(client.id, authPromise);

      try {
        const result = await authPromise;
        return result;
      } finally {
        // Clean up authentication tracking
        this.authenticatingClients.delete(client.id);
      }
    } catch (error) {
      this.logger.error(
        `WebSocket authentication error for client ${client.id}: ${error.message}`,
        error.stack,
      );

      // Clean up on error
      this.authenticatingClients.delete(client.id);

      throw new WsException({
        status: 'error',
        error: {
          code: 'authentication_failed',
          message: 'WebSocket authentication failed',
        },
      });
    }
  }

  private async authenticateClient(
    client: AuthenticatedSocket,
  ): Promise<boolean> {
    // Extract token from various possible locations
    const token = this.extractTokenFromClient(client);

    if (!token) {
      this.logger.warn(
        `WebSocket authentication attempt without token from client: ${client.id}`,
      );
      throw new WsException({
        status: 'error',
        error: {
          code: 'missing_token',
          message: 'Authentication token is required',
        },
      });
    }

    // Check for test authentication first (only in development/test)
    if (this.isTestAuthToken(token)) {
      return await this.handleTestAuthentication(client, token);
    }

    // Handle Firebase authentication
    return await this.handleFirebaseAuthentication(client, token);
  }

  private extractTokenFromClient(client: AuthenticatedSocket): string | null {
    // Try multiple locations for the token

    // 1. Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader) {
      const token = this.parseAuthorizationHeader(authHeader);
      if (token) return token;
    }

    // 2. Auth object (Socket.IO auth)
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }

    // 3. Query parameter
    if (client.handshake.query?.token) {
      return client.handshake.query.token;
    }

    // 4. Access_token query parameter (common pattern)
    if (client.handshake.query?.access_token) {
      return client.handshake.query.access_token;
    }

    return null;
  }

  private parseAuthorizationHeader(authHeader: string): string | null {
    const parts = authHeader.split(' ');

    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }

    if (parts.length === 1) {
      return parts[0];
    }

    return null;
  }

  private isTestAuthToken(token: string): boolean {
    return token.startsWith('test_') && process.env.NODE_ENV !== 'production';
  }

  private async handleTestAuthentication(
    client: AuthenticatedSocket,
    token: string,
  ): Promise<boolean> {
    const parts = token.split('_');

    if (parts.length !== 3) {
      throw new WsException({
        status: 'error',
        error: {
          code: 'invalid_test_token',
          message: 'Invalid test token format',
        },
      });
    }

    const [, testSecret, testUserId] = parts;

    const user = await this.testAuthService.validateTestAuth(
      testSecret,
      testUserId,
    );

    if (!user) {
      throw new WsException({
        status: 'error',
        error: {
          code: 'invalid_test_credentials',
          message: 'Invalid test credentials',
        },
      });
    }

    client.user = user;
    client.authenticated = true;

    this.logger.debug(
      `WebSocket test authentication successful for user: ${user.id}`,
    );
    return true;
  }

  private async handleFirebaseAuthentication(
    client: AuthenticatedSocket,
    token: string,
  ): Promise<boolean> {
    // Validate token format
    if (!this.isValidJWTFormat(token)) {
      throw new WsException({
        status: 'error',
        error: {
          code: 'invalid_token_format',
          message: 'Invalid token format',
        },
      });
    }

    try {
      // Verify Firebase ID token with timeout
      const decodedToken = await this.verifyTokenWithTimeout(token, 10000);

      this.logger.debug(
        `WebSocket Firebase token verified for UID: ${decodedToken.uid}`,
      );

      // Additional token validations
      this.validateTokenClaims(decodedToken);

      // Get user from database
      const user = await this.getUserFromDatabase(decodedToken.uid);

      // Set authentication state
      client.user = user;
      client.authenticated = true;

      // Update last active timestamp (fire and forget)
      this.updateLastActiveTimestamp(user.id).catch((error) => {
        this.logger.error(
          `Failed to update last active timestamp: ${error.message}`,
        );
      });

      this.logger.debug(
        `WebSocket authentication successful for user: ${user.id}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `WebSocket Firebase authentication failed: ${error.message}`,
      );
      throw this.mapFirebaseErrorToWsException(error);
    }
  }

  private async verifyTokenWithTimeout(
    token: string,
    timeoutMs: number,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Token verification timeout'));
      }, timeoutMs);

      this.firebaseAdminService
        .verifyIdToken(token)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private isValidJWTFormat(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
  }

  private validateTokenClaims(decodedToken: any): void {
    const now = Math.floor(Date.now() / 1000);

    // Check token expiration
    if (decodedToken.exp && decodedToken.exp < now) {
      throw new Error('Token has expired');
    }

    // Check token issued time
    if (decodedToken.iat && decodedToken.iat > now + 300) {
      throw new Error('Token issued in the future');
    }

    // Validate audience
    const expectedAudience = process.env.FIREBASE_PROJECT_ID;
    if (expectedAudience && decodedToken.aud !== expectedAudience) {
      throw new Error('Invalid token audience');
    }

    // Validate issuer
    const expectedIssuer = `https://securetoken.google.com/${process.env.FIREBASE_PROJECT_ID}`;
    if (expectedIssuer && decodedToken.iss !== expectedIssuer) {
      throw new Error('Invalid token issuer');
    }
  }

  private async getUserFromDatabase(firebaseUid: string): Promise<any> {
    const user = await this.prismaService.user.findUnique({
      where: { firebaseUid },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        displayName: true,
        isActive: true,
        settings: {
          select: {
            privateProfile: true,
            pushNotifications: true,
          },
        },
      },
    });

    if (!user) {
      throw new WsException({
        status: 'error',
        error: {
          code: 'user_not_found',
          message: 'User not found in database',
        },
      });
    }

    if (!user.isActive) {
      throw new WsException({
        status: 'error',
        error: {
          code: 'account_deactivated',
          message: 'User account is deactivated',
        },
      });
    }

    return user;
  }

  private async updateLastActiveTimestamp(userId: string): Promise<void> {
    try {
      await this.prismaService.userStats.update({
        where: { userId },
        data: { lastActiveDate: new Date() },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update last active date for user ${userId}: ${error.message}`,
      );
    }
  }

  private mapFirebaseErrorToWsException(error: any): WsException {
    const errorCode = error.code || error.message || 'unknown_error';

    const errorMappings: Record<string, { code: string; message: string }> = {
      'auth/id-token-expired': {
        code: 'token_expired',
        message: 'Authentication token has expired',
      },
      'auth/id-token-revoked': {
        code: 'token_revoked',
        message: 'Authentication token has been revoked',
      },
      'auth/invalid-id-token': {
        code: 'invalid_token',
        message: 'Invalid authentication token',
      },
      'auth/user-not-found': {
        code: 'user_not_found',
        message: 'User not found',
      },
      'auth/user-disabled': {
        code: 'account_disabled',
        message: 'User account has been disabled',
      },
      'Token verification timeout': {
        code: 'token_verification_timeout',
        message: 'Authentication timeout',
      },
    };

    const mappedError = errorMappings[errorCode] || {
      code: 'authentication_failed',
      message: 'WebSocket authentication failed',
    };

    return new WsException({
      status: 'error',
      error: mappedError,
    });
  }

  // Cleanup method to be called when client disconnects
  onClientDisconnect(clientId: string): void {
    this.authenticatingClients.delete(clientId);
  }

  // Health check for monitoring
  getAuthenticationStats(): {
    authenticatingClients: number;
    timestamp: string;
  } {
    return {
      authenticatingClients: this.authenticatingClients.size,
      timestamp: new Date().toISOString(),
    };
  }
}
