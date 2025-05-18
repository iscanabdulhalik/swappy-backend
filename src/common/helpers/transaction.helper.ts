// src/common/helpers/transaction.helper.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AppException } from '../exceptions/app-exceptions';

@Injectable()
export class TransactionHelper {
  private readonly logger = new Logger(TransactionHelper.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bir işlemi transaction içinde çalıştırır
   * @param operation Transaction içinde çalıştırılacak işlem
   * @param errorMessage Hata durumunda kullanılacak mesaj
   */
  async runInTransaction<T>(
    operation: (tx: any) => Promise<T>,
    errorMessage = 'İşlem sırasında bir hata oluştu',
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (error) {
      this.logger.error(`Transaction hatası: ${error.message}`, error.stack);
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(500, 'internal_error', errorMessage);
    }
  }
}
