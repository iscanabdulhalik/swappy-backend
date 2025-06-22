// src/configs/environment.ts
import { z } from 'zod';

// Custom Zod validators
const base64String = z.string().refine(
  (val) => {
    try {
      Buffer.from(val, 'base64').toString('utf8');
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid base64 string' },
);

const privateKeyValidator = z.string().refine(
  (val) => {
    if (!val) return false;

    // Check if it's a properly formatted private key or base64 encoded
    const hasPrivateKeyHeaders =
      val.includes('-----BEGIN PRIVATE KEY-----') &&
      val.includes('-----END PRIVATE KEY-----');

    const looksLikeBase64 = /^[A-Za-z0-9+/]+=*$/.test(val.replace(/\s/g, ''));

    return hasPrivateKeyHeaders || looksLikeBase64;
  },
  { message: 'Must be a valid private key or base64 encoded private key' },
);

const firebaseProjectId = z
  .string()
  .regex(
    /^[a-z0-9-]{6,30}$/,
    'Firebase project ID must be 6-30 characters, lowercase letters, digits, and hyphens only',
  );

const envSchema = z.object({
  // Basic environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  API_PREFIX: z.string().default('api'),

  // Database (required)
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Firebase Admin (required for production, optional for development)
  FIREBASE_PROJECT_ID: z
    .union([
      firebaseProjectId,
      z.string().length(0), // Allow empty in development
    ])
    .optional(),

  FIREBASE_ADMIN_PRIVATE_KEY: z
    .union([
      privateKeyValidator,
      z.string().length(0), // Allow empty in development
    ])
    .optional(),

  FIREBASE_ADMIN_CLIENT_EMAIL: z
    .union([
      z.string().email('FIREBASE_ADMIN_CLIENT_EMAIL must be a valid email'),
      z.string().length(0), // Allow empty in development
    ])
    .optional(),

  // Firebase Client (optional)
  FIREBASE_API_KEY: z.string().optional(),
  FIREBASE_AUTH_DOMAIN: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  FIREBASE_APP_ID: z.string().optional(),
  FIREBASE_DATABASE_URL: z.string().url().optional(),

  // Firebase Admin optional fields
  FIREBASE_ADMIN_TYPE: z.string().default('service_account'),
  FIREBASE_ADMIN_CLIENT_ID: z.string().optional(),
  FIREBASE_ADMIN_AUTH_URI: z.string().url().optional(),
  FIREBASE_ADMIN_TOKEN_URI: z.string().url().optional(),
  FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL: z.string().url().optional(),
  FIREBASE_ADMIN_CLIENT_X509_CERT_URL: z.string().url().optional(),

  // AI Services
  GEMINI_API_KEY: z.string().min(10).optional(),
  OLLAMA_API_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_DEFAULT_MODEL: z.string().default('gemma:3b-4k'),

  // Cache & Redis
  CACHE_TTL: z.coerce.number().min(1000).default(3600000), // Min 1 second, default 1 hour
  CACHE_MAX_ITEMS: z.coerce.number().min(10).default(100),
  REDIS_URL: z.string().url().optional(),

  // Security
  CORS_ORIGINS: z.string().default('*'),
  JWT_SECRET: z.string().min(32).optional(), // At least 32 characters for security

  // Rate Limiting
  RATE_LIMIT_TTL: z.coerce.number().min(1).default(60), // seconds
  RATE_LIMIT_MAX: z.coerce.number().min(1).default(100), // requests per TTL

  // Test
  TEST_MODE_ENABLED: z.coerce.boolean().default(false),
  TEST_AUTH_SECRET: z.string().min(32).optional(), // At least 32 characters

  // Monitoring & Logging
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'debug', 'verbose'])
    .default('info'),
  ENABLE_REQUEST_LOGGING: z.coerce.boolean().default(false),

  // External Services
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // File Upload
  MAX_FILE_SIZE: z.coerce.number().default(10485760), // 10MB default
  ALLOWED_FILE_TYPES: z.string().default('image/jpeg,image/png,image/webp'),
});

type Env = z.infer<typeof envSchema>;

function validateEnvironment(): Env {
  try {
    const parsed = envSchema.parse(process.env);

    // Additional production-specific validations
    if (parsed.NODE_ENV === 'production') {
      validateProductionEnvironment(parsed);
    }

    // Additional test-specific validations
    if (parsed.NODE_ENV === 'test') {
      validateTestEnvironment(parsed);
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');

      console.error('❌ Environment validation failed:');
      console.error(errorMessages);

      // In development, show helpful hints
      if (process.env.NODE_ENV !== 'production') {
        console.error('\n💡 Hints:');
        console.error('- Check your .env file');
        console.error('- Ensure all required environment variables are set');
        console.error('- Verify URL formats and data types');
      }
    } else {
      console.error(
        '❌ Unexpected error during environment validation:',
        error,
      );
    }

    process.exit(1);
  }
}

function validateProductionEnvironment(env: Env): void {
  const requiredForProduction = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_ADMIN_PRIVATE_KEY',
    'FIREBASE_ADMIN_CLIENT_EMAIL',
  ];

  const missing = requiredForProduction.filter((key) => !env[key as keyof Env]);

  if (missing.length > 0) {
    throw new Error(
      `Production environment missing required variables: ${missing.join(', ')}`,
    );
  }

  // Additional production validations
  if (env.CORS_ORIGINS === '*') {
    console.warn('⚠️  Warning: CORS is set to allow all origins in production');
  }

  if (!env.JWT_SECRET) {
    console.warn('⚠️  Warning: JWT_SECRET not set in production');
  }

  if (!env.REDIS_URL && env.NODE_ENV === 'production') {
    console.warn('⚠️  Warning: Redis not configured for production caching');
  }
}

function validateTestEnvironment(env: Env): void {
  if (env.TEST_MODE_ENABLED && !env.TEST_AUTH_SECRET) {
    throw new Error(
      'TEST_AUTH_SECRET is required when TEST_MODE_ENABLED is true',
    );
  }
}

// Export validated environment
export const env = validateEnvironment();

// Export type for use in other files
export type Environment = Env;

// Helper function to check if we're in a specific environment
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isProduction = () => env.NODE_ENV === 'production';
export const isTest = () => env.NODE_ENV === 'test';

// Helper to get environment info
export const getEnvironmentInfo = () => ({
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  apiPrefix: env.API_PREFIX,
  hasRedis: !!env.REDIS_URL,
  hasFirebase: !!(env.FIREBASE_PROJECT_ID && env.FIREBASE_ADMIN_PRIVATE_KEY),
  hasGemini: !!env.GEMINI_API_KEY,
  testMode: env.TEST_MODE_ENABLED,
});
