import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { User } from '@prisma/client';
import { AppException } from '../../../common/exceptions/app-exceptions';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(prisma: PrismaService) {
    super(prisma, 'User');
  }

  /**
   * Find a user by email
   *
   * @param email - User's email
   * @returns User object or null if not found
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { email },
      });
    } catch (error) {
      this.logger.error(
        `Error finding user by email: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving user by email');
    }
  }

  /**
   * Find a user by Firebase UID
   *
   * @param firebaseUid - Firebase UID
   * @returns User object or null if not found
   */
  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { firebaseUid },
      });
    } catch (error) {
      this.logger.error(
        `Error finding user by Firebase UID: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving user by Firebase UID');
    }
  }

  /**
   * Get user with languages, stats, and settings
   *
   * @param userId - User ID
   * @returns User with relations or null if not found
   */
  async findWithRelations(userId: string): Promise<any | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          languages: {
            include: {
              language: true,
            },
          },
          stats: true,
          settings: true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error finding user with relations: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving user with relations');
    }
  }

  /**
   * Search for users with various criteria
   *
   * @param query - Search query
   * @param nativeLanguageId - Filter by native language
   * @param learningLanguageId - Filter by learning language
   * @param countryCode - Filter by country code
   * @param excludeUserId - User ID to exclude
   * @param page - Page number
   * @param pageSize - Items per page
   * @returns Paginated user search results
   */
  async searchUsers(
    query?: string,
    nativeLanguageId?: string,
    learningLanguageId?: string,
    countryCode?: string,
    excludeUserId?: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const filter: any = { isActive: true };

    if (excludeUserId) {
      filter.id = { not: excludeUserId };
    }

    if (query) {
      filter.OR = [
        { displayName: { contains: query, mode: 'insensitive' } },
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (nativeLanguageId) {
      filter.languages = {
        some: {
          languageId: nativeLanguageId,
          isNative: true,
        },
      };
    }

    if (learningLanguageId) {
      filter.languages = {
        some: {
          languageId: learningLanguageId,
          isLearning: true,
        },
      };
    }

    if (countryCode) {
      filter.countryCode = countryCode;
    }

    return this.findWithPagination(
      filter,
      page,
      pageSize,
      { displayName: 'asc' },
      {
        languages: {
          include: {
            language: true,
          },
        },
      },
    );
  }
}
