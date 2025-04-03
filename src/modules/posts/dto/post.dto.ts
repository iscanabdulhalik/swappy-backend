import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsArray,
  ValidateNested,
  IsUrl,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MediaType,
  FeedType,
  ContentSortType,
} from '../../../common/enums/app.enum';

export class CreatePostDto {
  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  languageId?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean = true;
}

export class UpdatePostDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}

export class CreatePostMediaDto {
  @IsEnum(MediaType)
  type: MediaType;

  @IsUrl()
  url: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateCommentDto {
  @IsString()
  content: string;

  @IsUUID()
  @IsOptional()
  parentCommentId?: string;
}

export class UpdateCommentDto {
  @IsString()
  content: string;
}

export class FeedQueryDto {
  @IsEnum(FeedType)
  @IsOptional()
  type?: FeedType = FeedType.ALL;

  @IsEnum(ContentSortType)
  @IsOptional()
  sort?: ContentSortType = ContentSortType.RECENT;

  @IsString()
  @IsOptional()
  languageId?: string;
}
