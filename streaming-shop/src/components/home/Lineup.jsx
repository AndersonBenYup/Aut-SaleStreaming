import { Link } from 'react-router-dom'
import BrandLogo from '../ui/BrandLogo.jsx'
import { useCatalog } from '../../context/CatalogContext.jsx'
import { formatPEN } from '../../lib/format.js'
import { useReveal } from '../../lib/useReveal.js'

const priceFor = (p, months) => p.plans.find((x) => x.months === months)?.price

// The catalogue as a programme: one type size, fixed column starts, no boxes, no lines.
export default function Lineup() {
  const { platforms } = useCatalog()
  const ref = useReveal()
  return (
    <section id="catalogo" ref={ref} aria-labelledby="catalogo-title" className="scroll-mt-20 px-4 pt-32 sm:px-8 lg:pt-44">
      <div className="grid gap-6 lg:grid-cols-12">
        <h2 id="catalogo-title" className="reveal font-display text-[clamp(40px,5.4vw,80px)] font-bold leading-[0.95] tracking-[-0.035em] lg:col-span-7">
          Plataformas y precios
        </h2>
        <p className="reveal max-w-[44ch] self-end text-lg text-ink-100 lg:col-span-5" style={{ '--d': '80ms' }}>
          Precio por perfil personal, con tu propio PIN. Puedes pedir hasta seis perfiles de cada plataforma.
        </p>
      </div>

      <div className="mt-14 hidden px-3 pb-3 text-base text-ink-300 lg:grid lg:grid-cols-12 lg:gap-6" aria-hidden="true">
        <span className="col-span-4">Plataforma</span>
        <span className="col-span-4">Incluye</span>
        <span className="col-span-2 text-right">1 mes</span>
        <span className="col-span-2 text-right">3 meses</span>
      </div>

      <ul className="mt-8 lg:mt-0">
        {platforms.map((p, i) => (
          <li key={p.id} className="reveal" style={{ '--d': `${120 + i * 50}ms` }}>
            <Link
              to={`/plataforma/${p.slug}`}
              className="group grid grid-cols-[56px_1fr_auto] items-center gap-x-4 gap-y-1 py-4 transition-[background-color] duration-200 hover:bg-ink-900 focus-visible:bg-ink-900 lg:grid-cols-12 lg:gap-6 lg:px-3 lg:py-5"
            >
              <span className="flex items-center gap-5 lg:col-span-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl transition-transform duration-300 ease-[var(--ease-out)] group-hover:scale-105" style={{ backgroundColor: p.field }}>
                  <BrandLogo platform={p} variant="icon" tone={p.wordmarkTone === 'black' ? 'black' : p.field === '#f1f1f1' ? 'color' : 'white'} className="h-7 w-auto max-w-10 text-[28px]" />
                </span>
                <span className="hidden font-display text-[clamp(20px,2.1vw,30px)] font-semibold tracking-tight lg:inline">{p.name}</span>
              </span>
              <span className="font-display text-xl font-semibold tracking-tight lg:hidden">{p.name}</span>
              <span className="text-base text-ink-300 lg:col-span-4 lg:text-[clamp(18px,1.5vw,22px)] lg:text-ink-100 max-lg:col-start-2 max-lg:row-start-2">
                {p.tagline}
              </span>
              <span className="text-right font-display text-lg font-semibold tabular-nums lg:col-span-2 lg:text-[clamp(20px,2.1vw,30px)] max-lg:col-start-3 max-lg:row-start-1">
                {formatPEN(priceFor(p, 1))}
              </span>
              <span className="text-right text-base tabular-nums text-ink-300 lg:col-span-2 lg:font-display lg:text-[clamp(20px,2.1vw,30px)] lg:font-semibold lg:text-ink-100 max-lg:col-start-3 max-lg:row-start-2">
                <span className="lg:hidden">3 meses </span>
                {priceFor(p, 3) ? formatPEN(priceFor(p, 3)) : '—'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
