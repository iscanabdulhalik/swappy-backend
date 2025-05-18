import { registerAs } from '@nestjs/config';

export default registerAs('firebase', () => {
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');

    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
    }
  } else {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Firebase private key is missing, using development mode');
    }
  }

  return {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,

    admin: {
      type: process.env.FIREBASE_ADMIN_TYPE || 'service_account',
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: privateKey,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      clientId: process.env.FIREBASE_ADMIN_CLIENT_ID,
      authUri: process.env.FIREBASE_ADMIN_AUTH_URI,
      tokenUri: process.env.FIREBASE_ADMIN_TOKEN_URI,
      authProviderX509CertUrl:
        process.env.FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL,
      clientX509CertUrl: process.env.FIREBASE_ADMIN_CLIENT_X509_CERT_URL,
    },
  };
});
