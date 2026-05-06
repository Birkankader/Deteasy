const BASE = '/detsis/api/backoffice'
export const API_MAX_PAGE_SIZE = 100

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
    throw new Error(msg)
  }
  return r.json()
}

export function getIller() {
  return get('/unauthorizedintegration/iller')
}

export function getIlceler(ilId) {
  return get(`/unauthorizedintegration/ilceler/${ilId}`)
}

export function searchKategoriler(prefix) {
  return get(`/unauthorizedaccessdata/tumkategoriler/${encodeURIComponent(prefix)}`)
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
  return qs.toString()
}

function getBirimlerPage(filters, page, pageSize, signal) {
  return get('/unauthorizedaccessdata/birimler?' + buildBirimQuery(filters, page, pageSize), signal)
}

/**
 * Fetches up to `uiPageSize` rows starting at offset (uiPage-1)*uiPageSize.
 * Backend caps pageSize at 100; this aggregator splits into 100-row API pages
 * and runs them with limited concurrency.
 *
 * If uiPageSize === 'all', fetches every row matching the filters.
 *
 * onProgress({ fetched, target, totalCount }) called after each chunk.
 */
export async function getBirimlerAggregate(filters, opts = {}) {
  const { signal, onProgress, concurrency = 5 } = opts
  const uiPage = Math.max(1, Number(filters.page) || 1)
  const apiSize = API_MAX_PAGE_SIZE
  const wantAll = filters.pageSize === 'all'
  const uiSize = wantAll ? Infinity : Number(filters.pageSize) || 15

  const offset = wantAll ? 0 : (uiPage - 1) * uiSize
  const startApiPage = Math.floor(offset / apiSize) + 1
  const skipInFirst = offset - (startApiPage - 1) * apiSize

  const first = await getBirimlerPage(filters, startApiPage, apiSize, signal)
  const total = first.totalCount ?? 0
  const target = wantAll
    ? Math.max(0, total - offset)
    : Math.min(uiSize, Math.max(0, total - offset))

  if (target === 0) {
    return {
      page: uiPage,
      pageSize: wantAll ? total : uiSize,
      totalCount: total,
      data: [],
    }
  }

  const firstSlice = first.data.slice(skipInFirst, skipInFirst + target)
  let collected = firstSlice
  onProgress?.({ fetched: collected.length, target, totalCount: total })

  if (collected.length >= target) {
    return { page: uiPage, pageSize: wantAll ? total : uiSize, totalCount: total, data: collected.slice(0, target) }
  }

  const consumedFromFirst = first.data.length - skipInFirst
  const remaining = target - consumedFromFirst
  const additionalPages = Math.ceil(remaining / apiSize)
  const lastApiPage = startApiPage + additionalPages

  const pageNums = []
  for (let p = startApiPage + 1; p <= lastApiPage; p++) pageNums.push(p)

  const buckets = new Array(pageNums.length)
  let cursor = 0

  async function worker() {
    while (cursor < pageNums.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const i = cursor++
      const r = await getBirimlerPage(filters, pageNums[i], apiSize, signal)
      buckets[i] = r.data || []
      const fetchedSoFar = consumedFromFirst + buckets.reduce((acc, b) => acc + (b?.length || 0), 0)
      onProgress?.({
        fetched: Math.min(fetchedSoFar, target),
        target,
        totalCount: total,
      })
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pageNums.length) }, () => worker())
  await Promise.all(workers)

  for (const bucket of buckets) {
    if (collected.length >= target) break
    if (!bucket) continue
    collected = collected.concat(bucket.slice(0, target - collected.length))
  }

  return {
    page: uiPage,
    pageSize: wantAll ? total : uiSize,
    totalCount: total,
    data: collected,
  }
}
