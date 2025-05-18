import { Module } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/user.module';
import { MatchScoringService } from './services/match-scoring.service';
import { MatchRecommendationService } from './services/match.recommendation.service';
import { MatchRequestService } from './services/match-request.service';
import { MatchManagementService } from './services/match-management.service';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  providers: [
    MatchesService,
    MatchScoringService,
    MatchRecommendationService,
    MatchRequestService,
    MatchManagementService,
  ],
  controllers: [MatchesController],
  exports: [MatchesService],
})
export class MatchesModule {}
