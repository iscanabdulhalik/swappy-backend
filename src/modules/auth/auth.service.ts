import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { FirebaseAdminService } from './firebase/firebase-admin.service';
import { RegisterDto, LoginDto, FirebaseAuthDto } from './dto/auth.dto';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdmin: FirebaseAdminService,
  ) {}

  async register(registerDto: RegisterDto): Promise<User> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException({
        error: 'user_already_exists',
        message: 'A user with this email already exists',
      });
    }

    try {
      const firebaseUser = await this.firebaseAdmin.createUser(
        registerDto.email,
        registerDto.password,
      );

      const newUser = await this.prisma.user.create({
        data: {
          email: registerDto.email,
          firebaseUid: firebaseUser.uid,
          displayName: registerDto.displayName,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          countryCode: registerDto.countryCode,
          settings: {
            create: {},
          },
          stats: {
            create: {},
          },
        },
      });

      return newUser;
    } catch (error) {
      throw new BadRequestException({
        error: 'registration_failed',
        message: 'Failed to register user',
        details: { originalError: error.message },
      });
    }
  }

  async login(loginDto: LoginDto): Promise<{ user: User; idToken: string }> {
    try {
      // Firebase ile giriş yap ve token al
      const firebaseAuth = await this.firebaseAdmin.signInWithEmailPassword(
        loginDto.email,
        loginDto.password,
      );

      // Veritabanında kullanıcıyı kontrol et
      const user = await this.prisma.user.findUnique({
        where: { email: loginDto.email },
      });

      if (!user) {
        throw new NotFoundException({
          error: 'user_not_found',
          message: 'User not found in database',
        });
      }

      // Kullanıcı ve token'ı döndür
      return {
        user,
        idToken: firebaseAuth.idToken,
      };
    } catch (error) {
      throw new UnauthorizedException({
        error: 'authentication_failed',
        message: 'Authentication failed',
        details: { originalError: error.message },
      });
    }
  }

  async authenticateWithFirebase(authDto: FirebaseAuthDto): Promise<User> {
    try {
      const decodedToken = await this.firebaseAdmin.verifyIdToken(
        authDto.idToken,
      );

      const user = await this.prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
      });

      if (!user) {
        const firebaseUser = await this.firebaseAdmin.getUser(decodedToken.uid);

        // Otomatik kullanıcı oluştur
        return this.prisma.user.create({
          data: {
            email: firebaseUser.email || 'unknown@example.com',
            firebaseUid: firebaseUser.uid,
            displayName:
              firebaseUser.displayName || firebaseUser.email?.split('@')[0],
            settings: {
              create: {},
            },
            stats: {
              create: {},
            },
          },
        });
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException({
        error: 'invalid_token',
        message: 'Invalid or expired authentication token',
        details: { originalError: error.message },
      });
    }
  }

  async refreshToken(userId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.firebaseUid) {
        throw new NotFoundException({
          error: 'user_not_found',
          message: 'User not found or missing Firebase UID',
        });
      }

      // Firebase'den custom token oluştur
      const customToken = await this.firebaseAdmin.createCustomToken(
        user.firebaseUid,
      );

      // Custom token'ı ID token'a dönüştür (normalde client tarafında yapılır)
      // Bu adım server tarafında yapılamaz, client'a custom token döndürülmeli

      return customToken;
    } catch (error) {
      throw new UnauthorizedException({
        error: 'token_refresh_failed',
        message: 'Failed to refresh authentication token',
        details: { originalError: error.message },
      });
    }
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    return user;
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
    });

    if (!user) {
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    await this.firebaseAdmin.deleteUser(user.firebaseUid);

    await this.prisma.user.delete({
      where: { id },
    });
  }
}
