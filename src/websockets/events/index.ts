// Message Events
export enum MessageEvents {
  // Client -> Server
  JOIN_CONVERSATION = 'join_conversation',
  LEAVE_CONVERSATION = 'leave_conversation',
  SEND_MESSAGE = 'send_message',
  TYPING_START = 'typing_start',
  TYPING_END = 'typing_end',

  // Server -> Client
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_UPDATED = 'message_updated',
  MESSAGE_DELETED = 'message_deleted',
  USER_TYPING = 'user_typing',
  USER_STOPPED_TYPING = 'user_stopped_typing',
  CONVERSATION_UPDATED = 'conversation_updated',
  ERROR = 'error',
}

// Notification Events
export enum NotificationEvents {
  // Client -> Server
  SUBSCRIBE_NOTIFICATIONS = 'subscribe_notifications',

  ERROR = 'error',
  // Server -> Client
  NEW_NOTIFICATION = 'new_notification',
  NOTIFICATION_READ = 'notification_read',
  NOTIFICATION_COUNT_UPDATED = 'notification_count_updated',
}

// Online Status Events
export enum OnlineStatusEvents {
  // Client -> Server
  SET_STATUS = 'set_status',
  ERROR = 'error',

  // Server -> Client
  USER_STATUS_CHANGED = 'user_status_changed',
  FRIEND_STATUS_CHANGED = 'friend_status_changed',
}

// Common Events
export enum CommonEvents {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  AUTHENTICATE = 'authenticate',
  AUTHENTICATED = 'authenticated',
}
