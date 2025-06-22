import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { NotificationGateway } from '../../websockets/notification.gateway';
import { NotificationType } from 'src/common/enums/app.enum';
import {
  CreatePostDto,
  UpdatePostDto,
  CreatePostMediaDto,
  CreateCommentDto,
  UpdateCommentDto,
  FeedQueryDto,
} from './dto/post.dto';
import { Logger } from '@nestjs/common';
import { AppException } from 'src/common/exceptions/app-exceptions';
import { TransactionHelper } from 'src/common/helpers/transaction.helper';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
    private readonly transactionHelper: TransactionHelper,
  ) {}

  async getFeed(
    userId: string,
    queryDto: FeedQueryDto,
    limit = 20,
    offset = 0,
  ) {
    try {
      const { type, sort, languageId } = queryDto;

      let followingIds: string[] = [];
      if (type === 'friends') {
        const following = await this.prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        });
        followingIds = following.map((f) => f.followingId);
      }

      let query: any = {};

      switch (type) {
        case 'friends':
          query = {
            OR: [
              { authorId: userId },
              {
                AND: [{ authorId: { in: followingIds } }, { isPublic: true }],
              },
            ],
          };
          break;
        default:
          query = {
            OR: [{ authorId: userId }, { isPublic: true }],
          };
      }

      if (languageId) {
        query.languageId = languageId;
      }

      let orderBy: any;
      switch (sort) {
        case 'popular':
          orderBy = { likes: { _count: 'desc' } };
          break;
        case 'relevance':
          orderBy = { createdAt: 'desc' };
          break;
        case 'recent':
        default:
          orderBy = { createdAt: 'desc' };
      }

      const total = await this.prisma.post.count({ where: query });

      // Tek sorguda tüm ilişkileri getir (N+1 sorununu önlemek için)
      const posts = await this.prisma.post.findMany({
        where: query,
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
          media: true,
          language: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: {
            where: {
              userId,
            },
            take: 1,
          },
        },
        take: limit,
        skip: offset,
        orderBy,
      });

      const transformedPosts = posts.map((post) => ({
        ...post,
        likedByMe: post.likes.length > 0,
        likes: undefined, // likes dizisini kaldır
      }));

      return {
        items: transformedPosts,
        total,
      };
    } catch (error) {
      this.logger.error(`Feed getirme hatası: ${error.message}`, error.stack);
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(500, 'internal_error', 'Feed getirilemedi');
    }
  }

  async createPost(authorId: string, createPostDto: CreatePostDto) {
    return this.transactionHelper.runInTransaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          authorId,
          content: createPostDto.content,
          languageId: createPostDto.languageId,
          isPublic: createPostDto.isPublic ?? true,
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

      await tx.userStats.update({
        where: { userId: authorId },
        data: { postsCount: { increment: 1 } },
      });

      return post;
    }, 'Gönderi oluşturulamadı');
  }

  async addPostMedia(
    postId: string,
    userId: string,
    mediaDto: CreatePostMediaDto,
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException({
        error: 'post_not_found',
        message: 'Post not found',
      });
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'not_author',
        message: 'You are not the author of this post',
      });
    }

    return this.prisma.postMedia.create({
      data: {
        postId,
        type: mediaDto.type,
        url: mediaDto.url,
        description: mediaDto.description,
      },
    });
  }

  async getPostById(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
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
        media: true,
        language: true,
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        likes: {
          where: {
            userId,
          },
          take: 1,
        },
      },
    });

    if (!post) {
      throw new NotFoundException({
        error: 'post_not_found',
        message: 'Post not found',
      });
    }

    if (!post.isPublic && post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'private_post',
        message: 'This post is private',
      });
    }

    // Transform post to include if the current user liked it
    return {
      ...post,
      likedByMe: post.likes.length > 0,
      likes: undefined, // Remove the likes array
    };
  }

  async updatePost(
    postId: string,
    userId: string,
    updatePostDto: UpdatePostDto,
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException({
        error: 'post_not_found',
        message: 'Post not found',
      });
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'not_author',
        message: 'You are not the author of this post',
      });
    }

    // Update post
    return this.prisma.post.update({
      where: { id: postId },
      data: updatePostDto,
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
        media: true,
        language: true,
      },
    });
  }

  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException({
        error: 'post_not_found',
        message: 'Post not found',
      });
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'not_author',
        message: 'You are not the author of this post',
      });
    }

    await this.prisma.post.delete({
      where: { id: postId },
    });

    await this.prisma.userStats.update({
      where: { userId },
      data: { postsCount: { decrement: 1 } },
    });
  }

  async toggleLikePost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException({
        error: 'post_not_found',
        message: 'Post not found',
      });
    }

    const existingLike = await this.prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existingLike) {
      // Unlike the post
      await this.prisma.postLike.delete({
        where: {
          id: existingLike.id,
        },
      });
      return { liked: false };
    } else {
      // Like the post
      await this.prisma.postLike.create({
        data: {
          postId,
          userId,
        },
      });

      if (post.authorId !== userId) {
        this.notificationGateway.sendNotification(post.authorId, {
          type: NotificationType.LIKE,
          actorId: userId,
          entityId: postId,
          entityType: 'post',
          message: `liked your post`,
        });
      }

      return { liked: true };
    }
  }

  async getPostComments(
    postId: string,
    userId: string,
    limit = 20,
    offset = 0,
  ) {
    // Check if post exists
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException({
        error: 'post_not_found',
        message: 'Post not found',
      });
    }

    // Check if the post is not public and the user is not the author
    if (!post.isPublic && post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'private_post',
        message: 'This post is private',
      });
    }

    // Get total count
    const total = await this.prisma.comment.count({
      where: {
        postId,
        parentCommentId: null, // Only count top-level comments
      },
    });

    // Get comments
    const comments = await this.prisma.comment.findMany({
      where: {
        postId,
        parentCommentId: null, // Only get top-level comments
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
        _count: {
          select: {
            likes: true,
            replies: true,
          },
        },
        likes: {
          where: {
            userId,
          },
          take: 1,
        },
        replies: {
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
            _count: {
              select: {
                likes: true,
              },
            },
            likes: {
              where: {
                userId,
              },
              take: 1,
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 3, // Show only first few replies
        },
      },
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform comments to include if the current user liked them
    const transformedComments = comments.map((comment) => ({
      ...comment,
      likedByMe: comment.likes.length > 0,
      likes: undefined, // Remove the likes array
      replies: comment.replies.map((reply) => ({
        ...reply,
        likedByMe: reply.likes.length > 0,
        likes: undefined, // Remove the likes array
      })),
    }));

    return {
      items: transformedComments,
      total,
    };
  }

  async addComment(
    postId: string,
    userId: string,
    createCommentDto: CreateCommentDto,
  ) {
    // Check if post exists
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException({
        error: 'post_not_found',
        message: 'Post not found',
      });
    }

    if (!post.isPublic && post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'private_post',
        message: 'This post is private',
      });
    }

    if (createCommentDto.parentCommentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: createCommentDto.parentCommentId },
      });

      if (!parentComment || parentComment.postId !== postId) {
        throw new BadRequestException({
          error: 'invalid_parent_comment',
          message: 'Parent comment is invalid',
        });
      }
    }

    // Create comment
    const comment = await this.prisma.comment.create({
      data: {
        postId,
        authorId: userId,
        content: createCommentDto.content,
        parentCommentId: createCommentDto.parentCommentId,
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
      },
    });

    if (post.authorId !== userId) {
      this.notificationGateway.sendNotification(post.authorId, {
        type: NotificationType.COMMENT,
        actorId: userId,
        entityId: postId,
        entityType: 'post',
        message: `commented on your post`,
      });
    }

    if (createCommentDto.parentCommentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: createCommentDto.parentCommentId },
      });

      if (parentComment && parentComment.authorId !== userId) {
        this.notificationGateway.sendNotification(parentComment.authorId, {
          type: NotificationType.COMMENT,
          actorId: userId,
          entityId: createCommentDto.parentCommentId,
          entityType: 'comment',
          message: `replied to your comment`,
        });
      }
    }

    return comment;
  }

  async updateComment(
    commentId: string,
    userId: string,
    updateCommentDto: UpdateCommentDto,
  ) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundException({
        error: 'comment_not_found',
        message: 'Comment not found',
      });
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException({
        error: 'not_author',
        message: 'You are not the author of this comment',
      });
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: {
        content: updateCommentDto.content,
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
      },
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: true,
      },
    });

    if (!comment) {
      throw new NotFoundException({
        error: 'comment_not_found',
        message: 'Comment not found',
      });
    }

    if (comment.authorId !== userId && comment.post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'not_authorized',
        message: 'You are not authorized to delete this comment',
      });
    }

    await this.prisma.comment.delete({
      where: { id: commentId },
    });
  }

  async toggleLikeComment(commentId: string, userId: string) {
    // Check if comment exists
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    if (!comment) {
      throw new NotFoundException({
        error: 'comment_not_found',
        message: 'Comment not found',
      });
    }

    const existingLike = await this.prisma.commentLike.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });

    if (existingLike) {
      await this.prisma.commentLike.delete({
        where: {
          id: existingLike.id,
        },
      });
      return { liked: false };
    } else {
      await this.prisma.commentLike.create({
        data: {
          commentId,
          userId,
        },
      });

      if (comment.authorId !== userId) {
        this.notificationGateway.sendNotification(comment.authorId, {
          type: NotificationType.LIKE,
          actorId: userId,
          entityId: commentId,
          entityType: 'comment',
          message: `liked your comment`,
        });
      }

      return { liked: true };
    }
  }
}
