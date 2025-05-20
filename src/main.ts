import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isDev = process.env.NODE_ENV !== 'production';

  // Uygulamayı oluştur
  const app = await NestFactory.create(AppModule, {
    logger: isDev
      ? ['error', 'warn', 'log', 'debug', 'verbose']
      : ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT', 3003);
  const apiPrefix = configService.get<string>('API_PREFIX', 'v1');
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '').split(',');

  // CORS ayarları
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders:
      'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization',
    maxAge: 86400, // 24 saat
  });

  // WebSocket options (Socket.IO için)
  app.useWebSocketAdapter(new IoAdapter(app));

  // API prefix ayarı
  app.setGlobalPrefix(apiPrefix);

  // Production için güvenlik önlemleri
  if (process.env.NODE_ENV === 'production') {
    // HTTP başlık güvenliği için Helmet
    app.use(helmet());

    // DDoS koruması için rate limiter
    app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 dakika
        max: 100, // IP başına 15 dakikada 100 istek
        message: 'İstek limiti aşıldı, lütfen daha sonra tekrar deneyin.',
      }),
    );
  }

  // Validasyon pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Ana rota
  app.getHttpAdapter().get('/v1', (req, res) => {
    res.send('API is running');
  });

  const config = new DocumentBuilder()
    .setTitle('API Dokümantasyonu')
    .setDescription('Projenin otomatik oluşturulan Swagger dökümantasyonu')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  // Uygulamayı başlat
  await app.listen(port);

  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`Application is running on: http://localhost:${port}/v1`);

  if (isDev) {
    logger.log(
      `Swagger docs available at: http://localhost:${port}/${apiPrefix}/docs/`,
    );
  }
}

bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
