import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CorrectionType, WordDifficulty } from 'src/common/enums/app.enum';

export class TranslationRequestDto {
  @IsString()
  text: string;

  @IsString()
  sourceLanguage: string;

  @IsString()
  targetLanguage: string;
}

export class CorrectionRequestDto {
  @IsString()
  text: string;

  @IsString()
  languageCode: string;

  @IsEnum(CorrectionType)
  @IsOptional()
  type?: CorrectionType;
}

export class PronunciationRequestDto {
  @IsString()
  audioUrl: string;

  @IsString()
  text: string;

  @IsString()
  languageCode: string;
}

export class DictionaryRequestDto {
  @IsString()
  word: string;

  @IsString()
  languageCode: string;
}

export class SaveWordDto {
  @IsString()
  word: string;

  @IsString()
  definition: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  languageId: string;

  @IsEnum(WordDifficulty)
  @IsOptional()
  difficulty?: WordDifficulty;
}
