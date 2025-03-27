import { registerAs } from '@nestjs/config';

export default registerAs('firebase', () => {
  // Ortak değerleri tek yerden tanımla
  const projectId = process.env.FIREBASE_PROJECT_ID;

  return {
    // Firebase Web SDK Configuration
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,

    // Firebase Admin SDK Configuration
    type: process.env.FIREBASE_ADMIN_TYPE,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_ADMIN_CLIENT_ID,
    authUri: process.env.FIREBASE_ADMIN_AUTH_URI,
    tokenUri: process.env.FIREBASE_ADMIN_TOKEN_URI,
    authProviderX509CertUrl:
      process.env.FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL,
    clientX509CertUrl: process.env.FIREBASE_ADMIN_CLIENT_X509_CERT_URL,
  };
});
