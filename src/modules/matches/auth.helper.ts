// test/auth-helper.ts (veya benzeri bir dosya)
import * as admin from 'firebase-admin'; // Eğer Firebase Admin SDK'yı doğrudan kullanıyorsanız
import { FirebaseAdminService } from '../auth/firebase/firebase-admin.service';
import { ConfigService } from '@nestjs/config';

// Bu fonksiyon, test kullanıcıları için Firebase'e giriş yaparak ID token alır.
// GERÇEK UYGULAMADA BU KULLANICI BİLGİLERİNİ GÜVENLİ BİR YERDEN ALMANIZ GEREKİR.
// VEYA TEST İÇİN ÖZEL KULLANICILAR OLUŞTURUN.
export async function getFirebaseIdToken(
  firebaseAdminService: FirebaseAdminService, // Veya doğrudan admin.auth()
  email: string,
  password?: string, // Eğer email/şifre ile giriş yapılacaksa
  uid?: string, // Eğer custom token ile giriş yapılacaksa
): Promise<string> {
  if (!firebaseAdminService) {
    throw new Error(
      'FirebaseAdminService is not initialized for token generation.',
    );
  }
  try {
    if (uid) {
      // Custom token ile
      const customToken = await firebaseAdminService.createCustomToken(uid);
      // Bu custom token'ı ID token'a çevirmek için Firebase REST API'sine istek atmanız gerekir.
      // FirebaseAdminService'inize bunun için bir metod ekleyebilirsiniz (exchangeCustomTokenForIdToken gibi)
      const { idToken } =
        await firebaseAdminService.exchangeCustomTokenForIdToken(customToken);
      return idToken;
    } else if (email && password) {
      // Email/şifre ile (Firebase REST API üzerinden)
      const { idToken } = await firebaseAdminService.signInWithEmailPassword(
        email,
        password,
      );
      return idToken;
    }
    throw new Error('Email/password or UID must be provided to get ID token.');
  } catch (error) {
    console.error(`Failed to get ID token for ${email || uid}:`, error.message);
    throw error;
  }
}
