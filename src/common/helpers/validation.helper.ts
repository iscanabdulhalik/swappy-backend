import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Helper service for common validation operations
 */
@Injectable()
export class ValidationHelper {
  private readonly logger = new Logger(ValidationHelper.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate that a user exists and get user data
   *
   * @param userId - User ID to validate
   * @param includeRelations - Additional relations to include
   * @returns User object if found
   * @throws NotFoundException if user not found
   */
  async validateUserExists(
    userId: string,
    includeRelations: Record<string, any> = {},
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: includeRelations,
      });

      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
        throw new NotFoundException({
          error: 'user_not_found',
          message: 'User not found',
        });
      }

      return user;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(
          `Error validating user existence: ${error.message}`,
          error.stack,
        );
      }
      throw error;
    }
  }

  /**
   * Validate that a language exists
   *
   * @param languageId - Language ID to validate
   * @returns Language object if found
   * @throws NotFoundException if language not found
   */
  async validateLanguageExists(languageId: string) {
    try {
      const language = await this.prisma.language.findUnique({
        where: { id: languageId },
      });

      if (!language) {
        this.logger.warn(`Language not found: ${languageId}`);
        throw new NotFoundException({
          error: 'language_not_found',
          message: 'Language not found',
        });
      }

      return language;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(
          `Error validating language: ${error.message}`,
          error.stack,
        );
      }
      throw error;
    }
  }

  /**
   * Validate language codes existence
   *
   * @param languageCodes - Array of language codes to validate
   * @throws NotFoundException if any language code is not found
   */
  async validateLanguageCodes(languageCodes: string[]) {
    try {
      for (const code of languageCodes) {
        const language = await this.prisma.language.findFirst({
          where: { code },
        });

        if (!language) {
          throw new NotFoundException({
            error: 'language_not_found',
            message: `Language with code ${code} not found`,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Error validating language codes: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Validate that a user has access to a conversation
   *
   * @param userId - User ID to check
   * @param conversationId - Conversation ID to check
   * @returns true if user has access, false otherwise
   */
  async validateConversationAccess(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    try {
      const count = await this.prisma.userConversation.count({
        where: {
          userId,
          conversationId,
        },
      });

      return count > 0;
    } catch (error) {
      this.logger.error(
        `Error validating conversation access: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Validate pagination parameters
   *
   * @param limit - Limit parameter
   * @param offset - Offset parameter
   * @throws BadRequestException if parameters are invalid
   * @returns Validated and sanitized parameters
   */
  validatePagination(
    limit?: number,
    offset?: number,
  ): { limit: number; offset: number } {
    const safeLimit = limit ? Math.min(Math.max(1, limit), 100) : 20; // Between 1-100, default 20
    const safeOffset = offset ? Math.max(0, offset) : 0; // Min 0, default 0

    return { limit: safeLimit, offset: safeOffset };
  }
}
