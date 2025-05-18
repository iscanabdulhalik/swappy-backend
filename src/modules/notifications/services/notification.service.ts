import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateNotificationSettingsDto } from '../dto/notification.dto';
import { ValidationHelper } from '../../../common/helpers/validation.helper';
import { AppException } from 'src/common/exceptions/app-exceptions';
import { NotificationPreferenceRepository } from '../repositories/notification-repository';

@Injectable()
export class NotificationSettingsService {
  private readonly logger = new Logger(NotificationSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validationHelper: ValidationHelper,
    private readonly notificationPreferenceRepository: NotificationPreferenceRepository,
  ) {}

  /**
   * Get notification settings for a user
   *
   * @param userId - User ID
   * @returns User's notification settings
   */
  async getNotificationSettings(userId: string) {
    try {
      // Verify user exists
      await this.validationHelper.validateUserExists(userId);

      // Get user settings
      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!userSettings) {
        throw AppException.notFound('not_found', 'User settings not found');
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

      // If no preferences found, initialize defaults
      if (preferences.length === 0) {
        await this.notificationPreferenceRepository.initializeDefaultPreferences(
          userSettings.id,
        );
        return this.getNotificationSettings(userId); // Recursive call to get newly created preferences
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
        `Error getting notification settings: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving notification settings');
    }
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

      // Get current settings
      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!userSettings) {
        throw AppException.notFound('not_found', 'User settings not found');
      }

      // Update email and push settings
      const updateData: any = {};

      if (dto.emailEnabled !== undefined) {
        updateData.emailNotifications = dto.emailEnabled;
      }

      if (dto.pushEnabled !== undefined) {
        updateData.pushNotifications = dto.pushEnabled;
      }

      // Update user settings
      const updatedSettings = await this.prisma.userSettings.update({
        where: { id: userSettings.id },
        data: updateData,
      });

      // Update notification preferences if provided
      if (dto.preferences) {
        await this.notificationPreferenceRepository.upsertPreferences(
          userSettings.id,
          dto.preferences,
        );
      }

      // Get updated preferences
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
        emailEnabled: updatedSettings.emailNotifications,
        pushEnabled: updatedSettings.pushNotifications,
        preferences: formattedPreferences,
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      this.logger.error(
        `Error updating notification settings: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error updating notification settings');
    }
  }
}
