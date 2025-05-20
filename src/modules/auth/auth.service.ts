import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
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
import { AppException } from 'src/common/exceptions/app-exceptions';

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
      const firebaseUser = await this.firebaseAdmin.createUser(
        registerDto.email,
        registerDto.password,
      );

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
      throw AppException.badRequest('bad_request', 'authentication_failed');
    }
  }

  async login(loginDto: LoginDto): Promise<{ user: User; idToken: string }> {
    try {
      // Sign in with Firebase
      const firebaseAuth = await this.firebaseAdmin.signInWithEmailPassword(
        loginDto.email,
        loginDto.password,
      );

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

      await this.prisma.userStats.update({
        where: { userId: user.id },
        data: { lastActiveDate: new Date() },
      });

      return {
        user,
        idToken: firebaseAuth.idToken,
      };
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`, error.stack);
      throw AppException.unauthorized('authentication_failed');
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

        if (firebaseUser.email) {
          const existingUser = await this.prisma.user.findUnique({
            where: { email: firebaseUser.email },
          });

          if (existingUser) {
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
      throw AppException.unauthorized('firebase_auth_failed');
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
      await this.firebaseAdmin.deleteUser(user.firebaseUid);

      await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`User deletion failed: ${error.message}`, error.stack);
      throw AppException.internal('User deletion failed');
    }
  }

  async authenticateWithGoogle(idToken: string): Promise<User> {
    try {
      const decodedToken = await this.firebaseAdmin.verifyIdToken(idToken);

      if (!decodedToken.email) {
        throw new BadRequestException({
          error: 'invalid_account',
          message: "Google account doesn't have a valid email",
        });
      }

      let user = await this.prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
        include: {
          settings: true,
          stats: true,
        },
      });

      if (!user && decodedToken.email) {
        user = await this.prisma.user.findUnique({
          where: { email: decodedToken.email },
          include: {
            settings: true,
            stats: true,
          },
        });

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

      if (!user) {
        const firebaseUser = await this.firebaseAdmin.getUser(decodedToken.uid);

        const email = firebaseUser.email;
        if (!email) {
          throw new BadRequestException({
            error: 'invalid_account',
            message: "Google account doesn't have a valid email",
          });
        }

        user = await this.prisma.user.create({
          data: {
            email: email,
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
      throw AppException.unauthorized('google_auth_failed');
    }
  }

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
        throw AppException.internal('email_update_failed');
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

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const { email } = resetPasswordDto;

    try {
      await this.firebaseAdmin.generatePasswordResetLink(email);
      this.logger.log(
        `Password reset link generation initiated for email: ${email}`,
      );
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        this.logger.warn(
          `Password reset attempt for non-existent user: ${email}`,
        );
      } else {
        this.logger.error(
          `Password reset link generation failed for email ${email}: ${error.message}`,
          error.stack,
        );
      }
    }
  }

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AppException.notFound('user_not_found', 'User not found');
    }

    try {
      await this.firebaseAdmin.generateEmailVerificationLink(user.email);
    } catch (error) {
      this.logger.error(
        `Email verification failed: ${error.message}`,
        error.stack,
      );
      throw AppException.badRequest('bad_request', 'email_verification_failed');
    }
  }

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
      throw AppException.badRequest('bad_request', 'password_change_failed');
    }
  }
}
