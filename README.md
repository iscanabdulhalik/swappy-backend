# Swappy Backend

A modern, scalable language exchange and learning platform built with NestJS, PostgreSQL, and Firebase. This platform connects language learners worldwide through real-time chat, AI-powered learning tools, and social features.

## 🌟 Features

### 🔐 Authentication & User Management

- **Firebase Authentication** with custom token support
- **User Profiles** with comprehensive language settings
- **Multi-language Support** with 90+ languages
- **Follow System** for building learning communities
- **Real-time Online Status** tracking

### 💬 Real-time Communication

- **WebSocket-based Chat** with conversation management
- **Message Corrections** for language learning
- **Typing Indicators** and read receipts
- **Media Sharing** (images, audio, video)
- **Real-time Notifications** system

### 🤝 Matching & Discovery

- **Smart Matching Algorithm** based on language compatibility
- **Scored Recommendations** with custom weighting
- **Match Requests** with acceptance/rejection workflow
- **Language Pair Matching** (native speakers ↔ learners)

### 🤖 AI-Powered Learning

- **Text Translation** using Google Gemini AI
- **Grammar Correction** with detailed explanations
- **Writing Suggestions** for better communication
- **Pronunciation Guidance** with phonetic transcriptions
- **Dictionary Lookup** with examples and synonyms
- **Local AI Support** via Ollama for privacy-focused users

### 📱 Social Features

- **Posts & Comments** with language-specific feeds
- **Stories** with 24-hour expiration
- **User Following** and activity feeds
- **Saved Words** vocabulary management
- **Learning Progress** tracking

### 🔔 Notification System

- **Real-time Push Notifications** via WebSocket
- **Granular Notification Settings** per notification type
- **Email Notifications** support
- **Notification History** and read status

### 📊 Analytics & Insights

- **User Statistics** (matches, messages, learning days)
- **Learning Progress** tracking per language
- **Activity Monitoring** with last active timestamps

## 🏗️ Architecture

### Technology Stack

- **Backend Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Firebase Admin SDK
- **Real-time**: Socket.IO WebSockets
- **AI Services**: Google Gemini AI + Ollama (local)
- **Caching**: Redis (optional) + in-memory cache
- **API Documentation**: Swagger/OpenAPI

### Key Components

#### 🗄️ Database Schema

- **Users**: Profile data, settings, and statistics
- **Languages**: 90+ supported languages with metadata
- **UserLanguages**: Proficiency levels and learning preferences
- **Matches**: User connections and conversations
- **Messages**: Chat messages with corrections and reactions
- **Posts/Stories**: Social content with media support
- **Notifications**: Comprehensive notification system

#### 🔌 WebSocket Architecture

- **Main Gateway**: Connection management and authentication
- **Conversation Gateway**: Real-time messaging
- **Notification Gateway**: Push notifications
- **Online Status Gateway**: User presence tracking

#### 🧠 AI Services

- **Google Gemini AI**: Cloud-based AI for translation and corrections
- **Ollama Integration**: Local AI models for privacy
- **Configurable Models**: Switch between different AI providers

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL (v14+)
- Redis (optional, for caching)
- Firebase Project
- Google Gemini API Key (optional)
- Ollama (optional, for local AI)

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd swappy-backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp .env.example .env
```

Configure the following environment variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/swappy"

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_ADMIN_PRIVATE_KEY=your-private-key
FIREBASE_ADMIN_CLIENT_EMAIL=your-service-account-email

# AI Services (Optional)
GEMINI_API_KEY=your-gemini-api-key
OLLAMA_API_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=gemma:3b-4k

# Cache (Optional)
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-jwt-secret-32-chars-minimum
TEST_AUTH_SECRET=your-test-secret-32-chars-minimum

# CORS
CORS_ORIGINS=http://localhost:3000,https://your-frontend-domain.com
```

4. **Set up the database**

```bash
# Start PostgreSQL (using Docker)
docker-compose up -d postgres

# Generate Prisma client
npm run prisma:generate

# Run migrations
npx prisma migrate deploy

# Seed the database with languages
npx prisma db seed
```

5. **Start the development server**

```bash
npm run start:dev
```

The server will start on `http://localhost:3000/v1`

### Docker Setup

Use the provided Docker Compose for easy local development:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

## 📖 API Documentation

### Base URL

- Development: `http://localhost:3000/v1`
- API Documentation: `http://localhost:3000/v1/docs`

### Authentication

All protected endpoints require a Firebase ID token in the Authorization header:

```bash
Authorization: Bearer <firebase-id-token>
```

For testing, you can use test tokens (development only):

```bash
Authorization: Bearer test_<TEST_AUTH_SECRET>_<user-id>
```

### Core Endpoints

#### 🔐 Authentication

```
POST /v1/auth/register          # Register new user
POST /v1/auth/login             # Login with email/password
POST /v1/auth/firebase          # Authenticate with Firebase token
GET  /v1/auth/me                # Get current user info
PUT  /v1/auth/me/profile        # Update user profile
```

#### 👥 Users

```
GET  /v1/users/me               # Get current user
PUT  /v1/users/me               # Update user profile
GET  /v1/users/:id              # Get user by ID
GET  /v1/users/search           # Search users
POST /v1/users/:id/follow       # Follow user
GET  /v1/users/languages        # Get all languages
```

#### 🤝 Matches

```
GET  /v1/matches/recommendations        # Get match recommendations
GET  /v1/matches/recommendations/scored # Get scored recommendations
POST /v1/matches/request               # Send match request
GET  /v1/matches/requests              # Get match requests
PUT  /v1/matches/requests/:id/accept   # Accept match request
GET  /v1/matches                       # Get user matches
```

#### 💬 Conversations

```
GET  /v1/conversations                 # Get user conversations
GET  /v1/conversations/:id             # Get conversation details
GET  /v1/conversations/:id/messages    # Get conversation messages
POST /v1/conversations/:id/messages    # Send message
PUT  /v1/conversations/:id/read        # Mark as read
```

#### 🤖 Learning (AI-Powered)

```
POST /v1/learning/translate            # Translate text
POST /v1/learning/correct              # Correct grammar
GET  /v1/learning/suggestions          # Get writing suggestions
POST /v1/learning/pronunciation        # Get pronunciation guide
GET  /v1/learning/dictionary           # Dictionary lookup
GET  /v1/learning/words                # Get saved words
```

#### 🤖 Local Learning (Ollama)

```
POST /v1/local-learning/translate      # Local translation
POST /v1/local-learning/correct        # Local grammar correction
GET  /v1/local-learning/models         # Get available models
POST /v1/local-learning/set-model      # Set active model
```

#### 📱 Social Features

```
GET  /v1/feed                          # Get activity feed
POST /v1/posts                         # Create post
PUT  /v1/posts/:id/like               # Like/unlike post
GET  /v1/posts/:id/comments           # Get post comments
POST /v1/stories                       # Create story
GET  /v1/stories                       # Get stories feed
```

#### 🔔 Notifications

```
GET  /v1/notifications                 # Get notifications
PUT  /v1/notifications/:id/read        # Mark notification as read
GET  /v1/notifications/settings        # Get notification settings
PUT  /v1/notifications/settings        # Update notification settings
```

## 🔌 WebSocket Events

### Connection & Authentication

```javascript
// Connect to WebSocket
const socket = io('ws://localhost:3000');

// Authenticate
socket.emit('authenticate', { token: 'your-firebase-token' });

// Listen for authentication success
socket.on('authenticated', (data) => {
  console.log('Authenticated:', data);
});
```

### Conversation Events

```javascript
// Join a conversation
socket.emit('join_conversation', { conversationId: 'uuid' });

// Send a message
socket.emit('send_message', {
  conversationId: 'uuid',
  message: { content: 'Hello!', contentType: 'text' },
});

// Listen for new messages
socket.on('message_received', (data) => {
  console.log('New message:', data);
});

// Typing indicators
socket.emit('typing_start', { conversationId: 'uuid' });
socket.emit('typing_end', { conversationId: 'uuid' });
```

### Notification Events

```javascript
// Subscribe to notifications
socket.emit('subscribe_notifications');

// Listen for new notifications
socket.on('new_notification', (notification) => {
  console.log('New notification:', notification);
});

// Listen for notification count updates
socket.on('notification_count_updated', (data) => {
  console.log('Unread count:', data.count);
});
```

## 🧪 Testing

### Unit Tests

```bash
npm run test
```

### E2E Tests

```bash
npm run test:e2e
```

### Test Coverage

```bash
npm run test:cov
```

### Test Authentication

For testing, you can use test tokens:

```typescript
const testToken = `test_${process.env.TEST_AUTH_SECRET}_${userId}`;
```

## 🔧 Configuration

### Environment Variables

#### Required

- `DATABASE_URL`: PostgreSQL connection string
- `FIREBASE_PROJECT_ID`: Firebase project identifier
- `FIREBASE_ADMIN_PRIVATE_KEY`: Firebase service account private key
- `FIREBASE_ADMIN_CLIENT_EMAIL`: Firebase service account email

#### Optional

- `REDIS_URL`: Redis connection string for caching
- `GEMINI_API_KEY`: Google Gemini AI API key
- `OLLAMA_API_URL`: Ollama server URL (default: http://localhost:11434)
- `TEST_AUTH_SECRET`: Secret for test authentication
- `CORS_ORIGINS`: Allowed CORS origins

### Cache Configuration

The application supports multiple caching strategies:

- **In-memory caching** (default)
- **Redis caching** (recommended for production)

### AI Configuration

#### Google Gemini AI

```env
GEMINI_API_KEY=your-api-key
```

#### Ollama (Local AI)

```env
OLLAMA_API_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=gemma:3b-4k
```

Available Ollama models:

- `gemma:3b-4k` (default, good balance)
- `llama2:7b` (better quality, slower)
- `codellama:7b` (for code-related tasks)

## 🚀 Deployment

### Production Setup

1. **Environment Configuration**

```bash
NODE_ENV=production
DATABASE_URL=your-production-db-url
REDIS_URL=your-redis-url
```

2. **Build the application**

```bash
npm run build
```

3. **Start production server**

```bash
npm run start:prod
```

### Vercel Deployment

The project includes Vercel configuration:

```bash
npm run vercel-build
```

### Docker Deployment

Build and run with Docker:

```bash
docker build -t swappy-backend .
docker run -p 3000:3000 swappy-backend
```

## 🔒 Security Features

### Authentication & Authorization

- Firebase ID token verification
- Custom token support for testing
- Role-based access control
- Request rate limiting
- CORS protection

### Data Protection

- Input validation and sanitization
- SQL injection prevention (Prisma)
- XSS protection
- Secure WebSocket authentication
- Environment variable validation

### Privacy Features

- Local AI processing option (Ollama)
- User data anonymization options
- Comprehensive user deletion
- Privacy-focused caching

## 📊 Monitoring & Health Checks

### Health Endpoints

```bash
GET /health                    # Application health
GET /health/database          # Database connectivity
GET /health/websockets        # WebSocket gateway status
```

### Metrics & Logging

The application includes comprehensive logging:

- Request/response logging
- Error tracking with stack traces
- Performance monitoring
- WebSocket connection tracking

### Cache Statistics

Monitor cache performance:

```typescript
// Get cache statistics
const stats = await conversationsService.getCacheStats();
```

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**

```bash
git checkout -b feature/your-feature-name
```

3. **Make your changes**
4. **Run tests**

```bash
npm run test
npm run test:e2e
```

5. **Commit with conventional commits**

```bash
git commit -m "feat: add new matching algorithm"
```

6. **Push and create a pull request**

### Code Standards

- **TypeScript** with strict type checking
- **ESLint** and **Prettier** for code formatting
- **Conventional Commits** for commit messages
- **Jest** for testing
- **Comprehensive error handling**

### Database Migrations

When making schema changes:

```bash
# Generate migration
npx prisma migrate dev --name your-migration-name

# Apply migrations
npx prisma migrate deploy
```

## 📝 API Examples

### Complete User Registration Flow

```typescript
// 1. Register user
const registerResponse = await fetch('/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securePassword123',
    displayName: 'John Doe',
    countryCode: 'US',
  }),
});

// 2. Set up user languages
const languagesResponse = await fetch('/v1/users/me/languages', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  },
  body: JSON.stringify({
    languages: [
      {
        languageId: 'english-uuid',
        level: 'ADVANCED',
        isNative: true,
        isLearning: false,
      },
      {
        languageId: 'spanish-uuid',
        level: 'BEGINNER',
        isNative: false,
        isLearning: true,
      },
    ],
  }),
});

// 3. Get match recommendations
const matchesResponse = await fetch(
  '/v1/matches/recommendations?learningLanguageId=spanish-uuid',
  {
    headers: { Authorization: `Bearer ${idToken}` },
  },
);
```

### Real-time Chat Implementation

```typescript
// Initialize WebSocket connection
const socket = io('ws://localhost:3000');

// Authenticate
socket.emit('authenticate', { token: idToken });

socket.on('authenticated', () => {
  // Join conversation
  socket.emit('join_conversation', { conversationId: 'conv-uuid' });

  // Listen for messages
  socket.on('message_received', (data) => {
    displayMessage(data.message);
  });

  // Send message
  const sendMessage = (content) => {
    socket.emit('send_message', {
      conversationId: 'conv-uuid',
      message: { content, contentType: 'text' },
    });
  };
});
```

### AI-Powered Learning Features

```typescript
// Translate text
const translation = await fetch('/v1/learning/translate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  },
  body: JSON.stringify({
    text: 'Hello, how are you?',
    sourceLanguage: 'en',
    targetLanguage: 'es',
  }),
});

// Get grammar corrections
const correction = await fetch('/v1/learning/correct', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  },
  body: JSON.stringify({
    text: 'I are learning Spanish',
    languageCode: 'en',
    type: 'GRAMMAR',
  }),
});
```

## 🎯 Roadmap

### Upcoming Features

- [ ] Voice messages with speech recognition
- [ ] Video calling integration
- [ ] Gamification system with points and achievements
- [ ] Advanced learning analytics
- [ ] Mobile app push notifications
- [ ] Content moderation with AI
- [ ] Multi-language UI support

### Performance Improvements

- [ ] Database query optimization
- [ ] CDN integration for media files
- [ ] Horizontal scaling support
- [ ] Advanced caching strategies

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation

- [API Documentation](http://localhost:3000/v1/docs)
- [Database Schema](./prisma/schema.prisma)
- [Environment Configuration](./src/configs/environment.ts)

### Common Issues

**Firebase Authentication Issues**

- Ensure Firebase project is configured correctly
- Check private key format (should include newlines)
- Verify service account permissions

**Database Connection Issues**

- Check PostgreSQL is running
- Verify DATABASE_URL format
- Run migrations: `npx prisma migrate deploy`

**WebSocket Connection Issues**

- Check CORS configuration
- Verify authentication token format
- Monitor server logs for connection errors

**AI Service Issues**

- For Gemini: Check API key validity
- For Ollama: Ensure server is running on correct port
- Verify model availability: `GET /v1/local-learning/models`

### Getting Help

1. Check the [API Documentation](http://localhost:3000/v1/docs)
2. Review server logs for error details
3. Test with provided example requests
4. Check environment variable configuration

---

Built with ❤️ for language learners worldwide
