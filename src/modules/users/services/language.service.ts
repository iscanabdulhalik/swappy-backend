import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Language } from '@prisma/client';
import { AppException } from 'src/common/exceptions/app-exceptions';

@Injectable()
export class LanguageService {
  private readonly logger = new Logger(LanguageService.name);
  private readonly LANGUAGES_CACHE_KEY = 'all_languages';
  private readonly LANGUAGE_CACHE_KEY_PREFIX = 'language_';
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 saat

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Get all languages with caching
   *
   * @returns Array of all languages
   */
  async getAllLanguages(): Promise<Language[]> {
    try {
      // Try to get from cache first
      const cachedLanguages = await this.cacheManager.get<Language[]>(
        this.LANGUAGES_CACHE_KEY,
      );

      if (cachedLanguages) {
        this.logger.debug('Languages retrieved from cache');
        return cachedLanguages;
      }

      // If not in cache, get from database
      const languages = await this.prisma.language.findMany({
        orderBy: { name: 'asc' },
      });

      // Store in cache
      await this.cacheManager.set(
        this.LANGUAGES_CACHE_KEY,
        languages,
        this.CACHE_TTL,
      );
      this.logger.debug('Languages fetched from database and cached');

      return languages;
    } catch (error) {
      this.logger.error(
        `Error getting languages: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving languages');
    }
  }

  /**
   * Get a language by its code with caching
   *
   * @param code - Language code
   * @returns Language object
   */
  async getLanguageByCode(code: string): Promise<Language | null> {
    try {
      const cacheKey = `${this.LANGUAGE_CACHE_KEY_PREFIX}code_${code}`;

      // Try to get from cache first
      const cachedLanguage = await this.cacheManager.get<Language>(cacheKey);

      if (cachedLanguage) {
        return cachedLanguage;
      }

      // If not in cache, get from database
      const language = await this.prisma.language.findUnique({
        where: { code },
      });

      if (language) {
        // Store in cache
        await this.cacheManager.set(cacheKey, language, this.CACHE_TTL);
      }

      return language;
    } catch (error) {
      this.logger.error(
        `Error getting language by code: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving language');
    }
  }

  /**
   * Get a language by ID with caching
   *
   * @param id - Language ID
   * @returns Language object
   */
  async getLanguageById(id: string): Promise<Language | null> {
    try {
      const cacheKey = `${this.LANGUAGE_CACHE_KEY_PREFIX}id_${id}`;

      // Try to get from cache first
      const cachedLanguage = await this.cacheManager.get<Language>(cacheKey);

      if (cachedLanguage) {
        return cachedLanguage;
      }

      // If not in cache, get from database
      const language = await this.prisma.language.findUnique({
        where: { id },
      });

      if (language) {
        // Store in cache
        await this.cacheManager.set(cacheKey, language, this.CACHE_TTL);
      }

      return language;
    } catch (error) {
      this.logger.error(
        `Error getting language by ID: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving language');
    }
  }

  /**
   * Invalidate language cache when data changes
   */
  async invalidateCache() {
    try {
      await this.cacheManager.del(this.LANGUAGES_CACHE_KEY);
      this.logger.debug('Languages cache invalidated');
    } catch (error) {
      this.logger.error(
        `Error invalidating language cache: ${error.message}`,
        error.stack,
      );
    }
  }
}
