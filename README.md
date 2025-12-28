# BAZ AI Stem Separator V2

Vokal ve enstrüman ayrıştırma uygulaması. BAZ AI Music Login sistemiyle entegre çalışır.

## 🎯 Özellikler

- **Database Entegrasyonu**: BAZ AI'da oluşturulan şarkılar otomatik yüklenir
- **Hesap Sistemi**: Wix login ile giriş yapılabilir
- **Kredi Görüntüleme**: Kullanıcının kredi ve plan bilgisi gösterilir
- **Sol Menü / Sağ Sonuçlar**: Modern iki panel layout
- **Geçmiş Ayrıştırmalar**: Yapılan işlemler kaydedilir
- **İki Dil Desteği**: Türkçe ve İngilizce

## 📁 Dosya Yapısı

```
BAZ_AI_Stem_Separator_Updated/
├── index.html          # Ana sayfa (tüm frontend)
├── package.json        # Bağımlılıklar
├── vercel.json         # Vercel konfigürasyonu
├── .env.example        # Örnek environment variables
├── README.md           # Bu dosya
└── api/
    ├── auth-sync.js    # Kullanıcı auth senkronizasyonu
    ├── user-data.js    # Kullanıcı verileri (şarkılar, geçmiş)
    ├── stem.js         # Stem ayrıştırma başlatma
    └── stem-status.js  # Stem durumu sorgulama
```

## 🚀 Kurulum

### 1. Vercel'e Deploy

```bash
# Vercel CLI ile
vercel

# veya GitHub'a push edip Vercel'den import edin
```

### 2. Environment Variables

Vercel Dashboard'da şu değişkenleri ayarlayın:

| Değişken | Açıklama |
|----------|----------|
| `MONGODB_URI` | MongoDB bağlantı string'i (BAZ AI Music Login ile aynı) |
| `KIE_API_KEY` | KIE.ai API anahtarı |

### 3. Wix Entegrasyonu

BAZ AI Music Login'deki Wix backend kodunu kullanın. Login sonrası kullanıcı bu uygulamaya yönlendirilirken token URL'de gönderilir:

```javascript
// Wix backend'de
const redirectUrl = `https://stem.bazaimuzik.com?token=${userToken}`;
```

## 🔧 API Endpoints

### POST /api/auth-sync
Kullanıcı bilgilerini senkronize eder.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "email": "user@example.com",
    "credits": 50,
    "planId": "temel",
    "daysRemaining": 25
  }
}
```

### GET /api/user-data
Kullanıcının şarkılarını ve stem geçmişini getirir.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tracks": [...],
    "stemHistory": [...]
  }
}
```

### POST /api/stem
Stem ayrıştırma işlemini başlatır.

**Body:**
```json
{
  "taskId": "abc123",
  "audioId": "xyz789",
  "type": "separate_vocal"
}
```

**Type Değerleri:**
- `separate_vocal`: Vokal ve enstrümantal (2 stem)
- `split_stem`: Detaylı ayrıştırma (çoklu stem)

### GET /api/stem-status
Stem işleminin durumunu sorgular.

**Query:**
```
?taskId=abc123
```

## 🎨 UI Özellikleri

### Layout
- **Sol Panel (380px)**: Şarkı seçimi ve ayarlar
- **Sağ Panel**: Sonuçlar ve geçmiş

### Şarkı Seçimi
- Database'den otomatik yükleme
- Manuel Task ID / Audio ID girişi
- Şarkı listesi seçim arayüzü

### Sonuçlar
- Her stem için oynatıcı
- İndirme butonu
- Geçmiş ayrıştırmalar listesi

## 🔗 BAZ AI Music Login ile Bağlantı

Bu uygulama BAZ AI Music Login ile aynı MongoDB database'ini kullanır:

1. **Aynı `users` collection'ı** kullanılır
2. **Aynı token sistemi** geçerlidir
3. **Şarkılar `tracks` array'inden** okunur

### Database Şeması

```javascript
// users collection
{
  wixUserId: "user123",
  email: "user@example.com",
  planId: "temel",
  credits: 50,
  tracks: [
    {
      id: "track1",
      taskId: "abc123",
      audioId: "xyz789",
      title: "Şarkım",
      style: "Pop",
      addedAt: Date
    }
  ],
  stemHistory: [
    {
      trackName: "Şarkım",
      type: "separate_vocal",
      stems: {...},
      createdAt: Date
    }
  ]
}
```

## 📝 Notlar

- KIE.ai API'si stem ayrıştırma için kullanılır
- İşlem süresi genellikle 1-3 dakika arasındadır
- Sonuçlar 5 saniyede bir poll edilir
- Geçmiş ayrıştırmalar localStorage'da saklanır

## 🐛 Hata Ayıklama

### Token Geçersiz
- Wix'te yeniden login yapın
- localStorage'daki token'ı temizleyin

### Şarkılar Yüklenmiyor
- MongoDB bağlantısını kontrol edin
- `tracks` array'inin doğru formatta olduğunu doğrulayın

### Stem İşlemi Başlamıyor
- KIE_API_KEY'in doğru ayarlandığını kontrol edin
- taskId ve audioId'nin geçerli olduğunu doğrulayın

## 📄 Lisans

BAZ AI Music - Tüm hakları saklıdır.re çalışır.

## 🎯 Özellikler

- **Database Entegrasyonu**: BAZ AI'da oluşturulan şarkılar otomatik yüklenir
- **Auth Sistemi**: Wix ile giriş yapma desteği
- **Kredi Takibi**: Kullanıcı kredilerini gösterir
- **İki Panel Layout**: Sol tarafta yaratım menüsü, sağda sonuçlar
- **Stem Geçmişi**: Önceki ayrıştırmalar kaydedilir
- **İki Dil Desteği**: Türkçe / İngilizce

## 📁 Dosya Yapısı

```
BAZ_AI_Stem_Separator_Updated/
├── index.html          # Ana sayfa (UI)
├── package.json        # Bağımlılıklar
├── vercel.json         # Vercel konfigürasyonu
├── .env.example        # Örnek environment variables
├── README.md           # Bu dosya
└── api/
    ├── auth-sync.js    # Kullanıcı auth senkronizasyonu
    ├── user-data.js    # Database'den şarkı yükleme
    ├── stem.js         # Stem ayrıştırma başlatma
    └── stem-status.js  # Stem durumu sorgulama
```

## 🚀 Kurulum

### 1. Vercel'e Deploy

```bash
# Vercel CLI ile
vercel

# veya GitHub'dan otomatik deploy
```

### 2. Environment Variables

Vercel Dashboard'da şu değişkenleri ayarlayın:

| Değişken | Açıklama |
|----------|----------|
| `MONGODB_URI` | MongoDB bağlantı string'i (BAZ AI Music Login ile aynı) |
| `KIE_API_KEY` | KIE.ai API anahtarı |

### 3. Wix Entegrasyonu

BAZ AI Music Login'deki Wix ayarlarını kullanın. Token aynı formatta çalışır.

## 🔗 API Endpoints

### POST /api/auth-sync
Kullanıcı auth senkronizasyonu

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "...",
    "email": "user@example.com",
    "credits": 50,
    "planId": "temel",
    "daysRemaining": 25
  }
}
```

### GET /api/user-data
Kullanıcının şarkılarını ve verilerini getir

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tracks": [...],
    "stemHistory": [...],
    "credits": 50
  }
}
```

### POST /api/stem
Stem ayrıştırma başlat

**Body:**
```json
{
  "taskId": "abc123",
  "audioId": "xyz789",
  "type": "separate_vocal",
  "callBackUrl": "https://..."
}
```

### GET /api/stem-status?taskId=xxx
Stem durumunu sorgula

## 🎨 UI Yapısı

```
┌─────────────────────────────────────────────────────────┐
│ Header: Logo | Kredi Display | Dil | User Menu          │
├──────────────────┬──────────────────────────────────────┤
│                  │                                      │
│  SOL SIDEBAR     │        SAĞ SONUÇLAR                  │
│                  │                                      │
│  - Kaynak Seçimi │  - Stem sonuçları                    │
│  - Şarkı Listesi │  - Audio player'lar                  │
│  - Ayarlar       │  - İndirme butonları                 │
│  - Başlat Butonu │  - Geçmiş ayrıştırmalar              │
│                  │                                      │
└──────────────────┴──────────────────────────────────────┘
```

## 🔄 BAZ AI Music Login ile Entegrasyon

Bu uygulama BAZ AI Music Login (v1.7) ile aynı:
- MongoDB database'ini kullanır
- Token formatını kullanır
- User modelini kullanır

Şarkılar `users` collection'ında `tracks` array'inde saklanır:

```javascript
{
  wixUserId: "xxx",
  tracks: [
    {
      id: "track_123",
      taskId: "task_abc",
      audioId: "audio_xyz",
      title: "Şarkı Adı",
      style: "Pop",
      audioUrl: "https://...",
      addedAt: Date
    }
  ]
}
```

## 📝 Notlar

1. **Aynı Database**: BAZ AI Music Login ile aynı MongoDB database'ini kullanın
2. **Token Paylaşımı**: Kullanıcılar bir kez giriş yapınca her iki uygulamada da çalışır
3. **Şarkı Senkronizasyonu**: BAZ AI Music'te oluşturulan şarkılar otomatik olarak burada görünür

## 🛠️ Geliştirme

```bash
# Local development
npm install
npm run dev
```

## 📄 Lisans

BAZ AI Music © 2024
