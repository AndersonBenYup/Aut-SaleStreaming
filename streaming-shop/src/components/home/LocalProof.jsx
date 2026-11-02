import { useEffect, useRef } from 'react'
import { useCatalog } from '../../context/CatalogContext.jsx'
import './local-proof.css'

// LOKISTREAM en runas del futhark antiguo (trazos en una caja de 40×60).
const RUNES = [
  'M14 6V54M14 6L30 20', // L laguz
  'M20 6L33 22L8 54M20 6L7 22L32 54', // O othala
  'M30 10L12 30L30 50', // K kaunan
  'M20 6V54', // I isaz
  'M27 6L12 24L28 36L13 54', // S sowilo
  'M20 6V54M8 18L20 6L32 18', // T tiwaz
  'M12 6V54M12 6L28 16L12 28L28 54', // R raido
  'M10 54V6L20 20L30 6V54', // E ehwaz
  'M14 6V54M14 6L30 18M14 20L30 32', // A ansuz
  'M10 54V6L30 26M30 54V6L10 26', // M mannaz
]

/*
 * "Desde Trujillo" en la paleta del logo: panel negro verdoso, "Trujillo" en dorado y la firma
 * LOKISTREAM en runas que se enciende una sola vez. Sin fondos animados.
 */
export default function LocalProof() {
  const { site } = useCatalog()
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('is-in') // entradas y runas: una sola vez
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} aria-labelledby="local-title" className="px-4 pt-32 sm:px-8 lg:pt-44">
      <div className="lp-panel">
        <div className="relative grid gap-12 lg:grid-cols-12 lg:items-end lg:gap-8">
          <div className="lg:col-span-7">
            <h2 id="local-title" className="reveal font-display text-[clamp(40px,5.4vw,80px)] font-bold leading-[0.95] tracking-[-0.035em] text-ink-100">
              Desde <span className="text-[#f3d27a]">Trujillo</span>
            </h2>
            <p className="reveal mt-6 max-w-[44ch] text-lg leading-relaxed text-ink-100 sm:text-xl" style={{ '--d': '80ms' }}>
              Somos un equipo pequeño de {site.city}. Atendemos a todo el país por WhatsApp, {site.hours.toLowerCase()}, y la misma persona que te vende es la que te ayuda si algo falla.
            </p>
            <div className="mt-10 flex items-center gap-4">
              <div className="lp-runes" aria-hidden="true">
                {RUNES.map((d, i) => (
                  <svg key={i} viewBox="0 0 40 60" style={{ '--i': i }}>
                    <path d={d} className="lp-rune-base" />
                    <path d={d} className="lp-rune-lit" />
                  </svg>
                ))}
              </div>
              <span className="whitespace-nowrap text-sm text-[#7fa58c]">LokiStream, en runas</span>
            </div>
          </div>

          <dl className="reveal grid gap-8 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1 lg:justify-self-end" style={{ '--d': '140ms' }}>
            <div>
              <dt className="text-sm font-semibold tracking-wide text-[#d4a531]">Pagas con</dt>
              <dd className="mt-1.5 font-display text-2xl font-semibold text-ink-100">Yape, Plin o transferencia</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold tracking-wide text-[#d4a531]">Garantía</dt>
              <dd className="mt-1.5 font-display text-2xl font-semibold text-ink-100">Todo el periodo que pagaste</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}
