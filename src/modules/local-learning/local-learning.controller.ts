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
import { LocalLearningService } from './local-learning.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  TranslationRequestDto,
  CorrectionRequestDto,
  PronunciationRequestDto,
  DictionaryRequestDto,
  SaveWordDto,
} from '../learning/dto/learning.dto'; // Aynı DTO'ları kullanıyoruz

@Controller('local-learning')
@UseGuards(FirebaseAuthGuard)
export class LocalLearningController {
  constructor(private readonly localLearningService: LocalLearningService) {}

  @Post('translate')
  async translateText(
    @CurrentUser('id') userId: string,
    @Body() translationDto: TranslationRequestDto,
  ) {
    return this.localLearningService.translateText(userId, translationDto);
  }

  @Post('correct')
  async correctText(
    @CurrentUser('id') userId: string,
    @Body() correctionDto: CorrectionRequestDto,
  ) {
    return this.localLearningService.correctText(userId, correctionDto);
  }

  @Get('suggestions')
  async getSuggestions(
    @CurrentUser('id') userId: string,
    @Query('context') context: string,
    @Query('languageCode') languageCode: string,
  ) {
    return this.localLearningService.getSuggestions(
      userId,
      context,
      languageCode,
    );
  }

  @Post('pronunciation')
  async evaluatePronunciation(
    @CurrentUser('id') userId: string,
    @Body() pronunciationDto: PronunciationRequestDto,
  ) {
    return this.localLearningService.evaluatePronunciation(
      userId,
      pronunciationDto,
    );
  }

  @Get('dictionary')
  async searchDictionary(
    @CurrentUser('id') userId: string,
    @Query() dictionaryDto: DictionaryRequestDto,
  ) {
    return this.localLearningService.searchDictionary(userId, dictionaryDto);
  }

  @Get('models')
  async getAvailableModels(@CurrentUser('id') userId: string) {
    return this.localLearningService.getAvailableModels();
  }

  @Post('set-model')
  async setActiveModel(
    @CurrentUser('id') userId: string,
    @Body() data: { model: string },
  ) {
    return this.localLearningService.setActiveModel(data.model);
  }
}
