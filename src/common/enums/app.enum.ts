// Kullanıcı İlgili Enum Tipleri
export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum ProfileVisibility {
  PUBLIC = 'public',
  MATCHES_ONLY = 'matches_only',
  PRIVATE = 'private',
}

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

// Dil İlgili Enum Tipleri
export enum ProficiencyLevel {
  BEGINNER = 'beginner',
  ELEMENTARY = 'elementary',
  INTERMEDIATE = 'intermediate',
  UPPER_INTERMEDIATE = 'upper_intermediate',
  ADVANCED = 'advanced',
  NATIVE = 'native',
}

export enum LearningGoal {
  TRAVEL = 'travel',
  BUSINESS = 'business',
  ACADEMIC = 'academic',
  IMMIGRATION = 'immigration',
  CULTURE = 'culture',
  HOBBY = 'hobby',
  FRIENDS = 'friends',
  FAMILY = 'family',
  OTHER = 'other',
}

// Eşleşme İlgili Enum Tipleri
export enum MatchStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum MatchRequestReason {
  NOT_INTERESTED = 'not_interested',
  NO_TIME = 'no_time',
  INAPPROPRIATE = 'inappropriate',
  DIFFERENT_GOALS = 'different_goals',
  OTHER = 'other',
}

export enum MatchEndReason {
  INACTIVE = 'inactive',
  NO_LONGER_LEARNING = 'no_longer_learning',
  DIFFERENT_GOALS = 'different_goals',
  INAPPROPRIATE_BEHAVIOR = 'inappropriate_behavior',
  OTHER = 'other',
}

// Mesajlaşma İlgili Enum Tipleri
export enum CorrectionType {
  GRAMMAR = 'grammar',
  VOCABULARY = 'vocabulary',
  SPELLING = 'spelling',
  PUNCTUATION = 'punctuation',
  STRUCTURE = 'structure',
  STYLE = 'style',
  OTHER = 'other',
}

export enum ReactionType {
  LIKE = 'like',
  LOVE = 'love',
  HAHA = 'haha',
  WOW = 'wow',
  SAD = 'sad',
  ANGRY = 'angry',
  THANKS = 'thanks',
  QUESTION = 'question',
}

export enum CallType {
  AUDIO = 'audio',
  VIDEO = 'video',
}

export enum CallStatus {
  INITIATING = 'initiating',
  RINGING = 'ringing',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  MISSED = 'missed',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

// İçerik İlgili Enum Tipleri
export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
}

export enum FeedType {
  ALL = 'all',
  FRIENDS = 'friends',
  OTHERS = 'others',
}

export enum ContentSortType {
  RECENT = 'recent',
  POPULAR = 'popular',
  RELEVANCE = 'relevance',
}

export enum ReportReason {
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  SPAM = 'spam',
  OFFENSIVE = 'offensive',
  MISINFORMATION = 'misinformation',
  PRIVACY_VIOLATION = 'privacy_violation',
  INTELLECTUAL_PROPERTY = 'intellectual_property',
  OTHER = 'other',
}

// Bildirim İlgili Enum Tipleri
export enum NotificationType {
  NEW_MESSAGE = 'new_message',
  NEW_MATCH = 'new_match',
  MATCH_REQUEST = 'match_request',
  CORRECTION = 'correction',
  MENTION = 'mention',
  COMMENT = 'comment',
  LIKE = 'like',
  FOLLOW = 'follow',
  SYSTEM = 'system',
}

// Video Feed İlgili Enum Tipleri
export enum WordDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}
