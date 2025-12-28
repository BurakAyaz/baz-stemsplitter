# BAZ AI Cover Designer v2.0

MongoDB Visuals entegrasyonu ile albüm kapağı ve sanatçı fotoğrafı tasarım uygulaması.

## Değişiklikler

- Kullanıcı profilleri `users` koleksiyonunda `visuals` dizisi olarak saklanır
- Görseller otomatik olarak MongoDB'ye kaydedilir
- Referans projeden tüm API'ler entegre edildi

## Kurulum

1. Vercel'e deploy et: `vercel --prod`
2. Environment Variables ayarla:
   - `MONGODB_URI` - MongoDB bağlantı URL'i
   - `KIE_API_KEY` - Kie.ai API anahtarı
   - `ADMIN_KEY` - Admin güvenlik anahtarı

## API Endpoints

- POST /api/auth-sync - Kullanıcı doğrulama
- POST /api/use-credits - Kredi harcama
- POST /api/add-credits - Kredi ekleme (Admin)
- POST /api/wix-webhook - Wix ödeme
- POST /api/generate-image - Görsel oluştur
- GET /api/image-status - Durum sorgula
- POST /api/save-image - Görsel kaydet
- GET /api/list-images - Görselleri listele
- DELETE /api/delete-image - Görsel sil
- GET/POST /api/user-data - Kullanıcı verileri
- GET /api/status - API durumu
