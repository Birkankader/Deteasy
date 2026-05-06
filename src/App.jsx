import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getIller,
  getIlceler,
  searchKategoriler,
  getBirimlerAggregate,
  API_MAX_PAGE_SIZE,
} from './api.js'

const PAGE_SIZE_OPTIONS = [15, 25, 50, 100, 250, 500, 1000]

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
  })

  const [pageSize, setPageSize] = useState(25)
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)

  const [dataset, setDataset] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const debounceRef = useRef(null)
  const abortRef = useRef(null)

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

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])
  const stale = dataset && dataset.filtersKey !== filtersKey

  function update(key, value) {
    setFilters((f) => {
      const next = { ...f, [key]: value }
      if (key === 'ilId') next.ilceId = ''
      return next
    })
  }

  function selectKategori(k) {
    setSelectedKategori(k)
    setKategoriQuery(k.ad)
    setKategoriOpen(false)
    setFilters((f) => ({ ...f, kategoriId: k.id ?? k.kategoriId ?? '', statuId: '' }))
  }

  function clearKategori() {
    setSelectedKategori(null)
    setKategoriQuery('')
    setKategoriler([])
    setFilters((f) => ({ ...f, kategoriId: '', statuId: '' }))
  }

  function cancel() {
    if (abortRef.current) abortRef.current.abort()
  }

  async function loadAll() {
    setError(null)
    if (!hasFilter) {
      setError('En az bir filtre seçin (İl, İlçe, Kategori, Statü veya Birim Adı).')
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setProgress(null)
    try {
      const r = await getBirimlerAggregate(
        { ...filters, page: 1, pageSize: 'all' },
        {
          signal: ctrl.signal,
          onProgress: (p) => setProgress(p),
        }
      )
      setDataset({
        filtersKey,
        all: r.data,
        totalCount: r.totalCount,
        failedPages: r.failedPages || [],
      })
      setPage(1)
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('İptal edildi.')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    loadAll()
  }

  const totalRows = dataset?.all.length || 0
  const effectivePageSize = showAll ? Math.max(totalRows, 1) : pageSize
  const totalPages = totalRows ? Math.max(1, Math.ceil(totalRows / effectivePageSize)) : 1
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * effectivePageSize
  const visibleRows = useMemo(
    () => (dataset ? dataset.all.slice(start, start + effectivePageSize) : []),
    [dataset, start, effectivePageSize]
  )

  function gotoPage(p) {
    setPage(Math.max(1, Math.min(totalPages, p)))
  }

  return (
    <div className="app">
      <header className="hdr">
        <h1>DETSİS Birim Arama</h1>
        <span className="sub">
          API limit 100/sayfa · UI tüm kayıtları önden çeker, sayfalama client-side
        </span>
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

          {loading ? (
            <button type="button" className="danger" onClick={cancel}>
              İptal
            </button>
          ) : (
            <button type="submit" className="primary">
              Tümünü Çek
            </button>
          )}
        </div>

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
              {progress.failed ? ` · ${progress.failed} parça başarısız` : ''}
            </span>
          </div>
        )}

        {!loading && stale && (
          <div className="hint">
            Filtreler değişti. Yeni sonuçlar için <strong>Tümünü Çek</strong>'e bas.
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </form>

      {dataset?.failedPages?.length > 0 && (
        <div className="warn">
          <span>
            {dataset.failedPages.length} parça sunucu hatası nedeniyle çekilemedi (sayfalar:{' '}
            {dataset.failedPages.slice(0, 8).join(', ')}
            {dataset.failedPages.length > 8 ? '…' : ''}). Eksik kayıt:{' '}
            {(dataset.failedPages.length * API_MAX_PAGE_SIZE).toLocaleString('tr-TR')} civarı.
          </span>
          <button type="button" onClick={loadAll}>Yeniden Dene</button>
        </div>
      )}

      {dataset && (
        <section className="result">
          <div className="meta">
            <strong>{dataset.totalCount.toLocaleString('tr-TR')}</strong> sonuç ·
            önbellekte: {totalRows.toLocaleString('tr-TR')} kayıt ·
            {showAll
              ? ' tüm kayıtlar görünüyor'
              : ` sayfa ${safePage} / ${totalPages} (${effectivePageSize}/sayfa)`}

            <span className="ctrls">
              <label className="inline">
                Sayfa boyutu
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  disabled={showAll}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline check">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => {
                    setShowAll(e.target.checked)
                    setPage(1)
                  }}
                />
                Tümünü göster
              </label>
            </span>
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
                {visibleRows.map((b, idx) => (
                  <tr key={(b.id ?? b.detsisNo) + ':' + (start + idx)}>
                    <td className="num">{start + idx + 1}</td>
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
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty">Sonuç yok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!showAll && totalPages > 1 && (
            <div className="pager">
              <button disabled={safePage <= 1} onClick={() => gotoPage(1)}>«</button>
              <button disabled={safePage <= 1} onClick={() => gotoPage(safePage - 1)}>‹</button>
              <span>{safePage} / {totalPages}</span>
              <button disabled={safePage >= totalPages} onClick={() => gotoPage(safePage + 1)}>›</button>
              <button disabled={safePage >= totalPages} onClick={() => gotoPage(totalPages)}>»</button>
            </div>
          )}
        </section>
      )}

      <footer className="ftr">
        <small>
          Veri kaynağı: yetkiliapi.detsis.gov.tr — API 100/sayfa, UI 100'lük gruplarla tüm kayıtları
          birleştirip belleğe alır. Sayfa değişimi anında.
        </small>
      </footer>
    </div>
  )
}
