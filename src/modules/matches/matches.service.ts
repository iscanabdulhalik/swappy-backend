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
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class MatchesService {
  constructor(
    private readonly matchRecommendationService: MatchRecommendationService,
    private readonly matchRequestService: MatchRequestService,
    private readonly matchManagementService: MatchManagementService,
    private readonly prisma: PrismaService,
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

  async getTopRecommendedNonFriends(
    userId: string,
    limit = 5,
    weights?: ScoringWeightsDto,
  ): Promise<any[]> {
    // 1. Geniş bir skorlu öneri listesi al
    const { items: scoredRecommendations } =
      await this.matchRecommendationService.getMatchRecommendationsWithScoring(
        userId,
        {}, // Kriterleri boş bırakıyoruz
        100, // Daha fazla sonuç alarak filtreleme için yeterli aday olmasını sağlarız
        0,
        weights,
      );

    let initialNonFriendRecommendations: any[] = [];
    const alreadyRecommendedUserIds = new Set<string>(); // Önerilen kullanıcı ID'lerini takip etmek için

    if (scoredRecommendations && scoredRecommendations.length > 0) {
      // 2. Kullanıcının takip ettiklerinin ve takipçilerinin ID'lerini al
      const [following, followers] = await Promise.all([
        this.prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        }),
        this.prisma.follow.findMany({
          where: { followingId: userId },
          select: { followerId: true },
        }),
      ]);

      const friendIds = new Set<string>([
        // userId, // Kendisini aşağıda excludeIdsFromRandom'a ekleyeceğiz
        ...following.map((f) => f.followingId),
        ...followers.map((f) => f.followerId),
      ]);

      // 3. Arkadaş listesinde olmayan ve kendisi olmayan kullanıcıları filtrele
      initialNonFriendRecommendations = scoredRecommendations.filter((rec) => {
        if (rec.user && rec.user.id !== userId && !friendIds.has(rec.user.id)) {
          // Bu kullanıcı zaten daha önce (belki farklı bir skorla ama aynı ID ile)
          // eklendiyse tekrar ekleme
          if (alreadyRecommendedUserIds.has(rec.user.id)) {
            return false;
          }
          alreadyRecommendedUserIds.add(rec.user.id);
          return true;
        }
        return false;
      });
    }

    // 4. İstenen limite ulaşıldıysa doğrudan dön
    if (initialNonFriendRecommendations.length >= limit) {
      return initialNonFriendRecommendations.slice(0, limit);
    }

    // 5. Eksik kalan öneriler için rastgele kullanıcılar bul
    const neededRandomCount = limit - initialNonFriendRecommendations.length;
    if (neededRandomCount > 0) {
      // Mevcut skorlu önerilerde, arkadaş listesinde ve temel hariç tutulanlarda olmayan kullanıcıları hariç tut
      const excludeIdsFromRandom = new Set<string>([
        userId, // Kendisi
        ...alreadyRecommendedUserIds, // Zaten skorlu ve filtrelenmiş önerilenler
        // Arkadaşları ve diğer hariç tutulanları alalım:
        // MatchRecommendationService'deki getExcludedUserIds'ı kullanmak ideal olurdu.
        // Şimdilik, arkadaşları ve temel eşleşme/istekleri hariç tutacak şekilde manuel oluşturalım.
      ]);

      // Arkadaşları ekle
      const [followingForRandom, followersForRandom] = await Promise.all([
        this.prisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        }),
        this.prisma.follow.findMany({
          where: { followingId: userId },
          select: { followerId: true },
        }),
      ]);
      followingForRandom.forEach((f) =>
        excludeIdsFromRandom.add(f.followingId),
      );
      followersForRandom.forEach((f) => excludeIdsFromRandom.add(f.followerId));

      // Mevcut eşleşmeleri ve istekleri de hariç tutalım
      // Bu kısım MatchRecommendationService.getExcludedUserIds'ın yaptığı işe benzer
      const [existingMatches, sentRequests, receivedRequests] =
        await Promise.all([
          this.prisma.match.findMany({
            where: { OR: [{ initiatorId: userId }, { receiverId: userId }] },
            select: { initiatorId: true, receiverId: true },
          }),
          this.prisma.matchRequest.findMany({
            where: { senderId: userId },
            select: { receiverId: true },
          }),
          this.prisma.matchRequest.findMany({
            where: { receiverId: userId },
            select: { senderId: true },
          }),
        ]);

      existingMatches.forEach((match) => {
        excludeIdsFromRandom.add(
          match.initiatorId === userId ? match.receiverId : match.initiatorId,
        );
      });
      sentRequests.forEach((req) => excludeIdsFromRandom.add(req.receiverId));
      receivedRequests.forEach((req) => excludeIdsFromRandom.add(req.senderId));

      const randomCandidates = await this.prisma.user.findMany({
        where: {
          id: { notIn: Array.from(excludeIdsFromRandom) },
          isActive: true,
        },
        take: neededRandomCount * 2 + 10, // Biraz daha fazla alıp karıştırıyoruz, unique ID garantisi için
        select: {
          id: true,
          displayName: true,
          profileImageUrl: true,
          // Diğer gerekli alanlar eklenebilir
        },
      });

      const shuffledRandomCandidates = randomCandidates
        .filter((candidate) => !alreadyRecommendedUserIds.has(candidate.id)) // Tekrar kontrol
        .sort(() => 0.5 - Math.random());

      let randomUsersAddedCount = 0;
      for (const candidate of shuffledRandomCandidates) {
        if (randomUsersAddedCount >= neededRandomCount) break;
        if (!alreadyRecommendedUserIds.has(candidate.id)) {
          initialNonFriendRecommendations.push({
            user: candidate,
            score: 0,
            scoreDetails: { random: true },
          });
          alreadyRecommendedUserIds.add(candidate.id);
          randomUsersAddedCount++;
        }
      }
    }

    return initialNonFriendRecommendations.slice(0, limit);
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
