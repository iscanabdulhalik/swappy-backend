import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LanguageLevel } from '@prisma/client';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  hobbies?: string[];

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  countryCode?: string;
}

export class UserLanguageDto {
  @IsUUID()
  languageId: string;

  @IsEnum(LanguageLevel)
  level: LanguageLevel;

  @IsBoolean()
  isNative: boolean;

  @IsBoolean()
  isLearning: boolean;
}

export class UpdateLanguagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserLanguageDto)
  languages: UserLanguageDto[];
}

export class UserSearchDto {
  @IsString()
  @IsOptional()
  query?: string;

  @IsUUID()
  @IsOptional()
  nativeLanguageId?: string;

  @IsUUID()
  @IsOptional()
  learningLanguageId?: string;

  @IsString()
  @IsOptional()
  countryCode?: string;
}

export class UpdateUserSettingsDto {
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  pushNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  privateProfile?: boolean;

  @IsString()
  @IsOptional()
  theme?: string;

  @IsString()
  @IsOptional()
  language?: string;
}
