import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationGateway } from '../../websockets/notification.gateway';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import {
  Conversation,
  Message,
  MessageCorrection,
  UserConversation,
} from '@prisma/client';

import {
  CreateMessageDto,
  CreateMediaMessageDto,
  ReadConversationDto,
  MessageCorrectionDto,
  MessageReactionDto,
  ArchiveConversationDto,
  MuteConversationDto,
  CallDto,
  TranslationRequestDto,
} from './dto/conversation.dto';

type ConversationWithParticipants = Conversation & {
  language: {
    id: string;
    name: string;
  };
  match: any;
  participants: Array<{
    user: {
      id: string;
      displayName: string;
      firstName: string;
      lastName: string;
      profileImageUrl: string;
      nativeLanguages?: any[];
      learningLanguages?: any[];
    };
  }>;
};

// Cache TTL constants
const CACHE_TTL = {
  CONVERSATIONS: 300000, // 5 minutes
  CONVERSATION_DETAILS: 600000, // 10 minutes
  MESSAGES: 180000, // 3 minutes
  USER_LANGUAGES: 1800000, // 30 minutes
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Get all conversations for a user with Redis caching
   */
  async getUserConversations(
    userId: string,
    showArchived = false,
    limit = 20,
    offset = 0,
  ): Promise<{ items: Conversation[]; total: number }> {
    // Create cache key
    const cacheKey = `conversations:${userId}:${showArchived}:${limit}:${offset}`;

    // Check cache first
    const cachedResult = await this.cacheManager.get(cacheKey);
    if (cachedResult) {
      return cachedResult as { items: Conversation[]; total: number };
    }

    // Build where clause
    const where = {
      participants: {
        some: {
          userId,
          ...(showArchived ? {} : { isArchived: false }),
        },
      },
    };

    // Execute queries in parallel
    const [total, conversations] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        include: {
          language: true,
          match: true,
          participants: {
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
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        take: limit,
        skip: offset,
        orderBy: {
          updatedAt: 'desc',
        },
      }),
    ]);

    const result = { items: conversations, total };

    // Cache the result
    await this.cacheManager.set(cacheKey, result, CACHE_TTL.CONVERSATIONS);

    return result;
  }

  /**
   * Get conversation by ID with participant details and caching
   */
  async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<ConversationWithParticipants> {
    // Create cache key
    const cacheKey = `conversation:${conversationId}:${userId}`;

    // Check cache first
    const cachedResult = await this.cacheManager.get(cacheKey);
    if (cachedResult) {
      return cachedResult as ConversationWithParticipants;
    }

    // Find the conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        language: true,
        match: true,
        participants: {
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
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: 'conversation_not_found',
        message: 'Conversation not found',
      });
    }

    // Check if the user is a participant
    if (!this.isUserInConversation(conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Fetch languages for each participant with caching
    const enhancedParticipants = await Promise.all(
      conversation.participants.map(async (participant) => {
        const languageCacheKey = `user-languages:${participant.user.id}`;
        let languages = await this.cacheManager.get(languageCacheKey);

        if (!languages) {
          const [nativeLanguages, learningLanguages] = await Promise.all([
            this.prisma.userLanguage.findMany({
              where: { userId: participant.user.id, isNative: true },
              include: { language: true },
            }),
            this.prisma.userLanguage.findMany({
              where: { userId: participant.user.id, isLearning: true },
              include: { language: true },
            }),
          ]);

          languages = { nativeLanguages, learningLanguages };
          await this.cacheManager.set(
            languageCacheKey,
            languages,
            CACHE_TTL.USER_LANGUAGES,
          );
        }

        return {
          ...participant,
          user: {
            ...participant.user,
            ...(typeof languages === 'object' && languages !== null
              ? languages
              : {}),
          },
        };
      }),
    );

    const result = {
      ...conversation,
      participants: enhancedParticipants,
    } as ConversationWithParticipants;

    // Cache the result
    await this.cacheManager.set(
      cacheKey,
      result,
      CACHE_TTL.CONVERSATION_DETAILS,
    );

    return result;
  }

  /**
   * Get messages for a conversation with caching
   */
  async getConversationMessages(
    conversationId: string,
    options: { limit: number; offset: number; before?: Date; after?: Date } = {
      limit: 50,
      offset: 0,
    },
  ): Promise<{ items: Message[]; total: number }> {
    const { limit, offset, before, after } = options;

    // Create cache key including filters
    const dateFilters = {
      before: before?.toISOString() || '',
      after: after?.toISOString() || '',
    };
    const cacheKey = `messages:${conversationId}:${limit}:${offset}:${JSON.stringify(dateFilters)}`;

    // Check cache first
    const cachedResult = await this.cacheManager.get(cacheKey);
    if (cachedResult) {
      return cachedResult as { items: Message[]; total: number };
    }

    // Build where clause
    let where: any = { conversationId };
    if (before) {
      where.createdAt = { ...(where.createdAt || {}), lt: before };
    }
    if (after) {
      where.createdAt = { ...(where.createdAt || {}), gt: after };
    }

    // Execute queries in parallel
    const [total, messages] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          },
          corrections: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
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
      }),
    ]);

    const result = { items: messages, total };

    await this.cacheManager.set(cacheKey, result, CACHE_TTL.MESSAGES);

    return result;
  }

  async createMessage(
    senderId: string,
    conversationId: string,
    messageDto: CreateMessageDto,
  ): Promise<Message> {
    if (!messageDto.content || messageDto.content.trim() === '') {
      throw new BadRequestException({
        error: 'invalid_content',
        message: 'Message content cannot be empty',
      });
    }
    const sanitizedContent = this.sanitizeContent(messageDto.content);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: 'conversation_not_found',
        message: 'Conversation not found',
      });
    }

    if (!this.isUserInConversation(conversation, senderId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Create message with transaction
    const message = await this.prisma.$transaction(async (tx) => {
      const newMessage = await tx.message.create({
        data: {
          conversationId,
          senderId,
          content: messageDto.content,
          contentType: messageDto.contentType || 'text',
        },
        include: {
          sender: {
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

      // Update conversation timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      // Update user stats
      await tx.userStats.update({
        where: { userId: senderId },
        data: { messagesCount: { increment: 1 } },
      });

      return newMessage;
    });
    // Invalidate caches
    await this.invalidateConversationCaches(conversationId);
    await this.invalidateMessageCaches(conversationId);
    await this.invalidateUserConversationCaches(
      conversation.participants.map((p) => p.userId),
    );

    // Notify participants
    this.notifyParticipants(conversation, senderId, {
      type: 'new_message',
      message,
    });

    return message;
  }

  private sanitizeContent(content: string): string {
    return content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async createMediaMessage(
    senderId: string,
    conversationId: string,
    messageDto: CreateMediaMessageDto,
  ): Promise<Message> {
    // Check conversation and permissions
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: 'conversation_not_found',
        message: 'Conversation not found',
      });
    }

    if (!this.isUserInConversation(conversation, senderId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Create media message with transaction
    const message = await this.prisma.$transaction(async (tx) => {
      const newMessage = await tx.message.create({
        data: {
          conversationId,
          senderId,
          content: messageDto.content || '',
          contentType: messageDto.contentType,
          mediaUrl: messageDto.mediaUrl,
        },
        include: {
          sender: {
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

      // Update conversation timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      // Update user stats
      await tx.userStats.update({
        where: { userId: senderId },
        data: { messagesCount: { increment: 1 } },
      });

      return newMessage;
    });

    // Invalidate caches
    await this.invalidateConversationCaches(conversationId);
    await this.invalidateMessageCaches(conversationId);
    await this.invalidateUserConversationCaches(
      conversation.participants.map((p) => p.userId),
    );

    // Notify participants
    this.notifyParticipants(conversation, senderId, {
      type: 'new_message',
      message,
    });

    return message;
  }

  /**
   * Mark a conversation as read
   */
  async markConversationAsRead(
    userId: string,
    conversationId: string,
    dto?: ReadConversationDto,
  ): Promise<UserConversation> {
    // Check if user is in the conversation
    const userConversation = await this.prisma.userConversation.findUnique({
      where: {
        userId_conversationId: {
          userId,
          conversationId,
        },
      },
    });

    if (!userConversation) {
      throw new NotFoundException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Update last read timestamp
    const result = await this.prisma.userConversation.update({
      where: { id: userConversation.id },
      data: { lastReadAt: new Date() },
    });

    // Invalidate conversation cache for this user
    await this.invalidateUserConversationCaches([userId]);

    return result;
  }

  /**
   * Add a correction to a message
   */
  async correctMessage(
    userId: string,
    messageId: string,
    correctionDto: MessageCorrectionDto,
  ): Promise<MessageCorrection> {
    // Find the message
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: 'message_not_found',
        message: 'Message not found',
      });
    }

    // Check permissions
    if (!this.isUserInConversation(message.conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Create correction
    const correction = await this.prisma.messageCorrection.create({
      data: {
        messageId,
        userId,
        correctedContent: correctionDto.correctedContent,
        explanation: correctionDto.explanation,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Invalidate message caches
    await this.invalidateMessageCaches(message.conversationId);

    // Notify message sender
    if (message.senderId !== userId) {
      this.notificationGateway.sendNotification(message.senderId, {
        type: 'message_correction',
        correction,
        messageId,
        conversationId: message.conversationId,
      });
    }

    return correction;
  }

  /**
   * Toggle archiving a conversation
   */
  async toggleArchiveConversation(
    userId: string,
    conversationId: string,
    dto: ArchiveConversationDto,
  ): Promise<UserConversation> {
    // Check if user is in the conversation
    const userConversation = await this.prisma.userConversation.findUnique({
      where: {
        userId_conversationId: {
          userId,
          conversationId,
        },
      },
    });

    if (!userConversation) {
      throw new NotFoundException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Update archive status
    const result = await this.prisma.userConversation.update({
      where: { id: userConversation.id },
      data: { isArchived: dto.isArchived },
    });

    // Invalidate user conversation caches
    await this.invalidateUserConversationCaches([userId]);

    return result;
  }

  /**
   * Toggle muting a conversation
   */
  async toggleMuteConversation(
    userId: string,
    conversationId: string,
    dto: MuteConversationDto,
  ): Promise<UserConversation> {
    // Check if user is in the conversation
    const userConversation = await this.prisma.userConversation.findUnique({
      where: {
        userId_conversationId: {
          userId,
          conversationId,
        },
      },
    });

    if (!userConversation) {
      throw new NotFoundException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Update mute status
    const result = await this.prisma.userConversation.update({
      where: { id: userConversation.id },
      data: { isMuted: dto.isMuted },
    });

    // Invalidate user conversation caches
    await this.invalidateUserConversationCaches([userId]);

    return result;
  }

  /**
   * Request a translation for a message with caching
   */
  async translateMessage(
    userId: string,
    messageId: string,
    dto: TranslationRequestDto,
  ): Promise<{ original: string; translated: string }> {
    // Check cache first
    const cacheKey = `translation:${messageId}:${dto.targetLanguage}`;
    const cachedTranslation = await this.cacheManager.get(cacheKey);
    if (cachedTranslation) {
      return cachedTranslation as { original: string; translated: string };
    }

    // Find the message
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: 'message_not_found',
        message: 'Message not found',
      });
    }

    // Check permissions
    if (!this.isUserInConversation(message.conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // TODO: Implement actual translation service
    const result = {
      original: message.content,
      translated: `[Translated to ${dto.targetLanguage}] ${message.content}`,
    };

    // Cache translation for 24 hours
    await this.cacheManager.set(cacheKey, result, 86400000);

    return result;
  }

  /**
   * Add a reaction to a message
   */
  async addMessageReaction(
    userId: string,
    messageId: string,
    dto: MessageReactionDto,
  ): Promise<{ messageId: string; userId: string; reaction: string }> {
    // Find the message
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: 'message_not_found',
        message: 'Message not found',
      });
    }

    // Check permissions
    if (!this.isUserInConversation(message.conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Create reaction
    const reaction = {
      messageId,
      userId,
      reaction: dto.reaction,
    };

    // TODO: Store reactions in proper table
    // For now just invalidate message caches
    await this.invalidateMessageCaches(message.conversationId);

    // Notify message sender
    if (message.senderId !== userId) {
      this.notificationGateway.sendNotification(message.senderId, {
        type: 'message_reaction',
        reaction,
        messageId,
        conversationId: message.conversationId,
      });
    }

    return reaction;
  }

  /**
   * Remove a reaction from a message
   */
  async removeMessageReaction(
    userId: string,
    messageId: string,
    reactionId: string,
  ): Promise<void> {
    // Find the message
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: 'message_not_found',
        message: 'Message not found',
      });
    }

    // Check permissions
    if (!this.isUserInConversation(message.conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // TODO: Implement proper reaction removal
    // For now just invalidate caches
    await this.invalidateMessageCaches(message.conversationId);
  }

  /**
   * Initiate a call in a conversation
   */
  async initiateCall(
    userId: string,
    conversationId: string,
    dto: CallDto,
  ): Promise<{ callId: string; conversationId: string; type: string }> {
    // Check conversation and permissions
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException({
        error: 'conversation_not_found',
        message: 'Conversation not found',
      });
    }

    if (!this.isUserInConversation(conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Create call
    const callId = `call-${Date.now()}`;
    const callData = {
      callId,
      conversationId,
      type: dto.type,
    };

    // Cache active call
    await this.cacheManager.set(`call:${callId}`, callData, 3600000); // 1 hour

    // Notify participants
    this.notifyParticipants(conversation, userId, {
      type: 'incoming_call',
      call: callData,
      caller: conversation.participants.find((p) => p.userId === userId)?.user,
    });

    return callData;
  }

  /**
   * End a call
   */
  async endCall(
    userId: string,
    callId: string,
  ): Promise<{ callId: string; status: string }> {
    // Remove from cache
    await this.cacheManager.del(`call:${callId}`);

    return {
      callId,
      status: 'ended',
    };
  }

  /**
   * Check if a user is a participant in a conversation
   */
  private isUserInConversation(conversation: any, userId: string): boolean {
    return conversation.participants.some(
      (p: { userId: string }) => p.userId === userId,
    );
  }

  /**
   * Check if a user has access to a conversation with caching
   */
  async userHasAccessToConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const cacheKey = `access:${userId}:${conversationId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached !== null && cached !== undefined) {
      return cached as boolean;
    }

    const count = await this.prisma.userConversation.count({
      where: { userId, conversationId },
    });

    const hasAccess = count > 0;

    // Cache for 10 minutes
    await this.cacheManager.set(cacheKey, hasAccess, 600000);

    return hasAccess;
  }

  /**
   * Create a conversation between users
   */
  async createConversation(
    userIds: string[],
    languageId: string,
    matchId?: string,
  ): Promise<Conversation> {
    // Validation
    if (userIds.length < 2) {
      throw new BadRequestException({
        error: 'invalid_participants',
        message: 'Conversation must have at least 2 participants',
      });
    }

    // Check language exists
    const language = await this.prisma.language.findUnique({
      where: { id: languageId },
    });

    if (!language) {
      throw new NotFoundException({
        error: 'language_not_found',
        message: 'Language not found',
      });
    }

    // Create conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        languageId,
        ...(matchId ? { match: { connect: { id: matchId } } } : {}),
        participants: {
          create: userIds.map((userId) => ({ userId })),
        },
      },
      include: {
        language: true,
        participants: {
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
        },
      },
    });

    // Invalidate user conversation caches
    await this.invalidateUserConversationCaches(userIds);

    return conversation;
  }

  /**
   * Notify conversation participants about an event
   */
  private notifyParticipants(
    conversation: any,
    exceptUserId: string,
    notification: any,
  ): void {
    conversation.participants
      .filter((p: { userId: string }) => p.userId !== exceptUserId)
      .forEach((p: { userId: string }) => {
        this.notificationGateway.sendNotification(p.userId, {
          ...notification,
          conversationId: conversation.id,
        });
      });
  }

  // Cache invalidation methods
  private async invalidateUserConversationCaches(
    userIds: string[],
  ): Promise<void> {
    const promises = userIds.map(async (userId) => {
      const keys = await (this.cacheManager as any).store.keys(
        `conversations:${userId}:*`,
      );
      const deletePromises: Promise<void>[] = keys.map((key: string) =>
        this.cacheManager.del(key),
      );
      return Promise.all(deletePromises);
    });

    await Promise.all(promises);
  }

  private async invalidateConversationCaches(
    conversationId: string,
  ): Promise<void> {
    const keys = await (this.cacheManager as any).store.keys(
      `conversation:${conversationId}:*`,
    );
    const deletePromises: Promise<void>[] = keys.map((key: string) =>
      this.cacheManager.del(key),
    );
    await Promise.all(deletePromises);
  }

  private async invalidateMessageCaches(conversationId: string): Promise<void> {
    const keys = await (this.cacheManager as any).store.keys(
      `messages:${conversationId}:*`,
    );
    const deletePromises = keys.map((key: string) =>
      this.cacheManager.del(key),
    );
    await Promise.all(deletePromises);
  }
}
