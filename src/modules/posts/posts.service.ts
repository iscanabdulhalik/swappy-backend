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

  /**
   * Get feed posts
   */
  async getFeed(
    userId: string,
    queryDto: FeedQueryDto,
    limit = 20,
    offset = 0,
  ) {
    try {
      const { type, sort, languageId } = queryDto;

      // Takip edilen kullanıcıları tek seferde yükle
      let followingIds: string[] = [];
      if (type === 'friends') {
        const following = await this.prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        });
        followingIds = following.map((f) => f.followingId);
      }

      // Sorgu oluştur
      let query: any = {};

      switch (type) {
        case 'friends':
          query = {
            OR: [
              { authorId: userId }, // Kullanıcının kendi gönderileri
              {
                AND: [
                  { authorId: { in: followingIds } }, // Takip edilen kullanıcıların gönderileri
                  { isPublic: true }, // Herkese açık olan
                ],
              },
            ],
          };
          break;
        default:
          // Varsayılan tip 'all'
          query = {
            OR: [
              { authorId: userId }, // Kullanıcının kendi gönderileri
              { isPublic: true }, // Herkese açık olan
            ],
          };
      }

      // Dil filtresi ekle
      if (languageId) {
        query.languageId = languageId;
      }

      // Sıralama tanımla
      let orderBy: any;
      switch (sort) {
        case 'popular':
          orderBy = { likes: { _count: 'desc' } };
          break;
        case 'relevance':
          orderBy = { createdAt: 'desc' }; // Şimdilik createdAt kullan
          break;
        case 'recent':
        default:
          orderBy = { createdAt: 'desc' };
      }

      // Toplam sayıyı öğren
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

      // Kullanıcı beğenilerini dönüştür
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

      // Update user stats
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
    // Check if post exists and belongs to the user
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

    // Add media
    return this.prisma.postMedia.create({
      data: {
        postId,
        type: mediaDto.type,
        url: mediaDto.url,
        description: mediaDto.description,
      },
    });
  }

  /**
   * Get a post by ID
   */
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

    // Check if the post is not public and the user is not the author
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

  /**
   * Update a post
   */
  async updatePost(
    postId: string,
    userId: string,
    updatePostDto: UpdatePostDto,
  ) {
    // Check if post exists and belongs to the user
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

  /**
   * Delete a post
   */
  async deletePost(postId: string, userId: string) {
    // Check if post exists and belongs to the user
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

    // Delete post
    await this.prisma.post.delete({
      where: { id: postId },
    });

    // Update user stats
    await this.prisma.userStats.update({
      where: { userId },
      data: { postsCount: { decrement: 1 } },
    });
  }

  /**
   * Toggle like on a post
   */
  async toggleLikePost(postId: string, userId: string) {
    // Check if post exists
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

    // Check if user already liked the post
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

      // Send notification to post author if it's not the same user
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

  /**
   * Get comments for a post
   */
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

  /**
   * Add a comment to a post
   */
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

    // Check if the post is not public and the user is not the author
    if (!post.isPublic && post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'private_post',
        message: 'This post is private',
      });
    }

    // If this is a reply, check if parent comment exists
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

    // Send notification to post author if it's not the same user
    if (post.authorId !== userId) {
      this.notificationGateway.sendNotification(post.authorId, {
        type: NotificationType.COMMENT,
        actorId: userId,
        entityId: postId,
        entityType: 'post',
        message: `commented on your post`,
      });
    }

    // If this is a reply, also notify the parent comment author
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

  /**
   * Update a comment
   */
  async updateComment(
    commentId: string,
    userId: string,
    updateCommentDto: UpdateCommentDto,
  ) {
    // Check if comment exists and belongs to the user
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

    // Update comment
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

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string, userId: string) {
    // Check if comment exists and belongs to the user
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

    // Allow deletion if user is the comment author or the post author
    if (comment.authorId !== userId && comment.post.authorId !== userId) {
      throw new ForbiddenException({
        error: 'not_authorized',
        message: 'You are not authorized to delete this comment',
      });
    }

    // Delete comment
    await this.prisma.comment.delete({
      where: { id: commentId },
    });
  }

  /**
   * Toggle like on a comment
   */
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

    // Check if user already liked the comment
    const existingLike = await this.prisma.commentLike.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });

    if (existingLike) {
      // Unlike the comment
      await this.prisma.commentLike.delete({
        where: {
          id: existingLike.id,
        },
      });
      return { liked: false };
    } else {
      // Like the comment
      await this.prisma.commentLike.create({
        data: {
          commentId,
          userId,
        },
      });

      // Send notification to comment author if it's not the same user
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
