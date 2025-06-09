import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Post,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './user.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  UpdateUserDto,
  UpdateLanguagesDto,
  UserSearchDto,
  UpdateUserSettingsDto,
} from './dto/user.dto';
import {
  User,
  UserLanguage,
  Language,
  Follow,
  UserStats,
} from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getCurrentUser(@CurrentUser('id') userId: string): Promise<User> {
    return this.usersService.getUserById(userId, true, true, true);
  }

  @Get(':id')
  @UseGuards(FirebaseAuthGuard)
  async getUserById(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.getUserById(id, true, true, false);
  }

  @Put('me')
  @UseGuards(FirebaseAuthGuard)
  async updateUser(
    @CurrentUser('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.updateUser(userId, updateUserDto);
  }

  @Put('me/languages')
  @UseGuards(FirebaseAuthGuard)
  async updateUserLanguages(
    @CurrentUser('id') userId: string,
    @Body() updateLanguagesDto: UpdateLanguagesDto,
  ): Promise<UserLanguage[]> {
    return this.usersService.updateUserLanguages(userId, updateLanguagesDto);
  }

  @Put('me/settings')
  @UseGuards(FirebaseAuthGuard)
  async updateUserSettings(
    @CurrentUser('id') userId: string,
    @Body() updateSettingsDto: UpdateUserSettingsDto,
  ): Promise<User> {
    return this.usersService.updateUserSettings(userId, updateSettingsDto);
  }

  @Delete('me')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@CurrentUser('id') userId: string): Promise<void> {
    return this.usersService.deleteUser(userId);
  }

  @Get('search')
  @UseGuards(FirebaseAuthGuard)
  async searchUsers(
    @CurrentUser('id') userId: string,
    @Query() searchDto: UserSearchDto,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    return this.usersService.searchUsers(userId, searchDto, limit, offset);
  }

  @Get('languages')
  @UseGuards(FirebaseAuthGuard)
  async getLanguages(): Promise<Language[]> {
    return this.usersService.getLanguages();
  }

  @Post(':id/follow')
  @UseGuards(FirebaseAuthGuard)
  async followUser(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) followingId: string,
  ): Promise<Follow> {
    return this.usersService.followUser(userId, followingId);
  }

  @Delete(':id/follow')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfollowUser(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) followingId: string,
  ): Promise<void> {
    return this.usersService.unfollowUser(userId, followingId);
  }

  @Get(':id/followers')
  @UseGuards(FirebaseAuthGuard)
  async getUserFollowers(
    @Param('id', ParseUUIDPipe) userId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    return this.usersService.getUserFollowers(userId, limit, offset);
  }

  @Get(':id/following')
  @UseGuards(FirebaseAuthGuard)
  async getUserFollowing(
    @Param('id', ParseUUIDPipe) userId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ): Promise<{ items: User[]; total: number }> {
    return this.usersService.getUserFollowing(userId, limit, offset);
  }

  @Get(':id/stats')
  @UseGuards(FirebaseAuthGuard)
  async getUserStats(
    @Param('id', ParseUUIDPipe) userId: string,
  ): Promise<UserStats> {
    return this.usersService.getUserStats(userId);
  }

  @Get(':id/hobbies')
  @UseGuards(FirebaseAuthGuard)
  async getUserHobbies(
    @Param('id', ParseUUIDPipe) userId: string,
  ): Promise<string[]> {
    return this.usersService.getUserHobbies(userId);
  }
}
