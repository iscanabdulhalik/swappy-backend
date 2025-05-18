import { Injectable } from '@nestjs/common';
import {
  MatchCriteriaDto,
  MatchRequestDto,
  ScoringWeightsDto,
} from './dto/match.dto';
import { Match, MatchRequest } from '@prisma/client';
import { MatchScoringService } from './services/match-scoring.service';
import { MatchRecommendationService } from './services/match.recommendation.service';
import { MatchRequestService } from './services/match-request.service';
import { MatchManagementService } from './services/match-management.service';

@Injectable()
export class MatchesService {
  constructor(
    private readonly matchRecommendationService: MatchRecommendationService,
    private readonly matchRequestService: MatchRequestService,
    private readonly matchManagementService: MatchManagementService,
  ) {}

  async getMatchRecommendations(
    userId: string,
    criteria: MatchCriteriaDto,
    limit = 20,
    offset = 0,
  ) {
    return this.matchRecommendationService.getMatchRecommendations(
      userId,
      criteria,
      limit,
      offset,
    );
  }

  async getMatchRecommendationsWithScoring(
    userId: string,
    criteria: MatchCriteriaDto,
    limit = 20,
    offset = 0,
    weights?: ScoringWeightsDto,
  ) {
    return this.matchRecommendationService.getMatchRecommendationsWithScoring(
      userId,
      criteria,
      limit,
      offset,
      weights,
    );
  }

  async sendMatchRequest(
    senderId: string,
    requestDto: MatchRequestDto,
  ): Promise<MatchRequest> {
    return this.matchRequestService.sendMatchRequest(senderId, requestDto);
  }

  async getMatchRequests(
    userId: string,
    status = 'pending',
    limit = 20,
    offset = 0,
  ) {
    return this.matchRequestService.getMatchRequests(
      userId,
      status,
      limit,
      offset,
    );
  }

  async acceptMatchRequest(
    requestId: string,
    receiverId: string,
  ): Promise<Match> {
    return this.matchRequestService.acceptMatchRequest(requestId, receiverId);
  }

  async rejectMatchRequest(
    requestId: string,
    receiverId: string,
  ): Promise<MatchRequest> {
    return this.matchRequestService.rejectMatchRequest(requestId, receiverId);
  }

  async getUserMatches(userId: string, limit = 20, offset = 0) {
    return this.matchManagementService.getUserMatches(userId, limit, offset);
  }

  async getMatchById(matchId: string, userId: string): Promise<Match> {
    return this.matchManagementService.getMatchById(matchId, userId);
  }

  async toggleFavorite(matchId: string, userId: string): Promise<Match> {
    return this.matchManagementService.toggleFavorite(matchId, userId);
  }

  async endMatch(matchId: string, userId: string): Promise<Match> {
    return this.matchManagementService.endMatch(matchId, userId);
  }
}
