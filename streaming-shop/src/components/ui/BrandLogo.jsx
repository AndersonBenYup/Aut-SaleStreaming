// Renders a platform's official logo, recoloured to sit on a given field.
// tone: "white" | "black" | "color" (as published). variant: "wordmark" (full colour lockup),
// "mono" (a version that survives being flattened to one colour), "icon" (the glyph only).
const toneFilter = {
  white: 'brightness(0) invert(1)',
  black: 'brightness(0)',
  color: 'none',
}

export default function BrandLogo({ platform, tone, variant = 'wordmark', className = '' }) {
  const t = tone ?? platform.wordmarkTone ?? 'color'
  const filter = toneFilter[t]
  const src =
    variant === 'icon' ? platform.icon ?? platform.wordmark
    : variant === 'mono' ? platform.mono ?? platform.wordmark
    : platform.wordmark

  if (src) {
    return <img src={src} alt={platform.name} className={`object-contain ${className}`} style={{ filter }} draggable="false" />
  }
  // No wordmark published (Crunchyroll): its glyph beside the name, set in the brand face.
  return (
    <span className={`inline-flex items-center gap-[0.3em] ${className}`} role="img" aria-label={platform.name}>
      <img src={platform.icon} alt="" className="h-full w-auto" style={{ filter }} draggable="false" />
      <span
        className="font-display font-bold leading-none tracking-tight"
        style={{ color: t === 'black' ? '#0a0a0d' : '#fff', fontSize: '0.8em' }}
      >
        {platform.name.toLowerCase()}
      </span>
    </span>
  )
}
