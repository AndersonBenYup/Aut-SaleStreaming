import { formatPEN } from './format.js'

export function buildWaUrl(phone, text = '') {
  const digits = String(phone ?? '').replace(/\D/g, '')
  const query = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${digits}${query}`
}

export const profilesLabel = (n) => `${n} ${n === 1 ? 'perfil' : 'perfiles'}`

export function lineTotal(item) {
  return item.unitPrice * item.profiles
}

export function cartTotal(items) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0)
}

const orderTag = (orderId) => (orderId ? ` (pedido ${orderId})` : '')
const nameLine = (name) => (name ? [`A nombre de: ${name.trim()}`] : [])

export function cartMessage(items, { orderId, customerName } = {}) {
  if (!items.length) return 'Hola, quiero información sobre sus plataformas.'
  const lines = items.map(
    (i) => `• ${i.platformName} – ${profilesLabel(i.profiles)} × ${i.planLabel} – ${formatPEN(lineTotal(i))}`,
  )
  return [
    `Hola, quiero hacer este pedido${orderTag(orderId)}:`,
    ...lines,
    `Total: ${formatPEN(cartTotal(items))}`,
    ...nameLine(customerName),
    '¿Cómo realizo el pago?',
  ].join('\n')
}

export function packMessage(pack, platformNames = [], { orderId, customerName } = {}) {
  const incl = platformNames.length ? ` (${platformNames.join(', ')})` : ''
  const first = `Hola, me interesa el ${pack.name}${incl} a ${formatPEN(pack.price)} al ${pack.period}${orderTag(orderId)}. ¿Cómo lo activo?`
  return [first, ...nameLine(customerName)].join('\n')
}

export function contactMessage({ name, topic, message }) {
  const parts = [`Hola, soy ${name.trim()}.`]
  if (topic) parts.push(`Consulta sobre: ${topic}.`)
  if (message?.trim()) parts.push(message.trim())
  return parts.join('\n')
}
