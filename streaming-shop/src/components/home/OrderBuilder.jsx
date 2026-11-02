import { useMemo, useState } from 'react'
import BrandLogo from '../ui/BrandLogo.jsx'
import QuantitySelector from '../ui/QuantitySelector.jsx'
import { IconWhatsApp, IconCart } from '../ui/Icons.jsx'
import { useCatalog } from '../../context/CatalogContext.jsx'
import { useCheckout } from '../../context/CheckoutContext.jsx'
import { cartMessage, profilesLabel } from '../../lib/whatsapp.js'
import { formatPEN } from '../../lib/format.js'
import { clampProfiles } from '../../lib/cartReducer.js'
import { useCart } from '../../context/CartContext.jsx'
import { useReveal } from '../../lib/useReveal.js'

const dateFmt = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long' })
const addMonths = (months) => {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return dateFmt.format(d)
}

// How it works, shown as the real thing: what you pick on the left is, word for word,
// the WhatsApp message on the right, followed by an example of how the access arrives.
export default function OrderBuilder() {
  const { platforms, site } = useCatalog()
  const { checkout } = useCheckout()
  const ref = useReveal()
  const { add, open } = useCart()
  const [platformId, setPlatformId] = useState('netflix')
  const [planId, setPlanId] = useState('1m')
  const [profiles, setProfiles] = useState(2)

  const platform = platforms.find((p) => p.id === platformId) ?? platforms[0]
  const plan = platform.plans.find((p) => p.id === planId) ?? platform.plans[0]
  const item = useMemo(
    () => ({
      platformId: platform.id,
      platformName: platform.name,
      planId: plan.id,
      planLabel: plan.label,
      unitPrice: plan.price,
      profiles,
    }),
    [platform, plan, profiles],
  )
  const message = cartMessage([item])
  const total = plan.price * profiles

  const pickPlatform = (p) => {
    setPlatformId(p.id)
    if (!p.plans.some((x) => x.id === planId)) setPlanId(p.plans[0].id)
  }

  return (
    <section id="como" ref={ref} aria-labelledby="como-title" className="px-4 pt-32 sm:px-8 lg:pt-44">
      <div className="grid gap-6 lg:grid-cols-12">
        <h2 id="como-title" className="reveal font-display text-[clamp(40px,5.4vw,80px)] font-bold leading-[0.95] tracking-[-0.035em] lg:col-span-7">
          Arma tu pedido
        </h2>
        <p className="reveal max-w-[44ch] self-end text-lg text-ink-100 lg:col-span-5" style={{ '--d': '80ms' }}>
          Así funciona: lo que elijas aquí es, palabra por palabra, el mensaje que nos llega por WhatsApp. Pagas y recibes tu acceso en minutos.
        </p>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-12 lg:gap-6">
        {/* Elige */}
        <div data-ui className="reveal space-y-10 lg:col-span-6" style={{ '--d': '120ms' }}>
          <fieldset>
            <legend className="font-display text-[28px] font-semibold tracking-tight">Elige la plataforma</legend>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {platforms.map((p) => {
                const on = p.id === platformId
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={p.name}
                    onClick={() => pickPlatform(p)}
                    className="press grid h-16 place-items-center overflow-hidden rounded-2xl px-2 transition-[background-color] duration-200 sm:h-20"
                    style={{ backgroundColor: on ? p.field : 'var(--color-ink-900)' }}
                  >
                    <BrandLogo
                      platform={p}
                      variant={p.mono ? 'mono' : 'icon'}
                      tone={on ? (p.ink === '#ffffff' ? 'white' : 'black') : 'white'}
                      className={`h-5 w-auto max-w-[84%] text-[20px] transition-opacity duration-200 sm:h-7 sm:text-[26px] ${on ? 'opacity-100' : 'opacity-60'}`}
                    />
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-display text-[28px] font-semibold tracking-tight">Por cuánto tiempo</legend>
            <div className="mt-4 flex flex-wrap gap-2">
              {platform.plans.map((p) => {
                const on = p.id === plan.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPlanId(p.id)}
                    className={`press h-12 rounded-full px-5 text-base font-semibold transition-colors duration-200 ${
                      on ? 'bg-ink-100 text-ink-950' : 'bg-ink-900 text-ink-100 hover:bg-ink-850'
                    }`}
                  >
                    {p.label} · {formatPEN(p.price)}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-display text-[28px] font-semibold tracking-tight" id="perfiles-label">Cuántos perfiles</p>
              <div className="mt-4">
                <QuantitySelector value={profiles} onChange={(n) => setProfiles(clampProfiles(n))} label="Cantidad de perfiles" />
              </div>
            </div>
            <p className="text-right">
              <span className="block text-base text-ink-300">{profilesLabel(profiles)} · {plan.label}</span>
              <span key={total} className="fade-swap block font-display text-[clamp(48px,5vw,72px)] font-bold leading-none tracking-[-0.03em] tabular-nums">
                {formatPEN(total)}
              </span>
            </p>
          </div>
        </div>

        {/* Pide y recibe: the real conversation */}
        <div className="reveal lg:col-span-5 lg:col-start-8" style={{ '--d': '200ms' }}>
          <div data-ui className="rounded-[28px] bg-[#0b141a] p-4 sm:p-5 lg:sticky lg:top-24">
            <div className="flex items-center gap-3 pb-4">
              <span className="grid size-10 place-items-center rounded-full bg-accent font-display font-bold text-ink-950">L</span>
              <span>
                <span className="block font-semibold text-ink-100">{site.brand}</span>
                <span className="block text-sm text-wa">en línea</span>
              </span>
            </div>

            <div className="space-y-2.5 rounded-2xl bg-[#111b21] p-3 text-[15px] leading-snug">
              <p key={message} className="fade-swap ml-auto w-[92%] whitespace-pre-line rounded-2xl rounded-tr-md bg-[#005c4b] px-3.5 py-3 text-ink-100">
                {message}
                <span className="mt-1 block text-right text-xs text-ink-300">Tú</span>
              </p>
              <p className="w-[86%] rounded-2xl rounded-tl-md bg-[#202c33] px-3.5 py-3 text-ink-100">
                Te paso el Yape para pagar {formatPEN(total)}. Apenas lo confirmo te envío tu acceso.
              </p>
              <p key={`${platform.id}-${plan.id}`} className="fade-swap w-[86%] rounded-2xl rounded-tl-md bg-[#202c33] px-3.5 py-3 text-ink-100">
                Listo. Tu acceso a {platform.name}: {profiles === 1 ? 'tu perfil personal' : `${profiles} perfiles personales`} con PIN propio, con garantía hasta el {addMonths(plan.months)}.
                <span className="mt-1 block text-xs text-ink-300">Ejemplo de entrega</span>
              </p>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => checkout({ items: [item] })}
                className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-wa px-5 font-semibold text-ink-950 transition-[filter] hover:brightness-110"
              >
                <IconWhatsApp /> Enviar este pedido
              </button>
              <button
                type="button"
                onClick={() => {
                  add(item)
                  open()
                }}
                className="press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink-800 px-5 font-semibold text-ink-100 transition-colors hover:bg-ink-700"
              >
                <IconCart /> Al carrito
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
