import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { FirebaseAdminService } from 'src/modules/auth/firebase/firebase-admin.service';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // Test modu için X-Test-User-ID header'ına izin ver
    // DEV ortamında kullanılmalı, PROD ortamında bu kod çıkarılmalı
    const testUserId = request.headers['x-test-user-id'];
    if (process.env.NODE_ENV === 'development' && testUserId) {
      try {
        const user = await this.prismaService.user.findUnique({
          where: { id: testUserId },
        });

        if (!user) {
          throw new UnauthorizedException('Test user not found');
        }

        // Kullanıcıyı request'e ekle
        request.user = user;
        this.logger.log(`Test user authenticated: ${user.id}`);
        return true;
      } catch (error) {
        this.logger.error(`Test auth error: ${error.message}`);
        throw new UnauthorizedException('Invalid test user');
      }
    }

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      // Verify Firebase ID token
      const decodedToken = await this.firebaseAdminService.verifyIdToken(token);
      this.logger.debug(`Token verified for Firebase UID: ${decodedToken.uid}`);

      // Get user from database
      const user = await this.prismaService.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
      });

      if (!user) {
        this.logger.warn(
          `User not found for Firebase UID: ${decodedToken.uid}`,
        );
        throw new UnauthorizedException('User not found in database');
      }

      // Attach user to request object
      request.user = user;
      this.logger.debug(`User authenticated: ${user.id}`);

      return true;
    } catch (error) {
      this.logger.error(`Authentication error: ${error.message}`, error.stack);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
