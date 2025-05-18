import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Match } from '@prisma/client';

@Injectable()
export class MatchManagementService {
  private readonly logger = new Logger(MatchManagementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get matches for a user
   */
  async getUserMatches(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: Match[]; total: number }> {
    try {
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
    } catch (error) {
      this.logger.error(
        `Error getting user matches: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get match by ID
   */
  async getMatchById(matchId: string, userId: string): Promise<Match> {
    try {
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
    } catch (error) {
      this.logger.error(
        `Error getting match by ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Toggle favorite status for a match
   */
  async toggleFavorite(matchId: string, userId: string): Promise<Match> {
    try {
      const match = await this.getMatchById(matchId, userId);

      return this.prisma.match.update({
        where: { id: matchId },
        data: { isFavorite: !match.isFavorite },
      });
    } catch (error) {
      this.logger.error(
        `Error toggling favorite status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * End a match
   */
  async endMatch(matchId: string, userId: string): Promise<Match> {
    try {
      // Verify the match exists and the user is part of it
      await this.getMatchById(matchId, userId);

      return this.prisma.match.update({
        where: { id: matchId },
        data: { status: 'ended' },
      });
    } catch (error) {
      this.logger.error(`Error ending match: ${error.message}`, error.stack);
      throw error;
    }
  }
}
