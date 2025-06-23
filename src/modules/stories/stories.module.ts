import { Module } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { StoriesController } from './stories.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TestAuthService } from '../../common/services/test-auth.service';
import { ValidationHelper } from '../../common/helpers/validation.helper';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [StoriesService, TestAuthService, ValidationHelper],
  controllers: [StoriesController],
  exports: [StoriesService],
})
export class StoriesModule {}
