// auth.service.ts için iyileştirmeler
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { FirebaseAdminService } from './firebase/firebase-admin.service';
import {
  RegisterDto,
  LoginDto,
  FirebaseAuthDto,
  UpdateProfileDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
      // Create user in Firebase
      const firebaseUser = await this.firebaseAdmin.createUser(
        registerDto.email,
        registerDto.password,
      );

      // Create user in our database
      const newUser = await this.prisma.user.create({
        data: {
          email: registerDto.email,
          firebaseUid: firebaseUser.uid,
          role: registerDto.role || 'user',
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
        include: {
          settings: true,
          stats: true,
        },
      });

      return newUser;
    } catch (error) {
      this.logger.error(`Registration failed: ${error.message}`, error.stack);
      throw new BadRequestException({
        error: 'registration_failed',
        message: 'Failed to register user',
      });
    }
  }

  async login(loginDto: LoginDto): Promise<{ user: User; idToken: string }> {
    try {
      // Sign in with Firebase
      const firebaseAuth = await this.firebaseAdmin.signInWithEmailPassword(
        loginDto.email,
        loginDto.password,
      );

      // Check if user exists in database
      const user = await this.prisma.user.findUnique({
        where: { email: loginDto.email },
        include: {
          settings: true,
          stats: true,
        },
      });

      if (!user) {
        throw new NotFoundException({
          error: 'user_not_found',
          message: 'User not found in database',
        });
      }

      // Update lastActiveDate
      await this.prisma.userStats.update({
        where: { userId: user.id },
        data: { lastActiveDate: new Date() },
      });

      // Return user and token
      return {
        user,
        idToken: firebaseAuth.idToken,
      };
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`, error.stack);
      throw new UnauthorizedException({
        error: 'authentication_failed',
        message: 'Authentication failed',
      });
    }
  }

  async authenticateWithFirebase(authDto: FirebaseAuthDto): Promise<User> {
    try {
      const decodedToken = await this.firebaseAdmin.verifyIdToken(
        authDto.idToken,
      );

      let user = await this.prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
        include: {
          settings: true,
          stats: true,
        },
      });

      if (!user) {
        const firebaseUser = await this.firebaseAdmin.getUser(decodedToken.uid);

        // Check if user exists with email before creating
        if (firebaseUser.email) {
          const existingUser = await this.prisma.user.findUnique({
            where: { email: firebaseUser.email },
          });

          if (existingUser) {
            // Update Firebase UID if found by email
            user = await this.prisma.user.update({
              where: { id: existingUser.id },
              data: { firebaseUid: firebaseUser.uid },
              include: {
                settings: true,
                stats: true,
              },
            });
            return user;
          }
        }

        // Create new user automatically
        return this.prisma.user.create({
          data: {
            email: firebaseUser.email || `${firebaseUser.uid}@unknown.com`,
            firebaseUid: firebaseUser.uid,
            displayName:
              firebaseUser.displayName ||
              firebaseUser.email?.split('@')[0] ||
              'User',
            profileImageUrl: firebaseUser.photoURL,
            settings: {
              create: {},
            },
            stats: {
              create: {},
            },
          },
          include: {
            settings: true,
            stats: true,
          },
        });
      }

      // Update lastActiveDate
      await this.prisma.userStats.update({
        where: { userId: user.id },
        data: { lastActiveDate: new Date() },
      });

      return user;
    } catch (error) {
      this.logger.error(
        `Firebase authentication failed: ${error.message}`,
        error.stack,
      );
      throw new UnauthorizedException({
        error: 'invalid_token',
        message: 'Invalid or expired authentication token',
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

      // Create custom token from Firebase
      // This token should be exchanged for an ID token on the client side
      const customToken = await this.firebaseAdmin.createCustomToken(
        user.firebaseUid,
      );

      return customToken;
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error.message}`, error.stack);
      throw new UnauthorizedException({
        error: 'token_refresh_failed',
        message: 'Failed to refresh authentication token',
      });
    }
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        settings: true,
        stats: true,
        languages: {
          include: {
            language: true,
          },
        },
      },
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
      include: {
        settings: true,
        stats: true,
      },
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

    try {
      // Delete from Firebase first
      await this.firebaseAdmin.deleteUser(user.firebaseUid);

      // Then delete from database
      await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`User deletion failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException({
        error: 'user_deletion_failed',
        message: 'Failed to delete user',
      });
    }
  }

  async authenticateWithGoogle(idToken: string): Promise<User> {
    try {
      // Firebase ID token'ı doğrula
      const decodedToken = await this.firebaseAdmin.verifyIdToken(idToken);

      // Email doğrulaması yap
      if (!decodedToken.email) {
        throw new BadRequestException({
          error: 'invalid_account',
          message: "Google account doesn't have a valid email",
        });
      }

      // Kullanıcı zaten var mı kontrol et (Firebase UID ile)
      let user = await this.prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
        include: {
          settings: true,
          stats: true,
        },
      });

      // Kullanıcı email ile de kontrol et (Firebase UID değişmiş olabilir)
      if (!user && decodedToken.email) {
        user = await this.prisma.user.findUnique({
          where: { email: decodedToken.email },
          include: {
            settings: true,
            stats: true,
          },
        });

        // Eğer email ile bulunduysa, Firebase UID'yi güncelle
        if (user) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { firebaseUid: decodedToken.uid },
            include: {
              settings: true,
              stats: true,
            },
          });
        }
      }

      // Eğer kullanıcı yoksa yeni oluştur
      if (!user) {
        // Google hesabı bilgilerini al
        const firebaseUser = await this.firebaseAdmin.getUser(decodedToken.uid);

        // Email'in kesinlikle var olduğundan emin ol
        const email = firebaseUser.email;
        if (!email) {
          throw new BadRequestException({
            error: 'invalid_account',
            message: "Google account doesn't have a valid email",
          });
        }

        user = await this.prisma.user.create({
          data: {
            email: email, // null veya undefined olma ihtimalini elimine ettik
            firebaseUid: firebaseUser.uid,
            displayName:
              firebaseUser.displayName || email.split('@')[0] || 'User',
            profileImageUrl: firebaseUser.photoURL,
            settings: {
              create: {},
            },
            stats: {
              create: {},
            },
          },
          include: {
            settings: true,
            stats: true,
          },
        });
      }

      return user;
    } catch (error) {
      this.logger.error(
        `Google authentication failed: ${error.message}`,
        error.stack,
      );
      throw new UnauthorizedException({
        error: 'google_auth_failed',
        message: 'Google authentication failed',
      });
    }
  }

  // New method for updating user profile
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    // Update in Firebase if email is changing
    if (updateProfileDto.email && updateProfileDto.email !== user.email) {
      try {
        await this.firebaseAdmin.updateUser(user.firebaseUid, {
          email: updateProfileDto.email,
        });
      } catch (error) {
        this.logger.error(
          `Firebase email update failed: ${error.message}`,
          error.stack,
        );
        throw new BadRequestException({
          error: 'email_update_failed',
          message: 'Failed to update email in authentication provider',
        });
      }
    }

    // Update in database
    return this.prisma.user.update({
      where: { id: userId },
      data: updateProfileDto,
      include: {
        settings: true,
        stats: true,
      },
    });
  }

  // New method for password reset
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const { email } = resetPasswordDto;

    try {
      // This sends an email to the user with password reset link
      await this.firebaseAdmin.generatePasswordResetLink(email);
    } catch (error) {
      this.logger.error(`Password reset failed: ${error.message}`, error.stack);
      // Don't reveal if the email exists for security reasons
      throw new BadRequestException({
        error: 'password_reset_failed',
        message:
          'If your email is registered, you will receive a password reset link',
      });
    }
  }

  // New method for verifying email
  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    try {
      // This sends a verification email to the user
      await this.firebaseAdmin.generateEmailVerificationLink(user.email);
    } catch (error) {
      this.logger.error(
        `Email verification failed: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException({
        error: 'email_verification_failed',
        message: 'Failed to send email verification link',
      });
    }
  }

  // New method for changing password
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        error: 'user_not_found',
        message: 'User not found',
      });
    }

    try {
      // First verify old password is correct by signing in
      await this.firebaseAdmin.signInWithEmailPassword(user.email, oldPassword);

      // Then update password
      await this.firebaseAdmin.updateUser(user.firebaseUid, {
        password: newPassword,
      });
    } catch (error) {
      this.logger.error(
        `Password change failed: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException({
        error: 'password_change_failed',
        message:
          'Failed to change password. Please ensure your current password is correct.',
      });
    }
  }
}
