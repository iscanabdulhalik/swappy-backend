// src/common/guards/firebase-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { FirebaseAdminService } from '../../modules/auth/firebase/firebase-admin.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TestAuthService } from '../services/test-auth.service';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: any;
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly prismaService: PrismaService,
    private readonly testAuthService: TestAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    try {
      // Extract token from request
      const token = this.extractTokenFromRequest(request);

      if (!token) {
        this.logger.warn(
          `Authentication attempt without token from IP: ${request.ip}`,
        );
        throw new UnauthorizedException({
          status: 'error',
          error: {
            code: 'missing_token',
            message: 'Authorization token is required',
          },
        });
      }

      // Check for test authentication first (only in development/test)
      if (this.isTestAuthToken(token)) {
        return await this.handleTestAuthentication(request, token);
      }

      // Handle Firebase authentication
      return await this.handleFirebaseAuthentication(request, token);
    } catch (error) {
      this.logger.error(
        `Authentication error for IP ${request.ip}: ${error.message}`,
        error.stack,
      );

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Generic authentication failure
      throw new UnauthorizedException({
        status: 'error',
        error: {
          code: 'authentication_failed',
          message: 'Authentication failed',
        },
      });
    }
  }

  private extractTokenFromRequest(
    request: AuthenticatedRequest,
  ): string | null {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return null;
    }

    // Support both "Bearer <token>" and just "<token>" formats
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
    // Test tokens have a specific prefix to distinguish them
    return token.startsWith('test_') && process.env.NODE_ENV !== 'production';
  }

  private async handleTestAuthentication(
    request: AuthenticatedRequest,
    token: string,
  ): Promise<boolean> {
    // Extract test secret and user ID from token format: test_<secret>_<userId>
    const parts = token.split('_');

    if (parts.length !== 3) {
      throw new UnauthorizedException({
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
      throw new UnauthorizedException({
        status: 'error',
        error: {
          code: 'invalid_test_credentials',
          message: 'Invalid test credentials',
        },
      });
    }

    request.user = user;
    this.logger.debug(`Test authentication successful for user: ${user.id}`);
    return true;
  }

  private async handleFirebaseAuthentication(
    request: AuthenticatedRequest,
    token: string,
  ): Promise<boolean> {
    // Validate token format (basic check)
    if (!this.isValidJWTFormat(token)) {
      throw new UnauthorizedException({
        status: 'error',
        error: {
          code: 'invalid_token_format',
          message: 'Invalid token format',
        },
      });
    }

    try {
      // Verify Firebase ID token
      const decodedToken = await this.firebaseAdminService.verifyIdToken(token);

      this.logger.debug(`Firebase token verified for UID: ${decodedToken.uid}`);

      // Additional token validations
      this.validateTokenClaims(decodedToken);

      // Get user from database
      const user = await this.getUserFromDatabase(decodedToken.uid);

      // Attach user to request
      request.user = user;

      this.logger.debug(`Authentication successful for user: ${user.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Firebase authentication failed: ${error.message}`);

      // Map Firebase-specific errors to our error format
      throw this.mapFirebaseErrorToUnauthorized(error);
    }
  }

  private isValidJWTFormat(token: string): boolean {
    // Basic JWT format validation (3 parts separated by dots)
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
  }

  private validateTokenClaims(decodedToken: any): void {
    const now = Math.floor(Date.now() / 1000);

    // Check token expiration
    if (decodedToken.exp && decodedToken.exp < now) {
      throw new Error('Token has expired');
    }

    // Check token issued time (not too far in the future)
    if (decodedToken.iat && decodedToken.iat > now + 300) {
      // 5 minutes grace
      throw new Error('Token issued in the future');
    }

    // Check authentication time if present
    if (decodedToken.auth_time && decodedToken.auth_time > now + 300) {
      throw new Error('Authentication time in the future');
    }

    // Validate audience if configured
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
      include: {
        settings: true,
        stats: true,
      },
    });

    if (!user) {
      this.logger.warn(
        `User not found in database for Firebase UID: ${firebaseUid}`,
      );
      throw new UnauthorizedException({
        status: 'error',
        error: {
          code: 'user_not_found',
          message: 'User not found in database',
        },
      });
    }

    if (!user.isActive) {
      this.logger.warn(`Inactive user attempted login: ${user.id}`);
      throw new UnauthorizedException({
        status: 'error',
        error: {
          code: 'account_deactivated',
          message: 'User account is deactivated',
        },
      });
    }

    // Update last active timestamp (fire and forget)
    this.updateLastActiveTimestamp(user.id).catch((error) => {
      this.logger.error(
        `Failed to update last active timestamp: ${error.message}`,
      );
    });

    return user;
  }

  private async updateLastActiveTimestamp(userId: string): Promise<void> {
    try {
      await this.prismaService.userStats.update({
        where: { userId },
        data: { lastActiveDate: new Date() },
      });
    } catch (error) {
      // Log but don't fail authentication for this
      this.logger.error(
        `Failed to update last active date for user ${userId}: ${error.message}`,
      );
    }
  }

  private mapFirebaseErrorToUnauthorized(error: any): UnauthorizedException {
    const errorCode = error.code || error.message || 'unknown_error';

    // Map specific Firebase errors to user-friendly messages
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
      'auth/project-not-found': {
        code: 'configuration_error',
        message: 'Authentication service misconfigured',
      },
      'auth/insufficient-permission': {
        code: 'insufficient_permission',
        message: 'Insufficient permissions',
      },
    };

    const mappedError = errorMappings[errorCode] || {
      code: 'authentication_failed',
      message: 'Authentication failed',
    };

    return new UnauthorizedException({
      status: 'error',
      error: mappedError,
    });
  }

  // Health check method for monitoring
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const firebaseHealth = await this.firebaseAdminService.healthCheck();

      return {
        status: firebaseHealth.status === 'healthy' ? 'healthy' : 'degraded',
        details: {
          firebase: firebaseHealth,
          timestamp: new Date().toISOString(),
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
}
