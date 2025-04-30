import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import {
  TranslationRequestDto,
  CorrectionRequestDto,
  PronunciationRequestDto,
  DictionaryRequestDto,
  SaveWordDto,
} from './dto/learning.dto';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class LearningService {
  private readonly genAI: GoogleGenerativeAI;

  constructor(private readonly prisma: PrismaService) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  /**
   * Translate text using Gemini AI
   */
  async translateText(userId: string, dto: TranslationRequestDto) {
    // Check if languages exist
    await this.validateLanguages([dto.sourceLanguage, dto.targetLanguage]);

    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Translate the following text from ${dto.sourceLanguage} to ${dto.targetLanguage}. 
    Provide only the translation without any additional explanations or notes.
    Text to translate: "${dto.text}"`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const translatedText = response.text();

    return {
      originalText: dto.text,
      translatedText: translatedText.trim(),
      sourceLanguage: dto.sourceLanguage,
      targetLanguage: dto.targetLanguage,
    };
  }

  /**
   * Correct text using Gemini AI
   */
  async correctText(userId: string, dto: CorrectionRequestDto) {
    // Check if language exists
    await this.validateLanguages([dto.languageCode]);

    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const corrections = JSON.parse(response.text());

    return {
      originalText: dto.text,
      ...corrections,
    };
  }

  /**
   * Get suggestions based on context using Gemini AI
   */
  async getSuggestions(userId: string, context: string, languageCode: string) {
    // Check if language exists
    await this.validateLanguages([languageCode]);

    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Given the following context in ${languageCode}, provide 3 natural and contextually appropriate suggestions for how to continue or respond.
    Context: "${context}"
    
    Format the response as JSON with the following structure:
    {
      "suggestions": ["suggestion1", "suggestion2", "suggestion3"]
    }`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const suggestions = JSON.parse(response.text());

    return {
      context,
      ...suggestions,
    };
  }

  /**
   * Evaluate pronunciation
   */
  async evaluatePronunciation(userId: string, dto: PronunciationRequestDto) {
    // Check if language exists
    await this.validateLanguages([dto.languageCode]);

    // TODO: Implement actual pronunciation evaluation
    // For development, return a mock evaluation
    return {
      text: dto.text,
      audioUrl: dto.audioUrl,
      score: 85,
      feedback:
        'Good pronunciation overall. Pay attention to stress on syllables.',
      details: [
        {
          word: dto.text.split(' ')[0],
          score: 90,
          feedback: 'Well pronounced',
        },
        {
          word: dto.text.split(' ')[1] || 'example',
          score: 80,
          feedback: 'Slightly mispronounced',
        },
      ],
    };
  }

  /**
   * Search dictionary using Gemini AI
   */
  async searchDictionary(userId: string, dto: DictionaryRequestDto) {
    // Check if language exists
    await this.validateLanguages([dto.languageCode]);

    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

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

    const result = await model.generateContent(prompt);
    const response = result.response;
    const dictionaryEntry = JSON.parse(response.text());

    return dictionaryEntry;
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
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.savedWord.count({ where }),
    ]);

    return {
      items: words,
      total,
    };
  }

  /**
   * Save a word
   */
  async saveWord(userId: string, dto: SaveWordDto) {
    // Check if language exists
    const language = await this.prisma.language.findUnique({
      where: { id: dto.languageId },
    });

    if (!language) {
      throw new NotFoundException({
        error: 'language_not_found',
        message: 'Language not found',
      });
    }

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
  }

  /**
   * Delete a saved word
   */
  async deleteWord(userId: string, wordId: string) {
    // Check if word exists and belongs to user
    const word = await this.prisma.savedWord.findFirst({
      where: {
        id: wordId,
        userId,
      },
    });

    if (!word) {
      throw new NotFoundException({
        error: 'word_not_found',
        message: 'Word not found',
      });
    }

    // Delete the word
    await this.prisma.savedWord.delete({
      where: { id: wordId },
    });
  }

  /**
   * Get user's learning progress
   */
  async getLearningProgress(userId: string, languageId: string) {
    // Check if language exists
    const language = await this.prisma.language.findUnique({
      where: { id: languageId },
    });

    if (!language) {
      throw new NotFoundException({
        error: 'language_not_found',
        message: 'Language not found',
      });
    }

    // Get user's learning language
    const userLanguage = await this.prisma.userLanguage.findFirst({
      where: {
        userId,
        languageId,
        isLearning: true,
      },
    });

    if (!userLanguage) {
      throw new BadRequestException({
        error: 'not_learning_language',
        message: 'You are not learning this language',
      });
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

    // TODO: Implement actual progress calculation
    // For development, return mock progress data
    return {
      language,
      level: userLanguage.level,
      startedAt: userLanguage.createdAt,
      daysSinceStart: Math.floor(
        (Date.now() - userLanguage.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
      stats: {
        savedWords: wordCount,
        messagesSent: messageCount,
        correctionsReceived: correctionCount,
      },
      progress: {
        vocabulary: 35,
        grammar: 42,
        listening: 28,
        speaking: 20,
        reading: 45,
        writing: 38,
        overall: 35,
      },
      recentActivity: [
        {
          type: 'word_saved',
          date: new Date(),
          details: {
            word: 'Example',
          },
        },
        {
          type: 'message_sent',
          date: new Date(Date.now() - 24 * 60 * 60 * 1000),
          details: {
            length: 42,
          },
        },
      ],
    };
  }

  /**
   * Helper to validate if language codes exist
   */
  private async validateLanguages(languageCodes: string[]) {
    // For each language code, check if it exists
    for (const code of languageCodes) {
      const language = await this.prisma.language.findFirst({
        where: { code },
      });

      if (!language) {
        throw new NotFoundException({
          error: 'language_not_found',
          message: `Language with code "${code}" not found`,
        });
      }
    }
  }
}
