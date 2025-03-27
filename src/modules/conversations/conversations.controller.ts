import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
import {
  Conversation,
  Message,
  MessageCorrection,
  UserConversation,
} from '@prisma/client';

@Controller('conversations')
@UseGuards(FirebaseAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async getUserConversations(
    @CurrentUser('id') userId: string,
    @Query('archived') showArchived = false,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.conversationsService.getUserConversations(
      userId,
      showArchived,
      limit,
      offset,
    );
  }

  @Get(':id')
  async getConversationById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ): Promise<Conversation> {
    return this.conversationsService.getConversationById(
      conversationId,
      userId,
    );
  }

  @Get(':id/messages')
  async getConversationMessages(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    // Verify access
    await this.conversationsService.getConversationById(conversationId, userId);

    // Parse date strings if provided
    const options = {
      limit,
      offset,
      before: before ? new Date(before) : undefined,
      after: after ? new Date(after) : undefined,
    };

    return this.conversationsService.getConversationMessages(
      conversationId,
      options,
    );
  }

  @Post(':id/messages')
  async createMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() messageDto: CreateMessageDto,
  ): Promise<Message> {
    return this.conversationsService.createMessage(
      userId,
      conversationId,
      messageDto,
    );
  }

  @Post(':id/messages/media')
  async createMediaMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() messageDto: CreateMediaMessageDto,
  ): Promise<Message> {
    return this.conversationsService.createMediaMessage(
      userId,
      conversationId,
      messageDto,
    );
  }

  @Put(':id/read')
  async markConversationAsRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() readDto: ReadConversationDto,
  ): Promise<UserConversation> {
    return this.conversationsService.markConversationAsRead(
      userId,
      conversationId,
      readDto,
    );
  }

  @Put(':id/archive')
  async toggleArchiveConversation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() archiveDto: ArchiveConversationDto,
  ): Promise<UserConversation> {
    return this.conversationsService.toggleArchiveConversation(
      userId,
      conversationId,
      archiveDto,
    );
  }

  @Put(':id/mute')
  async toggleMuteConversation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() muteDto: MuteConversationDto,
  ): Promise<UserConversation> {
    return this.conversationsService.toggleMuteConversation(
      userId,
      conversationId,
      muteDto,
    );
  }

  @Post(':id/call')
  async initiateCall(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() callDto: CallDto,
  ) {
    return this.conversationsService.initiateCall(
      userId,
      conversationId,
      callDto,
    );
  }

  @Put('calls/:id/end')
  async endCall(
    @CurrentUser('id') userId: string,
    @Param('id') callId: string,
  ) {
    return this.conversationsService.endCall(userId, callId);
  }

  @Get('messages/:id/translate')
  async translateMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @Query() translationDto: TranslationRequestDto,
  ) {
    return this.conversationsService.translateMessage(
      userId,
      messageId,
      translationDto,
    );
  }

  @Post('messages/:id/correct')
  async correctMessage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @Body() correctionDto: MessageCorrectionDto,
  ): Promise<MessageCorrection> {
    return this.conversationsService.correctMessage(
      userId,
      messageId,
      correctionDto,
    );
  }

  @Post('messages/:id/reactions')
  async addMessageReaction(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @Body() reactionDto: MessageReactionDto,
  ) {
    return this.conversationsService.addMessageReaction(
      userId,
      messageId,
      reactionDto,
    );
  }

  @Delete('messages/:id/reactions/:reactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMessageReaction(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @Param('reactionId') reactionId: string,
  ): Promise<void> {
    return this.conversationsService.removeMessageReaction(
      userId,
      messageId,
      reactionId,
    );
  }
}
