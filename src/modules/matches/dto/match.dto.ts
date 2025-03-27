import { IsString, IsUUID, IsOptional, IsEnum } from 'class-validator';
import { LanguageLevel } from '@prisma/client';

export class MatchRequestDto {
  @IsUUID()
  receiverId: string;

  @IsString()
  @IsOptional()
  message?: string;
}

export class MatchCriteriaDto {
  @IsUUID()
  @IsOptional()
  nativeLanguageId?: string;

  @IsUUID()
  @IsOptional()
  learningLanguageId?: string;

  @IsEnum(LanguageLevel)
  @IsOptional()
  minLanguageLevel?: LanguageLevel;

  @IsString()
  @IsOptional()
  countryCode?: string;
}
