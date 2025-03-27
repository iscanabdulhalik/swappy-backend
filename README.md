# Dil Öğrenme ve Eşleştirme Uygulaması Backend

Bu proje, kullanıcıların dil öğrenme eşleştirme yapabilecekleri bir platformun backend uygulamasıdır.

## Teknoloji Yığını

- **Backend Framework**: NestJS
- **Kimlik Doğrulama**: Firebase Auth
- **Veritabanı**: PostgreSQL (Docker container)
- **ORM**: Prisma
- **Containerization**: Docker ve Docker Compose
- **API Format**: REST, JSON
- **Gerçek Zamanlı İletişim**: WebSockets (Socket.io)

## Kurulum

### Ön Koşullar

- Node.js (>=14.x)
- npm (>=6.x)
- Docker ve Docker Compose
- Firebase hesabı

### Firebase Yapılandırması

1. [Firebase Console](https://console.firebase.google.com/)'a gidin ve yeni bir proje oluşturun
2. Authentication bölümüne gidin ve "Email/Password" seçeneğini etkinleştirin
3. Proje ayarlarına gidin ve bir "Web App" oluşturun
4. Firebase Admin SDK için bir servis hesabı anahtarı oluşturun ve indirin
5. `.env` dosyasında Firebase yapılandırmasını güncelleyin:

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
```

### Yerel Geliştirme

1. Repoyu klonlayın

```bash
git clone <repo-url>
cd dil-ogrenme-backend
```

2. Bağımlılıkları yükleyin

```bash
npm install
```

3. PostgreSQL veritabanını Docker ile başlatın

```bash
docker-compose up -d
```

4. Prisma şemasını veritabanına yansıtın ve seed işlemini yapın

```bash
npm run db:setup
```

5. Uygulamayı geliştirme modunda başlatın

```bash
npm run start:dev
```

Uygulama varsayılan olarak `http://localhost:3000/api` adresinde çalışacaktır.

## API Kullanımı

### Kimlik Doğrulama

- `POST /api/auth/register` - Yeni kullanıcı kaydı
- `POST /api/auth/firebase` - Firebase token ile kimlik doğrulama

### Kullanıcı İşlemleri

- `GET /api/users/me` - Mevcut kullanıcı bilgilerini alma
- `PUT /api/users/me` - Kullanıcı profilini güncelleme
- `PUT /api/users/me/languages` - Kullanıcı dil bilgilerini güncelleme
- `GET /api/users/search` - Kullanıcı arama

### Eşleştirme İşlemleri

- `GET /api/matches/recommendations` - Eşleşme önerileri alma
- `POST /api/matches/request` - Eşleşme isteği gönderme
- `GET /api/matches/requests` - Eşleşme isteklerini görüntüleme
- `PUT /api/matches/requests/:id/accept` - Eşleşme isteğini kabul etme
- `PUT /api/matches/requests/:id/reject` - Eşleşme isteğini reddetme
- `GET /api/matches` - Eşleşmeleri listeleme

## Veritabanı Yönetimi

Prisma Studio ile veritabanını görsel olarak yönetebilirsiniz:

```bash
npm run prisma:studio
```

## Test

```bash
# Tüm testleri çalıştır
npm test

# Izleme modunda testleri çalıştır
npm run test:watch

# Test coverage'ını oluştur
npm run test:cov
```

## Docker ile Dağıtım

Uygulamayı Docker container olarak çalıştırmak için:

```bash
# Uygulamayı derle
npm run build

# Docker imajını oluştur
docker build -t dil-ogrenme-backend .

# Container'ı çalıştır
docker run -p 3000:3000 -d dil-ogrenme-backend
```

## Environment Değişkenleri

- `PORT` - Uygulama portu (varsayılan: 3000)
- `NODE_ENV` - Ortam (development, production, test)
- `DATABASE_URL` - PostgreSQL bağlantı URL'i
- `API_PREFIX` - API yollarının öneki (varsayılan: api)
- `CORS_ORIGINS` - CORS için izin verilen kaynaklar (virgülle ayrılmış)
- `FIREBASE_*` - Firebase yapılandırma değişkenleri

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır.
