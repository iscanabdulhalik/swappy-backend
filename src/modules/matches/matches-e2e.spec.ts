import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from './../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MatchRequestDto, MatchCriteriaDto } from './dto/match.dto';
import { LanguageLevel } from '@prisma/client';
import { FirebaseAdminService } from './../auth/firebase/firebase-admin.service';

// Helper fonksiyonu - Firebase ID token almak için
async function getFirebaseIdTokenForUser(
  firebaseAdminService: FirebaseAdminService,
  email: string,
  password?: string,
  uid?: string,
): Promise<string> {
  if (!firebaseAdminService) {
    throw new Error(
      'FirebaseAdminService is not initialized for token generation.',
    );
  }
  try {
    if (uid) {
      const customToken = await firebaseAdminService.createCustomToken(uid);
      // Not: Bu metodun FirebaseAdminService'te implement edilmesi gerekiyor
      const { idToken } =
        await firebaseAdminService.exchangeCustomTokenForIdToken(customToken);
      return idToken;
    } else if (email && password) {
      // Not: Bu metodun da FirebaseAdminService'te implement edilmesi gerekiyor
      const { idToken } = await firebaseAdminService.signInWithEmailPassword(
        email,
        password,
      );
      return idToken;
    }
    throw new Error('Email/password or UID must be provided to get ID token.');
  } catch (error) {
    console.error(`Failed to get ID token for ${email || uid}:`, error.message);
    throw error;
  }
}

describe('MatchesController (e2e) - Firebase Auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let configService: ConfigService;
  let firebaseAdminService: FirebaseAdminService;

  let testUser1AuthToken: string;
  let testUser1Id: string;
  let testUser1FirebaseUid: string;

  let testUser2AuthToken: string;
  let testUser2Id: string;
  let testUser2FirebaseUid: string;

  let languageEnId: string;
  let languageEsId: string;

  const FIREBASE_TEST_USER1 = {
    email: 'e2e.matches.user1.firebase@example.com',
    password: 'TestPassword123!',
    displayName: 'E2E Firebase User 1',
  };
  const FIREBASE_TEST_USER2 = {
    email: 'e2e.matches.user2.firebase@example.com',
    password: 'TestPassword123!',
    displayName: 'E2E Firebase User 2',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.setGlobalPrefix('v1');
    await app.init();

    prisma = app.get(PrismaService);
    configService = app.get(ConfigService);
    firebaseAdminService = app.get(FirebaseAdminService);

    try {
      let fbUser1 = await firebaseAdminService
        .getAuth()
        .getUserByEmail(FIREBASE_TEST_USER1.email)
        .catch(() => null);
      if (!fbUser1) {
        fbUser1 = await firebaseAdminService.getAuth().createUser({
          email: FIREBASE_TEST_USER1.email,
          password: FIREBASE_TEST_USER1.password,
          displayName: FIREBASE_TEST_USER1.displayName,
          emailVerified: true,
        });
      }
      testUser1FirebaseUid = fbUser1.uid;

      let fbUser2 = await firebaseAdminService
        .getAuth()
        .getUserByEmail(FIREBASE_TEST_USER2.email)
        .catch(() => null);
      if (!fbUser2) {
        fbUser2 = await firebaseAdminService.getAuth().createUser({
          email: FIREBASE_TEST_USER2.email,
          password: FIREBASE_TEST_USER2.password,
          displayName: FIREBASE_TEST_USER2.displayName,
          emailVerified: true,
        });
      }
      testUser2FirebaseUid = fbUser2.uid;
    } catch (error) {
      console.error('Error during Firebase user setup in beforeAll:', error);
      throw error;
    }

    try {
      testUser1AuthToken = await getFirebaseIdTokenForUser(
        firebaseAdminService,
        FIREBASE_TEST_USER1.email,
        FIREBASE_TEST_USER1.password,
      );
      testUser2AuthToken = await getFirebaseIdTokenForUser(
        firebaseAdminService,
        FIREBASE_TEST_USER2.email,
        FIREBASE_TEST_USER2.password,
      );
    } catch (error) {
      console.error(
        'CRITICAL: Could not obtain Firebase ID tokens for test users. E2E tests will likely fail.',
        error,
      );
    }

    await prisma.matchRequest.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.userLanguage.deleteMany({});
    await prisma.follow.deleteMany({});
    // User'a bağlı tabloları User'dan önce sil
    await prisma.userStats.deleteMany({
      where: { user: { email: { contains: 'e2e.matches.' } } },
    });
    await prisma.userSettings.deleteMany({
      where: { user: { email: { contains: 'e2e.matches.' } } },
    });
    // Şimdi User'ları sil
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e.matches.' } },
    });
    await prisma.language.deleteMany({});

    const langEn = await prisma.language.create({
      data: {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        flagEmoji: '🇬🇧',
      },
    });
    languageEnId = langEn.id;
    const langEs = await prisma.language.create({
      data: {
        code: 'es',
        name: 'Spanish',
        nativeName: 'Español',
        flagEmoji: '🇪🇸',
      },
    });
    languageEsId = langEs.id;

    const user1 = await prisma.user.create({
      data: {
        firebaseUid: testUser1FirebaseUid,
        email: FIREBASE_TEST_USER1.email,
        displayName: FIREBASE_TEST_USER1.displayName,
        hobbies: ['reading', 'coding'],
        stats: { create: {} },
        settings: { create: {} },
      },
    });
    testUser1Id = user1.id;

    const user2 = await prisma.user.create({
      data: {
        firebaseUid: testUser2FirebaseUid,
        email: FIREBASE_TEST_USER2.email,
        displayName: FIREBASE_TEST_USER2.displayName,
        hobbies: ['sports', 'music'],
        stats: { create: {} },
        settings: { create: {} },
      },
    });
    testUser2Id = user2.id;

    await prisma.userLanguage.createMany({
      data: [
        {
          userId: testUser1Id,
          languageId: languageEnId,
          level: LanguageLevel.ADVANCED,
          isNative: true,
          isLearning: false,
        },
        {
          userId: testUser1Id,
          languageId: languageEsId,
          level: LanguageLevel.BEGINNER,
          isNative: false,
          isLearning: true,
        },
        {
          userId: testUser2Id,
          languageId: languageEsId,
          level: LanguageLevel.ADVANCED,
          isNative: true,
          isLearning: false,
        },
        {
          userId: testUser2Id,
          languageId: languageEnId,
          level: LanguageLevel.INTERMEDIATE,
          isNative: false,
          isLearning: true,
        },
      ],
    });
  });

  afterAll(async () => {
    // Firebase kullanıcılarını silmek production Firebase projesini etkileyebilir, dikkatli olun!
    // Genellikle testler için ayrı bir Firebase projesi kullanılır.
    // if (testUser1FirebaseUid) await firebaseAdminService.getAuth().deleteUser(testUser1FirebaseUid).catch(e => console.warn("Could not delete Firebase user1:", e.message));
    // if (testUser2FirebaseUid) await firebaseAdminService.getAuth().deleteUser(testUser2FirebaseUid).catch(e => console.warn("Could not delete Firebase user2:", e.message));
    await app.close();
  });

  const makeAuthRequest = (
    method: 'get' | 'post' | 'put' | 'delete',
    endpoint: string,
    token: string = testUser1AuthToken,
  ) => {
    const req = request(app.getHttpServer())[method](`/v1${endpoint}`);
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    } else {
      console.warn(
        `Token for request to ${endpoint} is missing. Auth will fail if endpoint is protected.`,
      );
    }
    return req;
  };

  describe('Match Recommendations', () => {
    it('/matches/recommendations (GET) - should get basic recommendations', async () => {
      const criteria: MatchCriteriaDto = { learningLanguageId: languageEnId };
      const response = await makeAuthRequest(
        'get',
        '/matches/recommendations',
        testUser1AuthToken,
      )
        .query(criteria)
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      expect(response.body.data.items).toBeInstanceOf(Array);
    });

    it('/matches/recommendations/scored (GET) - should get scored recommendations', async () => {
      const criteria: MatchCriteriaDto = { nativeLanguageId: languageEsId };
      const response = await makeAuthRequest(
        'get',
        '/matches/recommendations/scored',
        testUser1AuthToken,
      )
        .query(criteria)
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      expect(response.body.data.items).toBeInstanceOf(Array);
      if (response.body.data.items.length > 0) {
        expect(response.body.data.items[0]).toHaveProperty('score');
        expect(response.body.data.items[0]).toHaveProperty('user');
      }
    });

    it('/matches/recommendations/top-non-friends (GET) - should get top non-friends', async () => {
      await prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: testUser1Id, followingId: testUser2Id },
            { followerId: testUser2Id, followingId: testUser1Id },
          ],
        },
      });

      await prisma.follow.createMany({
        data: [
          { followerId: testUser1Id, followingId: testUser2Id },
          { followerId: testUser2Id, followingId: testUser1Id },
        ],
      });

      const response = await makeAuthRequest(
        'get',
        '/matches/recommendations/top-non-friends',
        testUser1AuthToken,
      )
        .query({ limit: 2 })
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toBeInstanceOf(Array);
      response.body.data.forEach((rec) => {
        expect(rec.user.id).not.toBe(testUser2Id);
      });

      await prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: testUser1Id, followingId: testUser2Id },
            { followerId: testUser2Id, followingId: testUser1Id },
          ],
        },
      });
    });
  });

  describe('Match Requests', () => {
    let matchRequestId: string | null;

    afterEach(async () => {
      // Her request testinden sonra oluşabilecek request ve matchleri temizleyelim
      // Bu, testlerin birbirini etkilemesini azaltır.
      if (matchRequestId) {
        await prisma.matchRequest.deleteMany({ where: { id: matchRequestId } });
        await prisma.match.deleteMany({
          where: {
            OR: [
              { initiatorId: testUser1Id, receiverId: testUser2Id },
              { initiatorId: testUser2Id, receiverId: testUser1Id },
            ],
          },
        });
        matchRequestId = null;
      }
    });

    it('/matches/request (POST) - should send a match request', async () => {
      const dto: MatchRequestDto = {
        receiverId: testUser2Id,
        message: 'E2E Firebase Test Request',
      };
      const response = await makeAuthRequest(
        'post',
        '/matches/request',
        testUser1AuthToken,
      )
        .send(dto)
        .expect(HttpStatus.CREATED);

      expect(response.body.status).toBe('success');
      const requestData = response.body.data;
      expect(requestData.senderId).toBe(testUser1Id);
      expect(requestData.receiverId).toBe(testUser2Id);
      expect(requestData.status).toBe('pending');
      matchRequestId = requestData.id; // Bir sonraki testte kullanmak için sakla
    });

    it('/matches/requests (GET) - should get pending match requests for testUser2', async () => {
      // Önce bir istek oluşturalım ki listeleyebilelim
      const tempDto: MatchRequestDto = {
        receiverId: testUser2Id,
        message: 'Temporary request for listing',
      };
      const tempRequestResponse = await makeAuthRequest(
        'post',
        '/matches/request',
        testUser1AuthToken,
      ).send(tempDto);
      const tempRequestId = tempRequestResponse.body.data.id;

      const response = await makeAuthRequest(
        'get',
        '/matches/requests',
        testUser2AuthToken,
      )
        .query({ status: 'pending' })
        .expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      expect(response.body.data.items).toBeInstanceOf(Array);
      const foundRequest = response.body.data.items.find(
        (req) => req.id === tempRequestId,
      );
      expect(foundRequest).toBeDefined();
      if (foundRequest) {
        expect(foundRequest.sender.id).toBe(testUser1Id);
      }
      await prisma.matchRequest.delete({ where: { id: tempRequestId } }); // Temizle
    });

    it('/matches/requests/:id/accept (PUT) - testUser2 should accept the match request', async () => {
      const dto: MatchRequestDto = {
        receiverId: testUser2Id,
        message: 'Request to accept',
      };
      const reqResponse = await makeAuthRequest(
        'post',
        '/matches/request',
        testUser1AuthToken,
      ).send(dto);
      matchRequestId = reqResponse.body.data.id;

      const response = await makeAuthRequest(
        'put',
        `/matches/requests/${matchRequestId}/accept`,
        testUser2AuthToken,
      ).expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      expect(response.body.data.initiatorId).toBe(testUser1Id);
      expect(response.body.data.receiverId).toBe(testUser2Id);
      expect(response.body.data.status).toBe('active');
    });

    it('/matches/request (POST) - should fail with CONFLICT if match already exists', async () => {
      // Önce bir eşleşme oluşturalım
      const dtoForExistingMatch: MatchRequestDto = {
        receiverId: testUser2Id,
        message: 'Setup for conflict test',
      };
      const reqResp = await makeAuthRequest(
        'post',
        '/matches/request',
        testUser1AuthToken,
      ).send(dtoForExistingMatch);
      const reqIdForExistingMatch = reqResp.body.data.id;
      await makeAuthRequest(
        'put',
        `/matches/requests/${reqIdForExistingMatch}/accept`,
        testUser2AuthToken,
      );

      const dto: MatchRequestDto = {
        receiverId: testUser2Id,
        message: 'Another Request',
      };
      await makeAuthRequest('post', '/matches/request', testUser1AuthToken)
        .send(dto)
        .expect(HttpStatus.CONFLICT);
    });

    it('/matches/requests/:id/reject (PUT) - testUser1 should reject a request from testUser2', async () => {
      const dto: MatchRequestDto = {
        receiverId: testUser1Id,
        message: 'Request from user2 to user1',
      };
      // Bu isteği testUser2 gönderiyor, testUser1 alıcı
      const reqResponse = await makeAuthRequest(
        'post',
        '/matches/request',
        testUser2AuthToken,
      )
        .send(dto)
        .expect(HttpStatus.CREATED);
      const requestIdToReject = reqResponse.body.data.id;
      matchRequestId = requestIdToReject; // afterEach'de temizlenmesi için

      // Bu isteği testUser1 (alıcı) reddediyor
      const response = await makeAuthRequest(
        'put',
        `/matches/requests/${requestIdToReject}/reject`,
        testUser1AuthToken,
      ).expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBe(requestIdToReject);
      expect(response.body.data.status).toBe('rejected');
    });
  });

  describe('Manage Matches', () => {
    let activeMatchId: string | null;

    beforeEach(async () => {
      // beforeEach kullanarak her test için temiz bir eşleşme sağlarız
      await prisma.matchRequest.deleteMany({});
      await prisma.match.deleteMany({});

      const match = await prisma.match.create({
        data: {
          initiatorId: testUser1Id,
          receiverId: testUser2Id,
          status: 'active',
        },
      });
      activeMatchId = match.id;
    });

    afterEach(async () => {
      if (activeMatchId) {
        await prisma.match.deleteMany({ where: { id: activeMatchId } });
        activeMatchId = null;
      }
    });

    it("/matches (GET) - should get user1's active matches", async () => {
      const response = await makeAuthRequest(
        'get',
        '/matches',
        testUser1AuthToken,
      ).expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      expect(response.body.data.items).toBeInstanceOf(Array);
      const foundMatch = response.body.data.items.find(
        (m) => m.id === activeMatchId,
      );
      expect(foundMatch).toBeDefined();
    });

    it('/matches/:id (GET) - should get a specific match by ID for user1', async () => {
      const response = await makeAuthRequest(
        'get',
        `/matches/${activeMatchId}`,
        testUser1AuthToken,
      ).expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBe(activeMatchId);
    });

    it('/matches/:id/favorite (PUT) - should toggle favorite status for user1', async () => {
      let response = await makeAuthRequest(
        'put',
        `/matches/${activeMatchId}/favorite`,
        testUser1AuthToken,
      ).expect(HttpStatus.OK);
      expect(response.body.status).toBe('success');
      expect(response.body.data.isFavorite).toBe(true);

      response = await makeAuthRequest(
        'put',
        `/matches/${activeMatchId}/favorite`,
        testUser1AuthToken,
      ).expect(HttpStatus.OK);
      expect(response.body.status).toBe('success');
      expect(response.body.data.isFavorite).toBe(false);
    });

    it('/matches/:id (DELETE) - user1 should end the match', async () => {
      await makeAuthRequest(
        'delete',
        `/matches/${activeMatchId}`,
        testUser1AuthToken,
      ).expect(HttpStatus.NO_CONTENT);

      const endedMatchDetails = await prisma.match.findUnique({
        where: { id: activeMatchId ?? undefined },
      });
      expect(endedMatchDetails?.status).toBe('ended');
    });

    it('/matches (GET) - user1 should not find ended match in active list after ending it', async () => {
      // Önce maçı sonlandıralım
      await makeAuthRequest(
        'delete',
        `/matches/${activeMatchId}`,
        testUser1AuthToken,
      ).expect(HttpStatus.NO_CONTENT);

      // Sonra aktif maçları listeleyelim
      const response = await makeAuthRequest(
        'get',
        '/matches',
        testUser1AuthToken,
      ).expect(HttpStatus.OK);

      expect(response.body.status).toBe('success');
      const foundMatch = response.body.data.items.find(
        (m) => m.id === activeMatchId,
      );
      expect(foundMatch).toBeUndefined();
    });
  });
});
