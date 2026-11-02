import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../context/CatalogContext.jsx'
import { useReveal } from '../../lib/useReveal.js'

// Questions on the left; the answer is the large type and changes as the reader moves through them.
export default function FaqIndex() {
  const { faq } = useCatalog()
  const items = faq.slice(0, 6)
  const [active, setActive] = useState(0)
  const ref = useReveal()

  return (
    <section ref={ref} aria-labelledby="faq-title" className="px-4 pt-32 sm:px-8 lg:pt-44">
      <div className="grid gap-x-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 id="faq-title" className="reveal font-display text-[clamp(40px,5.4vw,80px)] font-bold leading-[0.95] tracking-[-0.035em]">
            Antes de pedir
          </h2>
          <ul className="mt-10 space-y-1">
            {items.map((item, i) => {
              const on = i === active
              return (
                <li key={item.q} className="reveal" style={{ '--d': `${80 + i * 50}ms` }}>
                  <button
                    type="button"
                    aria-expanded={on}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
                    className={`flex w-full items-center gap-4 py-2.5 text-left text-lg transition-colors duration-150 ${on ? 'text-ink-100' : 'text-ink-300 hover:text-ink-100'}`}
                  >
                    <span aria-hidden className={`size-2 shrink-0 rounded-full transition-colors duration-150 ${on ? 'bg-accent' : 'bg-ink-500'}`} />
                    {item.q}
                  </button>
                  {/* Phone: the answer opens beneath its question */}
                  {on && (
                    <p id={`faq-a-${i}`} className="fade-swap pb-4 pl-6 text-[19px] leading-snug text-ink-100 lg:hidden">
                      {item.a}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          <Link to="/faq" className="reveal mt-8 inline-block text-lg font-semibold text-ink-100 underline decoration-accent decoration-2 underline-offset-[6px] hover:decoration-ink-100">
            Ver todas las preguntas
          </Link>
        </div>
        <div className="hidden lg:col-span-6 lg:col-start-7 lg:block">
          <div className="sticky top-[120px] pt-28">
            <p key={active} aria-live="polite" className="fade-swap max-w-[30ch] text-[28px] leading-[1.3] text-ink-100">
              {items[active].a}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
