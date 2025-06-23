// src/common/common.module.ts
import { Module, Global } from '@nestjs/common';
import { TestAuthService } from './services/test-auth.service';
import { ValidationHelper } from './helpers/validation.helper';
import { TransactionHelper } from './helpers/transaction.helper';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TestAuthService, ValidationHelper, TransactionHelper],
  exports: [TestAuthService, ValidationHelper, TransactionHelper],
})
export class CommonModule {}
