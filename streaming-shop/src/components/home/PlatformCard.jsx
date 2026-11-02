import { Link } from 'react-router-dom'
import PlatformMark from '../ui/PlatformMark.jsx'
import { IconArrow } from '../ui/Icons.jsx'
import { formatPEN } from '../../lib/format.js'
import { useCatalog } from '../../context/CatalogContext.jsx'

export default function PlatformCard({ platform }) {
  const { categories, minPrice } = useCatalog()
  const monthly = platform.plans.find((p) => p.months === 1) ?? platform.plans[0]
  const best = minPrice(platform)
  const category = categories.find((c) => c.id === platform.category)?.label
  return (
    <Link
      to={`/plataforma/${platform.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-ink-800 bg-ink-900 p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-ink-700"
    >
      <div
        aria-hidden
        className="absolute -right-10 -top-10 size-40 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ background: platform.color }}
      />
      <div className="relative flex items-start justify-between">
        <PlatformMark platform={platform} />
        {platform.badge && (
          <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">{platform.badge}</span>
        )}
      </div>
      <h3 className="relative mt-5 text-xl font-semibold">{platform.name}</h3>
      <p className="relative text-sm text-ink-500">{category}</p>
      <div className="relative mt-6 flex items-end justify-between">
        <div>
          <p className="font-display text-2xl font-bold tabular-nums">{formatPEN(monthly.price)}</p>
          <p className="text-xs text-ink-300">
            por perfil · mensual{best < monthly.price && <> · desde {formatPEN(best)}/mes</>}
          </p>
        </div>
        <span className="grid size-10 place-items-center rounded-full border border-ink-700 transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-ink-950">
          <IconArrow width={18} height={18} />
        </span>
      </div>
    </Link>
  )
}
