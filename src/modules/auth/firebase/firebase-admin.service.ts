// src/modules/auth/firebase/firebase-admin.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import axios from 'axios';

interface FirebaseAdminConfig {
  type: string;
  projectId: string;
  privateKey: string;
  clientEmail: string;
  clientId?: string;
  authUri?: string;
  tokenUri?: string;
  authProviderX509CertUrl?: string;
  clientX509CertUrl?: string;
}

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private firebaseApp: admin.app.App | null = null;
  private apiKey: string | null = null;
  private readonly logger = new Logger(FirebaseAdminService.name);
  private isInitialized = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    try {
      this.initializeFirebaseAdmin();
    } catch (error) {
      this.logger.error(
        `Critical: Firebase Admin initialization failed: ${error.message}`,
        error.stack,
      );
      // Don't throw in production - allow app to start but log the error
      if (process.env.NODE_ENV !== 'production') {
        throw error;
      }
    }
  }

  private initializeFirebaseAdmin(): void {
    const firebaseConfig = this.configService.get('firebase');

    if (!firebaseConfig) {
      throw new Error('Firebase configuration is missing');
    }

    // Check if already initialized (avoid re-initialization)
    try {
      this.firebaseApp = admin.app();
      this.logger.log('Using existing Firebase Admin app instance');
      this.isInitialized = true;
    } catch (error) {
      // App doesn't exist, create new one
      this.createNewFirebaseApp(firebaseConfig);
    }

    // Set API key for REST operations
    this.apiKey = firebaseConfig.apiKey;
    if (!this.apiKey) {
      this.logger.warn(
        'Firebase API Key is missing - REST API operations will fail',
      );
    }
  }

  private createNewFirebaseApp(firebaseConfig: any): void {
    const adminConfig = this.validateAndProcessAdminConfig(
      firebaseConfig.admin,
    );

    try {
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(adminConfig),
        databaseURL: firebaseConfig.databaseURL,
        // Add additional security options
        projectId: adminConfig.projectId,
      });

      this.isInitialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error.stack);
      throw new Error(`Firebase Admin initialization failed: ${error.message}`);
    }
  }

  private validateAndProcessAdminConfig(adminConfig: any): FirebaseAdminConfig {
    if (!adminConfig) {
      throw new Error('Firebase Admin configuration is missing');
    }

    const { projectId, clientEmail, privateKey } = adminConfig;

    // Validate required fields
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Missing required Firebase Admin credentials: projectId, clientEmail, or privateKey',
      );
    }

    // Validate and process private key securely
    const processedPrivateKey = this.validateAndProcessPrivateKey(privateKey);

    // Validate email format
    if (!this.isValidEmail(clientEmail)) {
      throw new Error('Invalid Firebase client email format');
    }

    // Validate project ID format
    if (!this.isValidProjectId(projectId)) {
      throw new Error('Invalid Firebase project ID format');
    }

    return {
      type: adminConfig.type || 'service_account',
      projectId,
      privateKey: processedPrivateKey,
      clientEmail,
      clientId: adminConfig.clientId,
      authUri:
        adminConfig.authUri || 'https://accounts.google.com/o/oauth2/auth',
      tokenUri: adminConfig.tokenUri || 'https://oauth2.googleapis.com/token',
      authProviderX509CertUrl:
        adminConfig.authProviderX509CertUrl ||
        'https://www.googleapis.com/oauth2/v1/certs',
      clientX509CertUrl: adminConfig.clientX509CertUrl,
    };
  }

  private validateAndProcessPrivateKey(privateKey: string): string {
    if (!privateKey || typeof privateKey !== 'string') {
      throw new Error('Firebase private key is missing or invalid');
    }

    // Clean the private key
    let cleanedKey = privateKey.trim();

    // Handle escaped newlines
    cleanedKey = cleanedKey.replace(/\\n/g, '\n');

    // Validate private key format
    const privateKeyRegex =
      /-----BEGIN PRIVATE KEY-----[\s\S]*-----END PRIVATE KEY-----/;

    if (privateKeyRegex.test(cleanedKey)) {
      // Key is already properly formatted
      return cleanedKey;
    }

    // Try to add headers if missing
    if (!cleanedKey.includes('-----BEGIN PRIVATE KEY-----')) {
      // Remove any existing headers first
      cleanedKey = cleanedKey
        .replace(/-----BEGIN [^-]+-----/g, '')
        .replace(/-----END [^-]+-----/g, '')
        .replace(/\s/g, '');

      // Add proper headers
      const formattedKey = `-----BEGIN PRIVATE KEY-----\n${cleanedKey}\n-----END PRIVATE KEY-----`;

      // Final validation
      if (!privateKeyRegex.test(formattedKey)) {
        throw new Error('Unable to format Firebase private key properly');
      }

      return formattedKey;
    }

    throw new Error('Invalid Firebase private key format');
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidProjectId(projectId: string): boolean {
    // Firebase project IDs must be 6-30 characters, lowercase letters, digits, and hyphens
    const projectIdRegex = /^[a-z0-9-]{6,30}$/;
    return projectIdRegex.test(projectId);
  }

  // Public methods with proper error handling
  getAuth(): admin.auth.Auth {
    this.ensureInitialized();
    return this.firebaseApp!.auth();
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    this.ensureInitialized();

    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Invalid ID token provided');
    }

    try {
      return await this.getAuth().verifyIdToken(idToken, true); // checkRevoked = true
    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`);
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    this.ensureInitialized();

    if (!uid || typeof uid !== 'string') {
      throw new Error('Invalid UID provided');
    }

    try {
      return await this.getAuth().getUser(uid);
    } catch (error) {
      this.logger.error(`Get user failed: ${error.message}`);
      throw new Error(`Get user failed: ${error.message}`);
    }
  }

  async getUserByEmail(email: string): Promise<admin.auth.UserRecord> {
    this.ensureInitialized();

    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format provided');
    }

    try {
      return await this.getAuth().getUserByEmail(email);
    } catch (error) {
      this.logger.error(`Get user by email failed: ${error.message}`);
      throw new Error(`Get user by email failed: ${error.message}`);
    }
  }

  async createUser(
    email: string,
    password: string,
  ): Promise<admin.auth.UserRecord> {
    this.ensureInitialized();

    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format provided');
    }

    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    try {
      return await this.getAuth().createUser({
        email,
        password,
        emailVerified: false,
      });
    } catch (error) {
      this.logger.error(`Create user failed: ${error.message}`);
      throw new Error(`Create user failed: ${error.message}`);
    }
  }

  async updateUser(uid: string, data: any): Promise<admin.auth.UserRecord> {
    this.ensureInitialized();

    if (!uid || typeof uid !== 'string') {
      throw new Error('Invalid UID provided');
    }

    try {
      return await this.getAuth().updateUser(uid, data);
    } catch (error) {
      this.logger.error(`Update user failed: ${error.message}`);
      throw new Error(`Update user failed: ${error.message}`);
    }
  }

  async deleteUser(uid: string): Promise<void> {
    this.ensureInitialized();

    if (!uid || typeof uid !== 'string') {
      throw new Error('Invalid UID provided');
    }

    try {
      await this.getAuth().deleteUser(uid);
    } catch (error) {
      this.logger.error(`Delete user failed: ${error.message}`);
      throw new Error(`Delete user failed: ${error.message}`);
    }
  }

  async createCustomToken(uid: string): Promise<string> {
    this.ensureInitialized();

    if (!uid || typeof uid !== 'string') {
      throw new Error('Invalid UID provided');
    }

    try {
      return await this.getAuth().createCustomToken(uid);
    } catch (error) {
      this.logger.error(`Create custom token failed: ${error.message}`);
      throw new Error(`Create custom token failed: ${error.message}`);
    }
  }

  // REST API methods with proper error handling and timeouts
  async signInWithEmailPassword(
    email: string,
    password: string,
  ): Promise<{ idToken: string }> {
    if (!this.apiKey) {
      throw new Error('Firebase API Key is not configured');
    }

    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format provided');
    }

    if (!password) {
      throw new Error('Password is required');
    }

    try {
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`,
        {
          email,
          password,
          returnSecureToken: true,
        },
        {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data?.idToken) {
        throw new Error('Invalid response from Firebase Auth API');
      }

      return {
        idToken: response.data.idToken,
      };
    } catch (error) {
      if (error.response?.data?.error?.message) {
        const firebaseError = error.response.data.error.message;
        this.logger.error(`Firebase sign-in failed: ${firebaseError}`);
        throw new Error(`Authentication failed: ${firebaseError}`);
      }

      this.logger.error(`Sign-in request failed: ${error.message}`);
      throw new Error(`Authentication request failed: ${error.message}`);
    }
  }

  async exchangeCustomTokenForIdToken(
    customToken: string,
  ): Promise<{ idToken: string }> {
    if (!this.apiKey) {
      throw new Error('Firebase API Key is not configured');
    }

    if (!customToken || typeof customToken !== 'string') {
      throw new Error('Invalid custom token provided');
    }

    try {
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${this.apiKey}`,
        {
          token: customToken,
          returnSecureToken: true,
        },
        {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data?.idToken) {
        throw new Error('Invalid response from Firebase Auth API');
      }

      return {
        idToken: response.data.idToken,
      };
    } catch (error) {
      if (error.response?.data?.error?.message) {
        const firebaseError = error.response.data.error.message;
        this.logger.error(`Token exchange failed: ${firebaseError}`);
        throw new Error(`Token exchange failed: ${firebaseError}`);
      }

      this.logger.error(`Token exchange request failed: ${error.message}`);
      throw new Error(`Token exchange request failed: ${error.message}`);
    }
  }

  async generatePasswordResetLink(email: string): Promise<string> {
    this.ensureInitialized();

    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format provided');
    }

    try {
      return await this.getAuth().generatePasswordResetLink(email);
    } catch (error) {
      this.logger.error(
        `Generate password reset link failed: ${error.message}`,
      );
      throw new Error(`Generate password reset link failed: ${error.message}`);
    }
  }

  async generateEmailVerificationLink(email: string): Promise<string> {
    this.ensureInitialized();

    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format provided');
    }

    try {
      return await this.getAuth().generateEmailVerificationLink(email);
    } catch (error) {
      this.logger.error(
        `Generate email verification link failed: ${error.message}`,
      );
      throw new Error(
        `Generate email verification link failed: ${error.message}`,
      );
    }
  }

  // Utility methods
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.firebaseApp) {
      throw new Error('Firebase Admin SDK is not properly initialized');
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; initialized: boolean }> {
    try {
      this.ensureInitialized();

      // Try a simple operation to verify connection
      await this.getAuth().listUsers(1);

      return {
        status: 'healthy',
        initialized: this.isInitialized,
      };
    } catch (error) {
      this.logger.error(`Firebase health check failed: ${error.message}`);
      return {
        status: 'unhealthy',
        initialized: this.isInitialized,
      };
    }
  }
}
