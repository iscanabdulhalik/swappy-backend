import { Module } from '@nestjs/common';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ValidationHelper } from '../../common/helpers/validation.helper';
import { GoogleGenerativeAIService } from './services/google-generative-ai.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/user.module';
import { TestAuthService } from '../../common/services/test-auth.service';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, ConfigModule],
  providers: [
    LearningService,
    ValidationHelper,
    TestAuthService,
    {
      provide: 'AIService',
      useClass: GoogleGenerativeAIService,
    },
  ],
  controllers: [LearningController],
  exports: [LearningService, TestAuthService],
})
export class LearningModule {}
