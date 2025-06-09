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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
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

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  async register(@Body() registerDto: RegisterDto): Promise<User> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  async login(
    @Body() loginDto: LoginDto,
  ): Promise<{ userId: string; idToken: string; user: User }> {
    return this.authService.login(loginDto);
  }

  @Post('firebase')
  @ApiOperation({ summary: 'Authenticate with Firebase ID token' })
  async authenticateWithFirebase(
    @Body() authDto: FirebaseAuthDto,
  ): Promise<User> {
    return this.authService.authenticateWithFirebase(authDto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({ summary: 'Get current user info' })
  async getCurrentUser(@CurrentUser() user: User): Promise<User> {
    return user;
  }

  @Post('refresh-token')
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({ summary: 'Refresh JWT token' })
  async refreshToken(
    @CurrentUser('id') userId: string,
  ): Promise<{ token: string }> {
    const token = await this.authService.refreshToken(userId);
    return { token };
  }

  @Delete('me')
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user account' })
  async deleteAccount(@CurrentUser('id') userId: string): Promise<void> {
    return this.authService.deleteUser(userId);
  }

  @Post('google')
  @ApiOperation({ summary: 'Authenticate with Google ID token' })
  async authenticateWithGoogle(
    @Body() googleAuthDto: GoogleAuthDto,
  ): Promise<User> {
    return this.authService.authenticateWithGoogle(googleAuthDto.idToken);
  }

  @Put('me/profile')
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({ summary: 'Update user profile' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    return this.authService.updateProfile(userId, updateProfileDto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Send password reset email' })
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
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({ summary: 'Send email verification link' })
  async sendEmailVerification(
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.authService.sendEmailVerification(userId);
    return { message: 'Email verification link sent' };
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard)
  @ApiOperation({ summary: 'Change user password' })
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
