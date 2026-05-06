const BASE = '/detsis/api/backoffice'

async function get(path) {
  const r = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
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

export function getBirimler(filters) {
  const qs = new URLSearchParams()
  qs.set('page', filters.page ?? 1)
  qs.set('pageSize', filters.pageSize ?? 15)
  if (filters.ilId) qs.set('ilId', filters.ilId)
  if (filters.ilceId) qs.set('ilceId', filters.ilceId)
  if (filters.kategoriId) qs.set('KategoriId', filters.kategoriId)
  if (filters.statuId) qs.set('StatuId', filters.statuId)
  if (filters.birimAdi) qs.set('birimAdi', filters.birimAdi)
  return get('/unauthorizedaccessdata/birimler?' + qs.toString())
}
