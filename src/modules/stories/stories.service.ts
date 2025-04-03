import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateStoryDto, StoryViewDto } from './dto/story.dto';

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new story
   */
  async createStory(userId: string, createStoryDto: CreateStoryDto) {
    // Create story (expires after 24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return this.prisma.story.create({
      data: {
        authorId: userId,
        type: createStoryDto.type,
        mediaUrl: createStoryDto.mediaUrl,
        caption: createStoryDto.caption,
        languageId: createStoryDto.languageId,
        duration: createStoryDto.duration || 10,
        expiresAt,
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        },
        language: true,
      },
    });
  }

  /**
   * Get stories for the user's feed
   */
  async getStories(userId: string) {
    // Get current date
    const now = new Date();

    // Get user's following IDs
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    // Add current user to show their own stories too
    followingIds.push(userId);

    // Get active stories from followed users and group by author
    const stories = await this.prisma.story.findMany({
      where: {
        authorId: { in: followingIds },
        expiresAt: { gt: now }, // Only active stories
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        },
        language: true,
        views: {
          where: {
            userId,
          },
          take: 1,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    // Group stories by author
    const storiesByAuthor = stories.reduce((acc, story) => {
      const authorId = story.authorId;
      if (!acc[authorId]) {
        acc[authorId] = {
          author: story.author,
          stories: [],
        };
      }

      // Add viewed information to story
      acc[authorId].stories.push({
        ...story,
        viewed: story.views.length > 0,
        views: undefined, // Remove views array
      });

      return acc;
    }, {});

    // Convert to array and sort
    return Object.values(storiesByAuthor).sort((a: any, b: any) => {
      // Sort by whether any stories are unviewed
      const aHasUnviewed = a.stories.some((s) => !s.viewed);
      const bHasUnviewed = b.stories.some((s) => !s.viewed);

      if (aHasUnviewed && !bHasUnviewed) return -1;
      if (!aHasUnviewed && bHasUnviewed) return 1;

      // Then sort by most recent story
      const aLatest = Math.max(
        ...a.stories.map((s) => new Date(s.createdAt).getTime()),
      );
      const bLatest = Math.max(
        ...b.stories.map((s) => new Date(s.createdAt).getTime()),
      );

      return bLatest - aLatest;
    });
  }

  /**
   * Mark a story as viewed
   */
  async viewStory(userId: string, viewDto: StoryViewDto) {
    // Check if story exists and is active
    const now = new Date();
    const story = await this.prisma.story.findFirst({
      where: {
        id: viewDto.storyId,
        expiresAt: { gt: now },
      },
    });

    if (!story) {
      throw new NotFoundException({
        error: 'story_not_found',
        message: 'Story not found or has expired',
      });
    }

    // Check if already viewed
    const existingView = await this.prisma.storyView.findUnique({
      where: {
        storyId_userId: {
          storyId: viewDto.storyId,
          userId,
        },
      },
    });

    if (existingView) {
      // Update existing view
      return this.prisma.storyView.update({
        where: {
          id: existingView.id,
        },
        data: {
          viewedAt: now,
          viewDuration: viewDto.viewDuration || existingView.viewDuration,
        },
      });
    } else {
      // Create new view
      return this.prisma.storyView.create({
        data: {
          storyId: viewDto.storyId,
          userId,
          viewDuration: viewDto.viewDuration,
        },
      });
    }
  }

  /**
   * Get story views (for the story author)
   */
  async getStoryViews(storyId: string, userId: string) {
    // Check if story exists and belongs to the user
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      throw new NotFoundException({
        error: 'story_not_found',
        message: 'Story not found',
      });
    }

    if (story.authorId !== userId) {
      throw new BadRequestException({
        error: 'not_author',
        message: 'You are not the author of this story',
      });
    }

    // Get views with user details
    return this.prisma.storyView.findMany({
      where: { storyId },
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
      orderBy: { viewedAt: 'desc' },
    });
  }
}
