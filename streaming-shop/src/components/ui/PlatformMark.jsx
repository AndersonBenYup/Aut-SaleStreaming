import BrandLogo from './BrandLogo.jsx'

// The platform's real logo on a flat tile of its brand field colour.
export default function PlatformMark({ platform, size = 'md' }) {
  const sizes = {
    sm: 'size-10 rounded-xl p-2 text-[18px]',
    md: 'size-14 rounded-2xl p-2.5 text-[24px]',
    lg: 'size-24 rounded-3xl p-4 text-[40px]',
  }
  const tone = platform.wordmarkTone === 'black' ? 'black' : platform.field === '#f1f1f1' ? 'color' : 'white'
  return (
    <span aria-hidden className={`${sizes[size]} grid shrink-0 place-items-center`} style={{ backgroundColor: platform.field }}>
      <BrandLogo platform={platform} variant="icon" tone={tone} className="max-h-full max-w-full h-[1em] w-auto" />
    </span>
  )
}
