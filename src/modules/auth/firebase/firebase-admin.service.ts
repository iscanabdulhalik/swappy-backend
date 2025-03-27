import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import axios from 'axios';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private firebaseApp: admin.app.App;
  private apiKey: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const firebaseConfig = this.configService.get('firebase');

    // Firebase Admin SDK için initialization
    this.firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: firebaseConfig.projectId,
        privateKey: firebaseConfig.privateKey.replace(/\\n/g, '\n'),
        clientEmail: firebaseConfig.clientEmail,
      }),
      databaseURL: firebaseConfig.databaseURL,
    });

    // REST API için gerekli API Key
    this.apiKey = firebaseConfig.apiKey;
  }

  getAuth(): admin.auth.Auth {
    return this.firebaseApp.auth();
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return this.getAuth().verifyIdToken(idToken);
  }

  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    return this.getAuth().getUser(uid);
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
}
