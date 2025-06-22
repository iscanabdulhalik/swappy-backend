import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
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
import { createHash } from 'crypto';

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
  logger: Logger = new Logger(ConversationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private generateCacheKey(
    prefix: string,
    params: Record<string, any>,
  ): string {
    // Normalize parameters to ensure consistent key generation
    const normalizedParams = this.normalizeParams(params);

    // Create deterministic string from parameters
    const paramString = Object.keys(normalizedParams)
      .sort()
      .map((key) => `${key}=${JSON.stringify(normalizedParams[key])}`)
      .join('&');

    // Create hash to prevent key collision and length issues
    const hash = createHash('md5').update(paramString).digest('hex');

    // Return safe cache key
    return `${prefix}:${hash}`;
  }

  /**
   * Normalize parameters for consistent cache key generation
   */
  private normalizeParams(params: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        normalized[key] = 'null';
      } else if (typeof value === 'boolean') {
        normalized[key] = value ? '1' : '0';
      } else if (typeof value === 'number') {
        normalized[key] = value.toString();
      } else if (typeof value === 'string') {
        normalized[key] = value;
      } else if (value instanceof Date) {
        normalized[key] = value.toISOString();
      } else {
        normalized[key] = JSON.stringify(value);
      }
    }

    return normalized;
  }

  async getUserConversations(
    userId: string,
    showArchived = false,
    limit = 20,
    offset = 0,
  ): Promise<{ items: Conversation[]; total: number }> {
    // Generate safe cache key
    const cacheKey = this.generateCacheKey('conversations', {
      userId,
      showArchived,
      limit,
      offset,
    });

    try {
      // Check cache first
      const cachedResult = await this.cacheManager.get(cacheKey);
      if (cachedResult) {
        this.logger.debug(`Cache hit for conversations: ${cacheKey}`);
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

      // Cache the result with TTL
      await this.cacheManager.set(cacheKey, result, CACHE_TTL.CONVERSATIONS);

      this.logger.debug(`Cache set for conversations: ${cacheKey}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting user conversations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getCacheStats(): Promise<{
    totalKeys: number;
    keysByPrefix: Record<string, number>;
  }> {
    try {
      if (
        this.cacheManager.stores &&
        typeof (this.cacheManager as any).store.keys === 'function'
      ) {
        const keys = await (this.cacheManager as any).store.keys();
        const keysByPrefix: Record<string, number> = {};

        keys.forEach((key: string) => {
          const prefix = key.split(':')[0];
          keysByPrefix[prefix] = (keysByPrefix[prefix] || 0) + 1;
        });

        return {
          totalKeys: keys.length,
          keysByPrefix,
        };
      }

      return {
        totalKeys: 0,
        keysByPrefix: {},
      };
    } catch (error) {
      this.logger.warn(`Failed to get cache stats: ${error.message}`);
      return {
        totalKeys: 0,
        keysByPrefix: {},
      };
    }
  }

  async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<ConversationWithParticipants> {
    // Generate safe cache key
    const cacheKey = this.generateCacheKey('conversation_details', {
      conversationId,
      userId,
    });

    try {
      // Check cache first
      const cachedResult = await this.cacheManager.get(cacheKey);
      if (cachedResult) {
        this.logger.debug(`Cache hit for conversation: ${cacheKey}`);
        return cachedResult as ConversationWithParticipants;
      }

      // Find the conversation with all necessary relations
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

      // Fetch languages for each participant with individual caching
      const enhancedParticipants = await Promise.all(
        conversation.participants.map(async (participant) => {
          const languageData = await this.getCachedUserLanguages(
            participant.user.id,
          );
          return {
            ...participant,
            user: {
              ...participant.user,
              ...(typeof languageData === 'object' && languageData !== null
                ? languageData
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

      this.logger.debug(`Cache set for conversation: ${cacheKey}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting conversation by ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get cached user languages with safe key generation
   */
  private async getCachedUserLanguages(userId: string) {
    const cacheKey = this.generateCacheKey('user_languages', { userId });

    try {
      let languages = await this.cacheManager.get(cacheKey);

      if (!languages) {
        const [nativeLanguages, learningLanguages] = await Promise.all([
          this.prisma.userLanguage.findMany({
            where: { userId, isNative: true },
            include: { language: true },
          }),
          this.prisma.userLanguage.findMany({
            where: { userId, isLearning: true },
            include: { language: true },
          }),
        ]);

        languages = { nativeLanguages, learningLanguages };

        await this.cacheManager.set(
          cacheKey,
          languages,
          CACHE_TTL.USER_LANGUAGES,
        );
      }

      return languages;
    } catch (error) {
      this.logger.warn(
        `Failed to get cached user languages for ${userId}: ${error.message}`,
      );
      return { nativeLanguages: [], learningLanguages: [] };
    }
  }

  async getConversationMessages(
    conversationId: string,
    options: { limit: number; offset: number; before?: Date; after?: Date } = {
      limit: 50,
      offset: 0,
    },
  ): Promise<{ items: Message[]; total: number }> {
    const { limit, offset, before, after } = options;

    // Generate safe cache key
    const cacheKey = this.generateCacheKey('messages', {
      conversationId,
      limit,
      offset,
      before,
      after,
    });

    try {
      // Check cache first
      const cachedResult = await this.cacheManager.get(cacheKey);
      if (cachedResult) {
        this.logger.debug(`Cache hit for messages: ${cacheKey}`);
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

      // Cache the result
      await this.cacheManager.set(cacheKey, result, CACHE_TTL.MESSAGES);

      this.logger.debug(`Cache set for messages: ${cacheKey}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting conversation messages: ${error.message}`,
        error.stack,
      );
      throw error;
    }
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

  private async invalidateMessageCaches(conversationId: string): Promise<void> {
    if (!conversationId) {
      this.logger.warn(
        'No conversation ID provided for message cache invalidation',
      );
      return;
    }

    try {
      if (
        !this.cacheManager.stores ||
        typeof (this.cacheManager as any).store.keys !== 'function'
      ) {
        // Fallback: Genel mesaj cache'ini sil
        await this.cacheManager
          .del(`messages:${conversationId}`)
          .catch((error) =>
            this.logger.warn(
              `Failed to delete message cache: ${error.message}`,
            ),
          );
        return;
      }

      const keys = await (this.cacheManager as any).store.keys(
        `messages:${conversationId}:*`,
      );
      if (keys && keys.length > 0) {
        const deletePromises = keys.map((key: string) =>
          this.cacheManager
            .del(key)
            .catch((error) =>
              this.logger.warn(
                `Failed to delete cache key ${key}: ${error.message}`,
              ),
            ),
        );
        await Promise.allSettled(deletePromises);
        this.logger.debug(`Invalidated ${keys.length} message cache keys`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate message cache: ${error.message}`,
        error.stack,
      );
    }
  }

  private async fallbackCacheInvalidation(pattern: string): Promise<void> {
    // Generate common cache key variations and try to delete them
    const commonVariations = [
      `${pattern}:limit=20&offset=0`,
      `${pattern}:limit=50&offset=0`,
      `${pattern}:showArchived=0`,
      `${pattern}:showArchived=1`,
    ];

    const deletePromises = commonVariations.map((key) =>
      this.cacheManager
        .del(key)
        .catch((error) =>
          this.logger.debug(`Cache key ${key} not found: ${error.message}`),
        ),
    );

    await Promise.allSettled(deletePromises);
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

  async clearAllCache(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cache clearing is disabled in production');
    }

    try {
      if (
        this.cacheManager.stores &&
        typeof (this.cacheManager as any).store.reset === 'function'
      ) {
        await (this.cacheManager as any).store.reset();
        this.logger.log('All cache cleared successfully');
      } else {
        this.logger.warn('Cache store does not support reset operation');
      }
    } catch (error) {
      this.logger.error(`Failed to clear cache: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async deleteKeysWithPattern(pattern: string): Promise<void> {
    try {
      // Pattern'dan belirli key'leri tahmin et ve sil
      const baseKey = pattern.replace('*', '');
      const variations = ['20:0', '50:0', 'true:20:0', 'false:20:0'];

      const deletePromises = variations.map((variation) => {
        const key = baseKey + variation;
        return this.cacheManager
          .del(key)
          .catch((error) =>
            this.logger.debug(`Cache key ${key} not found or already deleted`),
          );
      });

      await Promise.allSettled(deletePromises);
    } catch (error) {
      this.logger.warn(
        `Pattern deletion failed for ${pattern}: ${error.message}`,
      );
    }
  }

  private async invalidateUserConversationCaches(
    userIds: string[],
  ): Promise<void> {
    if (!userIds || userIds.length === 0) {
      this.logger.warn('No user IDs provided for cache invalidation');
      return;
    }

    const promises = userIds.map(async (userId) => {
      try {
        // Cache store'un keys metodunun var olup olmadığını kontrol et
        if (
          !this.cacheManager.stores ||
          typeof (this.cacheManager as any).store.keys !== 'function'
        ) {
          this.logger.warn(
            'Cache store does not support keys operation, falling back to individual key deletion',
          );

          // Fallback: Bilinen pattern'ları sil
          const knownPatterns = [
            `conversations:${userId}:true:*`,
            `conversations:${userId}:false:*`,
            `conversation:${userId}:*`,
          ];

          const deletePromises = knownPatterns.map((pattern) =>
            this.deleteKeysWithPattern(pattern),
          );

          return Promise.allSettled(deletePromises);
        }

        // Ana cache temizleme
        const keys = await (this.cacheManager as any).store.keys(
          `conversations:${userId}:*`,
        );
        if (keys && keys.length > 0) {
          const deletePromises = keys.map((key: string) =>
            this.cacheManager
              .del(key)
              .catch((error) =>
                this.logger.warn(
                  `Failed to delete cache key ${key}: ${error.message}`,
                ),
              ),
          );
          await Promise.allSettled(deletePromises);
          this.logger.debug(
            `Invalidated ${keys.length} cache keys for user ${userId}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to invalidate conversation cache for user ${userId}: ${error.message}`,
          error.stack,
        );
      }
    });

    await Promise.allSettled(promises);
  }

  private async invalidateRelatedCaches(
    patterns: string[],
    context: string,
  ): Promise<void> {
    try {
      for (const pattern of patterns) {
        await this.invalidateCachePattern(pattern);
      }
      this.logger.debug(
        `Cache invalidated for ${context}: ${patterns.join(', ')}`,
      );
    } catch (error) {
      this.logger.warn(
        `Cache invalidation failed for ${context}: ${error.message}`,
      );
    }
  }

  private async invalidateCachePattern(pattern: string): Promise<void> {
    try {
      if (
        this.cacheManager.stores &&
        typeof (this.cacheManager as any).store.keys === 'function'
      ) {
        const keys = await (this.cacheManager as any).store.keys();
        const matchingKeys = keys.filter((key: string) =>
          key.includes(pattern),
        );

        const deletePromises = matchingKeys.map((key: string) =>
          this.cacheManager
            .del(key)
            .catch((error) =>
              this.logger.warn(
                `Failed to delete cache key ${key}: ${error.message}`,
              ),
            ),
        );

        await Promise.allSettled(deletePromises);

        if (matchingKeys.length > 0) {
          this.logger.debug(
            `Invalidated ${matchingKeys.length} cache keys for pattern: ${pattern}`,
          );
        }
      } else {
        // Fallback: Try to delete common cache keys
        await this.fallbackCacheInvalidation(pattern);
      }
    } catch (error) {
      this.logger.warn(
        `Cache pattern invalidation failed for ${pattern}: ${error.message}`,
      );
    }
  }

  private async invalidateConversationCaches(
    conversationId: string,
  ): Promise<void> {
    if (!conversationId) {
      this.logger.warn('No conversation ID provided for cache invalidation');
      return;
    }

    try {
      if (
        !this.cacheManager.stores ||
        typeof (this.cacheManager as any).store.keys !== 'function'
      ) {
        // Fallback: Bilinen cache key'leri sil
        const possibleKeys = [
          `conversation:${conversationId}`,
          `conversation:${conversationId}:details`,
        ];

        const deletePromises = possibleKeys.map((key) =>
          this.cacheManager
            .del(key)
            .catch((error) =>
              this.logger.warn(
                `Failed to delete cache key ${key}: ${error.message}`,
              ),
            ),
        );

        await Promise.allSettled(deletePromises);
        return;
      }

      const keys = await (this.cacheManager as any).store.keys(
        `conversation:${conversationId}:*`,
      );
      if (keys && keys.length > 0) {
        const deletePromises = keys.map((key: string) =>
          this.cacheManager
            .del(key)
            .catch((error) =>
              this.logger.warn(
                `Failed to delete cache key ${key}: ${error.message}`,
              ),
            ),
        );
        await Promise.allSettled(deletePromises);
        this.logger.debug(`Invalidated ${keys.length} conversation cache keys`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate conversation cache: ${error.message}`,
        error.stack,
      );
    }
  }
}
