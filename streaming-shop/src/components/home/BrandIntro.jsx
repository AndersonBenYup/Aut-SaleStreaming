import { useCallback, useEffect, useRef, useState } from 'react'

export const INTRO_KEY = 'lokistream:intro:v1'
const LOGO = '/logos/lokistream.webp'
const PLAY_MS = 2250 // when the fade to the page starts
const OUT_MS = 420 // fade to the page (total ≈ 2.7 s)
const STILL_MS = 1100 // reduced motion: the logo simply holds, then the page appears
const STRIPES = ['#0f5f2a', '#d4a531', '#1f9d3a', '#ff5a36', '#f3d27a', '#13803a']
const WORD = 'STREAM'

function firstVisit() {
  try {
    return !localStorage.getItem(INTRO_KEY)
  } catch {
    return false // storage blocked: never risk replaying it on every page
  }
}

function prefersStill() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Intro de marca, solo en la primera visita (localStorage).
 * wait → (logo decodificado) → play → out → done.  "Saltar" o Esc pasan directo a out.
 * Con prefers-reduced-motion no hay barrido, rayas ni zoom: el logo aparece quieto un momento.
 */
export default function BrandIntro() {
  const [phase, setPhase] = useState(() => (firstVisit() ? 'wait' : 'done'))
  const still = useRef(prefersStill()).current

  const leave = useCallback(() => setPhase((p) => (p === 'play' || p === 'wait' ? 'out' : p)), [])

  // Mark as seen right away and lock the scroll while it is on screen.
  useEffect(() => {
    if (phase === 'done') return
    try {
      localStorage.setItem(INTRO_KEY, new Date().toISOString())
    } catch {
      /* ignore */
    }
    document.documentElement.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && leave()
    window.addEventListener('keydown', onKey)
    return () => {
      document.documentElement.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [phase === 'done', leave]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start only once the logo is decoded, so the sweep never runs over an empty box (max 700 ms wait).
  useEffect(() => {
    if (phase !== 'wait') return
    let alive = true
    const go = () => alive && setPhase((p) => (p === 'wait' ? 'play' : p))
    const img = new Image()
    img.src = LOGO
    img.decode().then(go, go)
    const t = setTimeout(go, 700)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [phase])

  useEffect(() => {
    if (phase === 'play') {
      const t = setTimeout(() => setPhase('out'), still ? STILL_MS : PLAY_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'out') {
      const t = setTimeout(() => setPhase('done'), still ? 0 : OUT_MS)
      return () => clearTimeout(t)
    }
  }, [phase, still])

  if (phase === 'done') return null

  return (
    <div
      className="lk-intro"
      data-phase={phase}
      data-still={still || undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a LokiStream"
    >
      {phase !== 'wait' && (
        <div className="lk-exit">
          <div className="lk-stage">
            {!still && (
              <div className="lk-stripes" aria-hidden="true">
                {STRIPES.map((c, i) => (
                  <span key={c} style={{ '--c': c, '--i': i }} />
                ))}
              </div>
            )}
            <div className="lk-logo">
              <img src={LOGO} alt="LokiStream" width="920" height="535" draggable="false" />
              {!still && <span className="lk-sweep" style={{ '--logo': `url(${LOGO})` }} aria-hidden="true" />}
            </div>
            <p className="lk-word" aria-hidden="true">
              {WORD.split('').map((ch, i) => (
                <span key={i} style={{ '--i': i }}>
                  {ch}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      <button type="button" className="lk-skip press" onClick={leave}>
        Saltar
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3 3l5 5-5 5M9 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
