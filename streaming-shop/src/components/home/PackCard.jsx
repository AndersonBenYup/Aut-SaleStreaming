import Button from '../ui/Button.jsx'
import PlatformMark from '../ui/PlatformMark.jsx'
import { IconCheck, IconWhatsApp } from '../ui/Icons.jsx'
import { formatPEN } from '../../lib/format.js'
import { useCatalog } from '../../context/CatalogContext.jsx'
import { useCheckout } from '../../context/CheckoutContext.jsx'

export default function PackCard({ pack }) {
  const { getPlatformById } = useCatalog()
  const { checkout } = useCheckout()
  const included = pack.platforms.map(getPlatformById).filter(Boolean)
  const regular = included.reduce((sum, p) => sum + (p.plans.find((x) => x.months === 1)?.price ?? 0), 0)
  return (
    <article
      className={`relative flex flex-col rounded-3xl border p-6 sm:p-7 ${
        pack.highlight ? 'border-transparent bg-ink-800' : 'border-transparent bg-ink-900'
      }`}
    >
      {pack.highlight && (
        <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-xs font-bold text-ink-950">Recomendado</span>
      )}
      <h3 className="text-xl font-semibold">{pack.name}</h3>
      <p className="mt-1 text-sm text-ink-300">{pack.description}</p>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold tabular-nums">{formatPEN(pack.price)}</span>
        <span className="text-ink-300">/ {pack.period}</span>
      </div>
      {regular > pack.price && (
        <p className="mt-1 text-sm text-ink-500">
          Por separado <s>{formatPEN(regular)}</s>
        </p>
      )}
      <div className="mt-5 flex -space-x-2">
        {included.map((p) => (
          <span key={p.id} title={p.name} className="rounded-xl ring-4 ring-ink-900"><PlatformMark platform={p} size="sm" /></span>
        ))}
      </div>
      <ul className="mt-6 flex-1 space-y-2.5 text-sm">
        {pack.perks.map((perk) => (
          <li key={perk} className="flex gap-2"><IconCheck width={18} height={18} className="shrink-0 text-accent" /> {perk}</li>
        ))}
      </ul>
      <Button
        className="mt-8 w-full"
        variant={pack.highlight ? 'primary' : 'ghost'}
        onClick={() => checkout({ packId: pack.id })}
      >
        <IconWhatsApp width={18} height={18} /> Lo quiero
      </Button>
    </article>
  )
}
