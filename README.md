# Detsis Explorer

DETSİS (Devlet Teşkilatı Merkezi Kayıt Sistemi) birimlerini filtreleyip incelemek için React + Electron tabanlı masaüstü uygulaması.

## Özellikler

- İl / İlçe / Kategori / Statü / Üst Birim / Bütçe Türü filtreleri
- Hiyerarşik ağaç (kök kategoriden başlayarak lazy-load)
- Çoklu ata kategori filtresi (her biri AND, ✓ Var / ✗ Yok)
- Sonuçlar geldikçe ekrana akar (streaming)
- Tüm sayfalar önden çekilir, sayfalama anlık (client-side)
- Tablo sıralaması, sonuçlarda metin arama
- CSV (Excel uyumlu, UTF-8 BOM, `;` ayraç) ve JSON indirme

## Geliştirme (tarayıcı)

```bash
npm install
npm run dev
```

`http://localhost:5173` adresine git. Vite, `/detsis` istekleri için yetkiliapi.detsis.gov.tr'ye proxy yapar.

## Geliştirme (Electron, masaüstü)

```bash
npm install
npm run electron:dev
```

Electron penceresi açılır, devtools detached. Vite hot reload ile React kodu değiştikçe yenilenir.

## Production build (installer)

Sadece kendi platformunuz için (önerilen):

```bash
npm run electron:build
```

Üretilen dosyalar `release/` altında. Platforma göre:

| Platform | Çıktı |
| -------- | ----- |
| macOS    | `.dmg`, `.zip` (arm64 + x64) |
| Windows  | NSIS `.exe` installer + `portable.exe` |
| Linux    | `.AppImage`, `.deb` |

Spesifik platform için:

```bash
npm run electron:build:mac
npm run electron:build:win
npm run electron:build:linux
```

> Çapraz platform build (Mac'te Win exe vb.) için Wine / extra toolchain gerekebilir; en sağlamı her platformda kendi makinesinde build almak veya GitHub Actions kullanmak.

## Mimari

- **Renderer**: React 18 + Vite. `src/` altında.
- **Main process**: `electron/main.cjs` — uygulama açılışında localhost'ta rastgele portta küçük bir HTTP proxy başlatır (`/detsis/...` → `https://yetkiliapi.detsis.gov.tr/...`). Detsis sunucusunun talep ettiği `Origin`, `Referer`, `User-Agent` başlıklarını enjekte eder; bu nedenle 403 Forbidden almazsınız.
- **Preload**: `electron/preload.cjs` — port bilgisini renderer'a `window.DETSIS_PROXY_BASE` olarak verir. `src/api.js` bunu okur, dev'de düşerse `/detsis` (Vite proxy) kullanır.

## Lisans

MIT (sadece UI; veri DETSİS'e aittir).
