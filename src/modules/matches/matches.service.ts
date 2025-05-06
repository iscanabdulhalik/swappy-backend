import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Match, MatchRequest, User, LanguageLevel } from '@prisma/client';
import {
  MatchRequestDto,
  MatchCriteriaDto,
  ScoringWeightsDto,
} from './dto/match.dto';

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
        hobbies: true, // Include user hobbies for matching
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
   * Get match recommendations with scoring based on compatibility
   */
  async getMatchRecommendationsWithScoring(
    userId: string,
    criteria: MatchCriteriaDto,
    limit = 20,
    offset = 0,
    weights?: ScoringWeightsDto,
  ): Promise<{ items: any[]; total: number }> {
    // Get the user with all required data for scoring
    const mainUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        languages: {
          include: {
            language: true,
          },
        },
        stats: true,
      },
    });

    if (!mainUser) {
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    // Get basic match recommendations
    const { items: users, total } = await this.getMatchRecommendations(
      userId,
      criteria,
      100, // Get more users for better scoring
      offset,
    );

    // Get full user data for candidates
    const usersWithFullData = await Promise.all(
      users.map(async (user) => {
        return this.prisma.user.findUnique({
          where: { id: user.id },
          include: {
            languages: {
              include: {
                language: true,
              },
            },
            stats: true,
          },
        });
      }),
    );

    // Calculate scores for each potential match
    const currentTime = Date.now();
    const scoredMatches = usersWithFullData
      .filter((user) => user !== null)
      .map((user) => {
        const scoreData = this.calculateMatchScore(
          mainUser,
          user,
          currentTime,
          weights,
        );
        return {
          user,
          score: scoreData.total,
          scoreDetails: scoreData.details,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      items: scoredMatches,
      total,
    };
  }

  /**
   * Calculate match score between two users
   */
  private calculateMatchScore(
    mainUser: any,
    candidate: any,
    currentTime: number,
    customWeights?: ScoringWeightsDto,
  ): any {
    // Define default scoring weights
    const weights = {
      recency: customWeights?.recency ?? 0.3,
      age: customWeights?.age ?? 0.2,
      activity: 0.2,
      languageMatch: customWeights?.languageMatch ?? 0.3,
    };

    // Calculate recency score based on last active date from stats
    let scoreRecency = 0.5; // Default value if no last active date
    if (candidate.stats?.lastActiveDate) {
      const lastSeenTime = new Date(candidate.stats.lastActiveDate).getTime();
      const recencyDays = (currentTime - lastSeenTime) / (1000 * 60 * 60 * 24);
      scoreRecency = Math.max(0, 1 - recencyDays / 90); // Score decreases if user hasn't been active recently
    }

    // Calculate age difference score (if birth dates are available)
    let scoreAge = 0.5; // Default value if no birth dates
    if (mainUser.birthDate && candidate.birthDate) {
      const mainBirth = new Date(mainUser.birthDate).getTime();
      const candidateBirth = new Date(candidate.birthDate).getTime();
      const ageDiff =
        Math.abs(mainBirth - candidateBirth) / (1000 * 60 * 60 * 24 * 365.25);
      scoreAge = Math.max(0, 1 - ageDiff / 47); // Score decreases with age difference
    }

    // Calculate activity score based on user stats
    let scoreActivity = 0;
    if (candidate.stats) {
      // Calculate score based on message count and learning days
      const messageScore = Math.min(1, candidate.stats.messagesCount / 100);
      const learningDaysScore = Math.min(1, candidate.stats.learningDays / 30);
      scoreActivity = (messageScore + learningDaysScore) / 2;
    }

    // Calculate language compatibility score
    const languageMatchScore = this.calculateLanguageCompatibility(
      mainUser,
      candidate,
    );

    // Calculate total score
    const total =
      weights.recency * scoreRecency +
      weights.age * scoreAge +
      weights.activity * scoreActivity +
      weights.languageMatch * languageMatchScore;

    return {
      total,
      details: {
        recency: scoreRecency,
        age: scoreAge,
        activity: scoreActivity,
        languageMatch: languageMatchScore,
      },
    };
  }

  /**
   * Calculate language compatibility between users
   */
  private calculateLanguageCompatibility(user1: any, user2: any): number {
    if (!user1.languages || !user2.languages) {
      return 0;
    }

    // Get native languages of user1
    const user1NativeLanguages = user1.languages
      .filter((ul) => ul.isNative)
      .map((ul) => ul.languageId);

    // Get learning languages of user1
    const user1LearningLanguages = user1.languages
      .filter((ul) => ul.isLearning)
      .map((ul) => ul.languageId);

    // Get native languages of user2
    const user2NativeLanguages = user2.languages
      .filter((ul) => ul.isNative)
      .map((ul) => ul.languageId);

    // Get learning languages of user2
    const user2LearningLanguages = user2.languages
      .filter((ul) => ul.isLearning)
      .map((ul) => ul.languageId);

    // Calculate language compatibility scores

    // Check if user1's native languages match user2's learning languages
    const user1NativeMatchesUser2Learning = user1NativeLanguages.some((lang) =>
      user2LearningLanguages.includes(lang),
    );

    // Check if user1's learning languages match user2's native languages
    const user1LearningMatchesUser2Native = user1LearningLanguages.some(
      (lang) => user2NativeLanguages.includes(lang),
    );

    // Check language levels to give bonus for advanced learners
    let levelBonus = 0;

    // Find matching language levels
    if (user1NativeMatchesUser2Learning || user1LearningMatchesUser2Native) {
      const matchingUserLanguages = user2.languages.filter((ul) => {
        return ul.isLearning && user1NativeLanguages.includes(ul.languageId);
      });

      // Add bonus for higher level learners
      for (const ul of matchingUserLanguages) {
        if (ul.level === LanguageLevel.ADVANCED) {
          levelBonus += 0.2;
        } else if (ul.level === LanguageLevel.INTERMEDIATE) {
          levelBonus += 0.1;
        }
      }
    }

    // Calculate final language score
    // Perfect match: both users can help each other
    if (user1NativeMatchesUser2Learning && user1LearningMatchesUser2Native) {
      return Math.min(1.0, 0.8 + levelBonus); // Cap at 1.0
    }
    // One-way match: only one user can help the other
    else if (
      user1NativeMatchesUser2Learning ||
      user1LearningMatchesUser2Native
    ) {
      return Math.min(0.7, 0.5 + levelBonus); // Cap at 0.7
    }
    // No language match
    else {
      return 0.0;
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
