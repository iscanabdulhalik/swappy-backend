import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import axios from 'axios';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private firebaseApp: admin.app.App;
  private apiKey: string;
  private readonly logger = new Logger(FirebaseAdminService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    try {
      const firebaseConfig = this.configService.get('firebase');

      if (!firebaseConfig) {
        this.logger.error('Firebase configuration is missing');
        return;
      }

      try {
        this.firebaseApp = admin.app();
        this.logger.log('Using existing Firebase Admin app');
      } catch (error) {
        if (
          !firebaseConfig.admin ||
          !firebaseConfig.admin.projectId ||
          !firebaseConfig.admin.clientEmail ||
          !firebaseConfig.admin.privateKey
        ) {
          this.logger.error('Firebase Admin SDK credentials are incomplete');
          return;
        }

        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: firebaseConfig.admin.projectId,
            privateKey: firebaseConfig.admin.privateKey,
            clientEmail: firebaseConfig.admin.clientEmail,
          }),
          databaseURL: firebaseConfig.databaseURL,
        });
        this.logger.log('Firebase Admin SDK initialized successfully');
      }

      this.apiKey = firebaseConfig.apiKey;
      if (!this.apiKey) {
        this.logger.warn(
          'Firebase API Key is missing, REST API calls may fail',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to initialize Firebase Admin: ${error.message}`,
        error.stack,
      );
    }
  }

  getAuth(): admin.auth.Auth {
    if (!this.firebaseApp) {
      this.logger.error('Firebase Admin SDK is not initialized');
      throw new Error('Firebase Admin SDK is not initialized');
    }
    return this.firebaseApp.auth();
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return this.getAuth().verifyIdToken(idToken);
  }

  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    return this.getAuth().getUser(uid);
  }

  async getUserByEmail(email: string): Promise<admin.auth.UserRecord> {
    return this.getAuth().getUserByEmail(email);
  }

  async createUser(
    email: string,
    password: string,
  ): Promise<admin.auth.UserRecord> {
    return this.getAuth().createUser({
      email,
      password,
      emailVerified: false,
    });
  }

  async updateUser(uid: string, data: any): Promise<admin.auth.UserRecord> {
    return this.getAuth().updateUser(uid, data);
  }

  async deleteUser(uid: string): Promise<void> {
    return this.getAuth().deleteUser(uid);
  }

  async createCustomToken(uid: string): Promise<string> {
    return this.getAuth().createCustomToken(uid);
  }

  // Client tarafında kullanılacak bir token almak için Email/Password ile giriş yapar
  // NOT: Bu metod normalde client tarafında Firebase SDK ile yapılır
  // Bu sadece test amacıyla eklenmiştir, production'da kullanılmamalıdır
  async signInWithEmailPassword(
    email: string,
    password: string,
  ): Promise<{ idToken: string }> {
    try {
      // Firebase Auth REST API kullanarak giriş yap
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`,
        {
          email,
          password,
          returnSecureToken: true,
        },
      );

      return {
        idToken: response.data.idToken,
      };
    } catch (error) {
      // Firebase Auth hata mesajını yeniden şekillendir
      const errorMessage =
        error.response?.data?.error?.message || 'Authentication failed';
      throw new Error(`Firebase authentication failed: ${errorMessage}`);
    }
  }

  // Custom token'ı ID token'a dönüştürür
  // NOT: Bu metod normalde client tarafında Firebase SDK ile yapılır
  // Bu sadece test amacıyla eklenmiştir, production'da kullanılmamalıdır
  async exchangeCustomTokenForIdToken(
    customToken: string,
  ): Promise<{ idToken: string }> {
    try {
      // Firebase Auth REST API kullanarak custom token'ı exchange et
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${this.apiKey}`,
        {
          token: customToken,
          returnSecureToken: true,
        },
      );

      return {
        idToken: response.data.idToken,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.error?.message || 'Token exchange failed';
      throw new Error(`Firebase token exchange failed: ${errorMessage}`);
    }
  }

  async generatePasswordResetLink(email: string): Promise<string> {
    try {
      // Firebase Auth REST API ile şifre sıfırlama bağlantısı oluştur
      return this.getAuth().generatePasswordResetLink(email);
    } catch (error) {
      throw new Error(
        `Failed to generate password reset link: ${error.message}`,
      );
    }
  }

  async generateEmailVerificationLink(email: string): Promise<string> {
    try {
      // Firebase Auth REST API ile e-posta doğrulama bağlantısı oluştur
      return this.getAuth().generateEmailVerificationLink(email);
    } catch (error) {
      throw new Error(
        `Failed to generate email verification link: ${error.message}`,
      );
    }
  }
}
