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

## Lisans

MIT.
