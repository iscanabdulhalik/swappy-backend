import { Module } from '@nestjs/common';
import { UsersService } from './user.service';
import { UsersController } from './user.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UserRepository } from './repositories/user.repository';
import { ValidationHelper } from '../../common/helpers/validation.helper';
import { LanguageService } from './services/language.service';
import { TestAuthService } from '../../common/services/test-auth.service';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    UsersService,
    UserRepository,
    ValidationHelper,
    LanguageService,
    TestAuthService,
  ],
  controllers: [UsersController],
  exports: [UsersService, UserRepository, LanguageService, TestAuthService],
})
export class UsersModule {}
