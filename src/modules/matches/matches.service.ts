import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Match, MatchRequest, User, LanguageLevel } from '@prisma/client';
import { MatchRequestDto, MatchCriteriaDto } from './dto/match.dto';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get match recommendations for a user
   */
  async getMatchRecommendations(
    userId: string,
    criteria: MatchCriteriaDto,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    // Get user's languages
    const userWithLanguages = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        languages: {
          where: { isNative: true },
          include: {
            language: true,
          },
        },
      },
    });

    if (!userWithLanguages) {
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    // Get user's learning languages
    const userLearningLanguages = await this.prisma.userLanguage.findMany({
      where: {
        userId,
        isLearning: true,
      },
      include: {
        language: true,
      },
    });

    // Get user's existing matches and requests
    const [existingMatches, sentRequests, receivedRequests] = await Promise.all(
      [
        this.prisma.match.findMany({
          where: {
            OR: [{ initiatorId: userId }, { receiverId: userId }],
          },
          select: {
            initiatorId: true,
            receiverId: true,
          },
        }),
        this.prisma.matchRequest.findMany({
          where: { senderId: userId },
          select: { receiverId: true },
        }),
        this.prisma.matchRequest.findMany({
          where: { receiverId: userId },
          select: { senderId: true },
        }),
      ],
    );

    // Extract user IDs to exclude
    const excludeUserIds = new Set<string>([
      userId, // Exclude self
      ...existingMatches.map((match) =>
        match.initiatorId === userId ? match.receiverId : match.initiatorId,
      ),
      ...sentRequests.map((req) => req.receiverId),
      ...receivedRequests.map((req) => req.senderId),
    ]);

    // Build the recommendation query
    let query: any = {
      where: {
        id: { notIn: Array.from(excludeUserIds) },
        isActive: true,
      },
      include: {
        languages: {
          where: { isNative: true },
          include: {
            language: true,
          },
        },
      },
      take: limit,
      skip: offset,
    };

    // Add filter criteria
    if (criteria.nativeLanguageId) {
      query.where.languages = {
        some: {
          languageId: criteria.nativeLanguageId,
          isNative: true,
        },
      };
    }

    if (criteria.learningLanguageId) {
      query.where.languages = {
        some: {
          languageId: criteria.learningLanguageId,
          isLearning: true,
        },
      };
    }

    if (criteria.minLanguageLevel) {
      // Define the level hierarchy for comparison
      const levelHierarchy = {
        [LanguageLevel.BEGINNER]: 1,
        [LanguageLevel.INTERMEDIATE]: 2,
        [LanguageLevel.ADVANCED]: 3,
      };

      // Filter users based on language level
      const minLevel = levelHierarchy[criteria.minLanguageLevel];
      query.where.languages = {
        ...query.where.languages,
        some: {
          ...query.where.languages?.some,
          level: {
            in: Object.entries(levelHierarchy)
              .filter(([_, value]) => value >= minLevel)
              .map(([key, _]) => key),
          },
          isLearning: true,
        },
      };
    }

    if (criteria.countryCode) {
      query.where.countryCode = criteria.countryCode;
    }

    // Find language pairings
    const userNativeLanguageIds = userWithLanguages.languages.map(
      (ul) => ul.languageId,
    );

    const userLearningLanguageIds = userLearningLanguages.map(
      (ul) => ul.languageId,
    );

    // Look for users who are learning languages the current user knows natively
    // and who know natively languages the current user is learning
    if (!criteria.nativeLanguageId && !criteria.learningLanguageId) {
      query.where.OR = [
        {
          // User's native matches other's learning
          languages: {
            some: {
              isNative: true,
              languageId: { in: userLearningLanguageIds },
            },
          },
        },
        {
          // User's learning matches other's native
          languages: {
            some: {
              isLearning: true,
              languageId: { in: userNativeLanguageIds },
            },
          },
        },
      ];
    }

    // Execute query
    const [users, total] = await Promise.all([
      this.prisma.user.findMany(query),
      this.prisma.user.count({ where: query.where }),
    ]);

    return {
      items: users,
      total,
    };
  }

  /**
   * Send a match request
   */
  async sendMatchRequest(
    senderId: string,
    requestDto: MatchRequestDto,
  ): Promise<MatchRequest> {
    const { receiverId, message } = requestDto;

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
  }

  /**
   * Accept a match request
   */
  async acceptMatchRequest(
    requestId: string,
    receiverId: string,
  ): Promise<Match> {
    const request = await this.prisma.matchRequest.findUnique({
      where: { id: requestId },
      include: { sender: true },
    });

    if (!request) {
      throw new NotFoundException({
        error: 'request_not_found',
        message: 'Match request not found',
      });
    }

    if (request.receiverId !== receiverId) {
      throw new BadRequestException({
        error: 'not_receiver',
        message: 'You are not the receiver of this request',
      });
    }

    if (request.status !== 'pending') {
      throw new BadRequestException({
        error: 'invalid_request_status',
        message: `Request is already ${request.status}`,
      });
    }

    // Update request status
    await this.prisma.matchRequest.update({
      where: { id: requestId },
      data: { status: 'accepted' },
    });

    // Create match
    return this.createMatch(request.senderId, receiverId);
  }

  /**
   * Reject a match request
   */
  async rejectMatchRequest(
    requestId: string,
    receiverId: string,
  ): Promise<MatchRequest> {
    const request = await this.prisma.matchRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException({
        error: 'request_not_found',
        message: 'Match request not found',
      });
    }

    if (request.receiverId !== receiverId) {
      throw new BadRequestException({
        error: 'not_receiver',
        message: 'You are not the receiver of this request',
      });
    }

    if (request.status !== 'pending') {
      throw new BadRequestException({
        error: 'invalid_request_status',
        message: `Request is already ${request.status}`,
      });
    }

    // Update request status
    return this.prisma.matchRequest.update({
      where: { id: requestId },
      data: { status: 'rejected' },
    });
  }

  /**
   * Create a match between two users
   */
  private async createMatch(
    initiatorId: string,
    receiverId: string,
  ): Promise<Match> {
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
  }

  /**
   * Get matches for a user
   */
  async getUserMatches(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: Match[]; total: number }> {
    const total = await this.prisma.match.count({
      where: {
        OR: [{ initiatorId: userId }, { receiverId: userId }],
        status: 'active',
      },
    });

    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ initiatorId: userId }, { receiverId: userId }],
        status: 'active',
      },
      include: {
        initiator: {
          include: {
            languages: {
              where: { isNative: true },
              include: {
                language: true,
              },
            },
          },
        },
        receiver: {
          include: {
            languages: {
              where: { isNative: true },
              include: {
                language: true,
              },
            },
          },
        },
        conversation: true,
      },
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      items: matches,
      total,
    };
  }

  /**
   * Get match by ID
   */
  async getMatchById(matchId: string, userId: string): Promise<Match> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        initiator: {
          include: {
            languages: {
              where: { isNative: true },
              include: {
                language: true,
              },
            },
          },
        },
        receiver: {
          include: {
            languages: {
              where: { isNative: true },
              include: {
                language: true,
              },
            },
          },
        },
        conversation: true,
      },
    });

    if (!match) {
      throw new NotFoundException({
        error: 'match_not_found',
        message: 'Match not found',
      });
    }

    // Check if user is part of the match
    if (match.initiatorId !== userId && match.receiverId !== userId) {
      throw new BadRequestException({
        error: 'not_in_match',
        message: 'You are not part of this match',
      });
    }

    return match;
  }

  /**
   * Toggle favorite status for a match
   */
  async toggleFavorite(matchId: string, userId: string): Promise<Match> {
    const match = await this.getMatchById(matchId, userId);

    return this.prisma.match.update({
      where: { id: matchId },
      data: { isFavorite: !match.isFavorite },
    });
  }

  /**
   * End a match
   */
  async endMatch(matchId: string, userId: string): Promise<Match> {
    // Verify the match exists and the user is part of it
    await this.getMatchById(matchId, userId);

    return this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'ended' },
    });
  }
}
