# Deteasy

DETSİS (Devlet Teşkilatı Merkezi Kayıt Sistemi) birimlerini filtreleyip incelemek için React + Electron tabanlı masaüstü uygulaması.

## Özellikler

- İl / İlçe / Kategori / Statü / Üst Birim / Bütçe Türü filtreleri
- Hızlı ön ayar chip'leri (Bakanlıklar, Belediyeler, Şirketler, Üniversiteler, …)
- Hiyerarşik ağaç ile görsel birim seçimi (lazy-load)
- Çoklu **ata kategori** filtresi
  - ✓ pozitif chip'ler aralarında OR (biri ata olsa yeter)
  - ✗ negatif chip'ler aralarında AND (hiçbiri ata olmamalı)
- Sonuçlar geldikçe ekrana akar (streaming, paralel 5 worker)
- Tüm sayfalar önden çekilir, sayfalama anlık (client-side slice)
- Tablo sıralaması, sonuçlarda metin arama (tr locale)
- CSV (Excel uyumlu, UTF-8 BOM, `;` ayraç) ve JSON indirme

## Geliştirme

### Tarayıcı

```bash
npm install
npm run dev
```

`http://localhost:5173` adresine git. Vite, `/detsis` isteklerini yetkiliapi.detsis.gov.tr'ye proxy yapar (gov başlıkları enjekte edilir).

### Electron (masaüstü)

```bash
npm install
npm run electron:dev
```

## Production build

```bash
npm run electron:build         # mevcut platform için installer
npm run electron:build:mac     # macOS (.dmg + .zip)
npm run electron:build:win     # Windows (NSIS .exe + portable + zip)
npm run electron:build:linux   # Linux (.AppImage + .deb)
```

Çıktılar `release/` altında.

> Çapraz platform build (Mac'ten Win exe vb.) electron-builder Wine'ı kendi indirir. Sağlam ürün için her platformda yerelde build veya GitHub Actions kullanmak önerilir.

## Mimari

- **Renderer**: React 18 + Vite, `src/` altında.
- **Main process**: `electron/main.cjs` — uygulama açılırken localhost'ta rastgele portta HTTP proxy başlatır: `/detsis/...` → `https://yetkiliapi.detsis.gov.tr/...`. Detsis'in talep ettiği `Origin`, `Referer`, `User-Agent` başlıklarını enjekte eder.
- **Preload**: `electron/preload.cjs` — port bilgisini renderer'a `window.DETSIS_PROXY_BASE` olarak verir. `src/api.js` bunu okur; tarayıcı dev modunda fallback olarak `/detsis` (Vite proxy) kullanır.

## Güncelleme Bildirimi

Uygulama her açılışta ve sonraki her 30 dakikada bir GitHub Releases'ı kontrol eder:
`https://api.github.com/repos/Birkankader/Deteasy/releases/latest`. Mevcut sürüm
(`package.json#version`) ile karşılaştırıp yenisi varsa üstte mavi banner çıkar.
"İndir / Güncelle" tuşu varsayılan tarayıcıda release sayfasını / portable .exe
download linkini açar. Kullanıcı yeni `.exe`'yi eski portable'ın yerine koyar.

Sağ alt köşede her zaman bir mini sürüm rozeti vardır; tıklayınca anlık kontrol
yapar (güncel ise yeşil toast, hata varsa kırmızı toast).

### Yeni sürüm yayınlama (geliştirici tarafı)

```bash
# 1. package.json#version'u artır (örn 0.1.0 -> 0.2.0)
npm version patch    # veya minor / major
git push --follow-tags

# 2. Win build
npm run electron:build:win

# 3. GitHub release oluştur, release/ altındaki dosyaları yükle
gh release create v0.2.0 \
  "release/Deteasy 0.2.0.exe" \
  "release/Deteasy Setup 0.2.0.exe" \
  --title "Deteasy v0.2.0" \
  --notes "Sürüm notları…"
```

Açık olan uygulamalar 30 dk içinde update'i otomatik görür; kullanıcı pencereyi
kapatmadan banner ile haberdar olur.

## Lisans

MIT.
