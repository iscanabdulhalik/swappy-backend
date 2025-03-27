import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseAdminService } from './firebase/firebase-admin.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [FirebaseAdminService, AuthService],
  controllers: [AuthController],
  exports: [FirebaseAdminService, AuthService],
})
export class AuthModule {}
