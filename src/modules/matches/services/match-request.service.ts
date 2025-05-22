import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MatchRequestDto } from '../dto/match.dto';
import { Follow, Match, MatchRequest } from '@prisma/client';
import { AppException } from '../../../common/exceptions/app-exceptions';
import { TransactionHelper } from '../../../common/helpers/transaction.helper';

@Injectable()
export class MatchRequestService {
  private readonly logger = new Logger(MatchRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionHelper: TransactionHelper,
  ) {}

  /**
   * Create a conversation for a match
   */
  private async createConversationForMatch(
    userIds: string[],
    languageId: string,
    matchId?: string,
  ) {
    try {
      // Validation
      if (userIds.length < 2) {
        throw new BadRequestException({
          error: 'invalid_participants',
          message: 'Conversation must have at least 2 participants',
        });
      }

      // Check language exists
      const language = await this.prisma.language.findUnique({
        where: { id: languageId },
      });

      if (!language) {
        throw new NotFoundException({
          error: 'language_not_found',
          message: 'Language not found',
        });
      }

      // Create conversation
      const conversation = await this.prisma.conversation.create({
        data: {
          languageId,
          participants: {
            create: userIds.map((userId) => ({ userId })),
          },
        },
        include: {
          language: true,
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  profileImageUrl: true,
                },
              },
            },
          },
        },
      });

      return conversation;
    } catch (error) {
      this.logger.error(
        `Error creating conversation: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Send a match request
   */
  async sendMatchRequest(
    senderId: string,
    requestDto: MatchRequestDto,
  ): Promise<MatchRequest> {
    const { receiverId, message } = requestDto;

    try {
      // Check if users exist
      const [sender, receiver] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: senderId } }),
        this.prisma.user.findUnique({ where: { id: receiverId } }),
      ]);

      if (!sender || !receiver) {
        throw new NotFoundException({
          error: 'user_not_found',
          message: 'One or both users not found',
        });
      }

      // Check if sending to self
      if (senderId === receiverId) {
        throw new BadRequestException({
          error: 'invalid_request',
          message: 'Cannot send a match request to yourself',
        });
      }

      // Check if match already exists
      const existingMatch = await this.prisma.match.findFirst({
        where: {
          OR: [
            { initiatorId: senderId, receiverId },
            { initiatorId: receiverId, receiverId: senderId },
          ],
        },
      });

      if (existingMatch) {
        throw new ConflictException({
          error: 'match_exists',
          message: 'A match already exists between these users',
        });
      }

      // Check if request already exists
      const existingRequest = await this.prisma.matchRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId,
            receiverId,
          },
        },
      });

      if (existingRequest) {
        throw new ConflictException({
          error: 'request_exists',
          message: 'A match request already exists',
        });
      }

      // Check if there's a pending request from the receiver to the sender
      const pendingRequest = await this.prisma.matchRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: receiverId,
            receiverId: senderId,
          },
        },
      });

      // If there's a pending request in the opposite direction, auto-accept and create a match
      if (pendingRequest) {
        await this.prisma.matchRequest.update({
          where: { id: pendingRequest.id },
          data: { status: 'accepted' },
        });

        await this.createMatch(receiverId, senderId);

        // Return the request with status accepted
        return this.prisma.matchRequest.create({
          data: {
            senderId,
            receiverId,
            message,
            status: 'accepted',
          },
        });
      }

      // Create the match request
      return this.prisma.matchRequest.create({
        data: {
          senderId,
          receiverId,
          message,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error sending match request: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get match requests for a user
   */
  async getMatchRequests(
    userId: string,
    status = 'pending',
    limit = 20,
    offset = 0,
  ): Promise<{ items: MatchRequest[]; total: number }> {
    try {
      const total = await this.prisma.matchRequest.count({
        where: {
          receiverId: userId,
          status,
        },
      });

      const requests = await this.prisma.matchRequest.findMany({
        where: {
          receiverId: userId,
          status,
        },
        include: {
          sender: {
            include: {
              languages: {
                where: { isNative: true },
                include: {
                  language: true,
                },
              },
            },
          },
        },
        take: limit,
        skip: offset,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        items: requests,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Error getting match requests: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Accept a match request
   */
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
      const match = await this.transactionHelper.runInTransaction(
        async (tx) => {
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
        },
        'Eşleşme isteği kabul edilemedi',
      );

      // Transaction dışında conversation oluştur
      try {
        // Kullanıcıların dil tercihlerini belirle
        const [senderLanguages, receiverLanguages] = await Promise.all([
          this.prisma.userLanguage.findMany({
            where: { userId: request.senderId, isLearning: true },
            include: { language: true },
          }),
          this.prisma.userLanguage.findMany({
            where: { userId: receiverId, isNative: true },
            include: { language: true },
          }),
        ]);

        // Ortak dil bul (gönderen öğreniyor, alıcı anadil olarak biliyor)
        let conversationLanguageId: string | undefined = undefined;
        for (const senderLang of senderLanguages) {
          const matchingLang = receiverLanguages.find(
            (receiverLang) => receiverLang.languageId === senderLang.languageId,
          );
          if (matchingLang) {
            conversationLanguageId = senderLang.languageId;
            break;
          }
        }

        // Eğer ortak dil bulunamazsa, İngilizce'yi varsayılan olarak kullan
        if (!conversationLanguageId) {
          const englishLanguage = await this.prisma.language.findFirst({
            where: { code: 'en' },
          });
          conversationLanguageId = englishLanguage?.id;

          // Eğer İngilizce de bulunamazsa, gönderenin öğrendiği ilk dili kullan
          if (!conversationLanguageId && senderLanguages.length > 0) {
            conversationLanguageId = senderLanguages[0].languageId;
          }
        }

        // Conversation oluştur
        if (conversationLanguageId) {
          const conversation = await this.createConversationForMatch(
            [request.senderId, receiverId],
            conversationLanguageId,
            match.id,
          );

          // Match'i conversation ile ilişkilendir
          await this.prisma.match.update({
            where: { id: match.id },
            data: { conversationId: conversation.id },
          });

          this.logger.log(
            `Conversation created for match ${match.id}: ${conversation.id}`,
          );
        }
      } catch (conversationError) {
        this.logger.error(
          `Conversation oluşturulamadı: ${conversationError.message}`,
          conversationError.stack,
        );
        // Conversation hata verirse match'i silme, sadece log at
      }

      return match;
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

  /**
   * Reject a match request
   */
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

  /**
   * Create a match between two users
   */
  private async createMatch(
    initiatorId: string,
    receiverId: string,
  ): Promise<Match> {
    try {
      // Create a new match
      const match = await this.prisma.match.create({
        data: {
          initiatorId,
          receiverId,
        },
      });

      // Update user stats
      await this.prisma.$transaction([
        this.prisma.userStats.update({
          where: { userId: initiatorId },
          data: { matchesCount: { increment: 1 } },
        }),
        this.prisma.userStats.update({
          where: { userId: receiverId },
          data: { matchesCount: { increment: 1 } },
        }),
      ]);

      return match;
    } catch (error) {
      this.logger.error(`Error creating match: ${error.message}`, error.stack);
      throw error;
    }
  }
}
