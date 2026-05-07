import { useState } from 'react'
import { API_MAX_PAGE_SIZE } from './api.js'

const ROOT_CATEGORIES = [
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
]

const PAGE = API_MAX_PAGE_SIZE

async function fetchBirimlerPage(query, page) {
  const url =
    '/detsis/api/backoffice/unauthorizedaccessdata/birimler?' +
    new URLSearchParams({ ...query, page, pageSize: PAGE }).toString()
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
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

export default function Tree({ onSelect }) {
  const [nodes, setNodes] = useState({})
  const [expanded, setExpanded] = useState(new Set())

  function nodeKey(kind, id) {
    return `${kind}:${id}`
  }

  async function loadChildren(key, query, page = 1) {
    setNodes((n) => ({
      ...n,
      [key]: { ...(n[key] || {}), loading: true },
    }))
    try {
      const r = await fetchBirimlerPage(query, page)
      setNodes((n) => {
        const prev = n[key] || { items: [] }
        const items = page === 1 ? r.data : (prev.items || []).concat(r.data)
        const hasMore = items.length < r.totalCount
        return {
          ...n,
          [key]: {
            items,
            totalCount: r.totalCount,
            page,
            hasMore,
            loading: false,
          },
        }
      })
    } catch (e) {
      setNodes((n) => ({
        ...n,
        [key]: { ...(n[key] || {}), loading: false, error: e.message },
      }))
    }
  }

  function toggle(key, query) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        if (!nodes[key]?.items) loadChildren(key, query, 1)
      }
      return next
    })
  }

  function loadMore(key, query) {
    const cur = nodes[key]
    if (!cur || cur.loading) return
    loadChildren(key, query, (cur.page || 1) + 1)
  }

  return (
    <div className="tree">
      <div className="tree-hint">
        Ağaçtan birim seç. Tıkla → seç. ▶ ile alt birimleri aç.
      </div>
      <ul className="tree-list">
        {ROOT_CATEGORIES.map((c) => {
          const key = nodeKey('kat', c.id)
          const isOpen = expanded.has(key)
          const node = nodes[key]
          return (
            <li key={key} className="tree-node root">
              <div className="tree-row">
                <button
                  type="button"
                  className="caret"
                  onClick={() => toggle(key, { KategoriId: c.id })}
                  aria-label={isOpen ? 'Kapat' : 'Aç'}
                >
                  {isOpen ? '▼' : '▶'}
                </button>
                <span className="tree-label kat">{c.ad}</span>
                {node?.totalCount != null && (
                  <span className="tree-count">{node.totalCount.toLocaleString('tr-TR')}</span>
                )}
              </div>
              {isOpen && (
                <BirimList
                  parentKey={key}
                  query={{ KategoriId: c.id }}
                  node={node}
                  nodes={nodes}
                  expanded={expanded}
                  toggle={toggle}
                  loadMore={loadMore}
                  onSelect={onSelect}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BirimList({ parentKey, query, node, nodes, expanded, toggle, loadMore, onSelect }) {
  if (!node) return <div className="tree-loading">Yükleniyor…</div>
  if (node.loading && !node.items) return <div className="tree-loading">Yükleniyor…</div>
  if (node.error) return <div className="tree-error">Hata: {node.error}</div>
  const items = node.items || []
  if (items.length === 0) return <div className="tree-empty">Alt birim yok.</div>

  return (
    <ul>
      {items.map((b) => {
        const key = `bir:${b.id ?? b.detsisNo}`
        const isOpen = expanded.has(key)
        const child = nodes[key]
        return (
          <li key={key} className="tree-node">
            <div className="tree-row">
              <button
                type="button"
                className="caret"
                onClick={() => toggle(key, { ustBirimId: b.id ?? b.detsisNo })}
                aria-label={isOpen ? 'Kapat' : 'Aç'}
              >
                {isOpen ? '▼' : '▶'}
              </button>
              <button
                type="button"
                className="tree-pick"
                onClick={() => onSelect(b)}
                title="Bu birimi seç"
              >
                {b.birimAdi}
              </button>
              {child?.totalCount != null && (
                <span className="tree-count">{child.totalCount.toLocaleString('tr-TR')}</span>
              )}
            </div>
            {isOpen && (
              <BirimList
                parentKey={key}
                query={{ ustBirimId: b.id ?? b.detsisNo }}
                node={child}
                nodes={nodes}
                expanded={expanded}
                toggle={toggle}
                loadMore={loadMore}
                onSelect={onSelect}
              />
            )}
          </li>
        )
      })}
      {node.hasMore && (
        <li className="tree-more">
          <button
            type="button"
            disabled={node.loading}
            onClick={() => loadMore(parentKey, query)}
          >
            {node.loading
              ? 'Yükleniyor…'
              : `Daha yükle (${(node.totalCount - items.length).toLocaleString('tr-TR')} kaldı)`}
          </button>
        </li>
      )}
    </ul>
  )
}
