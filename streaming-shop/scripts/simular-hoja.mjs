// Simula la aplicación web de Apps Script en local, con la MISMA lógica (apps-script/*.js) y la hoja
// sembrada en memoria. Sirve para desarrollar y probar sin Google.
//   npm run hoja:mock            → http://localhost:8787/exec
//   VITE_SHEETS_API_URL=http://localhost:8787/exec npm run dev
// Extras de prueba: GET /exec?action=precio&plataforma=netflix&plan=1m&valor=19  (cambia un precio)
//                   GET /exec?action=pedidos                                       (lista los pedidos recibidos)
// Vendedor de WhatsApp: la clave del bot es BOT_API_KEY (por defecto "clave-bot-de-prueba-123").
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps-script')
const G = vm.createContext({ console })
for (const f of ['Config.js', 'Util.js', 'Catalog.js', 'Orders.js', 'Fulfillment.js', 'Seed.js']) {
  vm.runInContext(readFileSync(join(dir, f), 'utf8'), G, { filename: f })
}

const tables = Object.fromEntries(
  ['AJUSTES', 'PLATAFORMAS', 'PLANES', 'PACKS', 'FAQ'].map((k) => [k, [G.HEADERS[k], ...G.SEED[k]]]),
)
const orders = []
const port = Number(process.env.PORT || 8787)
const BOT_KEY = process.env.BOT_API_KEY || 'clave-bot-de-prueba-123'
const isBot = (k) => typeof k === 'string' && k === BOT_KEY

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body, null, 2))
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  if (url.pathname !== '/exec') return send(res, 404, { ok: false })
  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || 'catalog'
    if (action === 'catalog') return send(res, 200, G.publicCatalog(G.buildCatalog(tables), new Date().toISOString()))
    if (action === 'pedidos') return send(res, 200, orders)
    if (action === 'bot_catalog') {
      if (!isBot(url.searchParams.get('key'))) return send(res, 200, { ok: false, error: 'No autorizado' })
      const c = G.buildCatalog(tables)
      return send(res, 200, { ok: true, site: c.site, payment: c.settings['INSTRUCCIONES DE PAGO'], platforms: c.platforms, packs: c.packs, faq: c.faq })
    }
    if (action === 'precio') {
      const row = tables.PLANES.find((r) => r[0] === url.searchParams.get('plataforma') && r[1] === url.searchParams.get('plan'))
      if (!row) return send(res, 404, { ok: false, error: 'No existe ese plan' })
      row[4] = Number(url.searchParams.get('valor'))
      return send(res, 200, { ok: true, cambiado: row })
    }
    return send(res, 400, { ok: false, error: 'Acción desconocida' })
  }
  if (req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let payload
      try {
        payload = JSON.parse(body)
      } catch {
        return send(res, 400, { ok: false, error: 'JSON inválido' })
      }
      if (payload.type === 'payment_claim') {
        if (!isBot(payload.botKey)) return send(res, 200, { ok: false, error: 'No autorizado' })
        const o = orders.find((x) => x.id === String(payload.id || '').toUpperCase())
        if (!o) return send(res, 200, { ok: false, error: 'Pedido no encontrado' })
        o.estado = 'Por verificar'
        o.notas = G.paymentClaimSummary(payload, o.total)
        console.log(`✓ comprobante ${o.id}: ${o.notas}`)
        return send(res, 200, { ok: true, id: o.id, status: o.estado })
      }
      const catalog = G.buildCatalog(tables)
      const r = G.priceOrder(payload, catalog, '51', { trusted: isBot(payload.botKey) })
      if (!r.ok) {
        console.log('✗ pedido rechazado:', r.error)
        return send(res, 200, r)
      }
      if (!orders.some((o) => o.id === r.order.id)) orders.push({ ...r.order, detalle: G.orderDetail(r.order), estado: 'Nuevo' })
      console.log(`✓ pedido ${r.order.id} · ${r.order.name} · ${r.order.phone} · S/ ${r.order.total}\n${G.orderDetail(r.order)}`)
      send(res, 200, { ok: true, id: r.order.id, total: r.order.total })
    })
    return
  }
  send(res, 405, { ok: false })
}).listen(port, () => console.log(`Hoja simulada en http://localhost:${port}/exec`))
