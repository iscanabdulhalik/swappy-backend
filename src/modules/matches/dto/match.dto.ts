import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
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

  @IsBoolean()
  @IsOptional()
  useScoring?: boolean;
}

export class ScoringWeightsDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  recency?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  age?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  activity?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  languageMatch?: number;
}
