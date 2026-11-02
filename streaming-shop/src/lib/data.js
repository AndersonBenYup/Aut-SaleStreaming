import site from '../data/site.json'
import platforms from '../data/platforms.json'
import packs from '../data/plans.json'
import faq from '../data/faq.json'
import { buildWaUrl } from './whatsapp.js'

export { site, platforms, packs, faq }

export const categories = [
  { id: 'todos', label: 'Todos' },
  { id: 'video', label: 'Películas y series' },
  { id: 'musica', label: 'Música' },
  { id: 'anime', label: 'Anime' },
]

export const getPlatformBySlug = (slug) => platforms.find((p) => p.slug === slug)
export const getPlatformById = (id) => platforms.find((p) => p.id === id)
export const minPrice = (platform) => Math.min(...platform.plans.map((p) => p.price / p.months))

export const waUrl = (text) => buildWaUrl(site.whatsapp, text)
