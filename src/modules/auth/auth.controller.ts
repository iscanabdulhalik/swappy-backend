import {
  Controller,
  Post,
  Body,
  UseGuards,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  FirebaseAuthDto,
  GoogleAuthDto,
  ChangePasswordDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { User } from '@prisma/client';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto): Promise<User> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
  ): Promise<{ user: User; idToken: string }> {
    return this.authService.login(loginDto);
  }

  @Post('firebase')
  async authenticateWithFirebase(
    @Body() authDto: FirebaseAuthDto,
  ): Promise<User> {
    return this.authService.authenticateWithFirebase(authDto);
  }

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getCurrentUser(@CurrentUser() user: User): Promise<User> {
    return user;
  }

  @Post('refresh-token')
  @UseGuards(FirebaseAuthGuard)
  async refreshToken(
    @CurrentUser('id') userId: string,
  ): Promise<{ token: string }> {
    const token = await this.authService.refreshToken(userId);
    return { token };
  }

  @Delete('me')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser('id') userId: string): Promise<void> {
    return this.authService.deleteUser(userId);
  }

  @Post('google')
  async authenticateWithGoogle(
    @Body() googleAuthDto: GoogleAuthDto,
  ): Promise<User> {
    return this.authService.authenticateWithGoogle(googleAuthDto.idToken);
  }

  // auth.controller.ts - Yeni endpoint'leri ekleyelim
  @Put('me/profile')
  @UseGuards(FirebaseAuthGuard)
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    return this.authService.updateProfile(userId, updateProfileDto);
  }

  @Post('reset-password')
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(resetPasswordDto);
    return {
      message:
        'If your email is registered, you will receive a password reset link',
    };
  }

  @Post('verify-email')
  @UseGuards(FirebaseAuthGuard)
  async sendEmailVerification(
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.authService.sendEmailVerification(userId);
    return { message: 'Email verification link sent' };
  }

  @Post('change-password')
  @UseGuards(FirebaseAuthGuard)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(
      userId,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword,
    );
    return { message: 'Password changed successfully' };
  }
}
