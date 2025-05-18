import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('api'),

  // Veritabanı
  DATABASE_URL: z.string(),

  // Firebase
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_DATABASE_URL: z.string().optional(),
  FIREBASE_API_KEY: z.string().optional(),
  FIREBASE_AUTH_DOMAIN: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  FIREBASE_APP_ID: z.string().optional(),

  // AI Servisleri
  GEMINI_API_KEY: z.string().optional(),
  OLLAMA_API_URL: z.string().default('http://localhost:11434'),
  OLLAMA_DEFAULT_MODEL: z.string().default('gemma:3b-4k'),

  // Önbellek
  CACHE_TTL: z.coerce.number().default(3600000), // Varsayılan 1 saat
  CACHE_MAX_ITEMS: z.coerce.number().default(100),
  REDIS_URL: z.string().optional(),

  // Güvenlik
  CORS_ORIGINS: z.string().default('*'),
  JWT_SECRET: z.string().optional(),

  // Test
  TEST_MODE_ENABLED: z.coerce.boolean().default(false),
  TEST_AUTH_SECRET: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

function getEnvConfig(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('Ortam değişkenleri doğrulama hatası:', error.format());
    process.exit(1);
  }
}

export const env = getEnvConfig();
