// src/modules/notifications/services/notification.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateNotificationSettingsDto } from '../dto/notification.dto';
import { ValidationHelper } from '../../../common/helpers/validation.helper';
import { AppException } from 'src/common/exceptions/app-exceptions';
import { NotificationPreferenceRepository } from '../repositories/notification-repository';

@Injectable()
export class NotificationSettingsService {
  private readonly logger = new Logger(NotificationSettingsService.name);
  private readonly MAX_RECURSION_DEPTH = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly validationHelper: ValidationHelper,
    private readonly notificationPreferenceRepository: NotificationPreferenceRepository,
  ) {}

  /**
   * Get notification settings for a user with recursion protection
   *
   * @param userId - User ID
   * @param depth - Current recursion depth (internal use)
   * @returns User's notification settings
   */
  async getNotificationSettings(userId: string, depth = 0) {
    // Recursion protection
    if (depth >= this.MAX_RECURSION_DEPTH) {
      this.logger.error(
        `Maximum recursion depth (${this.MAX_RECURSION_DEPTH}) exceeded for user ${userId}`,
      );
      throw AppException.internal(
        'Unable to retrieve notification settings due to configuration error',
      );
    }

    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Get user settings
      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!userSettings) {
        // Create default user settings if they don't exist
        const newUserSettings = await this.createDefaultUserSettings(userId);
        this.logger.log(`Created default user settings for user ${userId}`);

        // Recursive call with depth tracking
        return this.getNotificationSettings(userId, depth + 1);
      }

      // Get notification preferences from dedicated table
      const preferences =
        await this.notificationPreferenceRepository.getPreferencesByUserSettingsId(
          userSettings.id,
        );

      // Convert to expected format
      const formattedPreferences = {};
      preferences.forEach((pref) => {
        formattedPreferences[pref.type] = {
          email: pref.emailEnabled,
          push: pref.pushEnabled,
        };
      });

      // If no preferences found, initialize defaults WITHOUT recursion
      if (preferences.length === 0) {
        this.logger.log(`Initializing default preferences for user ${userId}`);

        try {
          await this.notificationPreferenceRepository.initializeDefaultPreferences(
            userSettings.id,
          );

          // Fetch the newly created preferences directly
          const newPreferences =
            await this.notificationPreferenceRepository.getPreferencesByUserSettingsId(
              userSettings.id,
            );

          const newFormattedPreferences = {};
          newPreferences.forEach((pref) => {
            newFormattedPreferences[pref.type] = {
              email: pref.emailEnabled,
              push: pref.pushEnabled,
            };
          });

          return {
            emailEnabled: userSettings.emailNotifications,
            pushEnabled: userSettings.pushNotifications,
            preferences: newFormattedPreferences,
          };
        } catch (error) {
          this.logger.error(
            `Failed to initialize default preferences for user ${userId}: ${error.message}`,
            error.stack,
          );

          // Return basic settings without preferences if initialization fails
          return {
            emailEnabled: userSettings.emailNotifications,
            pushEnabled: userSettings.pushNotifications,
            preferences: this.getDefaultPreferencesObject(),
          };
        }
      }

      return {
        emailEnabled: userSettings.emailNotifications,
        pushEnabled: userSettings.pushNotifications,
        preferences: formattedPreferences,
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error getting notification settings for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving notification settings');
    }
  }

  /**
   * Create default user settings
   */
  private async createDefaultUserSettings(userId: string) {
    try {
      return await this.prisma.userSettings.create({
        data: {
          userId,
          emailNotifications: true,
          pushNotifications: true,
          privateProfile: false,
          theme: 'system',
          language: 'en',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create default user settings for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Failed to create user settings');
    }
  }

  /**
   * Get default preferences object structure
   */
  private getDefaultPreferencesObject() {
    return {
      NEW_MESSAGE: { email: true, push: true },
      NEW_MATCH: { email: true, push: true },
      MATCH_REQUEST: { email: true, push: true },
      CORRECTION: { email: true, push: true },
      MENTION: { email: true, push: true },
      COMMENT: { email: true, push: true },
      LIKE: { email: false, push: true },
      FOLLOW: { email: false, push: true },
      SYSTEM: { email: true, push: true },
    };
  }

  /**
   * Update notification settings for a user
   *
   * @param userId - User ID
   * @param dto - Updated settings
   * @returns Updated notification settings
   */
  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Get current settings or create if not exists
      let userSettings = await this.prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!userSettings) {
        userSettings = await this.createDefaultUserSettings(userId);
      }

      // Update email and push settings
      const updateData: any = {};

      if (dto.emailEnabled !== undefined) {
        updateData.emailNotifications = dto.emailEnabled;
      }

      if (dto.pushEnabled !== undefined) {
        updateData.pushNotifications = dto.pushEnabled;
      }

      // Update user settings if there are changes
      if (Object.keys(updateData).length > 0) {
        userSettings = await this.prisma.userSettings.update({
          where: { id: userSettings.id },
          data: updateData,
        });
      }

      // Update notification preferences if provided
      if (dto.preferences) {
        await this.notificationPreferenceRepository.upsertPreferences(
          userSettings.id,
          dto.preferences,
        );
      }

      // Get updated preferences without recursion risk
      const updatedPreferences =
        await this.notificationPreferenceRepository.getPreferencesByUserSettingsId(
          userSettings.id,
        );

      // Convert to expected format
      const formattedPreferences = {};
      updatedPreferences.forEach((pref) => {
        formattedPreferences[pref.type] = {
          email: pref.emailEnabled,
          push: pref.pushEnabled,
        };
      });

      return {
        emailEnabled: userSettings.emailNotifications,
        pushEnabled: userSettings.pushNotifications,
        preferences: formattedPreferences,
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error updating notification settings for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error updating notification settings');
    }
  }

  /**
   * Safely reset user notification settings to defaults
   */
  async resetToDefaults(userId: string) {
    try {
      await this.validationHelper.validateUserExists(userId);

      return await this.prisma.$transaction(async (tx) => {
        // Get or create user settings
        let userSettings = await tx.userSettings.findUnique({
          where: { userId },
        });

        if (!userSettings) {
          userSettings = await tx.userSettings.create({
            data: {
              userId,
              emailNotifications: true,
              pushNotifications: true,
              privateProfile: false,
              theme: 'system',
              language: 'en',
            },
          });
        } else {
          // Reset to defaults
          userSettings = await tx.userSettings.update({
            where: { id: userSettings.id },
            data: {
              emailNotifications: true,
              pushNotifications: true,
            },
          });
        }

        // Delete existing preferences
        await tx.notificationPreference.deleteMany({
          where: { userSettingsId: userSettings.id },
        });

        // Create default preferences
        const defaultPreferences = [
          { type: 'NEW_MESSAGE', emailEnabled: true, pushEnabled: true },
          { type: 'NEW_MATCH', emailEnabled: true, pushEnabled: true },
          { type: 'MATCH_REQUEST', emailEnabled: true, pushEnabled: true },
          { type: 'CORRECTION', emailEnabled: true, pushEnabled: true },
          { type: 'MENTION', emailEnabled: true, pushEnabled: true },
          { type: 'COMMENT', emailEnabled: true, pushEnabled: true },
          { type: 'LIKE', emailEnabled: false, pushEnabled: true },
          { type: 'FOLLOW', emailEnabled: false, pushEnabled: true },
          { type: 'SYSTEM', emailEnabled: true, pushEnabled: true },
        ];

        await tx.notificationPreference.createMany({
          data: defaultPreferences.map((pref) => ({
            userSettingsId: userSettings.id,
            type: pref.type as any,
            emailEnabled: pref.emailEnabled,
            pushEnabled: pref.pushEnabled,
          })),
        });

        return {
          emailEnabled: userSettings.emailNotifications,
          pushEnabled: userSettings.pushNotifications,
          preferences: this.getDefaultPreferencesObject(),
        };
      });
    } catch (error) {
      this.logger.error(
        `Error resetting notification settings for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error resetting notification settings');
    }
  }
}
