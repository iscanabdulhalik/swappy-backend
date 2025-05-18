import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AIService,
  TextGenerationRequest,
  TextGenerationResponse,
} from '../../../common/interfaces/ai-service.interface';
import { AppException } from 'src/common/exceptions/app-exceptions';

@Injectable()
export class GoogleGenerativeAIService implements AIService {
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly logger = new Logger(GoogleGenerativeAIService.name);

  constructor(private readonly configService: ConfigService) {
    // API anahtarını ConfigService üzerinden güvenli bir şekilde al
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.logger.log('Google Generative AI initialized');
    } else {
      this.logger.error(
        'Gemini API key is missing - AI features will not work',
      );
      throw new Error('GEMINI_API_KEY is required for AI features');
    }
  }

  async generateText(
    request: TextGenerationRequest,
  ): Promise<TextGenerationResponse> {
    if (!this.genAI) {
      throw AppException.serviceUnavailable(
        'Text generation service is not available',
      );
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
      });

      const generationConfig = {
        maxOutputTokens: request.maxLength,
        temperature: request.temperature,
      };

      const result = await model.generateContent(request.prompt);

      const response = result.response;
      const text = response.text();

      return {
        text: text.trim(),
      };
    } catch (error) {
      this.logger.error(`Text generation error: ${error.message}`, error.stack);
      throw AppException.serviceUnavailable(
        `Text generation failed: ${error.message}`,
      );
    }
  }
}
