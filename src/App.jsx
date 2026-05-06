import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getIller,
  getIlceler,
  searchKategoriler,
  getBirimler,
} from './api.js'

const PAGE_SIZES = [15, 25, 50, 100, 200]

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
  const [error, setError] = useState(null)

  const debounceRef = useRef(null)

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

  async function search(e) {
    e?.preventDefault()
    setError(null)
    if (!hasFilter) {
      setError('En az bir filtre seçin (İl, İlçe, Kategori, Statü veya Birim Adı).')
      return
    }
    setLoading(true)
    try {
      const r = await getBirimler(filters)
      setResult(r)
    } catch (err) {
      setError(err.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  function gotoPage(p) {
    setFilters((f) => ({ ...f, page: p }))
    setTimeout(() => search(), 0)
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / result.pageSize)) : 1

  return (
    <div className="app">
      <header className="hdr">
        <h1>DETSİS Birim Arama</h1>
        <span className="sub">yetkiliapi.detsis.gov.tr · proxy: /detsis</span>
      </header>

      <form className="filters" onSubmit={search}>
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
                  <li key={(k.id ?? k.kategoriId ?? idx) + ':' + k.ad} onMouseDown={() => selectKategori(k)}>
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
              onChange={(e) => update('pageSize', Number(e.target.value))}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Aranıyor…' : 'Ara'}
          </button>
        </div>

        {error && <div className="error">{error}</div>}
      </form>

      {result && (
        <section className="result">
          <div className="meta">
            <strong>{result.totalCount.toLocaleString('tr-TR')}</strong> sonuç ·
            sayfa {result.page} / {totalPages} · pageSize {result.pageSize}
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>DETSİS No</th>
                  <th>Birim Adı</th>
                  <th>Kategori</th>
                  <th>Statü</th>
                  <th>İl / İlçe</th>
                  <th>Hiyerarşi</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((b) => (
                  <tr key={b.id ?? b.detsisNo}>
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
                    <td colSpan={6} className="empty">Sonuç yok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button disabled={result.page <= 1 || loading} onClick={() => gotoPage(1)}>«</button>
            <button disabled={result.page <= 1 || loading} onClick={() => gotoPage(result.page - 1)}>‹</button>
            <span>{result.page} / {totalPages}</span>
            <button disabled={result.page >= totalPages || loading} onClick={() => gotoPage(result.page + 1)}>›</button>
            <button disabled={result.page >= totalPages || loading} onClick={() => gotoPage(totalPages)}>»</button>
          </div>
        </section>
      )}

      <footer className="ftr">
        <small>Veri kaynağı: yetkiliapi.detsis.gov.tr — geliştirme proxy üzerinden çağrılır.</small>
      </footer>
    </div>
  )
}
