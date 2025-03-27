import {
  Controller,
  Post,
  Body,
  UseGuards,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, FirebaseAuthDto } from './dto/auth.dto';
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
}
