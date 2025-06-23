// src/common/services/test-auth.service.ts
import { Injectable, Logger, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'prisma/prisma.service';

@Global()
@Injectable()
export class TestAuthService {
  private readonly logger = new Logger(TestAuthService.name);
  private readonly isTestModeEnabled: boolean;
  private readonly testSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    this.isTestModeEnabled = this.configService.get<boolean>(
      'TEST_MODE_ENABLED',
      false,
    );
    this.testSecret = this.configService.get<string>('TEST_AUTH_SECRET', '');

    // Güvenlik kontrolü
    if (
      this.isTestModeEnabled &&
      (!this.testSecret || this.testSecret.length < 32)
    ) {
      this.logger.warn(
        'Test mode is enabled with an insecure secret. Set a strong TEST_AUTH_SECRET!',
      );
    }
  }

  async validateTestAuth(providedSecret: string, testUserId: string) {
    // Üretim ortamında test kimlik doğrulaması devre dışı
    if (!this.isTestModeEnabled || process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'Attempted to use test auth in production or when test mode is disabled',
      );
      return null;
    }

    // Test sırrı boş veya yanlış ise reddet
    if (!this.testSecret || providedSecret !== this.testSecret) {
      this.logger.warn('Invalid test secret provided');
      return null;
    }

    try {
      const user = await this.prismaService.user.findUnique({
        where: { id: testUserId },
      });

      if (!user) {
        this.logger.warn(`Test user not found: ${testUserId}`);
        return null;
      }

      return user;
    } catch (error) {
      this.logger.error(`Test auth error: ${error.message}`, error.stack);
      return null;
    }
  }
}
