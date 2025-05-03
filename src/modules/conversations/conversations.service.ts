import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { NotificationGateway } from 'src/websockets/notification.gateway';
import {
  Conversation,
  Message,
  MessageCorrection,
  UserConversation,
} from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
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

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Get all conversations for a user
   */
  async getUserConversations(
    userId: string,
    showArchived = false,
    limit = 20,
    offset = 0,
  ): Promise<{ items: Conversation[]; total: number }> {
    // Get conversations where the user is a participant
    const where = {
      participants: {
        some: {
          userId,
          ...(showArchived ? {} : { isArchived: false }),
        },
      },
    };

    // Get total count
    const total = await this.prisma.conversation.count({ where });

    // Get conversations with related data
    const conversations = await this.prisma.conversation.findMany({
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
    });

    return { items: conversations, total };
  }

  /**
   * Get conversation by ID with participant details
   */
  async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<ConversationWithParticipants> {
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

    // Fetch native and learning languages for each participant separately
    const enhancedParticipants = await Promise.all(
      conversation.participants.map(async (participant) => {
        const nativeLanguages = await this.prisma.userLanguage.findMany({
          where: {
            userId: participant.user.id,
            isNative: true,
          },
          include: {
            language: true,
          },
        });

        const learningLanguages = await this.prisma.userLanguage.findMany({
          where: {
            userId: participant.user.id,
            isLearning: true,
          },
          include: {
            language: true,
          },
        });

        return {
          ...participant,
          user: {
            ...participant.user,
            nativeLanguages,
            learningLanguages,
          },
        };
      }),
    );

    // Return the conversation with enhanced participants
    return {
      ...conversation,
      participants: enhancedParticipants,
    } as ConversationWithParticipants;
  }

  /**
   * Get messages for a conversation
   */
  async getConversationMessages(
    conversationId: string,
    options: { limit: number; offset: number; before?: Date; after?: Date } = {
      limit: 50,
      offset: 0,
    },
  ): Promise<{ items: Message[]; total: number }> {
    const { limit, offset, before, after } = options;

    // Build where clause
    let where: any = { conversationId };

    if (before) {
      where.createdAt = { ...(where.createdAt || {}), lt: before };
    }

    if (after) {
      where.createdAt = { ...(where.createdAt || {}), gt: after };
    }

    // Get total count
    const total = await this.prisma.message.count({ where });

    // Get messages
    const messages = await this.prisma.message.findMany({
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
    });

    return { items: messages, total };
  }

  /**
   * Create a new message
   */
  async createMessage(
    senderId: string,
    conversationId: string,
    messageDto: CreateMessageDto,
  ): Promise<Message> {
    // Check if conversation exists and user is a participant
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: true,
      },
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

    // Create the message
    const message = await this.prisma.message.create({
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

    // Update conversation lastUpdated timestamp
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Update user stats
    await this.prisma.userStats.update({
      where: { userId: senderId },
      data: { messagesCount: { increment: 1 } },
    });

    // Notify other participants
    this.notifyParticipants(conversation, senderId, {
      type: 'new_message',
      message,
    });

    return message;
  }

  /**
   * Create a media message
   */
  async createMediaMessage(
    senderId: string,
    conversationId: string,
    messageDto: CreateMediaMessageDto,
  ): Promise<Message> {
    // Check if conversation exists and user is a participant
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: true,
      },
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

    // Create the media message
    const message = await this.prisma.message.create({
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

    // Update conversation lastUpdated timestamp
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Update user stats
    await this.prisma.userStats.update({
      where: { userId: senderId },
      data: { messagesCount: { increment: 1 } },
    });

    // Notify other participants
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

    // Update the lastReadAt timestamp
    return this.prisma.userConversation.update({
      where: {
        id: userConversation.id,
      },
      data: {
        lastReadAt: new Date(),
      },
    });
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
          include: {
            participants: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: 'message_not_found',
        message: 'Message not found',
      });
    }

    // Check if user is in the conversation
    if (!this.isUserInConversation(message.conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // Create the correction
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

    // Notify the message sender
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
    return this.prisma.userConversation.update({
      where: {
        id: userConversation.id,
      },
      data: {
        isArchived: dto.isArchived,
      },
    });
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
    return this.prisma.userConversation.update({
      where: {
        id: userConversation.id,
      },
      data: {
        isMuted: dto.isMuted,
      },
    });
  }

  /**
   * Request a translation for a message
   */
  async translateMessage(
    userId: string,
    messageId: string,
    dto: TranslationRequestDto,
  ): Promise<{ original: string; translated: string }> {
    // Find the message
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: 'message_not_found',
        message: 'Message not found',
      });
    }

    // Check if user is in the conversation
    if (!this.isUserInConversation(message.conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // TODO: Implement actual translation service
    // For now return a placeholder translated message
    return {
      original: message.content,
      translated: `[Translated to ${dto.targetLanguage}] ${message.content}`,
    };
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
          include: {
            participants: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: 'message_not_found',
        message: 'Message not found',
      });
    }

    // Check if user is in the conversation
    if (!this.isUserInConversation(message.conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // TODO: Store reactions in a proper table/model
    // For now we're just returning what would be stored
    const reaction = {
      messageId,
      userId,
      reaction: dto.reaction,
    };

    // Notify the message sender
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
          include: {
            participants: true,
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: 'message_not_found',
        message: 'Message not found',
      });
    }

    // Check if user is in the conversation
    if (!this.isUserInConversation(message.conversation, userId)) {
      throw new ForbiddenException({
        error: 'not_participant',
        message: 'You are not a participant in this conversation',
      });
    }

    // TODO: Implement proper reaction removal
    // This is a placeholder for when a real reaction model is implemented
  }

  /**
   * Initiate a call in a conversation
   */
  async initiateCall(
    userId: string,
    conversationId: string,
    dto: CallDto,
  ): Promise<{ callId: string; conversationId: string; type: string }> {
    // Check if conversation exists and user is a participant
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

    // TODO: Implement proper call functionality with a Call model
    // For now, return a mock call object
    const callId = `call-${Date.now()}`;
    const callData = {
      callId,
      conversationId,
      type: dto.type,
    };

    // Notify other participants
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
    // TODO: Implement proper call ending functionality
    // For now, return a mock response
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
   * Check if a user has access to a conversation
   */
  async userHasAccessToConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const count = await this.prisma.userConversation.count({
      where: {
        userId,
        conversationId,
      },
    });

    return count > 0;
  }

  /**
   * Create a conversation between users
   */
  async createConversation(
    userIds: string[],
    languageId: string,
    matchId?: string,
  ): Promise<Conversation> {
    // Ensure at least 2 users
    if (userIds.length < 2) {
      throw new BadRequestException({
        error: 'invalid_participants',
        message: 'Conversation must have at least 2 participants',
      });
    }

    // Check if language exists
    const language = await this.prisma.language.findUnique({
      where: { id: languageId },
    });

    if (!language) {
      throw new NotFoundException({
        error: 'language_not_found',
        message: 'Language not found',
      });
    }

    // Create conversation with participants
    return this.prisma.conversation.create({
      data: {
        languageId,
        ...(matchId ? { match: { connect: { id: matchId } } } : {}),
        participants: {
          create: userIds.map((userId) => ({
            userId,
          })),
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
}
