import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalLearningService } from './local-learning.service';
import { LocalLearningController } from './local-learning.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { ValidationHelper } from '../../common/helpers/validation.helper';
import { OllamaAIService } from './services/ollama-ai.service';
import { UsersModule } from '../users/user.module';
import { AuthModule } from '../auth/auth.module'; // AuthModule'u import et

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    UsersModule,
    AuthModule, // AuthModule'u ekle
  ],
  providers: [
    LocalLearningService,
    ValidationHelper,
    {
      provide: 'AIService',
      useClass: OllamaAIService,
    },
  ],
  controllers: [LocalLearningController],
  exports: [LocalLearningService],
})
export class LocalLearningModule {}
