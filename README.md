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

## Otomatik Güncelleme

NSIS Setup ile kurulu sürümlerde tam **auto-update**:

1. App açılışta + her 30 dk'da GitHub Releases'ı kontrol eder (`electron-updater`)
2. Yeni sürüm varsa **arka planda otomatik indirir** (progress banner üstte)
3. İndirme bitince banner **"Yükle ve yeniden başlat"** butonuna döner
4. Tıkla → installer çalışır, app yeniden başlar (kullanıcı dosya kopyalamaz)

Sağ alt köşede her zaman sürüm rozeti vardır; tıklayınca anlık kontrol tetikler.
Portable veya dev modunda rozet sarı nokta ile işaretlenir (auto-update yok).

### Yeni sürüm yayınlama (geliştirici tarafı)

`electron-builder` GH_TOKEN ile GitHub release'i kendi oluşturur, `latest.yml`
metadata dosyası dahil tüm artefaktları yükler. `latest.yml` olmadan istemci
auto-update tetiklenmez — bu yüzden manuel `gh release create` YERİNE
electron-builder'ı kullanın:

```bash
# 1. Versiyonu artır
npm version patch       # 0.1.0 -> 0.1.1, otomatik commit + tag
git push --follow-tags

# 2. GitHub Personal Access Token (repo scope) export et
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# 3. Build + publish (release otomatik, taslak olarak oluşur)
npm run electron:build:win -- --publish always
```

Sonra GitHub'da release'i "Draft" → "Published" yapın. Açık olan tüm Deteasy
örnekleri 30 dk içinde otomatik tetiklenir; banner indirme progress'i gösterir,
kullanıcı tek tıkla yükler.

## Lisans

MIT.
