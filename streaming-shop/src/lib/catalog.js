import localSite from '../data/site.json'
import localPlatforms from '../data/platforms.json'
import localPacks from '../data/plans.json'
import localFaq from '../data/faq.json'
import { buildWaUrl } from './whatsapp.js'

/** Catálogo incluido en la web: se usa mientras carga la hoja o si la hoja no responde. */
export const LOCAL_CATALOG = { site: localSite, platforms: localPlatforms, packs: localPacks, faq: localFaq, version: 'local' }

export const CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'video', label: 'Películas y series' },
  { id: 'musica', label: 'Música' },
  { id: 'anime', label: 'Anime' },
]

export const CACHE_KEY = 'lokistream:catalog:v1'

export const minPrice = (platform) => Math.min(...platform.plans.map((p) => p.price / p.months))

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const darkInk = (hex) => /^#0a0a0d$/i.test(hex ?? '')

function validPlatform(p) {
  return (
    isObj(p) && typeof p.id === 'string' && p.id && typeof p.name === 'string' && p.name &&
    Array.isArray(p.plans) && p.plans.length > 0 &&
    p.plans.every((pl) => isObj(pl) && pl.id && isNum(pl.months) && pl.months > 0 && isNum(pl.price) && pl.price >= 0)
  )
}

/**
 * Une el catálogo que publica la hoja con el local: la hoja manda en textos y precios,
 * y el local aporta lo que la hoja no tiene (logos). Devuelve null si lo remoto no sirve.
 */
export function mergeCatalog(remote, local = LOCAL_CATALOG) {
  if (!isObj(remote) || !Array.isArray(remote.platforms)) return null
  const platforms = remote.platforms.filter(validPlatform).map((rp) => {
    const lp = local.platforms.find((p) => p.id === rp.id) ?? {}
    const merged = { ...lp }
    for (const [k, v] of Object.entries(rp)) if (v !== undefined) merged[k] = v
    merged.slug = merged.slug || merged.id
    merged.field = merged.field || merged.color || '#16161d'
    merged.color = merged.field
    merged.ink = merged.ink || '#ffffff'
    merged.tagline = merged.tagline || ''
    merged.features = Array.isArray(merged.features) ? merged.features : []
    if (!lp.id) merged.wordmarkTone = darkInk(merged.ink) ? 'black' : 'white'
    return merged
  })
  if (!platforms.length) return null
  const ids = new Set(platforms.map((p) => p.id))
  const packs = (Array.isArray(remote.packs) ? remote.packs : [])
    .filter((k) => isObj(k) && k.id && k.name && isNum(k.price) && Array.isArray(k.platforms))
    .map((k) => ({ ...k, platforms: k.platforms.filter((id) => ids.has(id)), perks: Array.isArray(k.perks) ? k.perks : [] }))
    .filter((k) => k.platforms.length > 0)
  const faq = (Array.isArray(remote.faq) ? remote.faq : []).filter((f) => isObj(f) && f.q && f.a)
  const site = { ...local.site }
  if (isObj(remote.site)) for (const [k, v] of Object.entries(remote.site)) if (v) site[k] = v
  return {
    site,
    platforms,
    packs,
    faq: faq.length ? faq : local.faq,
    version: String(remote.version ?? 'remote'),
    updatedAt: remote.updatedAt ?? null,
  }
}

export function readCachedCatalog(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(CACHE_KEY)
    return raw ? mergeCatalog(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeCachedCatalog(remote, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(remote))
  } catch {
    /* sin almacenamiento (modo privado): la web sigue funcionando */
  }
}

/** Pide el catálogo a la aplicación web de Apps Script. Lanza si no responde a tiempo. */
export async function fetchRemoteCatalog(url, { timeoutMs = 8000, fetchImpl = globalThis.fetch } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const sep = url.includes('?') ? '&' : '?'
    const res = await fetchImpl(`${url}${sep}action=catalog`, { signal: ctrl.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

/** Funciones de ayuda atadas a un catálogo concreto (lo que usan los componentes). */
export function catalogApi(catalog) {
  return {
    ...catalog,
    categories: CATEGORIES,
    minPrice,
    getPlatformById: (id) => catalog.platforms.find((p) => p.id === id),
    getPlatformBySlug: (slug) => catalog.platforms.find((p) => p.slug === slug),
    getPackById: (id) => catalog.packs.find((p) => p.id === id),
    waUrl: (text) => buildWaUrl(catalog.site.whatsapp, text),
  }
}
