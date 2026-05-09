import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getIller,
  getIlceler,
  searchKategoriler,
  searchBirimler,
  getBirimlerAggregate,
  API_MAX_PAGE_SIZE,
  BUTCE_TURLERI,
  ROOT_CATEGORIES,
  normalizeName,
} from './api.js'
import Tree from './Tree.jsx'

const PAGE_SIZE_OPTIONS = [15, 25, 50, 100, 250, 500, 1000]
const QUICK_PRESETS = [
  { kategoriId: 19, ad: 'Bakanlıklar', searchTerm: 'BAKANLIK' },
  { kategoriId: 204, ad: 'Belediyeler', searchTerm: 'BELEDİYE' },
  { kategoriId: 214, ad: 'Şirketler', searchTerm: 'ŞİRKET' },
  { kategoriId: 132, ad: 'Üniversiteler', searchTerm: 'YÜKSEKÖĞRETİM' },
  { kategoriId: 17, ad: 'Cumhurbaşkanlığı', searchTerm: 'CUMHURBAŞKANLIĞI' },
  { kategoriId: 125, ad: 'Yüksek Yargı', searchTerm: 'YÜKSEK YARGI' },
  { kategoriId: 16, ad: 'TBMM', searchTerm: 'TBMM' },
  { kategoriId: 205, ad: 'İl Özel İdaresi', searchTerm: 'İL ÖZEL İDARESİ' },
]
const FETCH_LIMIT_OPTIONS = [
  { value: 100, label: '100' },
  { value: 500, label: '500' },
  { value: 1000, label: '1.000' },
  { value: 5000, label: '5.000' },
  { value: 'all', label: 'Tümü' },
]

export default function App() {
  const [iller, setIller] = useState([])
  const [ilceler, setIlceler] = useState([])
  const [kategoriQuery, setKategoriQuery] = useState('')
  const [kategoriler, setKategoriler] = useState([])
  const [kategoriOpen, setKategoriOpen] = useState(false)
  const [selectedKategori, setSelectedKategori] = useState(null)

  const [ustBirimQuery, setUstBirimQuery] = useState('')
  const [ustBirimResults, setUstBirimResults] = useState([])
  const [ustBirimOpen, setUstBirimOpen] = useState(false)
  const [ustBirimLoading, setUstBirimLoading] = useState(false)
  const [selectedUstBirim, setSelectedUstBirim] = useState(null)
  const [treeOpen, setTreeOpen] = useState(false)

  const [filters, setFilters] = useState({
    ilId: '',
    ilceId: '',
    kategoriId: '',
    statuId: '',
    birimAdi: '',
    ustBirimId: '',
    butceTuruId: '',
  })

  const [parentFilters, setParentFilters] = useState([]) // [{ kategoriId: '205', mode: 'is' | 'not' }, ...]
  const [parentDraft, setParentDraft] = useState('')
  const [parentNamesCache, setParentNamesCache] = useState({}) // { [kategoriId]: { loading, set, error, total } }

  const [pageSize, setPageSize] = useState(25)
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [fetchLimit, setFetchLimit] = useState(500)
  const [textFilter, setTextFilter] = useState('')

  const [dataset, setDataset] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const debounceRef = useRef(null)
  const ustBirimDebounceRef = useRef(null)
  const abortRef = useRef(null)
  const parentInFlightRef = useRef(new Set())

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

  useEffect(() => {
    if (ustBirimDebounceRef.current) clearTimeout(ustBirimDebounceRef.current)
    if (!ustBirimQuery || ustBirimQuery.length < 2) {
      setUstBirimResults([])
      setUstBirimLoading(false)
      return
    }
    if (selectedUstBirim && ustBirimQuery === selectedUstBirim.birimAdi) {
      return
    }
    setUstBirimLoading(true)
    ustBirimDebounceRef.current = setTimeout(() => {
      searchBirimler(ustBirimQuery)
        .then((r) => setUstBirimResults(r.data || []))
        .catch((e) => setError(e.message))
        .finally(() => setUstBirimLoading(false))
    }, 300)
    return () => clearTimeout(ustBirimDebounceRef.current)
  }, [ustBirimQuery, selectedUstBirim])

  const statuOptions = useMemo(
    () => selectedKategori?.statuListesi || [],
    [selectedKategori]
  )

  useEffect(() => {
    parentFilters.forEach((pf) => {
      const id = String(pf.kategoriId)
      // Skip if already cached or actively fetching. Identity tracked via ref so
      // re-running the effect (e.g. on chip mode toggle / removal) doesn't fire
      // duplicate aggregates.
      if (parentInFlightRef.current.has(id)) return
      const cached = parentNamesCache[id]
      if (cached?.set) return

      parentInFlightRef.current.add(id)
      setParentNamesCache((c) => ({
        ...c,
        [id]: { loading: true, set: null, total: 0 },
      }))

      getBirimlerAggregate(
        { kategoriId: pf.kategoriId },
        { limit: 'all', concurrency: 5 }
      )
        .then((r) => {
          const set = new Set(
            (r.data || []).map((b) => normalizeName(b.birimAdi)).filter(Boolean)
          )
          setParentNamesCache((c) => ({
            ...c,
            [id]: { loading: false, set, total: r.totalCount },
          }))
        })
        .catch((e) => {
          setParentNamesCache((c) => ({
            ...c,
            [id]: { loading: false, set: null, error: e.message },
          }))
        })
        .finally(() => {
          parentInFlightRef.current.delete(id)
        })
    })
  }, [parentFilters])

  const hasFilter =
    filters.ilId ||
    filters.ilceId ||
    filters.kategoriId ||
    filters.statuId ||
    filters.birimAdi ||
    filters.ustBirimId

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

  async function applyPreset(preset) {
    setKategoriOpen(false)
    setKategoriler([])
    setFilters((f) => ({ ...f, kategoriId: preset.kategoriId, statuId: '' }))
    setSelectedKategori({ id: preset.kategoriId, ad: preset.ad, statuListesi: [] })
    setKategoriQuery(preset.ad)
    try {
      const r = await searchKategoriler(preset.searchTerm || preset.ad)
      const match = (r.data || []).find(
        (k) => (k.id ?? k.kategoriId) === preset.kategoriId
      )
      if (match) {
        setSelectedKategori(match)
        setKategoriQuery(match.ad)
      }
    } catch (e) {
      // sessizce yut, statu listesiz devam edelim
    }
  }

  function selectUstBirim(b) {
    setSelectedUstBirim(b)
    setUstBirimQuery(b.birimAdi)
    setUstBirimOpen(false)
    setFilters((f) => ({ ...f, ustBirimId: b.id ?? b.detsisNo ?? '' }))
  }

  function clearUstBirim() {
    setSelectedUstBirim(null)
    setUstBirimQuery('')
    setUstBirimResults([])
    setFilters((f) => ({ ...f, ustBirimId: '' }))
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
    setPage(1)

    setDataset({
      filtersKey,
      all: [],
      totalCount: 0,
      failedPages: [],
      complete: false,
      fetchLimit,
    })

    try {
      const r = await getBirimlerAggregate(filters, {
        offset: 0,
        limit: fetchLimit,
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
        onChunk: (rows, meta) => {
          setDataset((d) => {
            if (!d || d.filtersKey !== filtersKey) return d
            return {
              ...d,
              all: d.all.concat(rows),
              totalCount: meta.totalCount,
            }
          })
        },
      })
      setDataset({
        filtersKey,
        all: r.data,
        totalCount: r.totalCount,
        failedPages: r.failedPages || [],
        complete: true,
        fetchLimit,
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        setDataset((d) => (d ? { ...d, complete: true } : d))
        setError('İptal edildi. Şu ana kadar gelen kayıtlar gösteriliyor.')
      } else {
        setError(err.message)
        setDataset(null)
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

  const NUMERIC_KEYS = new Set(['detsisNo'])

  const baseAll = dataset?.all || []

  // Resolve every active parent filter to its cached name set.
  // anyParentLoading: true while at least one chip's cache is still loading.
  const resolvedParentFilters = parentFilters.map((pf) => {
    const cached = parentNamesCache[String(pf.kategoriId)]
    return { ...pf, set: cached?.set || null, loading: !!cached?.loading }
  })
  const anyParentLoading = resolvedParentFilters.some((p) => p.loading)
  const readyParentFilters = resolvedParentFilters.filter((p) => p.set)

  const parentFilteredAll = useMemo(() => {
    if (readyParentFilters.length === 0) return baseAll
    return baseAll.filter((b) => {
      const h = b.kurumHiyerarsisi || ''
      // Walk EVERY ancestor in the hierarchy path "Root > P1 > P2 > ... > Self".
      // Drop the last segment (the unit itself) — we want only ancestors.
      const segments = h.split(' > ').map(normalizeName).filter(Boolean)
      const ancestors = segments.length >= 2 ? segments.slice(0, -1) : []
      // AND semantics across chips:
      //   mode 'is':  at least one ancestor must be in the chip's name set
      //   mode 'not': NO ancestor may be in the chip's name set
      for (const pf of readyParentFilters) {
        let hit = false
        for (const seg of ancestors) {
          if (pf.set.has(seg)) {
            hit = true
            break
          }
        }
        if (pf.mode === 'not' ? hit : !hit) return false
      }
      return true
    })
  }, [baseAll, readyParentFilters])

  const filteredAll = useMemo(() => {
    const q = textFilter.trim()
    if (!q) return parentFilteredAll
    const lq = q.toLocaleLowerCase('tr')
    return parentFilteredAll.filter((b) => {
      return (
        (b.birimAdi && b.birimAdi.toLocaleLowerCase('tr').includes(lq)) ||
        (b.kurumHiyerarsisi && b.kurumHiyerarsisi.toLocaleLowerCase('tr').includes(lq)) ||
        (b.statuAdi && b.statuAdi.toLocaleLowerCase('tr').includes(lq)) ||
        (b.kategoriAdi && b.kategoriAdi.toLocaleLowerCase('tr').includes(lq)) ||
        (b.ilAdi && b.ilAdi.toLocaleLowerCase('tr').includes(lq)) ||
        (b.ilceAdi && b.ilceAdi.toLocaleLowerCase('tr').includes(lq)) ||
        String(b.detsisNo || '').includes(q)
      )
    })
  }, [parentFilteredAll, textFilter])

  const sortedAll = useMemo(() => {
    if (!sort.key) return filteredAll
    const arr = filteredAll.slice()
    const dir = sort.dir === 'asc' ? 1 : -1
    const numeric = NUMERIC_KEYS.has(sort.key)
    arr.sort((a, b) => {
      const va = a?.[sort.key]
      const vb = b?.[sort.key]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (numeric) return ((Number(va) || 0) - (Number(vb) || 0)) * dir
      return String(va).localeCompare(String(vb), 'tr', { sensitivity: 'base' }) * dir
    })
    return arr
  }, [filteredAll, sort])

  const totalRows = sortedAll.length
  const totalLoaded = baseAll.length
  const effectivePageSize = showAll ? Math.max(totalRows, 1) : pageSize
  const totalPages = totalRows ? Math.max(1, Math.ceil(totalRows / effectivePageSize)) : 1
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * effectivePageSize
  const visibleRows = useMemo(
    () => sortedAll.slice(start, start + effectivePageSize),
    [sortedAll, start, effectivePageSize]
  )

  function gotoPage(p) {
    setPage(Math.max(1, Math.min(totalPages, p)))
  }

  useEffect(() => {
    setPage(1)
  }, [textFilter, parentFilters])

  function toggleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
    setPage(1)
  }

  function clearSort() {
    setSort({ key: null, dir: 'asc' })
  }

  function buildExportRecords() {
    if (!dataset) return []
    // sortedAll always reflects the full pipeline: parentFilters → textFilter
    // → sort. When nothing is active it equals dataset.all, so a single source
    // is always correct.
    return sortedAll
  }

  function buildFilenameSlug() {
    const slugParts = [
      filters.ilId && `il${filters.ilId}`,
      filters.ilceId && `ilce${filters.ilceId}`,
      filters.kategoriId && `kat${filters.kategoriId}`,
      filters.statuId && `statu${filters.statuId}`,
      filters.ustBirimId && `ust${filters.ustBirimId}`,
      filters.birimAdi && filters.birimAdi.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20),
    ].filter(Boolean)
    const slug = slugParts.join('_') || 'tum'
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    return `${slug}_${stamp}`
  }

  function triggerDownload(blob, fname) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fname
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function downloadJson() {
    if (!dataset) return
    const records = buildExportRecords()
    const payload = {
      fetchedAt: new Date().toISOString(),
      source: 'yetkiliapi.detsis.gov.tr',
      filters,
      ancestorFilters: parentFilters.length > 0 ? parentFilters : null,
      textFilter: textFilter.trim() || null,
      totalCount: dataset.totalCount,
      loadedCount: dataset.all.length,
      recordCount: records.length,
      failedPages: dataset.failedPages || [],
      sort: sort.key ? sort : null,
      records,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    triggerDownload(blob, `detsis_${buildFilenameSlug()}.json`)
  }

  function downloadCsv() {
    if (!dataset) return
    const records = buildExportRecords()
    const headers = [
      'DETSİS No',
      'Birim Adı',
      'İngilizce Adı',
      'Kategori',
      'Statü',
      'Ülke',
      'İl',
      'İlçe',
      'Hiyerarşi',
    ]
    const rows = records.map((b) => [
      b.detsisNo,
      b.birimAdi,
      b.ingilizceAdi,
      b.kategoriAdi,
      b.statuAdi,
      b.ulkeAdi,
      b.ilAdi,
      b.ilceAdi,
      b.kurumHiyerarsisi,
    ])
    const sep = ';'
    const escape = (v) => {
      if (v == null) return ''
      let s = String(v)
      // strip control chars Excel chokes on, normalise newlines
      s = s.replace(/\r\n|\n|\r/g, ' ').replace(/\t/g, ' ')
      if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
        s = '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }
    const lines = [headers, ...rows].map((row) => row.map(escape).join(sep))
    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    triggerDownload(blob, `detsis_${buildFilenameSlug()}.csv`)
  }

  const COLS = [
    { key: null, label: '#', sortable: false },
    { key: 'detsisNo', label: 'DETSİS No' },
    { key: 'birimAdi', label: 'Birim Adı' },
    { key: 'kategoriAdi', label: 'Kategori' },
    { key: 'statuAdi', label: 'Statü' },
    { key: 'ilAdi', label: 'İl / İlçe' },
    { key: 'kurumHiyerarsisi', label: 'Hiyerarşi' },
  ]

  return (
    <div className="app">
      <header className="hdr">
        <h1>DETSİS Birim Arama</h1>
        <span className="sub">
          API limit 100/sayfa · sonuçlar geldikçe ekrana akar, sayfalama anlık
        </span>
      </header>

      <form className="filters" onSubmit={onSubmit}>
        <div className="presets">
          <span className="presets-label">Hızlı:</span>
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.kategoriId}
              type="button"
              className={
                'preset' +
                (String(filters.kategoriId) === String(p.kategoriId) ? ' active' : '')
              }
              onClick={() => applyPreset(p)}
            >
              {p.ad}
            </button>
          ))}
        </div>

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

        <div className="row single">
          <label className="ustbirim">
            <span>
              Üst Birim (hiyerarşi) — yaz veya ağaçtan seç
              <button
                type="button"
                className="inline-clear"
                onClick={() => setTreeOpen((o) => !o)}
              >
                {treeOpen ? 'Ağacı gizle' : 'Ağaçtan seç'}
              </button>
              {selectedUstBirim && (
                <button type="button" className="clear inline-clear" onClick={clearUstBirim}>
                  Temizle
                </button>
              )}
            </span>
            <input
              type="text"
              value={ustBirimQuery}
              onChange={(e) => {
                setUstBirimQuery(e.target.value)
                setUstBirimOpen(true)
                if (selectedUstBirim) setSelectedUstBirim(null)
                if (filters.ustBirimId) setFilters((f) => ({ ...f, ustBirimId: '' }))
              }}
              onFocus={() => setUstBirimOpen(true)}
              onBlur={() => setTimeout(() => setUstBirimOpen(false), 180)}
              placeholder="örn: Adalet Bakanlığı, Burak Ceyhan, İstanbul Büyükşehir"
            />
            {ustBirimOpen && ustBirimQuery.length >= 2 && (
              <ul className="dropdown wide">
                {ustBirimLoading && <li className="muted">Aranıyor…</li>}
                {!ustBirimLoading && ustBirimResults.length === 0 && (
                  <li className="muted">Sonuç yok.</li>
                )}
                {ustBirimResults.slice(0, 30).map((b) => (
                  <li
                    key={(b.id ?? b.detsisNo) + ':' + b.birimAdi}
                    onMouseDown={() => selectUstBirim(b)}
                  >
                    <strong>{b.birimAdi}</strong>
                    <em className="hier-line">{b.kurumHiyerarsisi}</em>
                  </li>
                ))}
                {ustBirimResults.length > 30 && (
                  <li className="muted">…{ustBirimResults.length - 30} kayıt daha</li>
                )}
              </ul>
            )}
            {selectedUstBirim && (
              <div className="picked">
                Seçili: <strong>{selectedUstBirim.birimAdi}</strong>
                <span className="hier-line"> · {selectedUstBirim.kurumHiyerarsisi}</span>
              </div>
            )}
            {treeOpen && (
              <Tree
                key={`${filters.ilId || ''}-${filters.ilceId || ''}`}
                ilId={filters.ilId}
                ilceId={filters.ilceId}
                ilAdi={iller.find((x) => String(x.uavtKod) === String(filters.ilId))?.uavtAd}
                ilceAdi={ilceler.find((x) => String(x.uavtKod) === String(filters.ilceId))?.uavtAd}
                onSelect={(b) => {
                  selectUstBirim(b)
                  setTreeOpen(false)
                }}
              />
            )}
          </label>
        </div>

        <div className="row">
          <label>
            <span>Bütçe Türü</span>
            <select
              value={filters.butceTuruId}
              onChange={(e) => update('butceTuruId', e.target.value)}
            >
              <option value="">— Tümü —</option>
              {BUTCE_TURLERI.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ad}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>
              Ata kategori filtreleri (her biri AND, hiyerarşinin herhangi bir seviyesinde)
              {anyParentLoading && <em className="muted-inline"> · yükleniyor…</em>}
            </span>
            <div className="combo">
              <select
                value={parentDraft}
                onChange={(e) => setParentDraft(e.target.value)}
              >
                <option value="">— Kategori seç —</option>
                {ROOT_CATEGORIES
                  .filter((c) => !parentFilters.some((pf) => String(pf.kategoriId) === String(c.id)))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ad}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="ghost"
                disabled={!parentDraft}
                onClick={() => {
                  const id = parentDraft
                  if (!id) return
                  if (parentFilters.some((pf) => String(pf.kategoriId) === String(id))) return
                  setParentFilters((arr) => [...arr, { kategoriId: id, mode: 'is' }])
                  setParentDraft('')
                }}
              >
                + Ekle
              </button>
            </div>
            {parentFilters.length > 0 && (
              <div className="parent-chips">
                {parentFilters.map((pf) => {
                  const cat = ROOT_CATEGORIES.find((c) => String(c.id) === String(pf.kategoriId))
                  const cached = parentNamesCache[String(pf.kategoriId)]
                  return (
                    <div
                      key={pf.kategoriId}
                      className={'parent-chip' + (pf.mode === 'not' ? ' not' : '')}
                    >
                      <span className="pc-name">{cat?.ad || `#${pf.kategoriId}`}</span>
                      {cached?.loading && <em className="muted-inline"> · yükleniyor…</em>}
                      {cached?.set && (
                        <em className="muted-inline">
                          {' '}· {cached.set.size.toLocaleString('tr-TR')} ad
                        </em>
                      )}
                      <div className="seg-toggle icon" role="group" aria-label="Eşleşme modu">
                        <button
                          type="button"
                          className={'seg ok' + (pf.mode === 'is' ? ' active' : '')}
                          onClick={() =>
                            setParentFilters((arr) =>
                              arr.map((x) =>
                                x.kategoriId === pf.kategoriId ? { ...x, mode: 'is' } : x
                              )
                            )
                          }
                          title="Atalarında bu kategori VARSA kalsın"
                          aria-label="Var"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className={'seg no' + (pf.mode === 'not' ? ' active' : '')}
                          onClick={() =>
                            setParentFilters((arr) =>
                              arr.map((x) =>
                                x.kategoriId === pf.kategoriId ? { ...x, mode: 'not' } : x
                              )
                            )
                          }
                          title="Atalarında bu kategori YOKSA kalsın"
                          aria-label="Yok"
                        >
                          ✗
                        </button>
                      </div>
                      <button
                        type="button"
                        className="pc-remove"
                        onClick={() =>
                          setParentFilters((arr) =>
                            arr.filter((x) => x.kategoriId !== pf.kategoriId)
                          )
                        }
                        aria-label="Kaldır"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </label>

          <label className="grow">
            <span>Birim Adı (opsiyonel)</span>
            <input
              type="text"
              value={filters.birimAdi}
              onChange={(e) => update('birimAdi', e.target.value)}
              placeholder="örn: zabıta"
            />
          </label>
        </div>

        <div className="row">
          <label className="grow">
            <span>Çekilecek</span>
            <select
              value={fetchLimit}
              onChange={(e) => {
                const v = e.target.value
                setFetchLimit(v === 'all' ? 'all' : Number(v))
              }}
              disabled={loading}
            >
              {FETCH_LIMIT_OPTIONS.map((o) => (
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
              Çek
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

      {anyParentLoading && (
        <div className="warn">
          <span>
            Ata kategori cache yükleniyor — filtre tüm cache'ler hazır olmadan
            tam etkili olmayacak. Şu an{' '}
            {readyParentFilters.length} / {parentFilters.length} hazır.
          </span>
        </div>
      )}

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
          <div className="result-toolbar">
            <input
              type="text"
              className="text-filter"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="🔍 Sonuçlarda ara: birim adı, hiyerarşi, statü, il, ilçe, DETSİS no…"
            />
            {textFilter && (
              <button
                type="button"
                className="ghost"
                onClick={() => setTextFilter('')}
              >
                Temizle
              </button>
            )}
          </div>

          <div className="meta">
            <strong>{dataset.totalCount.toLocaleString('tr-TR')}</strong> sonuç ·
            yüklendi: {totalLoaded.toLocaleString('tr-TR')} kayıt
            {dataset.complete ? '' : ' (akıyor…)'} ·
            {readyParentFilters.length > 0 && (
              <>
                {' '}ata filtresi:{' '}
                <strong>
                  {readyParentFilters
                    .map((pf) => {
                      const cat = ROOT_CATEGORIES.find(
                        (c) => String(c.id) === String(pf.kategoriId)
                      )
                      return (pf.mode === 'not' ? '!' : '') + (cat?.ad || pf.kategoriId)
                    })
                    .join(' ∧ ')}
                </strong>
                {' '}({parentFilteredAll.length.toLocaleString('tr-TR')}) ·
              </>
            )}
            {textFilter
              ? ` filtre eşleşmesi: ${totalRows.toLocaleString('tr-TR')} ·`
              : ''}
            {showAll
              ? ' tüm yüklenen kayıtlar'
              : ` sayfa ${safePage} / ${totalPages} (${effectivePageSize}/sayfa)`}

            <span className="ctrls">
              {sort.key && (
                <button type="button" className="ghost" onClick={clearSort}>
                  Sıralamayı temizle
                </button>
              )}
              <button type="button" className="ghost" onClick={downloadCsv}>
                CSV (Excel) indir
              </button>
              <button type="button" className="ghost" onClick={downloadJson}>
                JSON indir
              </button>
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
                  {COLS.map((c) => {
                    const active = sort.key === c.key
                    const arrow = !c.sortable && c.key === null
                      ? ''
                      : active
                        ? sort.dir === 'asc' ? ' ▲' : ' ▼'
                        : ' ↕'
                    if (c.sortable === false) return <th key={c.label}>{c.label}</th>
                    return (
                      <th
                        key={c.key}
                        className={'sortable' + (active ? ' active' : '')}
                        onClick={() => toggleSort(c.key)}
                        title="Sırala"
                      >
                        {c.label}<span className="arr">{arrow}</span>
                      </th>
                    )
                  })}
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
