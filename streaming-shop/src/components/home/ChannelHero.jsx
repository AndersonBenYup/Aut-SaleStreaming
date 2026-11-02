import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BrandLogo from '../ui/BrandLogo.jsx'
import { useCatalog } from '../../context/CatalogContext.jsx'
import { formatPEN } from '../../lib/format.js'
import { usePrefersReducedMotion } from '../../lib/useReveal.js'

const DWELL = 3600

export default function ChannelHero() {
  const { platforms, minPrice, waUrl } = useCatalog()
  const cheapest = Math.min(...platforms.map(minPrice))
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = usePrefersReducedMotion()
  const hoverRef = useRef(false)
  const current = platforms[index % platforms.length]
  const monthly = current.plans.find((p) => p.months === 1) ?? current.plans[0]

  const go = useCallback((i) => setIndex((i + platforms.length) % platforms.length), [platforms.length])

  // Auto-zap between channels; pauses while the visitor is pointing at / focused in the stage,
  // while the tab is hidden, and never runs with reduced motion.
  useEffect(() => {
    if (reduced || paused) return
    const t = setTimeout(() => go(index + 1), DWELL)
    return () => clearTimeout(t)
  }, [index, paused, reduced, go])

  useEffect(() => {
    const onVis = () => setPaused(document.hidden || hoverRef.current)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const hold = (v) => {
    hoverRef.current = v
    setPaused(v)
  }

  const onKeyChannels = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); focusTab(index + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); focusTab(index - 1) }
  }
  const tabsRef = useRef(null)
  const focusTab = (i) => {
    const n = (i + platforms.length) % platforms.length
    tabsRef.current?.querySelectorAll('[role="tab"]')[n]?.focus()
  }

  return (
    <section aria-labelledby="hero-title" className="relative">
      <div className="relative grid min-h-[calc(100svh-64px-144px)] lg:min-h-[max(600px,calc(100svh-64px-104px))] lg:grid-cols-12">
        {/* Left panel: the name split to two corners, the sentence and the action between them */}
        <div className="max-lg:contents lg:relative lg:col-span-7 lg:flex lg:flex-col lg:px-8 lg:pb-8 lg:pt-7">
          <h1 id="hero-title" aria-label="LokiStream" className="max-lg:order-1 max-lg:px-4 max-lg:pb-4 max-lg:pt-4 max-lg:sm:px-8 animate-rise font-display text-[clamp(64px,15vw,150px)] font-bold leading-[0.85] tracking-[-0.045em] text-ink-100 lg:text-[clamp(72px,9vw,150px)]">
            <span aria-hidden="true">LOKI</span>
          </h1>

          <div className="max-lg:order-4 max-lg:px-4 max-lg:pb-10 max-lg:sm:px-8 my-auto max-w-[34ch] py-8 lg:ml-[16%] lg:py-0">
            <p className="animate-rise text-xl leading-snug text-ink-100 sm:text-[22px]" style={{ animationDelay: '120ms' }}>
              Netflix, Disney+, Max, Spotify y más, por perfil y desde {formatPEN(cheapest)} al mes. Pides por WhatsApp y tu acceso llega en minutos.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 animate-rise" style={{ animationDelay: '200ms' }}>
              <Link to="/#catalogo" className="press inline-flex h-12 items-center rounded-full bg-accent px-6 font-semibold text-ink-950 transition-colors hover:bg-accent-soft">
                Ver plataformas y precios
              </Link>
              <a
                href={waUrl('Hola, quiero hacer una consulta antes de comprar.')}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 font-semibold text-ink-100"
              >
                Escríbenos
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-1">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </div>
          </div>

          <span aria-hidden="true" className="max-lg:order-3 max-lg:px-4 max-lg:pt-4 max-lg:text-right max-lg:sm:px-8 block self-end animate-rise font-display text-[clamp(64px,15vw,150px)] font-bold leading-[0.85] tracking-[-0.045em] text-ink-100 lg:text-[clamp(72px,9vw,150px)]" style={{ animationDelay: '60ms' }}>
            STREAM
          </span>
        </div>

        {/* Right: the screen. Its field takes the current channel's colour; the official logo fills it. */}
        <div
          className="relative max-lg:order-2 h-[42svh] min-h-[280px] overflow-hidden transition-[background-color] duration-500 ease-[var(--ease-in-out)] lg:order-none lg:col-span-5 lg:h-auto"
          style={{ backgroundColor: current.field }}
          onPointerEnter={() => hold(true)}
          onPointerLeave={() => hold(false)}
          onFocus={() => hold(true)}
          onBlur={() => hold(false)}
          data-ui
          aria-roledescription="carrusel"
          aria-label="Plataformas disponibles"
        >
          <div key={current.id} id="channel-panel" role="tabpanel" aria-live={paused ? 'polite' : 'off'} className="zap-in absolute inset-0 flex flex-col justify-between p-6 sm:p-10" style={{ color: current.ink }}>
            <div className="flex items-start justify-between gap-4">
              <p className="pt-2.5 text-base font-medium opacity-80">{current.tagline}</p>
              <Link
                to={`/plataforma/${current.slug}`}
                className="press inline-flex h-11 shrink-0 items-center rounded-full px-5 text-sm font-semibold transition-opacity hover:opacity-85"
                style={{ backgroundColor: current.ink, color: current.field }}
              >
                Ver {current.name}
              </Link>
            </div>
            <div className="flex h-[38%] items-center">
              <BrandLogo platform={current} className="h-full max-h-[150px] w-auto max-w-[78%] text-[clamp(56px,7vw,120px)]" />
            </div>
            <p className="text-base">
              <span className="block font-display text-[clamp(32px,3.4vw,48px)] font-bold leading-none tracking-tight tabular-nums">
                {formatPEN(monthly.price)}
              </span>
              <span className="opacity-80">por perfil, al mes</span>
            </p>
          </div>
        </div>
      </div>

      {/* The channel strip: every service we sell, with its real logo. Arrow keys change channel. */}
      <div className="bg-ink-900">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Elegir plataforma"
          onKeyDown={onKeyChannels}
          className="grid grid-cols-4 lg:grid-cols-8"
        >
          {platforms.map((p, i) => {
            const active = i === index
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="channel-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => go(i)}
                className={`press group relative flex h-[72px] min-w-0 items-center justify-center px-3 sm:h-[92px] sm:px-5 transition-[background-color] duration-200 lg:h-[104px] lg:min-w-0 ${
                  active ? 'bg-ink-800' : 'hover:bg-ink-850'
                }`}
              >
                <BrandLogo
                  platform={p}
                  variant="mono"
                  tone="white"
                  className={`h-5 text-[20px] w-auto max-w-[78px] sm:h-7 sm:text-[28px] sm:max-w-[110px] transition-opacity duration-200 lg:h-8 ${active ? 'opacity-100' : 'opacity-55 group-hover:opacity-90'}`}
                />
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-ink-700">
                    <span
                      key={`${p.id}-${paused}`}
                      className={`block h-full bg-accent ${reduced || paused ? '' : 'channel-progress'}`}
                      style={{ '--dur': `${DWELL}ms` }}
                    />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
