import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsUrl,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { MediaType } from 'src/common/enums/app.enum';

export class CreateStoryDto {
  @IsEnum(MediaType)
  type: MediaType;

  @IsUrl()
  mediaUrl: string;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  @IsOptional()
  languageId?: string;

  @IsNumber()
  @IsOptional()
  duration?: number = 10; // Duration in seconds, default 10s
}

export class StoryViewDto {
  @IsUUID()
  storyId: string;

  @IsNumber()
  @IsOptional()
  viewDuration?: number; // How long the user viewed the story in seconds
}
