import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connectionAttempts = 0;
  private readonly maxConnectionAttempts = 5;
  private isConnected = false;

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  async connect() {
    try {
      if (!this.isConnected) {
        await this.$connect();
        this.isConnected = true;
        this.connectionAttempts = 0;
        this.logger.log('Veritabanına başarıyla bağlandı');
      }
    } catch (error) {
      this.connectionAttempts++;
      this.logger.error(
        `Veritabanı bağlantısı başarısız (deneme ${this.connectionAttempts}/${this.maxConnectionAttempts}): ${error.message}`,
        error.stack,
      );

      if (this.connectionAttempts < this.maxConnectionAttempts) {
        const delay = Math.min(
          1000 * Math.pow(2, this.connectionAttempts),
          10000,
        );
        this.logger.log(`${delay}ms sonra yeniden bağlanılacak...`);

        setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        this.logger.error(
          'Maksimum bağlantı denemesi aşıldı, uygulamayı kapatıyorum',
        );
        process.exit(1);
      }
    }
  }

  // Bağlantı durumunu kontrol et
  async checkConnection() {
    if (!this.isConnected) {
      this.logger.warn(
        'Veritabanı bağlantısı kesildi, yeniden bağlanılıyor...',
      );
      await this.connect();
    }

    try {
      // Basit bir sorgu ile bağlantıyı test et
      await this.$queryRaw`SELECT 1 as check`;
      return true;
    } catch (error) {
      this.isConnected = false;
      this.logger.error('Veritabanı bağlantı kontrolü başarısız');
      await this.connect();
      return false;
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test'
    ) {
      const models = Reflect.ownKeys(this).filter(
        (key) =>
          key[0] !== '_' && key[0] !== '$' && typeof this[key] === 'object',
      );

      return Promise.all(models.map((modelKey) => this[modelKey].deleteMany()));
    }
  }
}
