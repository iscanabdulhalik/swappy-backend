import { Injectable } from '@nestjs/common';
import { ScoringWeightsDto } from '../dto/match.dto';
import { LanguageLevel, User } from '@prisma/client';

@Injectable()
export class MatchScoringService {
  calculateMatchScore(
    mainUser: User & any,
    candidate: User & any,
    currentTime: number,
    customWeights?: ScoringWeightsDto,
  ): { total: number; details: any } {
    const weights = {
      recency: customWeights?.recency ?? 0.3,
      age: customWeights?.age ?? 0.2,
      activity: 0.2,
      languageMatch: customWeights?.languageMatch ?? 0.3,
    };

    // Calculate recency score based on last active date from stats
    let scoreRecency = 0.5; // Default value if no last active date
    if (candidate.stats?.lastActiveDate) {
      const lastSeenTime = new Date(candidate.stats.lastActiveDate).getTime();
      const recencyDays = (currentTime - lastSeenTime) / (1000 * 60 * 60 * 24);
      scoreRecency = Math.max(0, 1 - recencyDays / 90); // Score decreases if user hasn't been active recently
    }

    // Calculate age difference score (if birth dates are available)
    let scoreAge = 0.5; // Default value if no birth dates
    if (mainUser.birthDate && candidate.birthDate) {
      const mainBirth = new Date(mainUser.birthDate).getTime();
      const candidateBirth = new Date(candidate.birthDate).getTime();
      const ageDiff =
        Math.abs(mainBirth - candidateBirth) / (1000 * 60 * 60 * 24 * 365.25);
      scoreAge = Math.max(0, 1 - ageDiff / 47); // Score decreases with age difference
    }

    // Calculate activity score based on user stats
    let scoreActivity = 0;
    if (candidate.stats) {
      // Calculate score based on message count and learning days
      const messageScore = Math.min(1, candidate.stats.messagesCount / 100);
      const learningDaysScore = Math.min(1, candidate.stats.learningDays / 30);
      scoreActivity = (messageScore + learningDaysScore) / 2;
    }

    // Calculate language compatibility score
    const languageMatchScore = this.calculateLanguageCompatibility(
      mainUser,
      candidate,
    );

    // Calculate total score
    const total =
      weights.recency * scoreRecency +
      weights.age * scoreAge +
      weights.activity * scoreActivity +
      weights.languageMatch * languageMatchScore;

    return {
      total,
      details: {
        recency: scoreRecency,
        age: scoreAge,
        activity: scoreActivity,
        languageMatch: languageMatchScore,
      },
    };
  }

  /**
   * Calculate language compatibility between users
   */
  calculateLanguageCompatibility(user1: any, user2: any): number {
    if (!user1.languages || !user2.languages) {
      return 0;
    }

    // Get native languages of user1
    const user1NativeLanguages = user1.languages
      .filter((ul) => ul.isNative)
      .map((ul) => ul.languageId);

    // Get learning languages of user1
    const user1LearningLanguages = user1.languages
      .filter((ul) => ul.isLearning)
      .map((ul) => ul.languageId);

    // Get native languages of user2
    const user2NativeLanguages = user2.languages
      .filter((ul) => ul.isNative)
      .map((ul) => ul.languageId);

    // Get learning languages of user2
    const user2LearningLanguages = user2.languages
      .filter((ul) => ul.isLearning)
      .map((ul) => ul.languageId);

    // Check if user1's native languages match user2's learning languages
    const user1NativeMatchesUser2Learning = user1NativeLanguages.some((lang) =>
      user2LearningLanguages.includes(lang),
    );

    // Check if user1's learning languages match user2's native languages
    const user1LearningMatchesUser2Native = user1LearningLanguages.some(
      (lang) => user2NativeLanguages.includes(lang),
    );

    // Check language levels to give bonus for advanced learners
    let levelBonus = 0;

    // Find matching language levels
    if (user1NativeMatchesUser2Learning || user1LearningMatchesUser2Native) {
      const matchingUserLanguages = user2.languages.filter((ul) => {
        return ul.isLearning && user1NativeLanguages.includes(ul.languageId);
      });

      // Add bonus for higher level learners
      for (const ul of matchingUserLanguages) {
        if (ul.level === LanguageLevel.ADVANCED) {
          levelBonus += 0.2;
        } else if (ul.level === LanguageLevel.INTERMEDIATE) {
          levelBonus += 0.1;
        }
      }
    }

    // Calculate final language score
    // Perfect match: both users can help each other
    if (user1NativeMatchesUser2Learning && user1LearningMatchesUser2Native) {
      return Math.min(1.0, 0.8 + levelBonus); // Cap at 1.0
    }
    // One-way match: only one user can help the other
    else if (
      user1NativeMatchesUser2Learning ||
      user1LearningMatchesUser2Native
    ) {
      return Math.min(0.7, 0.5 + levelBonus); // Cap at 0.7
    }
    // No language match
    else {
      return 0.0;
    }
  }
}
