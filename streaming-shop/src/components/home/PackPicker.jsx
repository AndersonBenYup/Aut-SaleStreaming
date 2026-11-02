import { useState } from 'react'
import BrandLogo from '../ui/BrandLogo.jsx'
import { useCatalog } from '../../context/CatalogContext.jsx'
import { useCheckout } from '../../context/CheckoutContext.jsx'
import { formatPEN } from '../../lib/format.js'
import { useReveal } from '../../lib/useReveal.js'
import { IconWhatsApp } from '../ui/Icons.jsx'

const regularPrice = (pack, getPlatformById) =>
  pack.platforms.map(getPlatformById).reduce((s, p) => s + (p?.plans.find((x) => x.months === 1)?.price ?? 0), 0)

function Stage({ pack }) {
  const { getPlatformById } = useCatalog()
  const { checkout } = useCheckout()
  const included = pack.platforms.map(getPlatformById).filter(Boolean)
  const regular = regularPrice(pack, getPlatformById)
  return (
    <div key={pack.id} className="fade-swap">
      <p className="font-display text-[clamp(72px,20vw,150px)] font-bold leading-[0.85] tracking-[-0.045em] tabular-nums lg:text-[clamp(72px,9vw,150px)]">
        S/ {pack.price}
        <span className="ml-3 font-sans text-lg font-normal tracking-normal text-ink-300">al mes</span>
      </p>
      <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-ink-100">
        {pack.description} Incluye {included.map((p) => p.name).join(', ')}: {pack.perks.join(', ').toLowerCase()}.
        {regular > pack.price && <> Por separado pagarías {formatPEN(regular)}.</>}
      </p>
      <ul className="mt-6 flex flex-wrap gap-2" aria-label="Plataformas incluidas">
        {included.map((p) => (
          <li key={p.id} className="grid h-12 place-items-center rounded-xl px-3" style={{ backgroundColor: p.field }}>
            <BrandLogo platform={p} className="h-5 w-auto max-w-[96px] text-[20px]" />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => checkout({ packId: pack.id })}
        className="press mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-wa px-6 font-semibold text-ink-950 transition-[filter] hover:brightness-110 sm:w-auto"
      >
        <IconWhatsApp /> Pedir el {pack.name}
      </button>
    </div>
  )
}

// Plan names are the list; the price belongs to whichever name is selected.
export default function PackPicker() {
  const { packs } = useCatalog()
  const [selected, setSelected] = useState(packs[Math.floor(packs.length / 2)].id)
  const ref = useReveal()
  const current = packs.find((p) => p.id === selected)

  return (
    <section ref={ref} aria-labelledby="packs-title" className="px-4 pt-32 sm:px-8 lg:pt-44">
      <div className="grid gap-x-6 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <h2 id="packs-title" className="reveal font-display text-[clamp(40px,5.4vw,80px)] font-bold leading-[0.95] tracking-[-0.035em]">Packs del mes</h2>
          <ul className="mt-10" role="list">
            {packs.map((p, i) => {
              const on = p.id === selected
              return (
                <li key={p.id} className="reveal" style={{ '--d': `${80 + i * 70}ms` }}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(p.id)}
                    onFocus={() => setSelected(p.id)}
                    className={`flex w-full items-center gap-[0.3em] py-1 text-left font-display text-[clamp(36px,9vw,64px)] font-semibold leading-[1.15] tracking-[-0.03em] transition-colors duration-200 lg:text-[clamp(36px,3.6vw,64px)] ${
                      on ? 'text-ink-100' : 'text-ink-500 hover:text-ink-300'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`size-[0.3em] shrink-0 rounded-full bg-accent transition-[opacity,transform] duration-300 ease-[var(--ease-out)] ${on ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
                    />
                    {p.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="mt-10 lg:col-span-6 lg:mt-0">
          <div className="lg:sticky lg:top-28 lg:pt-[calc(clamp(40px,5.4vw,80px)+40px)]" aria-live="polite">
            <Stage pack={current} />
          </div>
        </div>
      </div>
    </section>
  )
}
