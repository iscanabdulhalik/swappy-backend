import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalLearningService } from './local-learning.service';
import { LocalLearningController } from './local-learning.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { ValidationHelper } from '../../common/helpers/validation.helper';
import { OllamaAIService } from './services/ollama-ai.service';
import { UsersModule } from '../users/user.module';
import { AuthModule } from '../auth/auth.module';
import { TestAuthService } from '../../common/services/test-auth.service';

@Module({
  imports: [PrismaModule, ConfigModule, UsersModule, AuthModule],
  providers: [
    LocalLearningService,
    ValidationHelper,
    TestAuthService,
    {
      provide: 'AIService',
      useClass: OllamaAIService,
    },
  ],
  controllers: [LocalLearningController],
  exports: [LocalLearningService, TestAuthService],
})
export class LocalLearningModule {}
