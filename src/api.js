const BASE = '/detsis/api/backoffice'
export const API_MAX_PAGE_SIZE = 100

// Hardcoded list — Detsis exposes only filter usage, no listing endpoint.
// IDs verified by probing /birimler?butceTuruId=N totalCount + sample names.
export const BUTCE_TURLERI = [
  { id: 1, ad: 'Genel Bütçeli İdare' },
  { id: 3, ad: 'Özel Bütçeli İdare' },
  { id: 7, ad: 'Düzenleyici ve Denetleyici Kurum Bütçesi' },
  { id: 9, ad: 'Sosyal Güvenlik Kurumu Bütçesi' },
  { id: 10, ad: 'Mahalli İdare Bütçesi' },
  { id: 12, ad: 'Diğer (Bağlı Ortaklık / Şirket / Döner Sermaye)' },
]

// Reused by Tree (root nodes) and App (parent kategori filter).
// Whitespace-collapse + lowercase tr. Used to compare hierarchy segments
// against cached parent unit names so trailing tabs / double spaces don't
// cause false negatives.
export function normalizeName(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr')
}

export const ROOT_CATEGORIES = [
  { id: 17, ad: 'Cumhurbaşkanlığı' },
  { id: 19, ad: 'Bakanlık' },
  { id: 16, ad: 'TBMM Başkanlığı' },
  { id: 125, ad: 'Yüksek Yargı Kuruluşu' },
  { id: 210, ad: 'Bağımsız/Düzenleyici Denetleyici Kuruluş' },
  { id: 127, ad: 'Bağlı Kuruluş' },
  { id: 128, ad: 'İlgili Kuruluş' },
  { id: 129, ad: 'İlişkili Kuruluş' },
  { id: 131, ad: 'Koordine Kuruluş' },
  { id: 132, ad: 'Yükseköğretim Kurumu' },
  { id: 18, ad: 'Başbakanlık' },
  { id: 136, ad: 'Özelleştirme Kapsamındaki Kuruluş' },
  { id: 223, ad: 'Tasfiye Halinde Kuruluş' },
  { id: 204, ad: 'Belediye' },
  { id: 205, ad: 'İl Özel İdaresi' },
  { id: 202, ad: 'Mahalli İdarelere Bağlı Kuruluş' },
  { id: 221, ad: 'Mülki İdareye Bağlı Kuruluş' },
  { id: 214, ad: 'Şirket' },
]

const DEFAULT_RETRIES = 3
const REQUEST_TIMEOUT_MS = 25_000

async function get(path, signal) {
  const r = await fetch(BASE + path, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try {
      const j = await r.json()
      if (j?.Message) msg = j.Message
    } catch {}
    const err = new Error(msg)
    err.status = r.status
    throw err
  }
  return r.json()
}

function isRetryable(err) {
  if (err?.name === 'AbortError') return false
  if (err?.status && err.status >= 400 && err.status < 500) return false
  return true
}

async function getWithRetry(path, signal, retries = DEFAULT_RETRIES) {
  let attempt = 0
  let lastErr
  while (attempt <= retries) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const timeoutCtrl = new AbortController()
    const timer = setTimeout(() => timeoutCtrl.abort(), REQUEST_TIMEOUT_MS)
    const onUserAbort = () => timeoutCtrl.abort()
    signal?.addEventListener('abort', onUserAbort)

    try {
      return await get(path, timeoutCtrl.signal)
    } catch (e) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      lastErr = e
      if (!isRetryable(e) || attempt === retries) break
      const wait = 400 * 2 ** attempt + Math.random() * 250
      await new Promise((r) => setTimeout(r, wait))
      attempt++
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onUserAbort)
    }
  }
  throw lastErr
}

export function getIller() {
  return getWithRetry('/unauthorizedintegration/iller', undefined, 2)
}

export function getIlceler(ilId) {
  return getWithRetry(`/unauthorizedintegration/ilceler/${ilId}`, undefined, 2)
}

export function searchKategoriler(prefix) {
  return getWithRetry(
    `/unauthorizedaccessdata/tumkategoriler/${encodeURIComponent(prefix)}`,
    undefined,
    1
  )
}

export function searchBirimler(prefix) {
  return getWithRetry(
    `/unauthorizedaccessdata/tumbirimler/${encodeURIComponent(prefix)}`,
    undefined,
    1
  )
}

function buildBirimQuery(filters, page, pageSize) {
  const qs = new URLSearchParams()
  qs.set('page', page)
  qs.set('pageSize', pageSize)
  if (filters.ilId) qs.set('ilId', filters.ilId)
  if (filters.ilceId) qs.set('ilceId', filters.ilceId)
  if (filters.kategoriId) qs.set('KategoriId', filters.kategoriId)
  if (filters.statuId) qs.set('StatuId', filters.statuId)
  if (filters.birimAdi) qs.set('birimAdi', filters.birimAdi)
  if (filters.ustBirimId) qs.set('ustBirimId', filters.ustBirimId)
  if (filters.butceTuruId) qs.set('butceTuruId', filters.butceTuruId)
  return qs.toString()
}

function getBirimlerPage(filters, page, pageSize, signal, retries) {
  return getWithRetry(
    '/unauthorizedaccessdata/birimler?' + buildBirimQuery(filters, page, pageSize),
    signal,
    retries
  )
}

/**
 * Streaming aggregator. Splits requested range into 100-row API pages, fetches
 * with limited concurrency, retries failures. Calls `onChunk(rows, meta)`
 * for each chunk as it arrives (out of order under concurrency > 1).
 *
 * opts:
 *   offset       starting row index (default 0)
 *   limit        max rows to collect; 'all' or null to fetch every match
 *   signal       AbortSignal
 *   onChunk      called per arrived chunk: (rows, { totalCount })
 *   onProgress   called per chunk: ({ fetched, target, totalCount, failed })
 *   concurrency  parallel workers (default 3)
 *
 * returns { offset, totalCount, data (ordered), failedPages }
 */
export async function getBirimlerAggregate(filters, opts = {}) {
  const {
    offset = 0,
    limit = 'all',
    signal,
    onChunk,
    onProgress,
    concurrency = 3,
    chunkRetries = DEFAULT_RETRIES,
  } = opts

  const apiSize = API_MAX_PAGE_SIZE
  const startApiPage = Math.floor(offset / apiSize) + 1
  const skipInFirst = offset - (startApiPage - 1) * apiSize

  const first = await getBirimlerPage(filters, startApiPage, apiSize, signal, chunkRetries)
  const total = first.totalCount ?? 0
  const remainingMatch = Math.max(0, total - offset)
  const target =
    limit === 'all' || limit == null
      ? remainingMatch
      : Math.min(Number(limit), remainingMatch)

  if (target === 0) {
    return { offset, totalCount: total, data: [], failedPages: [] }
  }

  const firstSlice = first.data.slice(skipInFirst, skipInFirst + target)
  onChunk?.(firstSlice, { totalCount: total })
  onProgress?.({ fetched: firstSlice.length, target, totalCount: total, failed: 0 })

  if (firstSlice.length >= target) {
    return { offset, totalCount: total, data: firstSlice, failedPages: [] }
  }

  const consumedFromFirst = first.data.length - skipInFirst
  const remaining = target - consumedFromFirst
  const additionalPages = Math.ceil(remaining / apiSize)
  const lastApiPage = startApiPage + additionalPages

  const pageNums = []
  for (let p = startApiPage + 1; p <= lastApiPage; p++) pageNums.push(p)

  const buckets = new Array(pageNums.length).fill(null)
  const failedPages = []
  let cursor = 0

  async function worker() {
    while (cursor < pageNums.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const i = cursor++
      const apiPage = pageNums[i]
      try {
        const r = await getBirimlerPage(filters, apiPage, apiSize, signal, chunkRetries)
        const rows = r.data || []
        buckets[i] = rows
        onChunk?.(rows, { totalCount: total })
      } catch (e) {
        if (e?.name === 'AbortError') throw e
        failedPages.push(apiPage)
        buckets[i] = []
      }
      const fetchedSoFar =
        consumedFromFirst + buckets.reduce((acc, b) => acc + (b?.length || 0), 0)
      onProgress?.({
        fetched: Math.min(fetchedSoFar, target),
        target,
        totalCount: total,
        failed: failedPages.length,
      })
    }
  }

  const workerCount = Math.min(concurrency, pageNums.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  let ordered = firstSlice.slice()
  for (const bucket of buckets) {
    if (ordered.length >= target) break
    if (!bucket) continue
    ordered = ordered.concat(bucket.slice(0, target - ordered.length))
  }

  return {
    offset,
    totalCount: total,
    data: ordered,
    failedPages: failedPages.sort((a, b) => a - b),
  }
}
