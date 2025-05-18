import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'prisma/prisma.service';
import { ValidationHelper } from '../../common/helpers/validation.helper';
import {
  TranslationRequestDto,
  CorrectionRequestDto,
  PronunciationRequestDto,
  DictionaryRequestDto,
  SaveWordDto,
} from './dto/learning.dto';
import { AIService } from '../../common/interfaces/ai-service.interface';
import { AppException } from 'src/common/exceptions/app-exceptions';
import { LanguageService } from '../users/services/language.service';

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly validationHelper: ValidationHelper,
    private readonly languageService: LanguageService,
    @Inject('AIService') private readonly aiService: AIService,
  ) {}

  /**
   * Translate text using AI service
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

      const response = await this.aiService.generateText({ prompt });

      return {
        originalText: dto.text,
        translatedText: response.text,
        sourceLanguage: dto.sourceLanguage,
        targetLanguage: dto.targetLanguage,
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
   * Correct text using AI service
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

      const response = await this.aiService.generateText({ prompt });

      try {
        const corrections = JSON.parse(response.text);
        return {
          originalText: dto.text,
          ...corrections,
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
   * Get suggestions based on context using AI
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

      const response = await this.aiService.generateText({ prompt });

      try {
        const suggestions = JSON.parse(response.text);
        return {
          context,
          ...suggestions,
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
   * Evaluate pronunciation guidelines for a word or phrase
   */
  async evaluatePronunciation(userId: string, dto: PronunciationRequestDto) {
    // Kullanıcı ve dil doğrulaması
    await this.validationHelper.validateUserExists(userId);
    await this.validationHelper.validateLanguageCodes([dto.languageCode]);

    try {
      // Metin için telaffuz bilgisi istemek için Gemini prompt oluştur
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

      const response = await this.aiService.generateText({ prompt });

      try {
        const pronunciationGuide = JSON.parse(response.text);
        return {
          text: dto.text,
          languageCode: dto.languageCode,
          ...pronunciationGuide,
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
   * Search dictionary using AI
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

      const response = await this.aiService.generateText({ prompt });

      try {
        const dictionaryEntry = JSON.parse(response.text);
        return dictionaryEntry;
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

  /**
   * Get user's saved words
   */
  async getSavedWords(
    userId: string,
    languageId?: string,
    limit = 50,
    offset = 0,
  ) {
    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Validate pagination
      const pagination = this.validationHelper.validatePagination(
        limit,
        offset,
      );

      // If languageId provided, verify it exists
      if (languageId) {
        await this.validationHelper.validateLanguageExists(languageId);
      }

      const where: any = { userId };

      if (languageId) {
        where.languageId = languageId;
      }

      const [words, total] = await Promise.all([
        this.prisma.savedWord.findMany({
          where,
          include: {
            language: true,
          },
          take: pagination.limit,
          skip: pagination.offset,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.savedWord.count({ where }),
      ]);

      return {
        items: words,
        total,
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error getting saved words: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving saved words');
    }
  }

  /**
   * Save a word
   */
  async saveWord(userId: string, dto: SaveWordDto) {
    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Verify language exists
      await this.validationHelper.validateLanguageExists(dto.languageId);

      // Check if word already exists for this user
      const existingWord = await this.prisma.savedWord.findFirst({
        where: {
          userId,
          word: dto.word,
          languageId: dto.languageId,
        },
      });

      if (existingWord) {
        // Update existing word
        return this.prisma.savedWord.update({
          where: { id: existingWord.id },
          data: {
            definition: dto.definition,
            example: dto.example,
            notes: dto.notes,
            difficulty: dto.difficulty,
          },
          include: {
            language: true,
          },
        });
      }

      // Create new saved word
      return this.prisma.savedWord.create({
        data: {
          userId,
          languageId: dto.languageId,
          word: dto.word,
          definition: dto.definition,
          example: dto.example,
          notes: dto.notes,
          difficulty: dto.difficulty,
        },
        include: {
          language: true,
        },
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(`Error saving word: ${error.message}`, error.stack);
      throw AppException.internal('Error saving word');
    }
  }

  /**
   * Delete a saved word
   */
  async deleteWord(userId: string, wordId: string) {
    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Check if word exists and belongs to user
      const word = await this.prisma.savedWord.findFirst({
        where: {
          id: wordId,
          userId,
        },
      });

      if (!word) {
        throw AppException.notFound('not_found', 'Word not found');
      }

      // Delete the word
      await this.prisma.savedWord.delete({
        where: { id: wordId },
      });
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(`Error deleting word: ${error.message}`, error.stack);
      throw AppException.internal('Error deleting word');
    }
  }

  /**
   * Get user's learning progress
   */
  async getLearningProgress(userId: string, languageId: string) {
    try {
      // Verify user and language exist
      const user = await this.validationHelper.validateUserExists(userId);
      const language =
        await this.validationHelper.validateLanguageExists(languageId);

      // Get user's learning language
      const userLanguage = await this.prisma.userLanguage.findFirst({
        where: {
          userId,
          languageId,
          isLearning: true,
        },
      });

      if (!userLanguage) {
        throw AppException.badRequest(
          'bad_request',
          'You are not learning this language',
        );
      }

      // Get word count
      const wordCount = await this.prisma.savedWord.count({
        where: {
          userId,
          languageId,
        },
      });

      // Get message count in this language
      const messageCount = await this.prisma.message.count({
        where: {
          senderId: userId,
          conversation: {
            languageId,
          },
        },
      });

      // Get correction count
      const correctionCount = await this.prisma.messageCorrection.count({
        where: {
          message: {
            senderId: userId,
            conversation: {
              languageId,
            },
          },
        },
      });

      // Get recent saved words
      const recentSavedWords = await this.prisma.savedWord.findMany({
        where: {
          userId,
          languageId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      });

      // Get recent conversations in this language
      const recentConversations = await this.prisma.conversation.findMany({
        where: {
          languageId,
          participants: {
            some: {
              userId,
            },
          },
        },
        include: {
          messages: {
            where: {
              senderId: userId,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  profileImageUrl: true,
                },
              },
            },
            where: {
              userId: {
                not: userId,
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 3,
      });

      // Calculate days since start
      const daysSinceStart = Math.floor(
        (Date.now() - userLanguage.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Calculate recent activity
      const recentActivity: Array<{
        type: string;
        date: Date;
        details: {
          word?: string;
          definition?: string;
          conversationId?: string;
          partner?: string;
          length?: number;
        };
      }> = [];

      // Add recent saved words to activity
      recentSavedWords.forEach((word) => {
        recentActivity.push({
          type: 'word_saved',
          date: word.createdAt,
          details: {
            word: word.word,
            definition: word.definition,
          },
        });
      });

      // Add recent messages to activity
      for (const conversation of recentConversations) {
        if (conversation.messages.length > 0) {
          recentActivity.push({
            type: 'message_sent',
            date: conversation.messages[0].createdAt,
            details: {
              conversationId: conversation.id,
              partner:
                conversation.participants[0]?.user.displayName || 'Unknown',
              length: conversation.messages[0].content.length,
            },
          });
        }
      }

      // Sort activity by date (newest first)
      recentActivity.sort((a, b) => b.date.getTime() - a.date.getTime());

      // Calculate progress metrics based on real data
      const calculateProgressPercentage = (value, target) =>
        Math.min(100, Math.round((value / target) * 100));

      // Different weight factors for different activities
      const vocabularyProgress = calculateProgressPercentage(wordCount, 200); // Target: 200 saved words
      const grammarProgress = calculateProgressPercentage(correctionCount, 50); // Target: 50 corrections
      const messagingProgress = calculateProgressPercentage(messageCount, 300); // Target: 300 messages

      // Overall progress is weighted average
      const overallProgress = Math.round(
        vocabularyProgress * 0.4 + // Vocabulary is 40% of overall progress
          grammarProgress * 0.3 + // Grammar is 30% of overall progress
          messagingProgress * 0.3, // Messaging is 30% of overall progress
      );

      return {
        language,
        level: userLanguage.level,
        startedAt: userLanguage.createdAt,
        daysSinceStart,
        stats: {
          savedWords: wordCount,
          messagesSent: messageCount,
          correctionsReceived: correctionCount,
          activeConversations: recentConversations.length,
        },
        progress: {
          vocabulary: vocabularyProgress,
          grammar: grammarProgress,
          messaging: messagingProgress,
          overall: overallProgress,
        },
        recentActivity: recentActivity.slice(0, 10), // Return at most 10 recent activities
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error getting learning progress: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving learning progress');
    }
  }
}
