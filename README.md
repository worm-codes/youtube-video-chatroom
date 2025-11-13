# YouTube Video Chatroom Chrome Extension

Chrome eklentisiyle YouTube videolarına özel gerçek zamanlı sohbet odaları eklemenizi sağlar. Kullanıcılar Google hesaplarıyla giriş yaparak Supabase altyapısı üzerinden sohbetlere katılır.

## 1. Supabase Kurulumu

1. [Supabase](https://app.supabase.com/) üzerinde ücretsiz bir proje oluşturun.
2. Proje ayarlarından (`Project Settings → API`) **Project URL** ve **anon key** değerlerini not alın.
3. `Authentication → Providers` sekmesinden **Google** sağlayıcısını aktif edin.
   - `Client ID` ve `Client Secret` için [Google Cloud Console](https://console.cloud.google.com/apis/credentials) üzerinde bir OAuth 2.0 istemcisi oluşturun.
   - Yetkili yönlendirme URI’lerine aşağıdakini ekleyin:
     ```
     chrome-extension://<EXTENSION_ID>/auth/auth.html
     ```
     Geliştirme sırasında `chrome.identity.getRedirectURL('auth/auth.html')` ile üretilen URI otomatik olarak uygun uzantı kimliğini içerir. Supabase'de bu URI'yı tanımlamanız gerekir.
4. `Authentication → URL Configuration` bölümünde `Redirect URLs` listesine aynı URI’yı eklemeyi unutmayın.

## 2. Veritabanı Şeması

Projede kullanılan tablolar ve indeksler `supabase/schema.sql` dosyasında yer alır. Supabase SQL editöründe bu dosyadaki sorguları sırasıyla çalıştırarak tabloları oluşturun.

### Tablolar
- `videos`: YouTube videolarını takip eder.
- `chat_messages`: Mesajları saklar.
- `user_profiles`: Supabase `auth.users` tablosunu genişletir (görünen ad, avatar, isteğe bağlı YouTube kullanıcı adı).
- `room_memberships`: Kullanıcıların video odalarına üyeliklerini tutar.
- `room_bans` (opsiyonel): Moderasyon için ban kayıtları.

### Row Level Security Politikaları
Güvenlik politikaları `supabase/policies.sql` dosyasında bulunur. Politikalar Supabase SQL editöründe çalıştırıldıktan sonra tablolar için RLS `enabled` hale getirilmelidir (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).

## 3. Yerel Geliştirme

1. Depoyu klonlayın ve kök dizinde şu adımları takip edin:
   ```bash
   npm install
   npm run build
   ```
   `npm run build` komutu `dist/` dizinine MV3 uyumlu paket dosyalarını üretir.

2. `src/lib/config.example.js` dosyasını kopyalayarak `src/lib/config.js` adında yeni bir dosya oluşturun ve Supabase projenize ait `SUPABASE_URL` ile `SUPABASE_ANON_KEY` değerlerini doldurun.

3. Chrome’da Geliştirici modunu açarak (`chrome://extensions`), `dist/` klasörünü **Unpacked** bir uzantı olarak yükleyin.

4. YouTube’da bir video sayfasını açtığınızda sidebar otomatik olarak gelecektir. "Google ile giriş yap" butonu OAuth akışını başlatır. Girişten sonra "Katıl" butonuyla oda kaydı yapılır ve gerçek zamanlı mesajlaşma başlar.

## 4. Komutlar

- `npm run build`: Esbuild ile tüm içerikleri `dist/` dizinine derler.
- `npm run dev`: Esbuild’i watch modunda çalıştırır (dosya değişikliklerinde otomatik derleme).
- `npm run clean`: `dist/` dizinini temizler.

## 5. Dosya Yapısı

```
youtube-video-chatroom/
├── dist/                     # Derlenen MV3 uzantı dosyaları
├── src/
│   ├── background/
│   ├── content/
│   ├── sidebar/
│   ├── popup/
│   ├── auth/
│   ├── lib/
│   └── shared/
├── supabase/
│   ├── schema.sql
│   └── policies.sql
├── scripts/
│   └── build.mjs
├── assets/
│   └── icons/
├── manifest.json             # Derlenmiş dosyaları işaret eder
├── package.json
└── README.md
```

> Not: `dist/` dizini build sonrasında oluşur. Kaynak dosyalar `src/` klasöründe tutulur.

## 6. Geliştirme İpuçları

- Supabase tabanlı gerçek zamanlı sohbet Realtime kanallarını kullanır. Tarayıcıda birden fazla YouTube sekmesi açarak eş zamanlı mesajlaşmayı test edin.
- Mesaj uzunluğu, gönderim hızı ve XSS temizliği (`DOMPurify`) istemci tarafında uygulanır. Gerekirse ek sunucu fonksiyonlarıyla sınırlar güçlendirilebilir.
- Uzantı yayınlamadan önce Google OAuth istemcinizi **Production** modunda kullanıma hazır hale getirin ve `manifest.json` içinde gerekli ikonları güncellediğinizden emin olun.

## 7. Yayın

1. `npm run build` komutuyla üretim paketini oluşturun.
2. `dist/` klasörünü zip’leyin.
3. Chrome Web Mağazası’na geliştirici hesabınızla giriş yaparak yeni uzantı oluşturun ve zip dosyasını yükleyin.
4. İnceleme sürecinden önce Supabase politikalarınızın doğru çalıştığından ve gizlilik bildiriminizin hazır olduğundan emin olun.

## Lisans

Bu proje MIT Lisansı ile yayınlanmıştır. Ayrıntılar için `LICENSE` dosyasına bakın.

