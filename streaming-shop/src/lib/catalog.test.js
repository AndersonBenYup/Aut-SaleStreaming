import { describe, it, expect, vi } from 'vitest'
import { LOCAL_CATALOG, mergeCatalog, readCachedCatalog, writeCachedCatalog, fetchRemoteCatalog, catalogApi } from './catalog.js'
import { buildOrderPayload, isValidPhone, newOrderId, sendOrder } from './orders.js'
import { cartMessage, packMessage } from './whatsapp.js'

const remote = {
  version: 'v2',
  site: { brand: 'LokiStream', whatsapp: '51911111111', city: '' },
  platforms: [
    { id: 'netflix', name: 'Netflix', slug: 'netflix', plans: [{ id: '1m', label: '1 mes', months: 1, price: 19 }], field: '#b1060f', ink: '#ffffff' },
    { id: 'vix', name: 'ViX Premium', slug: 'vix', plans: [{ id: '1m', label: '1 mes', months: 1, price: 8 }], field: '#f5a623', ink: '#0a0a0d' },
    { id: 'rota', name: 'Sin planes', plans: [] },
  ],
  packs: [{ id: 'p', name: 'Pack', price: 20, period: 'mes', platforms: ['netflix', 'max'], perks: [] }],
  faq: [{ q: '¿Hola?', a: 'Sí' }],
}

function memoryStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}

describe('mergeCatalog', () => {
  it('la hoja manda en precios y textos; el local aporta los logos', () => {
    const c = mergeCatalog(remote)
    const netflix = c.platforms.find((p) => p.id === 'netflix')
    expect(netflix.plans[0].price).toBe(19)
    expect(netflix.wordmark).toBe(LOCAL_CATALOG.platforms[0].wordmark)
    expect(c.site.whatsapp).toBe('51911111111')
    expect(c.site.city).toBe(LOCAL_CATALOG.site.city) // vacío en la hoja → se conserva el local
    expect(c.version).toBe('v2')
  })
  it('acepta plataformas nuevas sin logo y descarta las rotas', () => {
    const c = mergeCatalog(remote)
    expect(c.platforms.map((p) => p.id)).toEqual(['netflix', 'vix'])
    expect(c.platforms[1].wordmarkTone).toBe('black')
    expect(c.packs[0].platforms).toEqual(['netflix']) // max no está en la hoja
  })
  it('devuelve null si lo remoto no sirve', () => {
    expect(mergeCatalog(null)).toBeNull()
    expect(mergeCatalog({ platforms: [] })).toBeNull()
    expect(mergeCatalog({ platforms: [{ id: 'x', name: 'X', plans: [{ id: 'a', months: 1, price: 'gratis' }] }] })).toBeNull()
  })
  it('guarda y lee la caché sin romperse', () => {
    const storage = memoryStorage()
    expect(readCachedCatalog(storage)).toBeNull()
    writeCachedCatalog(remote, storage)
    expect(readCachedCatalog(storage).version).toBe('v2')
    storage.setItem('lokistream:catalog:v1', '{roto')
    expect(readCachedCatalog(storage)).toBeNull()
  })
  it('pide el catálogo con action=catalog y falla si la respuesta no es ok', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => remote })
    await expect(fetchRemoteCatalog('https://x/exec', { fetchImpl: ok })).resolves.toEqual(remote)
    expect(ok.mock.calls[0][0]).toBe('https://x/exec?action=catalog')
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    await expect(fetchRemoteCatalog('https://x/exec', { fetchImpl: bad })).rejects.toThrow('HTTP 500')
  })
  it('las ayudas usan el número de la hoja', () => {
    const api = catalogApi(mergeCatalog(remote))
    expect(api.waUrl('hola')).toBe('https://wa.me/51911111111?text=hola')
    expect(api.getPlatformBySlug('vix').name).toBe('ViX Premium')
  })
})

describe('pedidos desde la web', () => {
  it('genera códigos cortos que la hoja acepta', () => {
    const id = newOrderId(() => 0.5, 1_700_000_000_000)
    expect(id).toMatch(/^LK-[A-Z0-9]{6}$/)
    expect(newOrderId()).not.toBe(newOrderId())
  })
  it('valida celulares', () => {
    expect(isValidPhone('987 654 321')).toBe(true)
    expect(isValidPhone('+51 987654321')).toBe(true)
    expect(isValidPhone('12345')).toBe(false)
    expect(isValidPhone('887654321')).toBe(false)
  })
  it('manda qué se pide, nunca el precio', () => {
    const p = buildOrderPayload({
      id: 'LK-ABC123',
      customer: { name: ' Ana ', phone: '987654321' },
      consent: true,
      request: { items: [{ platformId: 'netflix', planId: '1m', profiles: 2, unitPrice: 15, platformName: 'Netflix' }] },
    })
    expect(p).toEqual({
      type: 'order', id: 'LK-ABC123', customer: { name: 'Ana', phone: '987654321' }, consent: true,
      items: [{ platformId: 'netflix', planId: '1m', profiles: 2 }], source: 'web', website: '',
    })
    expect(buildOrderPayload({ id: 'LK-X', customer: { name: 'a', phone: '1' }, request: { packId: 'pack-total' } }).items).toEqual([{ packId: 'pack-total' }])
  })
  it('envía sin esperar respuesta y no lanza si falla la red', async () => {
    const f = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(sendOrder('https://x/exec', { a: 1 }, f)).resolves.toBe(false)
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'POST', mode: 'no-cors', keepalive: true })
    await expect(sendOrder('', {}, f)).resolves.toBe(false)
  })
  it('incluye el código y el nombre en el mensaje de WhatsApp', () => {
    const msg = cartMessage([{ platformName: 'Netflix', planLabel: '1 mes', unitPrice: 15, profiles: 1 }], { orderId: 'LK-ABC123', customerName: 'Ana' })
    expect(msg.split('\n')[0]).toBe('Hola, quiero hacer este pedido (pedido LK-ABC123):')
    expect(msg).toContain('A nombre de: Ana')
    expect(packMessage({ name: 'Pack Cine', price: 35, period: 'mes' }, [], { orderId: 'LK-ABC123' })).toContain('(pedido LK-ABC123)')
  })
})
