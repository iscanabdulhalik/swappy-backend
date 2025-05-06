import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LearningService } from './learning.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  TranslationRequestDto,
  CorrectionRequestDto,
  PronunciationRequestDto,
  DictionaryRequestDto,
  SaveWordDto,
} from './dto/learning.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';

@Controller('learning')
@UseGuards(FirebaseAuthGuard)
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Post('translate')
  @Roles(Role.ADMIN)
  async translateText(
    @CurrentUser('id') userId: string,
    @Body() translationDto: TranslationRequestDto,
  ) {
    return this.learningService.translateText(userId, translationDto);
  }

  @Post('correct')
  async correctText(
    @CurrentUser('id') userId: string,
    @Body() correctionDto: CorrectionRequestDto,
  ) {
    return this.learningService.correctText(userId, correctionDto);
  }

  @Get('suggestions')
  async getSuggestions(
    @CurrentUser('id') userId: string,
    @Query('context') context: string,
    @Query('languageCode') languageCode: string,
  ) {
    return this.learningService.getSuggestions(userId, context, languageCode);
  }

  @Post('pronunciation')
  async evaluatePronunciation(
    @CurrentUser('id') userId: string,
    @Body() pronunciationDto: PronunciationRequestDto,
  ) {
    return this.learningService.evaluatePronunciation(userId, pronunciationDto);
  }

  @Get('dictionary')
  async searchDictionary(
    @CurrentUser('id') userId: string,
    @Query() dictionaryDto: DictionaryRequestDto,
  ) {
    return this.learningService.searchDictionary(userId, dictionaryDto);
  }

  @Get('words')
  async getSavedWords(
    @CurrentUser('id') userId: string,
    @Query('languageId') languageId?: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    return this.learningService.getSavedWords(
      userId,
      languageId,
      limit,
      offset,
    );
  }

  @Post('words')
  async saveWord(
    @CurrentUser('id') userId: string,
    @Body() saveWordDto: SaveWordDto,
  ) {
    return this.learningService.saveWord(userId, saveWordDto);
  }

  @Delete('words/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWord(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) wordId: string,
  ) {
    return this.learningService.deleteWord(userId, wordId);
  }

  @Get('learning-progress')
  async getLearningProgress(
    @CurrentUser('id') userId: string,
    @Query('languageId', ParseUUIDPipe) languageId: string,
  ) {
    return this.learningService.getLearningProgress(userId, languageId);
  }
}
