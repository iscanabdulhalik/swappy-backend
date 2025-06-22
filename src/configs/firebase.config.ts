// src/configs/firebase.config.ts
import { registerAs } from '@nestjs/config';

interface FirebaseConfig {
  // Client SDK config
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  databaseURL?: string;

  // Admin SDK config
  admin: {
    type: string;
    projectId?: string;
    privateKey?: string;
    clientEmail?: string;
    clientId?: string;
    authUri?: string;
    tokenUri?: string;
    authProviderX509CertUrl?: string;
    clientX509CertUrl?: string;
  };
}

export default registerAs('firebase', (): FirebaseConfig => {
  // Validate environment
  const requiredEnvVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_ADMIN_CLIENT_EMAIL',
    'FIREBASE_ADMIN_PRIVATE_KEY',
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );

  if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing required Firebase environment variables: ${missingVars.join(', ')}`,
    );
  }

  // Process private key securely
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (privateKey) {
    // Handle base64 encoded keys (common in deployment environments)
    try {
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        // Try to decode if it appears to be base64
        if (privateKey.match(/^[A-Za-z0-9+/]+=*$/)) {
          privateKey = Buffer.from(privateKey, 'base64').toString('utf8');
        }
      }
    } catch (error) {
      console.warn('Failed to decode private key from base64, using as-is');
    }
  }

  const config: FirebaseConfig = {
    // Client configuration (for frontend/mobile apps)
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,

    // Admin SDK configuration (server-side)
    admin: {
      type: process.env.FIREBASE_ADMIN_TYPE || 'service_account',
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: privateKey,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      clientId: process.env.FIREBASE_ADMIN_CLIENT_ID,
      authUri:
        process.env.FIREBASE_ADMIN_AUTH_URI ||
        'https://accounts.google.com/o/oauth2/auth',
      tokenUri:
        process.env.FIREBASE_ADMIN_TOKEN_URI ||
        'https://oauth2.googleapis.com/token',
      authProviderX509CertUrl:
        process.env.FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL ||
        'https://www.googleapis.com/oauth2/v1/certs',
      clientX509CertUrl: process.env.FIREBASE_ADMIN_CLIENT_X509_CERT_URL,
    },
  };

  // Validate admin configuration
  if (
    config.admin.projectId &&
    config.admin.clientEmail &&
    config.admin.privateKey
  ) {
    // Basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(config.admin.clientEmail)) {
      throw new Error('Invalid Firebase admin client email format');
    }

    const projectIdRegex = /^[a-z0-9-]{6,30}$/;
    if (!projectIdRegex.test(config.admin.projectId)) {
      throw new Error('Invalid Firebase project ID format');
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Firebase admin configuration is incomplete for production environment',
    );
  }

  return config;
});
