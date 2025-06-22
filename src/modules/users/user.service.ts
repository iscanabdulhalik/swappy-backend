import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  User,
  UserLanguage,
  Language,
  Follow,
  UserStats,
} from '@prisma/client';
import {
  UpdateUserDto,
  UpdateLanguagesDto,
  UserSearchDto,
  UpdateUserSettingsDto,
} from './dto/user.dto';
import { LanguageService } from './services/language.service';
import { AppException } from '../../common/exceptions/app-exceptions';

/**
 * Service responsible for managing user-related operations
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly languageService: LanguageService,
  ) {}

  /**
   * Update a user's profile information
   *
   * @param id - The user's unique identifier
   * @param updateUserDto - The data to update
   * @returns Updated user object
   * @throws NotFoundException if user not found
   */
  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      await this.getUserById(id);

      const updateData = {
        ...updateUserDto,
        ...(updateUserDto.birthDate && {
          birthDate: new Date(updateUserDto.birthDate),
        }),
      };

      return this.prisma.user.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(`Error updating user: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update a user's profile image
   *
   * @param id - The user's unique identifier
   * @param profileImageUrl - URL to the profile image
   * @returns Updated user object
   * @throws NotFoundException if user not found
   */
  async updateProfileImage(id: string, profileImageUrl: string): Promise<User> {
    try {
      // First check if user exists
      await this.getUserById(id);

      return this.prisma.user.update({
        where: { id },
        data: { profileImageUrl },
      });
    } catch (error) {
      this.logger.error(
        `Error updating profile image: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update a user's settings
   *
   * @param id - The user's unique identifier
   * @param settings - The settings to update
   * @returns Updated user object with settings
   * @throws NotFoundException if user not found
   */
  async updateUserSettings(
    id: string,
    settings: UpdateUserSettingsDto,
  ): Promise<User> {
    try {
      await this.getUserById(id);

      await this.prisma.userSettings.upsert({
        where: { userId: id },
        create: {
          userId: id,
          ...settings,
        },
        update: settings,
      });

      return this.getUserById(id, false, false, true);
    } catch (error) {
      this.logger.error(
        `Error updating user settings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update a user's language preferences
   *
   * @param id - The user's unique identifier
   * @param dto - DTO containing language data
   * @returns Array of updated user languages
   * @throws NotFoundException if user not found
   * @throws BadRequestException if language data is invalid
   */
  async updateUserLanguages(
    id: string,
    dto: UpdateLanguagesDto,
  ): Promise<UserLanguage[]> {
    try {
      await this.getUserById(id);

      const languageIds = dto.languages.map((lang) => lang.languageId);
      const languages = await this.prisma.language.findMany({
        where: { id: { in: languageIds } },
      });

      if (languages.length !== languageIds.length) {
        throw new BadRequestException({
          error: 'invalid_languages',
          message: 'One or more language IDs are invalid',
        });
      }

      if (!dto.languages.some((lang) => lang.isNative)) {
        throw new BadRequestException({
          error: 'native_language_required',
          message: 'At least one native language is required',
        });
      }

      // Using transaction to ensure data consistency
      return await this.prisma.$transaction(async (tx) => {
        // Delete existing languages
        await tx.userLanguage.deleteMany({
          where: { userId: id },
        });

        // Create new language records
        const newUserLanguages = await Promise.all(
          dto.languages.map((lang) =>
            tx.userLanguage.create({
              data: {
                userId: id,
                languageId: lang.languageId,
                level: lang.level,
                isNative: lang.isNative,
                isLearning: lang.isLearning,
              },
            }),
          ),
        );

        return newUserLanguages;
      });
    } catch (error) {
      this.logger.error(
        `Error updating user languages: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get all available languages (cached)
   *
   * @returns Array of all language objects
   */
  async getLanguages(): Promise<Language[]> {
    return this.languageService.getAllLanguages();
  }

  /**
   * Follow another user
   *
   * @param followerId - ID of the user who is following
   * @param followingId - ID of the user to be followed
   * @returns The created follow relationship
   * @throws NotFoundException if either user not found
   * @throws BadRequestException if user attempts to follow themselves
   * @throws ConflictException if already following
   */
  async followUser(followerId: string, followingId: string): Promise<Follow> {
    try {
      // Verify both users exist
      await Promise.all([
        this.getUserById(followerId),
        this.getUserById(followingId),
      ]);

      if (followerId === followingId) {
        throw new BadRequestException({
          error: 'invalid_follow',
          message: 'Users cannot follow themselves',
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
          message: 'You are already following this user',
        });
      }

      // Create follow relationship and update stats in a transaction
      return await this.prisma.$transaction(async (tx) => {
        const follow = await tx.follow.create({
          data: {
            followerId,
            followingId,
          },
        });

        // Update follower/following counts
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

        return follow;
      });
    } catch (error) {
      this.logger.error(`Error following user: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Unfollow a user
   *
   * @param followerId - ID of the user who is unfollowing
   * @param followingId - ID of the user to be unfollowed
   * @throws NotFoundException if follow relationship not found
   */
  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    try {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      });

      if (!follow) {
        throw new NotFoundException({
          error: 'not_following',
          message: 'You are not following this user',
        });
      }

      // Delete follow relationship and update stats in a transaction
      await this.prisma.$transaction(async (tx) => {
        await tx.follow.delete({
          where: {
            id: follow.id,
          },
        });

        // Update follower/following counts
        await Promise.all([
          tx.userStats.update({
            where: { userId: followerId },
            data: { followingCount: { decrement: 1 } },
          }),
          tx.userStats.update({
            where: { userId: followingId },
            data: { followersCount: { decrement: 1 } },
          }),
        ]);
      });
    } catch (error) {
      this.logger.error(
        `Error unfollowing user: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get followers of a user
   *
   * @param userId - The user's unique identifier
   * @param limit - Maximum number of results to return
   * @param offset - Pagination offset
   * @returns Object containing followers and total count
   * @throws NotFoundException if user not found
   */

  async getUserFollowers(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    try {
      // Kullanıcı var mı kontrol et
      await this.validateUserExists(userId);

      // Input validation
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, offset);

      // Tek sorguda tüm gerekli verileri çek (N+1 problemi çözümü)
      const [total, followersData] = await Promise.all([
        this.prisma.follow.count({
          where: { followingId: userId },
        }),
        this.prisma.follow.findMany({
          where: { followingId: userId },
          include: {
            follower: {
              include: {
                languages: {
                  where: { isNative: true },
                  include: { language: true },
                  take: 5, // Performans için limit
                },
                stats: {
                  select: {
                    matchesCount: true,
                    followersCount: true,
                    followingCount: true,
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

      // Sadece follower user'ları döndür
      const followers = followersData.map((follow) => follow.follower);

      return {
        items: followers,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Kullanıcı takipçilerini alırken hata: ${error.message}`,
        error.stack,
      );

      if (error instanceof AppException) {
        throw error;
      }

      throw AppException.internal('Kullanıcı takipçileri alınamadı');
    }
  }

  /**
   * Get user following with optimized query (N+1 fix)
   */
  async getUserFollowing(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    try {
      // Kullanıcı var mı kontrol et
      await this.validateUserExists(userId);

      // Input validation
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, offset);

      // Tek sorguda tüm gerekli verileri çek (N+1 problemi çözümü)
      const [total, followingData] = await Promise.all([
        this.prisma.follow.count({
          where: { followerId: userId },
        }),
        this.prisma.follow.findMany({
          where: { followerId: userId },
          include: {
            following: {
              include: {
                languages: {
                  where: { isNative: true },
                  include: { language: true },
                  take: 5, // Performans için limit
                },
                stats: {
                  select: {
                    matchesCount: true,
                    followersCount: true,
                    followingCount: true,
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

      // Sadece following user'ları döndür
      const following = followingData.map((follow) => follow.following);

      return {
        items: following,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Kullanıcının takip ettiklerini alırken hata: ${error.message}`,
        error.stack,
      );

      if (error instanceof AppException) {
        throw error;
      }

      throw AppException.internal('Kullanıcının takip ettikleri alınamadı');
    }
  }

  /**
   * Get a user's statistics
   *
   * @param userId - The user's unique identifier
   * @returns User statistics object
   * @throws NotFoundException if stats not found
   */
  async getUserStats(userId: string): Promise<UserStats> {
    try {
      const stats = await this.prisma.userStats.findUnique({
        where: { userId },
      });

      if (!stats) {
        throw new NotFoundException({
          error: 'stats_not_found',
          message: 'User stats not found',
        });
      }

      return stats;
    } catch (error) {
      this.logger.error(
        `Error getting user stats: ${error.message}`,
        error.stack,
      );
      throw new AppException(
        500,
        'internal_error',
        'Kullanıcı istatistikleri alınamadı',
      );
    }
  }

  /**
   * Delete a user account
   *
   * @param id - The user's unique identifier
   * @throws NotFoundException if user not found
   */
  async deleteUser(id: string): Promise<void> {
    try {
      await this.getUserById(id);

      await this.prisma.user.delete({
        where: { id },
      });

      this.logger.log(`User deleted: ${id}`);
    } catch (error) {
      this.logger.error(`Error deleting user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserHobbies(userId: string): Promise<string[]> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          hobbies: true,
        },
      });
      return user?.hobbies || [];
    } catch (error) {
      this.logger.error(
        `Error getting user hobbies: ${error.message}`,
        error.stack,
      );
      throw new AppException(
        500,
        'internal_error',
        'Kullanıcı hobileri alınamadı',
      );
    }
  }

  async searchUsers(
    userId: string,
    searchDto: UserSearchDto,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    try {
      // Input validation
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, offset);

      const filters: any = {
        id: { not: userId },
        isActive: true,
      };

      // Text search
      if (searchDto.query?.trim()) {
        const searchTerm = searchDto.query.trim();
        filters.OR = [
          { displayName: { contains: searchTerm, mode: 'insensitive' } },
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      // Language filters
      if (searchDto.nativeLanguageId || searchDto.learningLanguageId) {
        const languageConditions: {
          languageId: string;
          isNative?: boolean;
          isLearning?: boolean;
        }[] = [];

        if (searchDto.nativeLanguageId) {
          languageConditions.push({
            languageId: searchDto.nativeLanguageId,
            isNative: true,
          });
        }

        if (searchDto.learningLanguageId) {
          languageConditions.push({
            languageId: searchDto.learningLanguageId,
            isLearning: true,
          });
        }

        filters.languages = {
          some:
            languageConditions.length === 1
              ? languageConditions[0]
              : { OR: languageConditions },
        };
      }

      // Country filter
      if (searchDto.countryCode?.trim()) {
        filters.countryCode = searchDto.countryCode.trim();
      }

      // Optimized query with all necessary relations in one go
      const [total, users] = await Promise.all([
        this.prisma.user.count({ where: filters }),
        this.prisma.user.findMany({
          where: filters,
          include: {
            languages: {
              include: { language: true },
              orderBy: [
                { isNative: 'desc' },
                { isLearning: 'desc' },
                { level: 'desc' },
              ],
              take: 10, // Performans için limit
            },
            stats: {
              select: {
                matchesCount: true,
                followersCount: true,
                followingCount: true,
                lastActiveDate: true,
              },
            },
            // Mevcut kullanıcının bu kişiyi takip edip etmediğini kontrol et
            followers: {
              where: { followerId: userId },
              select: { id: true },
              take: 1,
            },
          },
          take: safeLimit,
          skip: safeOffset,
          orderBy: [
            { stats: { lastActiveDate: 'desc' } },
            { displayName: 'asc' },
          ],
        }),
      ]);

      // Transform results to include isFollowing flag
      const transformedUsers = users.map((user) => ({
        ...user,
        isFollowing: user.followers.length > 0,
        followers: undefined, // Remove the followers array from response
      }));

      return {
        items: transformedUsers,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Kullanıcı arama hatası: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Kullanıcı araması gerçekleştirilemedi');
    }
  }

  /**
   * Get user by ID with optimized relations (N+1 fix)
   */
  async getUserById(
    id: string,
    includeLanguages = false,
    includeStats = false,
    includeSettings = false,
  ): Promise<User> {
    try {
      const includeRelations: any = {};

      if (includeLanguages) {
        includeRelations.languages = {
          include: { language: true },
          orderBy: [
            { isNative: 'desc' },
            { isLearning: 'desc' },
            { level: 'desc' },
          ],
        };
      }

      if (includeStats) {
        includeRelations.stats = true;
      }

      if (includeSettings) {
        includeRelations.settings = {
          include: {
            notificationPreferences: {
              orderBy: { type: 'asc' },
            },
          },
        };
      }

      const user = await this.prisma.user.findUnique({
        where: { id },
        include: includeRelations,
      });

      if (!user) {
        this.logger.warn(`User not found: ${id}`);
        throw AppException.notFound('user_not_found', 'User not found');
      }

      if (!user.isActive) {
        throw AppException.badRequest(
          'bad_request',
          'User account is deactivated',
        );
      }

      return user;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(`Error fetching user: ${error.message}`, error.stack);
      throw AppException.internal('Error retrieving user');
    }
  }

  /**
   * Get user's mutual connections (optimized)
   */
  async getMutualConnections(
    userId: string,
    targetUserId: string,
    limit = 10,
  ): Promise<{ items: User[]; total: number }> {
    try {
      // Validate both users exist
      await Promise.all([
        this.validateUserExists(userId),
        this.validateUserExists(targetUserId),
      ]);

      // Get mutual follows in one optimized query
      const mutualFollows = await this.prisma.user.findMany({
        where: {
          AND: [
            {
              followers: {
                some: { followerId: userId },
              },
            },
            {
              followers: {
                some: { followerId: targetUserId },
              },
            },
            {
              id: { notIn: [userId, targetUserId] },
            },
            {
              isActive: true,
            },
          ],
        },
        include: {
          languages: {
            where: { isNative: true },
            include: { language: true },
            take: 3,
          },
          stats: {
            select: {
              followersCount: true,
              matchesCount: true,
            },
          },
        },
        take: limit,
        orderBy: [
          { stats: { followersCount: 'desc' } },
          { displayName: 'asc' },
        ],
      });

      return {
        items: mutualFollows,
        total: mutualFollows.length,
      };
    } catch (error) {
      this.logger.error(
        `Mutual connections error: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving mutual connections');
    }
  }

  /**
   * Get user activity feed (optimized for performance)
   */
  async getUserActivityFeed(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: any[]; total: number }> {
    try {
      await this.validateUserExists(userId);

      const safeLimit = Math.min(Math.max(1, limit), 50);
      const safeOffset = Math.max(0, offset);

      // Get user's following list first
      const following = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });

      const followingIds = following.map((f) => f.followingId);
      followingIds.push(userId); // Include user's own activities

      // Get recent activities with all necessary data in one query
      const activities = await this.prisma.post.findMany({
        where: {
          authorId: { in: followingIds },
          isPublic: true,
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
          language: {
            select: {
              id: true,
              name: true,
              flagEmoji: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
          media: {
            select: {
              id: true,
              type: true,
              url: true,
            },
            take: 3, // Limit media items for performance
          },
        },
        take: safeLimit,
        skip: safeOffset,
        orderBy: { createdAt: 'desc' },
      });

      // Transform activities
      const transformedActivities = activities.map((activity) => ({
        ...activity,
        isLiked: activity.likes.length > 0,
        likes: undefined, // Remove likes array
      }));

      return {
        items: transformedActivities,
        total: transformedActivities.length,
      };
    } catch (error) {
      this.logger.error(
        `User activity feed error: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving activity feed');
    }
  }

  /**
   * Helper method to validate user existence
   */
  private async validateUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!user) {
      throw AppException.notFound('user_not_found', 'User not found');
    }

    if (!user.isActive) {
      throw AppException.badRequest(
        'bad_request',
        'User account is deactivated',
      );
    }
  }
}
