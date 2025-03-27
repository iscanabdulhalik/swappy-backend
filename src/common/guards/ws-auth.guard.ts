import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { FirebaseAdminService } from 'src/modules/auth/firebase/firebase-admin.service';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient();
      const headers = client.handshake.headers;

      // Test modu için test kullanıcı ID'sine izin ver
      // DEV ortamında kullanılmalı, PROD ortamında bu kod çıkarılmalı
      const testUserId = headers['x-test-user-id'];
      if (process.env.NODE_ENV === 'development' && testUserId) {
        try {
          const user = await this.prismaService.user.findUnique({
            where: { id: testUserId },
          });

          if (!user) {
            throw new WsException('Test user not found');
          }

          client.user = user;
          this.logger.log(`WS test user authenticated: ${user.id}`);
          return true;
        } catch (error) {
          this.logger.error(`WS test auth error: ${error.message}`);
          throw new WsException('Invalid test user');
        }
      }

      // Normal Firebase Authentication
      const authHeader = headers.authorization;
      if (!authHeader) {
        throw new WsException('Authorization header is missing');
      }

      const [bearer, token] = authHeader.split(' ');
      if (bearer !== 'Bearer' || !token) {
        throw new WsException('Invalid token format');
      }

      // Verify Firebase ID token
      const decodedToken = await this.firebaseAdminService.verifyIdToken(token);

      // Get user from database
      const user = await this.prismaService.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
      });

      if (!user) {
        throw new WsException('User not found in database');
      }

      // Attach user to client
      client.user = user;
      this.logger.debug(`WS user authenticated: ${user.id}`);

      return true;
    } catch (error) {
      this.logger.error(
        `WS Authentication error: ${error.message}`,
        error.stack,
      );
      throw new WsException('Authentication failed');
    }
  }
}
