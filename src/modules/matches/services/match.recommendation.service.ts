import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MatchCriteriaDto, ScoringWeightsDto } from '../dto/match.dto';
import { MatchScoringService } from './match-scoring.service';
import {
  Language,
  LanguageLevel,
  Match,
  User,
  UserLanguage,
} from '@prisma/client';

@Injectable()
export class MatchRecommendationService {
  private readonly logger = new Logger(MatchRecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchScoringService: MatchScoringService,
  ) {}

  /**
   * Get match recommendations for a user
   */
  async getMatchRecommendations(
    userId: string,
    criteria: MatchCriteriaDto,
    limit = 20,
    offset = 0,
  ): Promise<{ items: any[]; total: number }> {
    try {
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
        this.logger.warn(`User not found: ${userId}`);
        return { items: [], total: 0 };
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

      // Get exclusion list (existing matches, requests, etc.)
      const excludeUserIds = await this.getExcludedUserIds(userId);

      // Build the recommendation query
      const query = this.buildRecommendationQuery(
        userId,
        criteria,
        excludeUserIds,
        userWithLanguages,
        userLearningLanguages,
        limit,
        offset,
      );

      // Execute query
      const [users, total] = await Promise.all([
        this.prisma.user.findMany(query),
        this.prisma.user.count({ where: query.where }),
      ]);

      return {
        items: users,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Error getting match recommendations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get match recommendations with scoring
   */
  async getMatchRecommendationsWithScoring(
    userId: string,
    criteria: MatchCriteriaDto,
    limit = 20,
    offset = 0,
    weights?: ScoringWeightsDto,
  ): Promise<{ items: any[]; total: number }> {
    try {
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
        this.logger.warn(`User not found: ${userId}`);
        return { items: [], total: 0 };
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
          // MatchScoringService'i kullan - önceki implementasyonda burada calculateMatchScore doğrudan çağrılıyordu
          const scoreData = this.matchScoringService.calculateMatchScore(
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
    } catch (error) {
      this.logger.error(
        `Error getting scored match recommendations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get list of user IDs to exclude from recommendations
   */
  private async getExcludedUserIds(userId: string): Promise<Set<string>> {
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
    return new Set<string>([
      userId, // Exclude self
      ...existingMatches.map((match) =>
        match.initiatorId === userId ? match.receiverId : match.initiatorId,
      ),
      ...sentRequests.map((req) => req.receiverId),
      ...receivedRequests.map((req) => req.senderId),
    ]);
  }

  /**
   * Build the recommendation query based on criteria
   */
  private buildRecommendationQuery(
    userId: string,
    criteria: MatchCriteriaDto,
    excludeUserIds: Set<string>,
    userWithLanguages: User & {
      languages: Array<UserLanguage & { language: Language }>;
    },
    userLearningLanguages: Array<UserLanguage & { language: Language }>,
    limit: number,
    offset: number,
  ): any {
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

    return query;
  }
}
