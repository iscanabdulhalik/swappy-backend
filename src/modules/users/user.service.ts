import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
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
   * Get a user by ID with optional related data
   *
   * @param id - The user's unique identifier
   * @param includeLanguages - Whether to include language data
   * @param includeStats - Whether to include user statistics
   * @param includeSettings - Whether to include user settings
   * @returns User object with requested relations
   * @throws NotFoundException if user not found
   */
  async getUserById(
    id: string,
    includeLanguages = false,
    includeStats = false,
    includeSettings = false,
  ): Promise<User> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          languages: includeLanguages
            ? {
                include: {
                  language: true,
                },
              }
            : false,
          stats: includeStats,
          settings: includeSettings,
        },
      });

      if (!user) {
        this.logger.warn(`User not found: ${id}`);
        throw new NotFoundException({
          error: 'user_not_found',
          message: 'User not found',
        });
      }

      return user;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(`Error fetching user: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

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
      // First check if user exists
      await this.getUserById(id);

      return this.prisma.user.update({
        where: { id },
        data: updateUserDto,
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
   * Search for users based on various criteria
   *
   * @param userId - Current user's ID (to exclude from results)
   * @param searchDto - Search criteria
   * @param limit - Maximum number of results to return
   * @param offset - Pagination offset
   * @returns Object containing matching users and total count
   */
  async searchUsers(
    userId: string,
    searchDto: UserSearchDto,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    try {
      const filters: any = {
        id: { not: userId },
        isActive: true,
      };

      if (searchDto.query) {
        filters.OR = [
          { displayName: { contains: searchDto.query, mode: 'insensitive' } },
          { firstName: { contains: searchDto.query, mode: 'insensitive' } },
          { lastName: { contains: searchDto.query, mode: 'insensitive' } },
        ];
      }

      if (searchDto.nativeLanguageId) {
        filters.languages = {
          some: {
            languageId: searchDto.nativeLanguageId,
            isNative: true,
          },
        };
      }

      if (searchDto.learningLanguageId) {
        filters.languages = {
          some: {
            languageId: searchDto.learningLanguageId,
            isLearning: true,
          },
        };
      }

      if (searchDto.countryCode) {
        filters.countryCode = searchDto.countryCode;
      }

      const [total, users] = await Promise.all([
        this.prisma.user.count({ where: filters }),
        this.prisma.user.findMany({
          where: filters,
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
        }),
      ]);

      return { items: users, total };
    } catch (error) {
      this.logger.error(`Error searching users: ${error.message}`, error.stack);
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
      // Verify user exists
      await this.getUserById(userId);

      // Tek sorguda tüm veriyi çek (N+1 sorununu önlemek için)
      const follows = await this.prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            include: {
              // Doğrudan tüm languages sorgula
              languages: {
                include: {
                  language: true,
                },
              },
            },
          },
        },
        take: limit,
        skip: offset,
      });

      // Toplam sayıyı ayrıca sor
      const total = await this.prisma.follow.count({
        where: { followingId: userId },
      });

      // Her takipçi için native language'ları filtrele (veritabanı seviyesinde filtreleme yapmadık çünkü prefiltering yapmak çoklu ilişkilerde N+1 sorunu yaratır)
      const followersWithNativeLanguages = follows.map((follow) => {
        const follower = { ...follow.follower };
        follower.languages = follower.languages.filter((lang) => lang.isNative);
        return follower;
      });

      return {
        items: followersWithNativeLanguages,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Error getting user followers: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get users followed by a user
   */
  async getUserFollowing(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    try {
      // Verify user exists
      await this.getUserById(userId);

      // Tek sorguda tüm veriyi çek (N+1 sorununu önlemek için)
      const follows = await this.prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: {
            include: {
              // Doğrudan tüm languages sorgula
              languages: {
                include: {
                  language: true,
                },
              },
            },
          },
        },
        take: limit,
        skip: offset,
      });

      // Toplam sayıyı ayrıca sor
      const total = await this.prisma.follow.count({
        where: { followerId: userId },
      });

      // Her takipçi için native language'ları filtrele
      const followingWithNativeLanguages = follows.map((follow) => {
        const following = { ...follow.following };
        following.languages = following.languages.filter(
          (lang) => lang.isNative,
        );
        return following;
      });

      return {
        items: followingWithNativeLanguages,
        total,
      };
    } catch (error) {
      this.logger.error(
        `Error getting user following: ${error.message}`,
        error.stack,
      );
      throw error;
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
      throw error;
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
}
