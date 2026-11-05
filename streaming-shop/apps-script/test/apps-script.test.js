import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// Carga los archivos puros de Apps Script en un contexto aislado, como los ve Google (todo global).
const dir = join(dirname(fileURLToPath(import.meta.url)), '..')
const ctx = vm.createContext({ console })
for (const f of ['Config.js', 'Util.js', 'Catalog.js', 'Orders.js', 'Fulfillment.js', 'Seed.js']) {
  vm.runInContext(readFileSync(join(dir, f), 'utf8'), ctx, { filename: f })
}
const G = ctx

// Copia las filas: así una prueba que edita la tabla no afecta a las siguientes.
const withHeader = (key, rows) => [G.HEADERS[key], ...rows.map((r) => [...r])]
const seedTables = () => ({
  AJUSTES: withHeader('AJUSTES', G.SEED.AJUSTES),
  PLATAFORMAS: withHeader('PLATAFORMAS', G.SEED.PLATAFORMAS),
  PLANES: withHeader('PLANES', G.SEED.PLANES),
  PACKS: withHeader('PACKS', G.SEED.PACKS),
  FAQ: withHeader('FAQ', G.SEED.FAQ),
})

describe('utilidades', () => {
  it('normaliza encabezados con tildes y símbolos', () => {
    expect(G.normalizeHeader('Contraseña ')).toBe('CONTRASENA')
    expect(G.normalizeHeader('Fecha de vencimiento')).toBe('FECHA DE VENCIMIENTO')
  })
  it('detecta la fila de encabezados aunque haya un título arriba', () => {
    const h = G.detectHeaderRow([['Mis ventas'], ['Cliente', 'Celular', 'Servicio']], G.FIELDS.VENTAS, 2)
    expect(h.row).toBe(1)
    expect(h.columns.telefono).toBe(1)
  })
  it('lee números, booleanos, fechas y teléfonos peruanos', () => {
    expect(G.toNumber('S/ 1,250.50')).toBe(1250.5)
    expect(G.toNumber('15,5')).toBe(15.5)
    expect(G.toBool('Sí')).toBe(true)
    expect(G.toBool('', true)).toBe(true)
    expect(G.toISODate(G.parseDate('02/12/2026'))).toBe('2026-12-02')
    expect(G.normalizePhone('987 654 321', '51')).toBe('51987654321')
    expect(G.normalizePhone('+51 987654321', '51')).toBe('51987654321')
    expect(G.normalizePhone('123', '51')).toBe('')
    expect(G.columnLetter(0)).toBe('A')
    expect(G.columnLetter(27)).toBe('AB')
  })
})

describe('catálogo desde la hoja', () => {
  it('reconstruye el catálogo de la web a partir de las pestañas sembradas', () => {
    const c = G.buildCatalog(seedTables())
    expect(c.errors).toEqual([])
    expect(c.site.brand).toBe('LokiStream')
    expect(c.platforms).toHaveLength(8)
    const netflix = c.platforms.find((p) => p.id === 'netflix')
    expect(netflix.plans.map((p) => p.price)).toEqual([15, 42, 80])
    expect(netflix.features).toContain('Calidad hasta 4K UHD')
    expect(c.packs.find((p) => p.id === 'pack-total').platforms).toEqual(['netflix', 'disney', 'max', 'prime', 'spotify'])
    expect(c.faq.length).toBe(8)
  })
  it('no publica filas inactivas o rotas y explica por qué', () => {
    const t = seedTables()
    t.PLATAFORMAS[1][11] = false // Netflix inactiva
    t.PLANES.push(['max', '', '', 'abc', '10', true]) // meses inválidos
    t.PACKS.push(['x', 'Pack Raro', 10, 'mes', '', 'inexistente', '', false, true])
    const c = G.buildCatalog(t)
    expect(c.platforms.find((p) => p.id === 'netflix')).toBeUndefined()
    expect(c.errors.map((e) => e.tab)).toEqual(expect.arrayContaining(['PLANES', 'PACKS']))
    // el pack total pierde Netflix pero se publica
    expect(c.packs.find((p) => p.id === 'pack-total').platforms).not.toContain('netflix')
  })
  it('elige color de texto legible si falta', () => {
    expect(G.inkFor('#1ed760')).toBe('#0a0a0d')
    expect(G.inkFor('#0c1b5c')).toBe('#ffffff')
  })
  it('la versión pública cambia solo si cambia el contenido', () => {
    const a = G.publicCatalog(G.buildCatalog(seedTables()))
    const b = G.publicCatalog(G.buildCatalog(seedTables()))
    expect(a.version).toBe(b.version)
    expect(a.settings).toBeUndefined()
  })
})

describe('pedidos', () => {
  const catalog = G.buildCatalog(seedTables())
  const base = { id: 'LK-AB12C', customer: { name: 'Ana Torres', phone: '987654321' }, consent: true }

  it('calcula el precio con la hoja, no con lo que manda el navegador', () => {
    const r = G.priceOrder({ ...base, items: [{ platformId: 'netflix', planId: '1m', profiles: 2, unitPrice: 1 }] }, catalog, '51')
    expect(r.ok).toBe(true)
    expect(r.order.total).toBe(30)
    expect(r.order.phone).toBe('51987654321')
  })
  it('cotiza packs y rechaza datos inválidos', () => {
    expect(G.priceOrder({ ...base, items: [{ packId: 'pack-total' }] }, catalog).order.total).toBe(55)
    expect(G.priceOrder({ ...base, id: 'hack', items: [{ packId: 'pack-total' }] }, catalog).ok).toBe(false)
    expect(G.priceOrder({ ...base, items: [{ platformId: 'netflix', planId: '1m', profiles: 9 }] }, catalog).ok).toBe(false)
    expect(G.priceOrder({ ...base, items: [{ platformId: 'nada', planId: '1m' }] }, catalog).ok).toBe(false)
    expect(G.priceOrder({ ...base, website: 'bot', items: [{ packId: 'pack-total' }] }, catalog).error).toBe('spam')
  })
  it('abre los packs en un perfil por plataforma con el precio repartido', () => {
    const r = G.priceOrder({ ...base, items: [{ packId: 'pack-cine' }] }, catalog)
    const lines = G.expandOrderLines(r.order, catalog)
    expect(lines.map((l) => l.platformName)).toEqual(['Netflix', 'Disney+', 'Max'])
    expect(lines[0].unitPrice).toBeCloseTo(35 / 3, 2)
  })
})

describe('regateo por WhatsApp (precio mínimo)', () => {
  const catalog = G.buildCatalog(seedTables())
  const base = { id: 'LK-WA12C', customer: { name: 'Luis Rojas', phone: '987654322' } }
  const netflix = (price) => ({ ...base, items: [{ platformId: 'netflix', planId: '1m', profiles: 1, price }] })

  it('lee PRECIO MINIMO de la hoja, pero nunca lo publica en la web', () => {
    const plan = catalog.platforms.find((p) => p.id === 'netflix').plans.find((p) => p.id === '1m')
    expect(plan.price).toBe(15)
    expect(plan.minPrice).toBe(14)
    const json = JSON.stringify(G.publicCatalog(catalog, 'x'))
    expect(json).not.toContain('minPrice')
    expect(catalog.platforms[0].plans[0].minPrice).toBeDefined() // el catálogo interno no se toca
  })
  it('acepta el precio acordado solo con la clave del bot y dentro del rango', () => {
    expect(G.priceOrder(netflix(14), catalog, '51', { trusted: true }).order.total).toBe(14)
    expect(G.priceOrder(netflix(13), catalog, '51', { trusted: true }).ok).toBe(false)
    expect(G.priceOrder(netflix(16), catalog, '51', { trusted: true }).ok).toBe(false)
    expect(G.priceOrder(netflix('abc'), catalog, '51', { trusted: true }).ok).toBe(false)
    // Desde la web (sin clave) el precio enviado se ignora y se cobra el de lista.
    expect(G.priceOrder(netflix(1), catalog, '51').order.total).toBe(15)
    expect(G.priceOrder({ ...base, items: [{ packId: 'pack-total', price: 1 }] }, catalog, '51', { trusted: true }).ok).toBe(false)
  })
  it('sin PRECIO MINIMO no hay rebaja, y un mínimo mayor al precio se ignora con aviso', () => {
    const t = seedTables()
    t.PLANES = [G.HEADERS.PLANES, ['netflix', '1m', '1 mes', 1, 15, true, ''], ['netflix', '3m', '3 meses', 3, 40, true, 99]]
    const c = G.buildCatalog(t)
    const plans = c.platforms.find((p) => p.id === 'netflix').plans
    expect(plans.map((p) => p.minPrice)).toEqual([15, 40])
    expect(c.errors.some((e) => /PRECIO MINIMO/.test(e.error))).toBe(true)
  })
  it('resume el comprobante y avisa si el monto no coincide', () => {
    expect(G.paymentClaimSummary({ method: 'Yape', amount: 14, operation: '00123', payer: 'Luis R.' }, 14)).toBe(
      'Comprobante Yape · S/ 14.00 · (coincide) · op. 00123 · de Luis R.'.replace(' · (coincide)', ' (coincide)'),
    )
    expect(G.paymentClaimSummary({ amount: 10 }, 14)).toMatch(/NO coincide/)
    expect(G.paymentClaimSummary({}, 14)).toMatch(/monto no legible/)
  })
})

describe('asignación de perfiles', () => {
  const today = new Date(2026, 10, 2)
  const accounts = [
    { _row: 2, estado: 'ACTIVA', servicio: 'NETFLIX', correo: 'n1@mail.com', contrasena: 'x1', perfiles: 5, fecha_vencimiento: new Date(2026, 11, 30), costo: 50 },
    { _row: 3, estado: 'ACTIVA', servicio: 'Netflix', correo: 'n2@mail.com', contrasena: 'x2', perfiles: 2, fecha_vencimiento: new Date(2027, 0, 30), costo: 20 },
    { _row: 4, estado: 'VENCIDA', servicio: 'Netflix', correo: 'n3@mail.com', contrasena: 'x3', perfiles: 5 },
    { _row: 5, estado: '', servicio: 'Disney Plus', correo: 'd1@mail.com', contrasena: 'y1', perfiles: 4 },
  ]
  const sales = [
    { correo: 'n2@mail.com', perfil: 'Perfil 1', fecha_vencimiento: new Date(2026, 11, 1), estado: 'ACTIVO' },
    { correo: 'n1@mail.com', perfil: 'Perfil 1', fecha_vencimiento: new Date(2026, 9, 1), estado: 'ACTIVO' }, // ya venció: libre
  ]
  const line = (platformName, profiles, months = 1) => ({ platformId: platformName.toLowerCase(), platformName, months, profiles, unitPrice: 15, planLabel: '1 mes' })

  it('llena primero la cuenta más ocupada y usa el primer número de perfil libre', () => {
    const r = G.allocateProfiles([line('Netflix', 2)], accounts, sales, today, 30)
    expect(r.ok).toBe(true)
    expect(r.assignments.map((a) => [a.account.email, a.profile])).toEqual([
      ['n2@mail.com', 'Perfil 2'],
      ['n1@mail.com', 'Perfil 1'],
    ])
    expect(G.toISODate(r.assignments[0].end)).toBe('2026-12-02')
    expect(r.assignments[0].account.costPerProfile).toBe(10)
  })
  it('reconoce "Disney Plus" como Disney+ e ignora cuentas vencidas', () => {
    expect(G.allocateProfiles([line('Disney+', 1)], accounts, [], today).ok).toBe(true)
    const r = G.allocateProfiles([line('Netflix', 7)], accounts, sales, today)
    expect(r.ok).toBe(false)
    expect(r.assignments).toEqual([])
    expect(r.missing).toEqual([{ platformName: 'Netflix', count: 1 }])
  })
  it('arma la fila de VENTAS y el mensaje con los accesos', () => {
    const order = { id: 'LK-AB12C', name: 'Ana Torres', phone: '51987654321', consent: true }
    const r = G.allocateProfiles([line('Netflix', 1)], accounts, sales, today)
    const row = G.saleRowFields(r.assignments[0], order)
    expect(row).toMatchObject({ cliente: 'Ana Torres', servicio: 'Netflix', perfil: 'Perfil 2', dias: 30, precio: 15, acepta_llamadas: 'SI', pedido: 'LK-AB12C' })
    const msg = G.credentialsMessage(order, r.assignments, 'LokiStream')
    expect(msg).toContain('Hola Ana, tu pedido LK-AB12C está listo.')
    expect(msg).toContain('Correo: n2@mail.com')
    expect(msg).toContain('vence el 02/12/2026')
  })
})
