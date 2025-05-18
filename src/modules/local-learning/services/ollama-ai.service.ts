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
  private isServiceAvailable = true;
  private lastCheckTime = 0;
  private readonly checkInterval = 60000; // 1 dakika

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

    // Servisin kullanılabilirliğini kontrol et
    this.checkServiceAvailability();
  }

  private async checkServiceAvailability() {
    const now = Date.now();

    // Son kontrolden beri yeterli zaman geçtiyse yeniden kontrol et
    if (now - this.lastCheckTime > this.checkInterval) {
      this.lastCheckTime = now;

      try {
        const response = await axios.get(`${this.ollamaBaseUrl}/api/version`, {
          timeout: 2000, // 2 saniye timeout
        });

        if (response.status === 200) {
          if (!this.isServiceAvailable) {
            this.logger.log('Ollama servisi artık kullanılabilir');
          }
          this.isServiceAvailable = true;
        } else {
          this.isServiceAvailable = false;
          this.logger.warn(
            `Ollama servisi beklenmedik durum kodu döndürdü: ${response.status}`,
          );
        }
      } catch (error) {
        this.isServiceAvailable = false;
        this.logger.warn(`Ollama servisi kullanılamıyor: ${error.message}`);
      }
    }

    return this.isServiceAvailable;
  }

  async generateText(
    request: TextGenerationRequest,
  ): Promise<TextGenerationResponse> {
    // Servis kullanılabilirliğini kontrol et
    const isAvailable = await this.checkServiceAvailability();

    if (!isAvailable) {
      throw AppException.serviceUnavailable(
        'Yerel AI servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin veya cloud tabanlı bir servis kullanın.',
      );
    }

    try {
      const model = request.model || this.defaultModel;

      this.logger.debug(`${model} modeli ile metin oluşturuluyor`);

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
        throw new Error("Ollama API'den geçersiz yanıt");
      }

      return {
        text: response.data.response.trim(),
        tokensUsed: response.data.eval_count || 0,
      };
    } catch (error) {
      this.logger.error(
        `Ollama metin oluşturma hatası: ${error.message}`,
        error.stack,
      );

      // Bağlantı hatası veya sunucu kullanılamıyor
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        this.isServiceAvailable = false;
        throw AppException.serviceUnavailable(
          "Yerel AI servisi kullanılamıyor. Lütfen Ollama'nın çalıştığından emin olun.",
        );
      }

      throw AppException.serviceUnavailable(
        `Yerel AI servisi hatası: ${error.message}`,
      );
    }
  }
}
