/** Pedidos registrados en la hoja (Apps Script). Todo lo de aquí es puro salvo sendOrder y el almacenamiento. */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O ni 1/I para dictarlo por teléfono

export function newOrderId(random = Math.random, now = Date.now()) {
  let s = ''
  let t = Math.floor(now / 1000)
  for (let i = 0; i < 3; i++) {
    s = ALPHABET[t % ALPHABET.length] + s
    t = Math.floor(t / ALPHABET.length)
  }
  for (let i = 0; i < 3; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return `LK-${s}`
}

/** Celular peruano de 9 dígitos que empieza en 9, o número internacional de 10 a 15 dígitos. */
export function isValidPhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '')
  return /^9\d{8}$/.test(d) || /^519\d{8}$/.test(d) || (d.length >= 10 && d.length <= 15 && !d.startsWith('0'))
}

/** Lo que viaja a la hoja: qué se pide, nunca el precio (la hoja lo calcula). */
export function buildOrderPayload({ id, customer, consent, request }) {
  const items = request.packId
    ? [{ packId: request.packId }]
    : request.items.map((i) => ({ platformId: i.platformId, planId: i.planId, profiles: i.profiles }))
  return {
    type: 'order',
    id,
    customer: { name: customer.name.trim(), phone: customer.phone.trim() },
    consent: !!consent,
    items,
    source: 'web',
    website: '', // campo trampa: los bots lo llenan
  }
}

/** Envía el pedido sin esperar respuesta (Apps Script no permite leerla desde otro dominio). */
export function sendOrder(url, payload, fetchImpl = globalThis.fetch) {
  if (!url) return Promise.resolve(false)
  return fetchImpl(url, {
    method: 'POST',
    mode: 'no-cors',
    keepalive: true,
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
    .then(() => true)
    .catch(() => false)
}

const CUSTOMER_KEY = 'lokistream:customer'

export function loadCustomer() {
  try {
    const c = JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? 'null')
    return c && typeof c === 'object' ? { name: c.name ?? '', phone: c.phone ?? '', consent: !!c.consent } : null
  } catch {
    return null
  }
}

export function saveCustomer(c) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name: c.name, phone: c.phone, consent: !!c.consent }))
  } catch {
    /* sin almacenamiento: se pedirá de nuevo la próxima vez */
  }
}
