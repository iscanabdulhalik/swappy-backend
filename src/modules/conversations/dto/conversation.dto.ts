import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUrl,
} from 'class-validator';

export class CreateMessageDto {
  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  contentType?: string = 'text';
}

export class CreateMediaMessageDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  contentType: string; // 'image', 'audio', 'video'

  @IsUrl()
  mediaUrl: string;
}

export class MessageCorrectionDto {
  @IsString()
  correctedContent: string;

  @IsString()
  @IsOptional()
  explanation?: string;
}

export class MessageReactionDto {
  @IsString()
  reaction: string; // Emoji code or identifier
}

export class CallDto {
  @IsString()
  @IsEnum(['audio', 'video'])
  type: 'audio' | 'video';
}

export class ArchiveConversationDto {
  @IsBoolean()
  isArchived: boolean;
}

export class MuteConversationDto {
  @IsBoolean()
  isMuted: boolean;
}

export class ReadConversationDto {
  @IsString()
  @IsOptional()
  lastReadMessageId?: string;
}

export class TranslationRequestDto {
  @IsString()
  @IsEnum(['auto', 'en', 'tr', 'es', 'fr', 'de', 'ru', 'ja', 'zh', 'ko', 'ar'])
  targetLanguage: string = 'auto';
}
