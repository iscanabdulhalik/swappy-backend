import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIService,
  TextGenerationRequest,
  TextGenerationResponse,
} from '../../../common/interfaces/ai-service.interface';
import { AppException } from 'src/common/exceptions/app-exceptions';
import axios from 'axios';

@Injectable()
export class OllamaAIService implements AIService {
  private readonly logger = new Logger(OllamaAIService.name);
  private readonly ollamaBaseUrl: string;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    this.ollamaBaseUrl = this.configService.get<string>(
      'OLLAMA_API_URL',
      'http://localhost:11434',
    );
    this.defaultModel = this.configService.get<string>(
      'OLLAMA_DEFAULT_MODEL',
      'gemma:3b-4k',
    );

    this.logger.log(
      `Ollama API initialized with URL: ${this.ollamaBaseUrl} and default model: ${this.defaultModel}`,
    );
  }

  /**
   * Generate text using Ollama local LLM service
   *
   * @param request - Text generation request parameters
   * @returns Generated text response
   * @throws AppException if service is unavailable or generation fails
   */
  async generateText(
    request: TextGenerationRequest,
  ): Promise<TextGenerationResponse> {
    try {
      const model = request.model || this.defaultModel;

      this.logger.debug(`Generating text with model ${model}`);

      const response = await axios.post(`${this.ollamaBaseUrl}/api/generate`, {
        model: model,
        prompt: request.prompt,
        stream: false,
        options: {
          temperature: request.temperature || 0.7,
          num_predict: request.maxLength || 1024,
        },
      });

      if (!response.data || !response.data.response) {
        throw new Error('Invalid response from Ollama API');
      }

      return {
        text: response.data.response.trim(),
        tokensUsed: response.data.eval_count || 0,
      };
    } catch (error) {
      this.logger.error(
        `Ollama text generation error: ${error.message}`,
        error.stack,
      );

      // Network error or server not available
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw AppException.serviceUnavailable(
          'Local AI service is not available. Please ensure Ollama is running.',
        );
      }

      throw AppException.serviceUnavailable(
        `Local AI service error: ${error.message}`,
      );
    }
  }
}
