import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useCatalog } from './CatalogContext.jsx'
import { buildOrderPayload, isValidPhone, loadCustomer, newOrderId, saveCustomer, sendOrder } from '../lib/orders.js'
import { cartMessage, cartTotal, packMessage, profilesLabel } from '../lib/whatsapp.js'
import { formatPEN } from '../lib/format.js'
import { IconClose, IconWhatsApp, IconCheck } from '../components/ui/Icons.jsx'

const CheckoutContext = createContext(null)

/**
 * Un solo punto para comprar. checkout(request) recibe
 *   { items: [{ platformId, platformName, planId, planLabel, unitPrice, profiles }] }  o  { packId }
 * Si la hoja está conectada, pide nombre y celular, registra el pedido y abre WhatsApp con su código.
 * Si no, abre WhatsApp directo como antes.
 */
export function CheckoutProvider({ children }) {
  const catalog = useCatalog()
  const [request, setRequest] = useState(null)

  const messageFor = useCallback(
    (req, opts) => {
      if (req.packId) {
        const pack = catalog.getPackById(req.packId)
        const names = pack.platforms.map((id) => catalog.getPlatformById(id)?.name).filter(Boolean)
        return packMessage(pack, names, opts)
      }
      return cartMessage(req.items, opts)
    },
    [catalog],
  )

  const checkout = useCallback(
    (req, { onDone } = {}) => {
      if (!catalog.apiUrl) {
        window.open(catalog.waUrl(messageFor(req)), '_blank', 'noopener,noreferrer')
        onDone?.()
        return
      }
      setRequest({ ...req, onDone })
    },
    [catalog, messageFor],
  )

  const value = useMemo(() => ({ checkout }), [checkout])
  return (
    <CheckoutContext.Provider value={value}>
      {children}
      {request && <CheckoutDialog request={request} messageFor={messageFor} onClose={() => setRequest(null)} />}
    </CheckoutContext.Provider>
  )
}

export function useCheckout() {
  const ctx = useContext(CheckoutContext)
  if (!ctx) throw new Error('useCheckout must be used inside <CheckoutProvider>')
  return ctx
}

function CheckoutDialog({ request, messageFor, onClose }) {
  const catalog = useCatalog()
  const saved = loadCustomer()
  const [form, setForm] = useState({ name: saved?.name ?? '', phone: saved?.phone ?? '', consent: saved?.consent ?? false })
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(null) // { id, url }
  const panel = useRef(null)
  const uid = useId()

  const pack = request.packId ? catalog.getPackById(request.packId) : null
  const lines = pack
    ? [{ key: pack.id, label: pack.name, detail: `${pack.platforms.length} plataformas · 1 ${pack.period}`, total: pack.price }]
    : request.items.map((i) => ({
        key: `${i.platformId}:${i.planId}`,
        label: i.platformName,
        detail: `${profilesLabel(i.profiles)} × ${i.planLabel}`,
        total: i.unitPrice * i.profiles,
      }))
  const total = pack ? pack.price : cartTotal(request.items)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('input')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const submit = (e) => {
    e.preventDefault()
    const next = {}
    if (form.name.trim().length < 2) next.name = 'Escribe tu nombre.'
    if (!isValidPhone(form.phone)) next.phone = 'Escribe un celular válido, por ejemplo 987 654 321.'
    setErrors(next)
    if (next.name || next.phone) return

    saveCustomer(form)
    const id = newOrderId()
    sendOrder(catalog.apiUrl, buildOrderPayload({ id, customer: form, consent: form.consent, request }))
    const url = catalog.waUrl(messageFor(request, { orderId: id, customerName: form.name }))
    // Se abre dentro del mismo clic para que el navegador no lo bloquee.
    // (con 'noopener' window.open devuelve null siempre, por eso se corta el opener a mano)
    const win = window.open(url, '_blank')
    if (win) win.opener = null
    else window.location.href = url
    setSent({ id, url })
    request.onDone?.()
  }

  const field = 'mt-1.5 w-full rounded-2xl bg-ink-850 px-4 py-3 text-base text-ink-100 placeholder:text-ink-500 outline-none ring-accent focus:ring-2 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-400'

  return (
    <div className="fixed inset-0 z-[80] grid items-end sm:place-items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="animate-rise relative max-h-[92svh] w-full overflow-y-auto rounded-t-[28px] bg-ink-900 p-5 sm:max-w-md sm:rounded-[28px] sm:p-7"
      >
        <button type="button" onClick={onClose} className="press absolute right-4 top-4 grid size-10 place-items-center rounded-full hover:bg-ink-800" aria-label="Cerrar">
          <IconClose />
        </button>

        {sent ? (
          <div className="pt-2">
            <span className="grid size-12 place-items-center rounded-full bg-wa text-ink-950"><IconCheck /></span>
            <h2 id={`${uid}-title`} className="mt-5 font-display text-[28px] font-bold leading-tight tracking-tight">Pedido {sent.id}</h2>
            <p className="mt-2 text-ink-100">
              Lo registramos y abrimos WhatsApp con tu pedido. Envía el mensaje y te pasamos los datos de pago.
            </p>
            <div className="mt-6 grid gap-2">
              <a href={sent.url} target="_blank" rel="noopener noreferrer" className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-wa font-semibold text-ink-950">
                <IconWhatsApp /> Abrir WhatsApp otra vez
              </a>
              <button type="button" onClick={onClose} className="press h-12 rounded-full bg-ink-800 font-semibold">Listo</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 id={`${uid}-title`} className="pr-10 font-display text-[28px] font-bold leading-tight tracking-tight">Tus datos para el pedido</h2>
            <p className="mt-1 text-ink-300">Los usamos para enviarte tu acceso y avisarte antes de que venza.</p>

            <ul className="mt-5 space-y-2 rounded-2xl bg-ink-850 p-4">
              {lines.map((l) => (
                <li key={l.key} className="flex items-baseline justify-between gap-3">
                  <span>
                    <span className="font-semibold">{l.label}</span>
                    <span className="block text-sm text-ink-300">{l.detail}</span>
                  </span>
                  <span className="font-display font-semibold tabular-nums">{formatPEN(l.total)}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between pt-2 text-lg">
                <span>Total</span>
                <span className="font-display text-2xl font-bold tabular-nums">{formatPEN(total)}</span>
              </li>
            </ul>

            <div className="mt-5">
              <label htmlFor={`${uid}-name`} className="text-sm font-semibold">Nombre</label>
              <input
                id={`${uid}-name`}
                className={field}
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value })
                  if (errors.name) setErrors({ ...errors, name: undefined })
                }}
                autoComplete="name"
                placeholder="Ej. Ana Torres"
                maxLength={80}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? `${uid}-name-err` : undefined}
              />
              {errors.name && <p id={`${uid}-name-err`} className="mt-1.5 text-sm text-red-400">{errors.name}</p>}
            </div>
            <div className="mt-4">
              <label htmlFor={`${uid}-phone`} className="text-sm font-semibold">Celular con WhatsApp</label>
              <input
                id={`${uid}-phone`}
                className={field}
                value={form.phone}
                onChange={(e) => {
                  setForm({ ...form, phone: e.target.value })
                  if (errors.phone) setErrors({ ...errors, phone: undefined })
                }}
                autoComplete="tel"
                inputMode="tel"
                placeholder="987 654 321"
                maxLength={20}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? `${uid}-phone-err` : undefined}
              />
              {errors.phone && <p id={`${uid}-phone-err`} className="mt-1.5 text-sm text-red-400">{errors.phone}</p>}
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-[15px] text-ink-100">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              Acepto que me avisen por WhatsApp o llamada cuando mi plan esté por vencer.
            </label>

            <button type="submit" className="press mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-wa font-semibold text-ink-950 transition-[filter] hover:brightness-110">
              <IconWhatsApp /> Enviar pedido por WhatsApp
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
