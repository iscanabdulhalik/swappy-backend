import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { NotificationPreference, Prisma } from '@prisma/client';
import { AppException } from 'src/common/exceptions/app-exceptions';
import { $Enums } from '@prisma/client';

@Injectable()
export class NotificationPreferenceRepository extends BaseRepository<NotificationPreference> {
  constructor(prisma: PrismaService) {
    super(prisma, 'NotificationPreference');
  }

  /**
   * Get notification preferences for a user
   *
   * @param userSettingsId - User settings ID
   * @returns Array of notification preferences
   */
  async getPreferencesByUserSettingsId(
    userSettingsId: string,
  ): Promise<NotificationPreference[]> {
    try {
      return await this.prisma.notificationPreference.findMany({
        where: { userSettingsId },
      });
    } catch (error) {
      this.logger.error(
        `Error getting notification preferences: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving notification preferences');
    }
  }

  /**
   * Get notification preferences by user ID
   *
   * @param userId - User ID
   * @returns Array of notification preferences
   */
  async getPreferencesByUserId(
    userId: string,
  ): Promise<NotificationPreference[]> {
    try {
      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId },
        include: {
          notificationPreferences: true,
        },
      });

      if (!userSettings) {
        return [];
      }

      return userSettings.notificationPreferences;
    } catch (error) {
      this.logger.error(
        `Error getting notification preferences by user ID: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error retrieving notification preferences');
    }
  }

  /**
   * Upsert notification preferences for a user
   *
   * @param userSettingsId - User settings ID
   * @param preferences - Preferences to update or create
   * @returns Updated notification preferences
   */
  async upsertPreferences(
    userSettingsId: string,
    preferences: Record<string, { email?: boolean; push?: boolean }>,
  ): Promise<NotificationPreference[]> {
    try {
      // Get existing preferences
      const existingPreferences =
        await this.prisma.notificationPreference.findMany({
          where: { userSettingsId },
        });

      const existingMap = new Map(
        existingPreferences.map((pref) => [pref.type, pref]),
      );

      // Prepare transactions for all preferences
      const operations: Prisma.PrismaPromise<any>[] = [];

      for (const [typeStr, settings] of Object.entries(preferences)) {
        try {
          const type = typeStr as $Enums.NotificationType; // NotificationType enum

          if (existingMap.has(type)) {
            // Update existing preference
            operations.push(
              this.prisma.notificationPreference.update({
                where: {
                  id:
                    existingMap.get(type)?.id ??
                    (() => {
                      throw new Error(
                        `Preference type ${type} not found in existingMap`,
                      );
                    })(),
                },
                data: {
                  emailEnabled:
                    settings.email !== undefined
                      ? settings.email
                      : (existingMap.get(type)?.emailEnabled ?? false),
                  pushEnabled:
                    settings.push !== undefined
                      ? settings.push
                      : (existingMap.get(type)?.pushEnabled ?? false),
                  updatedAt: new Date(),
                },
              }),
            );
          } else {
            // Create new preference
            operations.push(
              this.prisma.notificationPreference.create({
                data: {
                  userSettingsId,
                  type,
                  emailEnabled:
                    settings.email !== undefined ? settings.email : true,
                  pushEnabled:
                    settings.push !== undefined ? settings.push : true,
                },
              }),
            );
          }
        } catch (error) {
          this.logger.error(
            `Error processing notification preference for type ${typeStr}: ${error.message}`,
            error.stack,
          );
          // Continue with other preferences
        }
      }

      // Execute all operations in a transaction
      return await this.prisma.$transaction(operations);
    } catch (error) {
      this.logger.error(
        `Error upserting notification preferences: ${error.message}`,
        error.stack,
      );
      throw AppException.internal('Error updating notification preferences');
    }
  }

  /**
   * Initialize default notification preferences for a user
   *
   * @param userSettingsId - User settings ID
   * @returns Created notification preferences
   */
  async initializeDefaultPreferences(
    userSettingsId: string,
  ): Promise<NotificationPreference[]> {
    try {
      // Define default preferences
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

      // Create all preferences in a transaction
      const operations = defaultPreferences.map((pref) =>
        this.prisma.notificationPreference.create({
          data: {
            userSettingsId,
            type: pref.type as $Enums.NotificationType, // Prisma NotificationType enum
            emailEnabled: pref.emailEnabled,
            pushEnabled: pref.pushEnabled,
          },
        }),
      );

      return await this.prisma.$transaction(operations);
    } catch (error) {
      this.logger.error(
        `Error initializing notification preferences: ${error.message}`,
        error.stack,
      );
      throw AppException.internal(
        'Error initializing notification preferences',
      );
    }
  }
}
