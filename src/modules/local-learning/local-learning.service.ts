import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'prisma/prisma.service';
import { ValidationHelper } from '../../common/helpers/validation.helper';
import {
  TranslationRequestDto,
  CorrectionRequestDto,
  PronunciationRequestDto,
  DictionaryRequestDto,
} from '../learning/dto/learning.dto';
import { AIService } from '../../common/interfaces/ai-service.interface';
import { AppException } from 'src/common/exceptions/app-exceptions';
import { LanguageService } from '../users/services/language.service';
import axios from 'axios';

@Injectable()
export class LocalLearningService {
  private readonly logger = new Logger(LocalLearningService.name);
  private activeModel: string;
  private readonly ollamaBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly validationHelper: ValidationHelper,
    private readonly languageService: LanguageService,
    @Inject('AIService') private readonly aiService: AIService,
  ) {
    this.activeModel = this.configService.get<string>(
      'OLLAMA_DEFAULT_MODEL',
      'gemma:3b-4k',
    );
    this.ollamaBaseUrl = this.configService.get<string>(
      'OLLAMA_API_URL',
      'http://localhost:11434',
    );
  }

  /**
   * Set active model for local generation
   */
  async setActiveModel(
    model: string,
  ): Promise<{ success: boolean; model: string }> {
    try {
      // Check if model exists
      const models = await this.getAvailableModels();
      const modelExists = models.models.some((m) => m.name === model);

      if (!modelExists) {
        throw AppException.badRequest(
          'not_found',
          `Model "${model}" is not available in Ollama`,
        );
      }

      this.activeModel = model;
      this.logger.log(`Active model set to: ${model}`);

      return {
        success: true,
        model: this.activeModel,
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error setting active model: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error setting active model');
    }
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels(): Promise<{ models: any[]; activeModel: string }> {
    try {
      const response = await axios.get(`${this.ollamaBaseUrl}/api/tags`);

      if (!response.data || !response.data.models) {
        throw new Error('Invalid response from Ollama API');
      }

      return {
        models: response.data.models,
        activeModel: this.activeModel,
      };
    } catch (error) {
      this.logger.error(
        `Error getting available models: ${error.message}`,
        error.stack,
      );

      // Network error or server not available
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw AppException.serviceUnavailable(
          'Local AI service is not available. Please ensure Ollama is running.',
        );
      }

      throw AppException.serviceUnavailable(
        `Error getting available models: ${error.message}`,
      );
    }
  }

  /**
   * Translate text using local Ollama model
   */
  async translateText(userId: string, dto: TranslationRequestDto) {
    // Kullanıcı ve dil doğrulaması
    await this.validationHelper.validateUserExists(userId);
    await this.validationHelper.validateLanguageCodes([
      dto.sourceLanguage,
      dto.targetLanguage,
    ]);

    try {
      const prompt = `Translate the following text from ${dto.sourceLanguage} to ${dto.targetLanguage}. 
      Provide only the translation without any additional explanations or notes.
      Text to translate: "${dto.text}"`;

      const response = await this.aiService.generateText({
        prompt,
        model: this.activeModel,
      });

      return {
        originalText: dto.text,
        translatedText: response.text,
        sourceLanguage: dto.sourceLanguage,
        targetLanguage: dto.targetLanguage,
        model: this.activeModel,
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(`Translation error: ${error.message}`, error.stack);
      throw AppException.serviceUnavailable(
        'Translation service failed. Please try again later.',
      );
    }
  }

  /**
   * Correct text using local Ollama model
   */
  async correctText(userId: string, dto: CorrectionRequestDto) {
    // Kullanıcı ve dil doğrulaması
    await this.validationHelper.validateUserExists(userId);
    await this.validationHelper.validateLanguageCodes([dto.languageCode]);

    try {
      const prompt = `Please correct the following text in ${dto.languageCode}. 
      Focus on ${dto.type || 'grammar'} corrections.
      Provide the corrected text and explain each correction made.
      Text to correct: "${dto.text}"
      
      Format the response as JSON with the following structure:
      {
        "correctedText": "the corrected text",
        "corrections": [
          {
            "type": "grammar/spelling/punctuation",
            "start": number,
            "end": number,
            "suggestion": "the correction",
            "explanation": "explanation of the correction"
          }
        ]
      }`;

      const response = await this.aiService.generateText({
        prompt,
        model: this.activeModel,
      });

      try {
        const corrections = JSON.parse(response.text);
        return {
          originalText: dto.text,
          ...corrections,
          model: this.activeModel,
        };
      } catch (parseError) {
        this.logger.error(
          `Error parsing correction response: ${parseError.message}`,
          parseError.stack,
        );
        throw AppException.serviceUnavailable(
          'Failed to process correction results',
        );
      }
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(`Correction error: ${error.message}`, error.stack);
      throw AppException.serviceUnavailable(
        'Text correction service failed. Please try again later.',
      );
    }
  }

  /**
   * Get suggestions based on context using local Ollama model
   */
  async getSuggestions(userId: string, context: string, languageCode: string) {
    // Kullanıcı ve dil doğrulaması
    await this.validationHelper.validateUserExists(userId);
    await this.validationHelper.validateLanguageCodes([languageCode]);

    try {
      const prompt = `Given the following context in ${languageCode}, provide 3 natural and contextually appropriate suggestions for how to continue or respond.
      Context: "${context}"
      
      Format the response as JSON with the following structure:
      {
        "suggestions": ["suggestion1", "suggestion2", "suggestion3"]
      }`;

      const response = await this.aiService.generateText({
        prompt,
        model: this.activeModel,
      });

      try {
        const suggestions = JSON.parse(response.text);
        return {
          context,
          ...suggestions,
          model: this.activeModel,
        };
      } catch (parseError) {
        this.logger.error(
          `Error parsing suggestions response: ${parseError.message}`,
          parseError.stack,
        );
        throw AppException.serviceUnavailable(
          'Failed to process suggestions results',
        );
      }
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error getting suggestions: ${error.message}`,
        error.stack,
      );
      throw AppException.serviceUnavailable(
        'Suggestions service failed. Please try again later.',
      );
    }
  }

  /**
   * Get pronunciation guidance using local Ollama model
   */
  async evaluatePronunciation(userId: string, dto: PronunciationRequestDto) {
    // Kullanıcı ve dil doğrulaması
    await this.validationHelper.validateUserExists(userId);
    await this.validationHelper.validateLanguageCodes([dto.languageCode]);

    try {
      // Metin için telaffuz bilgisi istemek için prompt oluştur
      const prompt = `Provide pronunciation guidance for the following text in ${dto.languageCode}: "${dto.text}". 
    
    Format the response as JSON with the following structure:
    {
      "phoneticTranscription": "IPA phonetic transcription",
      "syllableBreakdown": "text broken down by syllables",
      "pronunciationTips": "Tips specific to this text's pronunciation",
      "soundGuide": [
        {
          "sound": "specific sound or phoneme",
          "example": "English word with similar sound",
          "description": "description of how to position mouth/tongue"
        }
      ],
      "commonErrors": [
        {
          "error": "common mistake",
          "correction": "how to fix it"
        }
      ]
    }`;

      const response = await this.aiService.generateText({
        prompt,
        model: this.activeModel,
      });

      try {
        const pronunciationGuide = JSON.parse(response.text);
        return {
          text: dto.text,
          languageCode: dto.languageCode,
          ...pronunciationGuide,
          model: this.activeModel,
        };
      } catch (parseError) {
        this.logger.error(
          `Error parsing pronunciation guide: ${parseError.message}`,
          parseError.stack,
        );
        throw AppException.serviceUnavailable(
          'Failed to process pronunciation guide results',
        );
      }
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Pronunciation guide error: ${error.message}`,
        error.stack,
      );
      throw AppException.serviceUnavailable(
        'Pronunciation guide service failed. Please try again later.',
      );
    }
  }
  /**
   * Search dictionary using local Ollama model
   */
  async searchDictionary(userId: string, dto: DictionaryRequestDto) {
    // Kullanıcı ve dil doğrulaması
    await this.validationHelper.validateUserExists(userId);
    await this.validationHelper.validateLanguageCodes([dto.languageCode]);

    try {
      const prompt = `Provide a detailed dictionary entry for the word "${dto.word}" in ${dto.languageCode}.
      Include phonetic transcription, multiple definitions with parts of speech, example sentences, synonyms, and antonyms.
      
      Format the response as JSON with the following structure:
      {
        "word": "the word",
        "phonetic": "phonetic transcription",
        "definitions": [
          {
            "partOfSpeech": "noun/verb/etc",
            "meaning": "definition",
            "example": "example sentence"
          }
        ],
        "synonyms": ["synonym1", "synonym2"],
        "antonyms": ["antonym1", "antonym2"]
      }`;

      const response = await this.aiService.generateText({
        prompt,
        model: this.activeModel,
        temperature: 0.2, // Dictionary entries should be factual and less creative
      });

      try {
        const dictionaryEntry = JSON.parse(response.text);
        return {
          ...dictionaryEntry,
          model: this.activeModel,
        };
      } catch (parseError) {
        this.logger.error(
          `Error parsing dictionary response: ${parseError.message}`,
          parseError.stack,
        );
        throw AppException.serviceUnavailable(
          'Failed to process dictionary results',
        );
      }
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Dictionary search error: ${error.message}`,
        error.stack,
      );
      throw AppException.serviceUnavailable(
        'Dictionary service failed. Please try again later.',
      );
    }
  }
}
