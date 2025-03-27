import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { WebsocketsGateway } from '../../websockets/websockets.gateway';
import { AuthenticatedSocket } from '../../websockets/interfaces/socket-client.interface';
import { MessageEvents } from '../../websockets/events';
import { CreateMessageDto } from './dto/conversation.dto';
import { WsAuthGuard } from 'src/common/guards/ws-auth.guard';

@WebSocketGateway({
  namespace: '/ws/conversations',
})
export class ConversationsGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ConversationsGateway.name);

  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly websocketsGateway: WebsocketsGateway,
  ) {}

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(MessageEvents.JOIN_CONVERSATION)
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      // Check if user has access to this conversation
      const hasAccess =
        await this.conversationsService.userHasAccessToConversation(
          client.user.id,
          data.conversationId,
        );

      if (!hasAccess) {
        client.emit(MessageEvents.ERROR, {
          message: 'You do not have access to this conversation',
        });
        return;
      }

      // Join the conversation room
      this.websocketsGateway.addToConversation(client.id, data.conversationId);

      // Mark conversation as read
      await this.conversationsService.markConversationAsRead(
        client.user.id,
        data.conversationId,
      );

      // Get recent messages
      const messages = await this.conversationsService.getConversationMessages(
        data.conversationId,
        { limit: 50, offset: 0 },
      );

      // Send recent messages to the user
      client.emit(MessageEvents.MESSAGE_RECEIVED, {
        conversationId: data.conversationId,
        messages: messages.items,
      });

      // Send typing status of other users if any
      // This can be implemented with a in-memory cache or Redis for typing status

      this.logger.log(
        `User ${client.user.id} joined conversation ${data.conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error joining conversation: ${error.message}`,
        error.stack,
      );
      client.emit(MessageEvents.ERROR, {
        message: 'Failed to join conversation',
      });
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(MessageEvents.LEAVE_CONVERSATION)
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      // Leave the conversation room
      this.websocketsGateway.removeFromConversation(
        client.id,
        data.conversationId,
      );

      this.logger.log(
        `User ${client.user.id} left conversation ${data.conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error leaving conversation: ${error.message}`,
        error.stack,
      );
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(MessageEvents.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; message: CreateMessageDto },
  ) {
    try {
      // Check if user has access to this conversation
      const hasAccess =
        await this.conversationsService.userHasAccessToConversation(
          client.user.id,
          data.conversationId,
        );

      if (!hasAccess) {
        client.emit(MessageEvents.ERROR, {
          message: 'You do not have access to this conversation',
        });
        return;
      }

      // Create message
      const message = await this.conversationsService.createMessage(
        client.user.id,
        data.conversationId,
        data.message,
      );

      // Broadcast to all users in the conversation
      this.websocketsGateway.sendToConversation(
        data.conversationId,
        MessageEvents.MESSAGE_RECEIVED,
        {
          conversationId: data.conversationId,
          message,
        },
      );

      this.logger.log(
        `User ${client.user.id} sent message to conversation ${data.conversationId}`,
      );
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`, error.stack);
      client.emit(MessageEvents.ERROR, {
        message: 'Failed to send message',
      });
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(MessageEvents.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      // Broadcast typing status to all users in the conversation except the sender
      this.websocketsGateway.sendToConversation(
        data.conversationId,
        MessageEvents.USER_TYPING,
        {
          conversationId: data.conversationId,
          userId: client.user.id,
          displayName: client.user.displayName,
        },
        client.user.id, // exclude the sender
      );
    } catch (error) {
      this.logger.error(
        `Error handling typing start: ${error.message}`,
        error.stack,
      );
    }
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage(MessageEvents.TYPING_END)
  handleTypingEnd(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      // Broadcast typing end status to all users in the conversation except the sender
      this.websocketsGateway.sendToConversation(
        data.conversationId,
        MessageEvents.USER_STOPPED_TYPING,
        {
          conversationId: data.conversationId,
          userId: client.user.id,
        },
        client.user.id, // exclude the sender
      );
    } catch (error) {
      this.logger.error(
        `Error handling typing end: ${error.message}`,
        error.stack,
      );
    }
  }
}
