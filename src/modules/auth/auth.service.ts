import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FirebaseAdminService } from './firebase/firebase-admin.service';
import {
  RegisterDto,
  LoginDto,
  FirebaseAuthDto,
  UpdateProfileDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { User } from '@prisma/client';
import { AppException } from '../../common/exceptions/app-exceptions';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdmin: FirebaseAdminService,
  ) {}

  async register(registerDto: RegisterDto): Promise<User> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException({
        error: 'user_already_exists',
        message: 'A user with this email already exists',
      });
    }

    let firebaseUser: any = null;

    try {
      // Create Firebase user first
      firebaseUser = await this.firebaseAdmin.createUser(
        registerDto.email,
        registerDto.password,
      );

      // Prepare data for database
      const birthDate = registerDto.birthDate
        ? new Date(registerDto.birthDate)
        : null;

      // Create user in database
      const newUser = await this.prisma.user.create({
        data: {
          email: registerDto.email,
          firebaseUid: firebaseUser.uid,
          role: registerDto.role || 'user',
          hobbies: registerDto.hobbies || [],
          birthDate,
          displayName: registerDto.displayName || null,
          firstName: registerDto.firstName || null,
          lastName: registerDto.lastName || null,
          bio: registerDto.bio || null,
          profileImageUrl: registerDto.profileImageUrl || null,
          countryCode: registerDto.countryCode || null,
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

      this.logger.log(`User registered successfully: ${newUser.id}`);
      return newUser;
    } catch (error) {
      this.logger.error(`Registration failed: ${error.message}`, error.stack);

      // Cleanup Firebase user if database creation failed
      if (firebaseUser?.uid) {
        try {
          await this.firebaseAdmin.deleteUser(firebaseUser.uid);
          this.logger.log(`Cleaned up Firebase user: ${firebaseUser.uid}`);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to cleanup Firebase user: ${cleanupError.message}`,
          );
        }
      }

      if (error.code === 'auth/email-already-exists') {
        throw AppException.conflict(
          'user_already_exists',
          'Email already registered',
        );
      }

      if (error.code === 'auth/weak-password') {
        throw AppException.badRequest('bad_request', 'Password is too weak');
      }

      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw AppException.conflict(
          'user_already_exists',
          'Email already exists',
        );
      }

      throw AppException.badRequest('bad_request', 'Registration failed');
    }
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ userId: string; idToken: string; user: User }> {
    try {
      // Authenticate with Firebase
      const firebaseAuth = await this.firebaseAdmin.signInWithEmailPassword(
        loginDto.email,
        loginDto.password,
      );

      // Get user from database
      const user = await this.prisma.user.findUnique({
        where: { email: loginDto.email },
        include: {
          settings: true,
          stats: true,
        },
      });

      if (!user) {
        throw AppException.notFound('user_not_found', 'User not found');
      }

      // Update last active date
      await this.prisma.userStats.update({
        where: { userId: user.id },
        data: { lastActiveDate: new Date() },
      });

      this.logger.log(`User logged in successfully: ${user.id}`);

      return {
        userId: user.id,
        idToken: firebaseAuth.idToken,
        user,
      };
    } catch (error) {
      this.logger.error(`Login failed: ${error.message}`);

      if (error instanceof AppException) {
        throw error;
      }

      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password'
      ) {
        throw AppException.badRequest(
          'invalid_credentials',
          'Invalid email or password',
        );
      }

      if (error.code === 'auth/too-many-requests') {
        throw AppException.badRequest(
          'bad_request',
          'Too many failed attempts. Please try again later',
        );
      }

      throw AppException.unauthorized('Authentication failed');
    }
  }

  async authenticateWithFirebase(authDto: FirebaseAuthDto): Promise<User> {
    try {
      // Verify Firebase token
      const decodedToken = await this.firebaseAdmin.verifyIdToken(
        authDto.idToken,
      );

      // Find user by Firebase UID
      let user = await this.prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
        include: {
          settings: true,
          stats: true,
        },
      });

      if (!user) {
        // Get Firebase user details
        const firebaseUser = await this.firebaseAdmin.getUser(decodedToken.uid);

        if (firebaseUser.email) {
          // Check if user exists with same email
          const existingUser = await this.prisma.user.findUnique({
            where: { email: firebaseUser.email },
          });

          if (existingUser) {
            // Link existing user to Firebase UID
            user = await this.prisma.user.update({
              where: { id: existingUser.id },
              data: { firebaseUid: firebaseUser.uid },
              include: {
                settings: true,
                stats: true,
              },
            });
          }
        }

        // Create new user if still not found
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              email: firebaseUser.email || `${firebaseUser.uid}@firebase.local`,
              firebaseUid: firebaseUser.uid,
              displayName:
                firebaseUser.displayName ||
                firebaseUser.email?.split('@')[0] ||
                'User',
              profileImageUrl: firebaseUser.photoURL || null,
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
      }

      // Update last active date
      await this.prisma.userStats.update({
        where: { userId: user.id },
        data: { lastActiveDate: new Date() },
      });

      return user;
    } catch (error) {
      this.logger.error(`Firebase authentication failed: ${error.message}`);

      if (error.code === 'auth/id-token-expired') {
        throw AppException.unauthorized('Token expired');
      }

      if (error.code === 'auth/id-token-revoked') {
        throw AppException.unauthorized('Token revoked');
      }

      throw AppException.unauthorized('Firebase authentication failed');
    }
  }

  async authenticateWithGoogle(idToken: string): Promise<User> {
    try {
      // Verify Google token
      const decodedToken = await this.firebaseAdmin.verifyIdToken(idToken);

      if (!decodedToken.email) {
        throw AppException.badRequest(
          'bad_request',
          'Google account missing email',
        );
      }

      // Find user by Firebase UID
      let user = await this.prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
        include: {
          settings: true,
          stats: true,
        },
      });

      if (!user) {
        // Check if user exists with same email
        user = await this.prisma.user.findUnique({
          where: { email: decodedToken.email },
          include: {
            settings: true,
            stats: true,
          },
        });

        if (user) {
          // Link existing user to Google
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { firebaseUid: decodedToken.uid },
            include: {
              settings: true,
              stats: true,
            },
          });
        } else {
          // Create new user from Google
          const firebaseUser = await this.firebaseAdmin.getUser(
            decodedToken.uid,
          );

          user = await this.prisma.user.create({
            data: {
              email: decodedToken.email,
              firebaseUid: firebaseUser.uid,
              displayName:
                firebaseUser.displayName ||
                decodedToken.email.split('@')[0] ||
                'User',
              profileImageUrl: firebaseUser.photoURL || null,
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
      }

      // Update last active date
      await this.prisma.userStats.update({
        where: { userId: user.id },
        data: { lastActiveDate: new Date() },
      });

      return user;
    } catch (error) {
      this.logger.error(`Google authentication failed: ${error.message}`);

      if (error instanceof AppException) {
        throw error;
      }

      throw AppException.unauthorized('Google authentication failed');
    }
  }

  async refreshToken(userId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firebaseUid: true },
      });

      if (!user?.firebaseUid) {
        throw AppException.notFound('user_not_found', 'User not found');
      }

      const customToken = await this.firebaseAdmin.createCustomToken(
        user.firebaseUid,
      );
      return customToken;
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error.message}`);

      if (error instanceof AppException) {
        throw error;
      }

      throw AppException.unauthorized('Token refresh failed');
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
      throw AppException.notFound('user_not_found', 'User not found');
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
      throw AppException.notFound('user_not_found', 'User not found');
    }

    return user;
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firebaseUid: true },
    });

    if (!user) {
      throw AppException.notFound('user_not_found', 'User not found');
    }

    try {
      // Update Firebase if email is changing
      if (updateProfileDto.email && updateProfileDto.email !== user.email) {
        await this.firebaseAdmin.updateUser(user.firebaseUid, {
          email: updateProfileDto.email,
        });
      }

      // Prepare update data
      const updateData: any = { ...updateProfileDto };
      if (updateProfileDto.birthDate) {
        updateData.birthDate = new Date(updateProfileDto.birthDate);
      }

      // Update database
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
        include: {
          settings: true,
          stats: true,
        },
      });

      this.logger.log(`Profile updated for user: ${userId}`);
      return updatedUser;
    } catch (error) {
      this.logger.error(`Profile update failed: ${error.message}`);

      if (error.code === 'auth/email-already-exists') {
        throw AppException.conflict(
          'user_already_exists',
          'Email already in use',
        );
      }

      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw AppException.conflict(
          'user_already_exists',
          'Email already exists',
        );
      }

      throw AppException.internal('Profile update failed');
    }
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firebaseUid: true },
    });

    if (!user) {
      throw AppException.notFound('user_not_found', 'User not found');
    }

    try {
      // Verify current password
      await this.firebaseAdmin.signInWithEmailPassword(user.email, oldPassword);

      // Update password
      await this.firebaseAdmin.updateUser(user.firebaseUid, {
        password: newPassword,
      });

      this.logger.log(`Password changed for user: ${userId}`);
    } catch (error) {
      this.logger.error(`Password change failed: ${error.message}`);

      if (
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        throw AppException.badRequest(
          'invalid_credentials',
          'Current password is incorrect',
        );
      }

      if (error.code === 'auth/weak-password') {
        throw AppException.badRequest(
          'bad_request',
          'New password is too weak',
        );
      }

      throw AppException.badRequest('bad_request', 'Password change failed');
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    try {
      await this.firebaseAdmin.generatePasswordResetLink(
        resetPasswordDto.email,
      );
      this.logger.log(`Password reset link sent to: ${resetPasswordDto.email}`);
    } catch (error) {
      // Security: Don't reveal whether user exists
      if (error.code === 'auth/user-not-found') {
        this.logger.warn(
          `Password reset for non-existent user: ${resetPasswordDto.email}`,
        );
      } else {
        this.logger.error(`Password reset failed: ${error.message}`);
      }
      // Always succeed for security
    }
  }

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw AppException.notFound('user_not_found', 'User not found');
    }

    try {
      await this.firebaseAdmin.generateEmailVerificationLink(user.email);
      this.logger.log(`Email verification sent to user: ${userId}`);
    } catch (error) {
      this.logger.error(`Email verification failed: ${error.message}`);
      throw AppException.badRequest('bad_request', 'Email verification failed');
    }
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, firebaseUid: true },
    });

    if (!user) {
      throw AppException.notFound('user_not_found', 'User not found');
    }

    try {
      // Delete from Firebase first
      if (user.firebaseUid) {
        await this.firebaseAdmin.deleteUser(user.firebaseUid);
      }

      // Delete from database
      await this.prisma.user.delete({
        where: { id },
      });

      this.logger.log(`User deleted: ${id}`);
    } catch (error) {
      this.logger.error(`User deletion failed: ${error.message}`);

      if (error.code === 'auth/user-not-found') {
        // Firebase user already deleted, continue with database
        await this.prisma.user.delete({ where: { id } });
        return;
      }

      throw AppException.internal('User deletion failed');
    }
  }
}
