import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserById(
    id: string,
    includeLanguages = false,
    includeStats = false,
    includeSettings = false,
  ): Promise<User> {
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
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    return user;
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  async updateProfileImage(id: string, profileImageUrl: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { profileImageUrl },
    });
  }

  async updateUserSettings(
    id: string,
    settings: UpdateUserSettingsDto,
  ): Promise<User> {
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
  }

  async updateUserLanguages(
    id: string,
    dto: UpdateLanguagesDto,
  ): Promise<UserLanguage[]> {
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

    await this.prisma.userLanguage.deleteMany({
      where: { userId: id },
    });

    const newUserLanguages = await Promise.all(
      dto.languages.map((lang) =>
        this.prisma.userLanguage.create({
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
  }

  async searchUsers(
    userId: string,
    searchDto: UserSearchDto,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
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

    const total = await this.prisma.user.count({ where: filters });

    const users = await this.prisma.user.findMany({
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
    });

    return { items: users, total };
  }

  async getLanguages(): Promise<Language[]> {
    return this.prisma.language.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async followUser(followerId: string, followingId: string): Promise<Follow> {
    await this.getUserById(followerId);
    await this.getUserById(followingId);

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

    const follow = await this.prisma.follow.create({
      data: {
        followerId,
        followingId,
      },
    });

    await this.prisma.$transaction([
      this.prisma.userStats.update({
        where: { userId: followerId },
        data: { followingCount: { increment: 1 } },
      }),
      this.prisma.userStats.update({
        where: { userId: followingId },
        data: { followersCount: { increment: 1 } },
      }),
    ]);

    return follow;
  }

  async unfollowUser(followerId: string, followingId: string): Promise<void> {
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

    await this.prisma.follow.delete({
      where: {
        id: follow.id,
      },
    });

    await this.prisma.$transaction([
      this.prisma.userStats.update({
        where: { userId: followerId },
        data: { followingCount: { decrement: 1 } },
      }),
      this.prisma.userStats.update({
        where: { userId: followingId },
        data: { followersCount: { decrement: 1 } },
      }),
    ]);
  }

  async getUserFollowers(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    await this.getUserById(userId);

    const total = await this.prisma.follow.count({
      where: { followingId: userId },
    });

    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: {
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
    });

    return {
      items: follows.map((follow) => follow.follower),
      total,
    };
  }

  async getUserFollowing(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    await this.getUserById(userId);

    const total = await this.prisma.follow.count({
      where: { followerId: userId },
    });

    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: {
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
    });

    return {
      items: follows.map((follow) => follow.following),
      total,
    };
  }

  async getUserStats(userId: string): Promise<UserStats> {
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
  }

  async deleteUser(id: string): Promise<void> {
    await this.getUserById(id);

    await this.prisma.user.delete({
      where: { id },
    });
  }
}
