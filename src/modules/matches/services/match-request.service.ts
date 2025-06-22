import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MatchRequestDto } from '../dto/match.dto';
import { Follow, Match, MatchRequest, Conversation } from '@prisma/client';
import { AppException } from '../../../common/exceptions/app-exceptions';
import { TransactionHelper } from '../../../common/helpers/transaction.helper';

// Type definitions for better type safety
type MatchRequestWithSender = MatchRequest & {
  sender: {
    id: string;
    displayName: string;
    languages: Array<{
      languageId: string;
      language: {
        id: string;
        name: string;
        code: string;
      };
    }>;
  };
};

type UserLanguageWithLanguage = {
  userId: string;
  languageId: string;
  language: {
    id: string;
    name: string;
    code: string;
  };
};

type MatchWithDetails = Match & {
  initiator: {
    id: string;
    displayName: string;
    profileImageUrl: string | null;
  };
  receiver: {
    id: string;
    displayName: string;
    profileImageUrl: string | null;
  };
  conversation?:
    | (Conversation & {
        language: {
          id: string;
          name: string;
        };
      })
    | null;
};

@Injectable()
export class MatchRequestService {
  private readonly logger = new Logger(MatchRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionHelper: TransactionHelper,
  ) {}

  async acceptMatchRequest(
    requestId: string,
    receiverId: string,
  ): Promise<MatchWithDetails> {
    try {
      const request = await this.prisma.matchRequest.findUnique({
        where: { id: requestId },
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

      if (!request) {
        throw AppException.notFound('not_found', 'Eşleşme isteği bulunamadı');
      }

      if (request.receiverId !== receiverId) {
        throw AppException.badRequest(
          'bad_request',
          'Bu isteğin alıcısı siz değilsiniz',
        );
      }

      if (request.status !== 'pending') {
        throw AppException.badRequest(
          'bad_request',
          `İstek zaten ${request.status} durumunda`,
        );
      }

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

      const conversationLanguageId = await this.selectConversationLanguage(
        senderLanguages,
        receiverLanguages,
      );

      return await this.transactionHelper.runInTransaction(async (tx) => {
        await tx.matchRequest.update({
          where: { id: requestId },
          data: { status: 'accepted' },
        });

        const match = await tx.match.create({
          data: {
            initiatorId: request.senderId,
            receiverId,
          },
        });

        let conversationId: string | null = null;
        if (conversationLanguageId) {
          const conversation = await tx.conversation.create({
            data: {
              languageId: conversationLanguageId,
              participants: {
                create: [{ userId: request.senderId }, { userId: receiverId }],
              },
            },
          });
          conversationId = conversation.id;

          await tx.match.update({
            where: { id: match.id },
            data: { conversationId: conversationId },
          });
        }

        await Promise.all([
          tx.userStats.update({
            where: { userId: request.senderId },
            data: { matchesCount: { increment: 1 } },
          }),
          tx.userStats.update({
            where: { userId: receiverId },
            data: { matchesCount: { increment: 1 } },
          }),
        ]);

        const updatedMatch = await tx.match.findUnique({
          where: { id: match.id },
          include: {
            initiator: {
              select: {
                id: true,
                displayName: true,
                profileImageUrl: true,
              },
            },
            receiver: {
              select: {
                id: true,
                displayName: true,
                profileImageUrl: true,
              },
            },
            conversation: conversationId
              ? {
                  include: {
                    language: true,
                  },
                }
              : false,
          },
        });

        if (!updatedMatch) {
          throw new Error('Failed to retrieve created match');
        }

        this.logger.log(
          `Match ${match.id} created successfully with conversation ${conversationId || 'none'}`,
        );

        return updatedMatch as MatchWithDetails;
      }, 'Eşleşme isteği kabul edilemedi');
    } catch (error) {
      this.logger.error(
        `Eşleşme isteği kabul hatası: ${error.message}`,
        error.stack,
      );

      if (error instanceof AppException) {
        throw error;
      }

      throw AppException.internal('Eşleşme isteği kabul edilemedi');
    }
  }

  private async selectConversationLanguage(
    senderLanguages: UserLanguageWithLanguage[],
    receiverLanguages: UserLanguageWithLanguage[],
  ): Promise<string | null> {
    try {
      for (const senderLang of senderLanguages) {
        const matchingLang = receiverLanguages.find(
          (receiverLang) => receiverLang.languageId === senderLang.languageId,
        );
        if (matchingLang) {
          return senderLang.languageId;
        }
      }

      const englishLanguage = await this.prisma.language.findFirst({
        where: { code: 'en' },
      });

      if (englishLanguage) {
        return englishLanguage.id;
      }

      if (senderLanguages.length > 0) {
        return senderLanguages[0].languageId;
      }

      this.logger.warn('No suitable language found for conversation');
      return null;
    } catch (error) {
      this.logger.error(
        `Error selecting conversation language: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async followUser(followerId: string, followingId: string): Promise<Follow> {
    try {
      const [follower, following] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: followerId },
          select: { id: true, isActive: true },
        }),
        this.prisma.user.findUnique({
          where: { id: followingId },
          select: { id: true, isActive: true },
        }),
      ]);

      if (!follower || !following) {
        throw AppException.notFound('user_not_found', 'Kullanıcı bulunamadı');
      }

      if (!follower.isActive || !following.isActive) {
        throw AppException.badRequest(
          'bad_request',
          'Kullanıcı hesabı aktif değil',
        );
      }

      if (followerId === followingId) {
        throw AppException.badRequest(
          'bad_request',
          'Kendinizi takip edemezsiniz',
        );
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
        throw AppException.conflict(
          'conflict',
          'Bu kullanıcıyı zaten takip ediyorsunuz',
        );
      }

      return await this.transactionHelper.runInTransaction(async (tx) => {
        const follow = await tx.follow.create({
          data: {
            followerId,
            followingId,
          },
          include: {
            following: {
              select: {
                id: true,
                displayName: true,
                profileImageUrl: true,
              },
            },
          },
        });

        await Promise.all([
          tx.userStats.update({
            where: { userId: followerId },
            data: { followingCount: { increment: 1 } },
          }),
          tx.userStats.update({
            where: { userId: followingId },
            data: { followersCount: { increment: 1 } },
          }),
        ]);

        this.logger.log(`User ${followerId} followed user ${followingId}`);
        return follow;
      }, 'Takip işlemi gerçekleştirilemedi');
    } catch (error) {
      this.logger.error(`Takip işlemi hatası: ${error.message}`, error.stack);

      if (error instanceof AppException) {
        throw error;
      }

      throw AppException.internal('Takip işlemi gerçekleştirilemedi');
    }
  }

  async sendMatchRequest(
    senderId: string,
    requestDto: MatchRequestDto,
  ): Promise<MatchRequest> {
    const { receiverId, message } = requestDto;

    try {
      const [sender, receiver] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: senderId },
          select: { id: true, isActive: true, displayName: true },
        }),
        this.prisma.user.findUnique({
          where: { id: receiverId },
          select: { id: true, isActive: true, displayName: true },
        }),
      ]);

      if (!sender || !receiver) {
        throw AppException.notFound('user_not_found', 'Kullanıcı bulunamadı');
      }

      if (!sender.isActive || !receiver.isActive) {
        throw AppException.badRequest(
          'bad_request',
          'Kullanıcı hesabı aktif değil',
        );
      }

      if (senderId === receiverId) {
        throw AppException.badRequest(
          'bad_request',
          'Kendinize eşleşme isteği gönderemezsiniz',
        );
      }

      const [existingMatch, existingRequest, pendingRequest] =
        await Promise.all([
          this.prisma.match.findFirst({
            where: {
              OR: [
                { initiatorId: senderId, receiverId },
                { initiatorId: receiverId, receiverId: senderId },
              ],
            },
          }),
          this.prisma.matchRequest.findUnique({
            where: {
              senderId_receiverId: { senderId, receiverId },
            },
          }),
          this.prisma.matchRequest.findUnique({
            where: {
              senderId_receiverId: {
                senderId: receiverId,
                receiverId: senderId,
              },
            },
          }),
        ]);

      if (existingMatch) {
        throw AppException.conflict(
          'match_exists',
          'Bu kullanıcıyla zaten bir eşleşmeniz var',
        );
      }

      if (existingRequest) {
        throw AppException.conflict(
          'conflict',
          'Bu kullanıcıya zaten bir eşleşme isteği gönderdiniz',
        );
      }

      if (pendingRequest && pendingRequest.status === 'pending') {
        this.logger.log(
          `Auto-accepting mutual match request between ${senderId} and ${receiverId}`,
        );

        return await this.transactionHelper.runInTransaction(async (tx) => {
          await tx.matchRequest.update({
            where: { id: pendingRequest.id },
            data: { status: 'accepted' },
          });

          const newRequest = await tx.matchRequest.create({
            data: {
              senderId,
              receiverId,
              message: message || '',
              status: 'accepted',
            },
            include: {
              sender: {
                select: {
                  id: true,
                  displayName: true,
                  profileImageUrl: true,
                },
              },
              receiver: {
                select: {
                  id: true,
                  displayName: true,
                  profileImageUrl: true,
                },
              },
            },
          });

          await tx.match.create({
            data: {
              initiatorId: receiverId,
              receiverId: senderId,
            },
          });

          await Promise.all([
            tx.userStats.update({
              where: { userId: senderId },
              data: { matchesCount: { increment: 1 } },
            }),
            tx.userStats.update({
              where: { userId: receiverId },
              data: { matchesCount: { increment: 1 } },
            }),
          ]);

          return newRequest;
        }, 'Karşılıklı eşleşme isteği işlenemedi');
      }

      const newRequest = await this.prisma.matchRequest.create({
        data: {
          senderId,
          receiverId,
          message: message || '',
        },
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
          receiver: {
            select: {
              id: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
        },
      });

      this.logger.log(
        `Match request created: ${newRequest.id} from ${senderId} to ${receiverId}`,
      );

      return newRequest;
    } catch (error) {
      if (
        !(error instanceof ConflictException) &&
        !(error instanceof BadRequestException) &&
        !(error instanceof NotFoundException) &&
        !(error instanceof AppException)
      ) {
        this.logger.error(
          `Unexpected error sending match request: ${error.message}`,
          error.stack,
        );
      }
      throw error;
    }
  }

  async rejectMatchRequest(
    requestId: string,
    receiverId: string,
  ): Promise<MatchRequest> {
    try {
      const request = await this.prisma.matchRequest.findUnique({
        where: { id: requestId },
        include: {
          sender: {
            select: { id: true, displayName: true },
          },
        },
      });

      if (!request) {
        throw AppException.notFound('not_found', 'Eşleşme isteği bulunamadı');
      }

      if (request.receiverId !== receiverId) {
        throw AppException.badRequest(
          'bad_request',
          'Bu isteğin alıcısı siz değilsiniz',
        );
      }

      if (request.status !== 'pending') {
        throw AppException.badRequest(
          'bad_request',
          `İstek zaten ${request.status} durumunda`,
        );
      }

      // İsteği reddet
      const rejectedRequest = await this.prisma.matchRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          updatedAt: new Date(),
        },
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
          receiver: {
            select: {
              id: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
        },
      });

      this.logger.log(
        `Match request ${requestId} rejected by user ${receiverId}`,
      );

      return rejectedRequest;
    } catch (error) {
      this.logger.error(
        `Eşleşme isteği reddetme hatası: ${error.message}`,
        error.stack,
      );

      if (error instanceof AppException) {
        throw error;
      }

      throw AppException.internal('Eşleşme isteği reddedilemedi');
    }
  }

  /**
   * Get match requests for a user with proper filtering and type safety
   */
  async getMatchRequests(
    userId: string,
    status = 'pending',
    limit = 20,
    offset = 0,
  ): Promise<{ items: MatchRequest[]; total: number }> {
    try {
      // Input validation
      const validStatuses = ['pending', 'accepted', 'rejected'];
      if (!validStatuses.includes(status)) {
        throw AppException.badRequest('bad_request', 'Geçersiz durum değeri');
      }

      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, offset);

      const where = {
        receiverId: userId,
        status,
      };

      const [total, requests] = await Promise.all([
        this.prisma.matchRequest.count({ where }),
        this.prisma.matchRequest.findMany({
          where,
          include: {
            sender: {
              select: {
                id: true,
                displayName: true,
                firstName: true,
                lastName: true,
                profileImageUrl: true,
                bio: true,
                countryCode: true,
              },
              include: {
                languages: {
                  where: { isNative: true },
                  include: { language: true },
                  take: 3, // Sadece ilk 3 anadil
                },
                stats: {
                  select: {
                    matchesCount: true,
                    lastActiveDate: true,
                  },
                },
              },
            },
          },
          take: safeLimit,
          skip: safeOffset,
          orderBy: {
            createdAt: 'desc',
          },
        }),
      ]);

      return {
        items: requests,
        total,
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error getting match requests: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Eşleşme istekleri alınamadı');
    }
  }
}
