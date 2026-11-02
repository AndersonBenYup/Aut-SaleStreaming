import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import Button from '../components/ui/Button.jsx'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import QuantitySelector from '../components/ui/QuantitySelector.jsx'
import PlatformCard from '../components/home/PlatformCard.jsx'
import { IconCheck, IconWhatsApp, IconCart, IconBolt, IconShield, IconClock } from '../components/ui/Icons.jsx'
import { useCatalog } from '../context/CatalogContext.jsx'
import { useCheckout } from '../context/CheckoutContext.jsx'
import { formatPEN } from '../lib/format.js'
import { profilesLabel } from '../lib/whatsapp.js'
import { clampProfiles } from '../lib/cartReducer.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NotFound from './NotFound.jsx'

export default function PlatformDetail() {
  const { getPlatformBySlug } = useCatalog()
  const { slug } = useParams()
  const platform = getPlatformBySlug(slug)
  // Remount when the slug changes so plan/profile state resets per platform.
  return platform ? <Detail key={platform.id} platform={platform} /> : <NotFound />
}

function Detail({ platform }) {
  const { platforms, categories } = useCatalog()
  const { checkout } = useCheckout()
  usePageTitle(platform.name)
  const { add, open } = useCart()
  const [planId, setPlanId] = useState(platform.plans[0].id)
  const [profiles, setProfiles] = useState(1)
  const [added, setAdded] = useState(false)

  const plan = platform.plans.find((p) => p.id === planId)
  const total = plan.price * profiles
  const item = {
    platformId: platform.id,
    platformName: platform.name,
    planId: plan.id,
    planLabel: plan.label,
    unitPrice: plan.price,
    profiles,
  }
  const related = platforms.filter((p) => p.id !== platform.id && p.category === platform.category).slice(0, 4)
  const category = categories.find((c) => c.id === platform.category)?.label

  const handleAdd = () => {
    add(item)
    setAdded(true)
    open()
    setTimeout(() => setAdded(false), 1800)
  }

  return (
    <>
      <section className="relative">
        {/* The platform's own field and official logo, as on the home screen */}
        <div className="pb-10 pt-6 lg:pb-14" style={{ backgroundColor: platform.field, color: platform.ink }}>
          <div className="container-x">
            <nav aria-label="Ruta" className="text-sm">
              <Link to="/" className="opacity-75 hover:opacity-100">Inicio</Link>
              <span className="mx-2 opacity-50">/</span>
              <Link to="/#catalogo" className="opacity-75 hover:opacity-100">Catálogo</Link>
              <span className="mx-2 opacity-50">/</span>
              <span>{platform.name}</span>
            </nav>
            <div className="zap-in mt-10 h-[clamp(56px,9vw,110px)] lg:mt-14">
              <BrandLogo platform={platform} className="h-full w-auto max-w-[80%] text-[clamp(56px,9vw,110px)]" />
            </div>
          </div>
        </div>

        <div className="container-x grid gap-10 py-10 lg:grid-cols-[1.1fr_1fr] lg:py-16">
          <div className="animate-rise">
            <h1 className=" text-4xl font-bold sm:text-6xl">{platform.name}</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-300">{platform.description}</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {platform.features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-3 text-sm">
                  <IconCheck width={18} height={18} className="shrink-0 text-accent" /> {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:sticky lg:top-24 lg:-mt-40 lg:self-start">
            <div className="rounded-3xl border border-ink-700 bg-ink-900 p-5 sm:p-7">
              <fieldset>
                <legend className="text-sm font-semibold">Elige tu plan</legend>
                <div className="mt-3 grid gap-2">
                  {platform.plans.map((p) => {
                    const perMonth = p.price / p.months
                    const checked = p.id === planId
                    return (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 transition-colors ${
                          checked ? 'border-accent bg-accent/10' : 'border-ink-700 hover:border-ink-500'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="plan"
                            value={p.id}
                            checked={checked}
                            onChange={() => setPlanId(p.id)}
                            className="size-4 accent-[var(--color-accent)]"
                          />
                          <span>
                            <span className="block font-semibold">{p.label}</span>
                            {p.months > 1 && <span className="block text-xs text-ink-300">{formatPEN(perMonth)} al mes</span>}
                          </span>
                        </span>
                        <span className="font-display font-semibold tabular-nums">{formatPEN(p.price)}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm font-semibold">Cantidad de perfiles</span>
                <QuantitySelector value={profiles} onChange={(n) => setProfiles(clampProfiles(n))} />
              </div>

              <div className="mt-6 flex items-baseline justify-between rounded-2xl bg-ink-850 px-4 py-4">
                <span className="text-ink-300">{profilesLabel(profiles)} · {plan.label}</span>
                <span className="font-display text-3xl font-bold tabular-nums">{formatPEN(total)}</span>
              </div>

              <div className="mt-6 grid gap-2.5">
                <Button size="lg" variant="whatsapp" onClick={() => checkout({ items: [item] })}>
                  <IconWhatsApp /> Comprar ahora
                </Button>
                <Button size="lg" variant="ghost" onClick={handleAdd} aria-live="polite">
                  {added ? <><IconCheck /> Agregado</> : <><IconCart /> Agregar al carrito</>}
                </Button>
              </div>

              <ul className="mt-6 grid grid-cols-3 gap-2 text-center text-xs text-ink-300">
                <li className="flex flex-col items-center gap-1.5"><IconBolt className="text-accent" /> Entrega en minutos</li>
                <li className="flex flex-col items-center gap-1.5"><IconShield className="text-accent" /> Garantía total</li>
                <li className="flex flex-col items-center gap-1.5"><IconClock className="text-accent" /> Soporte 24/7</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="container-x py-12">
          <h2 className="text-2xl font-semibold">También te puede interesar</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => <PlatformCard key={p.id} platform={p} />)}
          </div>
        </section>
      )}
    </>
  )
}
