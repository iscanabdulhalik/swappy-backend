import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MatchRequestDto, MatchCriteriaDto } from './dto/match.dto';
import { Match, MatchRequest } from '@prisma/client';

@Controller('matches')
@UseGuards(FirebaseAuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get('recommendations')
  async getMatchRecommendations(
    @CurrentUser('id') userId: string,
    @Query() criteria: MatchCriteriaDto,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.matchesService.getMatchRecommendations(
      userId,
      criteria,
      limit,
      offset,
    );
  }

  @Post('request')
  async sendMatchRequest(
    @CurrentUser('id') userId: string,
    @Body() requestDto: MatchRequestDto,
  ): Promise<MatchRequest> {
    return this.matchesService.sendMatchRequest(userId, requestDto);
  }

  @Get('requests')
  async getMatchRequests(
    @CurrentUser('id') userId: string,
    @Query('status') status = 'pending',
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.matchesService.getMatchRequests(userId, status, limit, offset);
  }

  @Put('requests/:id/accept')
  async acceptMatchRequest(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) requestId: string,
  ): Promise<Match> {
    return this.matchesService.acceptMatchRequest(requestId, userId);
  }

  @Put('requests/:id/reject')
  async rejectMatchRequest(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) requestId: string,
  ): Promise<MatchRequest> {
    return this.matchesService.rejectMatchRequest(requestId, userId);
  }

  @Get()
  async getUserMatches(
    @CurrentUser('id') userId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.matchesService.getUserMatches(userId, limit, offset);
  }

  @Get(':id')
  async getMatchById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) matchId: string,
  ): Promise<Match> {
    return this.matchesService.getMatchById(matchId, userId);
  }

  @Put(':id/favorite')
  async toggleFavorite(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) matchId: string,
  ): Promise<Match> {
    return this.matchesService.toggleFavorite(matchId, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async endMatch(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) matchId: string,
  ): Promise<Match> {
    return this.matchesService.endMatch(matchId, userId);
  }
}
