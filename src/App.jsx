import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getIller,
  getIlceler,
  searchKategoriler,
  getBirimlerAggregate,
  API_MAX_PAGE_SIZE,
} from './api.js'

const PAGE_SIZE_OPTIONS = [
  { value: 15, label: '15' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 250, label: '250' },
  { value: 500, label: '500' },
  { value: 1000, label: '1.000' },
  { value: 5000, label: '5.000' },
  { value: 'all', label: 'Tümü' },
]

const HEAVY_THRESHOLD = 1000

export default function App() {
  const [iller, setIller] = useState([])
  const [ilceler, setIlceler] = useState([])
  const [kategoriQuery, setKategoriQuery] = useState('')
  const [kategoriler, setKategoriler] = useState([])
  const [kategoriOpen, setKategoriOpen] = useState(false)
  const [selectedKategori, setSelectedKategori] = useState(null)

  const [filters, setFilters] = useState({
    ilId: '',
    ilceId: '',
    kategoriId: '',
    statuId: '',
    birimAdi: '',
    page: 1,
    pageSize: 15,
  })

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const debounceRef = useRef(null)
  const abortRef = useRef(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  useEffect(() => {
    getIller()
      .then((r) => setIller(r.data || []))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!filters.ilId) {
      setIlceler([])
      return
    }
    getIlceler(filters.ilId)
      .then((r) => setIlceler(r.data || []))
      .catch((e) => setError(e.message))
  }, [filters.ilId])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!kategoriQuery || kategoriQuery.length < 2) {
      setKategoriler([])
      return
    }
    debounceRef.current = setTimeout(() => {
      searchKategoriler(kategoriQuery)
        .then((r) => setKategoriler(r.data || []))
        .catch((e) => setError(e.message))
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [kategoriQuery])

  const statuOptions = useMemo(
    () => selectedKategori?.statuListesi || [],
    [selectedKategori]
  )

  const hasFilter =
    filters.ilId ||
    filters.ilceId ||
    filters.kategoriId ||
    filters.statuId ||
    filters.birimAdi

  function update(key, value) {
    setFilters((f) => {
      const next = { ...f, [key]: value }
      if (key === 'ilId') next.ilceId = ''
      if (key !== 'page') next.page = 1
      return next
    })
  }

  function selectKategori(k) {
    setSelectedKategori(k)
    setKategoriQuery(k.ad)
    setKategoriOpen(false)
    setFilters((f) => ({ ...f, kategoriId: k.id ?? k.kategoriId ?? '', statuId: '', page: 1 }))
  }

  function clearKategori() {
    setSelectedKategori(null)
    setKategoriQuery('')
    setKategoriler([])
    setFilters((f) => ({ ...f, kategoriId: '', statuId: '', page: 1 }))
  }

  function cancel() {
    if (abortRef.current) abortRef.current.abort()
  }

  async function runSearch(overrideFilters) {
    const f = overrideFilters || filtersRef.current
    setError(null)

    if (!f.ilId && !f.ilceId && !f.kategoriId && !f.statuId && !f.birimAdi) {
      setError('En az bir filtre seçin (İl, İlçe, Kategori, Statü veya Birim Adı).')
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setProgress(null)
    try {
      const r = await getBirimlerAggregate(f, {
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
      })
      setResult(r)
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('İptal edildi.')
      } else {
        setError(err.message)
        setResult(null)
      }
    } finally {
      setLoading(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    const next = { ...filtersRef.current, page: 1 }
    setFilters(next)
    runSearch(next)
  }

  function gotoPage(p) {
    const next = { ...filtersRef.current, page: p }
    setFilters(next)
    runSearch(next)
  }

  const isAll = filters.pageSize === 'all'
  const totalPages = result
    ? isAll
      ? 1
      : Math.max(1, Math.ceil(result.totalCount / Number(filters.pageSize)))
    : 1

  const heavy =
    filters.pageSize === 'all' || Number(filters.pageSize) >= HEAVY_THRESHOLD
  const apiCallsEstimate = result
    ? Math.ceil(
        (isAll ? result.totalCount : Math.min(Number(filters.pageSize), result.totalCount)) /
          API_MAX_PAGE_SIZE
      )
    : null

  return (
    <div className="app">
      <header className="hdr">
        <h1>DETSİS Birim Arama</h1>
        <span className="sub">yetkiliapi.detsis.gov.tr · API limit: 100/sayfa · UI'da birleştirildi</span>
      </header>

      <form className="filters" onSubmit={onSubmit}>
        <div className="row">
          <label>
            <span>İl</span>
            <select value={filters.ilId} onChange={(e) => update('ilId', e.target.value)}>
              <option value="">— Seçiniz —</option>
              {iller.map((i) => (
                <option key={i.uavtKod} value={i.uavtKod}>
                  {i.uavtAd}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>İlçe</span>
            <select
              value={filters.ilceId}
              onChange={(e) => update('ilceId', e.target.value)}
              disabled={!filters.ilId || ilceler.length === 0}
            >
              <option value="">— Tümü —</option>
              {ilceler.map((i) => (
                <option key={i.uavtKod} value={i.uavtKod}>
                  {i.uavtAd}
                </option>
              ))}
            </select>
          </label>

          <label className="kategori">
            <span>Kategori (yaz, seç)</span>
            <input
              type="text"
              value={kategoriQuery}
              onChange={(e) => {
                setKategoriQuery(e.target.value)
                setKategoriOpen(true)
                if (selectedKategori) setSelectedKategori(null)
              }}
              onFocus={() => setKategoriOpen(true)}
              onBlur={() => setTimeout(() => setKategoriOpen(false), 150)}
              placeholder="örn: İç, Belediye"
            />
            {kategoriOpen && kategoriler.length > 0 && (
              <ul className="dropdown">
                {kategoriler.map((k, idx) => (
                  <li
                    key={(k.id ?? k.kategoriId ?? idx) + ':' + k.ad}
                    onMouseDown={() => selectKategori(k)}
                  >
                    <strong>{k.ad}</strong>
                    {k.statuListesi?.length ? <em> · {k.statuListesi.length} statü</em> : null}
                  </li>
                ))}
              </ul>
            )}
            {selectedKategori && (
              <button type="button" className="clear" onClick={clearKategori}>
                Temizle
              </button>
            )}
          </label>

          <label>
            <span>Statü</span>
            <select
              value={filters.statuId}
              onChange={(e) => update('statuId', e.target.value)}
              disabled={statuOptions.length === 0}
            >
              <option value="">— Tümü —</option>
              {statuOptions.map((s) => (
                <option key={s.statuId} value={s.statuId}>
                  {s.statuAdi}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label className="grow">
            <span>Birim Adı (opsiyonel)</span>
            <input
              type="text"
              value={filters.birimAdi}
              onChange={(e) => update('birimAdi', e.target.value)}
              placeholder="örn: zabıta"
            />
          </label>

          <label>
            <span>Sayfa Boyutu</span>
            <select
              value={filters.pageSize}
              onChange={(e) => {
                const v = e.target.value
                update('pageSize', v === 'all' ? 'all' : Number(v))
              }}
            >
              {PAGE_SIZE_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {loading ? (
            <button type="button" className="danger" onClick={cancel}>
              İptal
            </button>
          ) : (
            <button type="submit" className="primary">
              Ara
            </button>
          )}
        </div>

        {heavy && !loading && (
          <div className="hint">
            Seçilen boyut API limitinin üstünde. Sorgu, arkaplanda 100'lük gruplar halinde çağrılır.
            {apiCallsEstimate ? ` Tahmini API çağrısı: ${apiCallsEstimate}.` : ''}
          </div>
        )}

        {loading && progress && (
          <div className="progress">
            <div
              className="bar"
              style={{
                width:
                  progress.target > 0
                    ? Math.min(100, (progress.fetched / progress.target) * 100) + '%'
                    : '0%',
              }}
            />
            <span>
              {progress.fetched.toLocaleString('tr-TR')} / {progress.target.toLocaleString('tr-TR')}
              {progress.totalCount
                ? ` (toplam ${progress.totalCount.toLocaleString('tr-TR')})`
                : ''}
              {progress.failed
                ? ` · ${progress.failed} parça başarısız`
                : ''}
            </span>
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </form>

      {result?.failedPages?.length > 0 && (
        <div className="warn">
          <span>
            {result.failedPages.length} parça sunucu hatası nedeniyle çekilemedi (sayfalar: {result.failedPages.slice(0, 8).join(', ')}{result.failedPages.length > 8 ? '…' : ''}).
            Eksik kayıt sayısı: {(result.failedPages.length * 100).toLocaleString('tr-TR')} civarı.
          </span>
          <button type="button" onClick={() => runSearch()}>Yeniden Dene</button>
        </div>
      )}

      {result && (
        <section className="result">
          <div className="meta">
            <strong>{result.totalCount.toLocaleString('tr-TR')}</strong> sonuç ·
            görüntülenen: {result.data.length.toLocaleString('tr-TR')} ·
            {isAll ? ' tüm kayıtlar' : ` sayfa ${result.page} / ${totalPages}`}
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>DETSİS No</th>
                  <th>Birim Adı</th>
                  <th>Kategori</th>
                  <th>Statü</th>
                  <th>İl / İlçe</th>
                  <th>Hiyerarşi</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((b, idx) => (
                  <tr key={(b.id ?? b.detsisNo) + ':' + idx}>
                    <td className="num">{idx + 1}</td>
                    <td className="mono">{b.detsisNo}</td>
                    <td>{b.birimAdi}</td>
                    <td>{b.kategoriAdi}</td>
                    <td>{b.statuAdi}</td>
                    <td>
                      {b.ilAdi}
                      {b.ilceAdi ? ' / ' + b.ilceAdi : ''}
                    </td>
                    <td className="hier" title={b.kurumHiyerarsisi}>
                      {b.kurumHiyerarsisi}
                    </td>
                  </tr>
                ))}
                {result.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty">Sonuç yok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!isAll && totalPages > 1 && (
            <div className="pager">
              <button disabled={result.page <= 1 || loading} onClick={() => gotoPage(1)}>«</button>
              <button disabled={result.page <= 1 || loading} onClick={() => gotoPage(result.page - 1)}>‹</button>
              <span>{result.page} / {totalPages}</span>
              <button disabled={result.page >= totalPages || loading} onClick={() => gotoPage(result.page + 1)}>›</button>
              <button disabled={result.page >= totalPages || loading} onClick={() => gotoPage(totalPages)}>»</button>
            </div>
          )}
        </section>
      )}

      <footer className="ftr">
        <small>Veri kaynağı: yetkiliapi.detsis.gov.tr — API limiti 100/sayfa, UI 100'lük gruplarla birleştirir.</small>
      </footer>
    </div>
  )
}
