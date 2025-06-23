import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WebsocketsModule } from '../../websockets/websockets.module';
import { TransactionHelper } from 'src/common/helpers/transaction.helper';
import { NotificationGateway } from 'src/websockets/notification.gateway';
import { PrismaService } from 'prisma/prisma.service';
import { TestAuthService } from '../../common/services/test-auth.service';

@Module({
  imports: [PrismaModule, AuthModule, WebsocketsModule],
  providers: [
    PostsService,
    TransactionHelper,
    NotificationGateway,
    PrismaService,
    TestAuthService,
  ],
  controllers: [PostsController],
  exports: [PostsService, TestAuthService],
})
export class PostsModule {}
