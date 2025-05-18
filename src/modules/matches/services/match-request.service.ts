import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Follow, Match, MatchRequest } from '@prisma/client';
import { TransactionHelper } from '../../../common/helpers/transaction.helper';
import { AppException } from 'src/common/exceptions/app-exceptions';

@Injectable()
export class MatchRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionHelper: TransactionHelper,
    private readonly logger: Logger,
  ) {}

  async acceptMatchRequest(
    requestId: string,
    receiverId: string,
  ): Promise<Match> {
    try {
      const request = await this.prisma.matchRequest.findUnique({
        where: { id: requestId },
        include: { sender: true },
      });

      if (!request) {
        throw new NotFoundException({
          error: 'request_not_found',
          message: 'Eşleşme isteği bulunamadı',
        });
      }

      if (request.receiverId !== receiverId) {
        throw new BadRequestException({
          error: 'not_receiver',
          message: 'Bu isteğin alıcısı siz değilsiniz',
        });
      }

      if (request.status !== 'pending') {
        throw new BadRequestException({
          error: 'invalid_request_status',
          message: `İstek zaten ${request.status} durumunda`,
        });
      }

      // Transaction içinde işlemleri gerçekleştir
      return this.transactionHelper.runInTransaction(async (tx) => {
        // İstek durumunu güncelle
        await tx.matchRequest.update({
          where: { id: requestId },
          data: { status: 'accepted' },
        });

        // Eşleşme oluştur
        const match = await tx.match.create({
          data: {
            initiatorId: request.senderId,
            receiverId,
          },
        });

        // Kullanıcı istatistiklerini güncelle
        await tx.userStats.update({
          where: { userId: request.senderId },
          data: { matchesCount: { increment: 1 } },
        });

        await tx.userStats.update({
          where: { userId: receiverId },
          data: { matchesCount: { increment: 1 } },
        });

        return match;
      }, 'Eşleşme isteği kabul edilemedi');
    } catch (error) {
      this.logger.error(
        `Eşleşme isteği kabul hatası: ${error.message}`,
        error.stack,
      );
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        500,
        'internal_error',
        'Eşleşme isteği kabul edilemedi',
      );
    }
  }

  async rejectMatchRequest(
    requestId: string,
    receiverId: string,
  ): Promise<MatchRequest> {
    try {
      const request = await this.prisma.matchRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        throw new NotFoundException({
          error: 'request_not_found',
          message: 'Eşleşme isteği bulunamadı',
        });
      }

      if (request.receiverId !== receiverId) {
        throw new BadRequestException({
          error: 'not_receiver',
          message: 'Bu isteğin alıcısı siz değilsiniz',
        });
      }

      if (request.status !== 'pending') {
        throw new BadRequestException({
          error: 'invalid_request_status',
          message: `İstek zaten ${request.status} durumunda`,
        });
      }

      // İsteği reddet
      return this.prisma.matchRequest.update({
        where: { id: requestId },
        data: { status: 'rejected' },
      });
    } catch (error) {
      this.logger.error(
        `Eşleşme isteği reddetme hatası: ${error.message}`,
        error.stack,
      );
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        500,
        'internal_error',
        'Eşleşme isteği reddedilemedi',
      );
    }
  }

  // Takip işlemi için transaction kullanımı
  async followUser(followerId: string, followingId: string): Promise<Follow> {
    try {
      // Kullanıcılar var mı kontrol et
      const [follower, following] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: followerId } }),
        this.prisma.user.findUnique({ where: { id: followingId } }),
      ]);

      if (!follower || !following) {
        throw new NotFoundException({
          error: 'user_not_found',
          message: 'Kullanıcı bulunamadı',
        });
      }

      if (followerId === followingId) {
        throw new BadRequestException({
          error: 'invalid_follow',
          message: 'Kendinizi takip edemezsiniz',
        });
      }

      const existingFollow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      });

      if (existingFollow) {
        throw new ConflictException({
          error: 'already_following',
          message: 'Bu kullanıcıyı zaten takip ediyorsunuz',
        });
      }

      // Transaction ile takip işlemi ve stat güncellemelerini yap
      return this.transactionHelper.runInTransaction(async (tx) => {
        const follow = await tx.follow.create({
          data: {
            followerId,
            followingId,
          },
        });

        // Takipçi/takip edilen sayılarını güncelle
        await tx.userStats.update({
          where: { userId: followerId },
          data: { followingCount: { increment: 1 } },
        });

        await tx.userStats.update({
          where: { userId: followingId },
          data: { followersCount: { increment: 1 } },
        });

        return follow;
      }, 'Takip işlemi gerçekleştirilemedi');
    } catch (error) {
      this.logger.error(`Takip işlemi hatası: ${error.message}`, error.stack);
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        500,
        'internal_error',
        'Takip işlemi gerçekleştirilemedi',
      );
    }
  }
}
