import { Link } from 'react-router-dom'
import PackCard from '../components/home/PackCard.jsx'
import PlatformMark from '../components/ui/PlatformMark.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import { IconWhatsApp } from '../components/ui/Icons.jsx'
import { useCatalog } from '../context/CatalogContext.jsx'
import { useCheckout } from '../context/CheckoutContext.jsx'
import { formatPEN } from '../lib/format.js'
import { usePageTitle } from '../lib/usePageTitle.js'

const durations = [
  { months: 1, label: '1 mes' },
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
]

const quickItem = (platform, plan) => ({
  platformId: platform.id,
  platformName: platform.name,
  planId: plan.id,
  planLabel: plan.label,
  unitPrice: plan.price,
  profiles: 1,
})

export default function Plans() {
  const { packs, platforms } = useCatalog()
  const { checkout } = useCheckout()
  const order = (p, plan) => () => {
    checkout({ items: [quickItem(p, plan)] })
  }
  usePageTitle('Planes y precios')
  return (
    <>
      <section className="container-x pb-12 pt-14 sm:pt-20">
        <SectionHeading eyebrow="Planes y precios" title="Paga solo por lo que ves" align="center">
          Precios por perfil en soles. Sin contratos: renuevas cuando quieras.
        </SectionHeading>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {packs.map((p) => <PackCard key={p.id} pack={p} />)}
        </div>
      </section>

      <section className="container-x py-12">
        <h2 className="text-2xl font-semibold sm:text-3xl">Precios por plataforma</h2>
        <p className="mt-2 text-ink-300">Toca un precio para pedirlo directo por WhatsApp.</p>

        {/* Desktop table */}
        <div className="mt-8 hidden overflow-hidden rounded-3xl border border-ink-800 md:block">
          <table className="w-full text-left">
            <thead className="bg-ink-900 text-sm text-ink-300">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium">Plataforma</th>
                {durations.map((d) => <th key={d.months} scope="col" className="px-6 py-4 font-medium">{d.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800" /* taste-skill-ignore: real table */>
              {platforms.map((p) => (
                <tr key={p.id} className="hover:bg-ink-900/60">
                  <th scope="row" className="px-6 py-4 font-normal">
                    <Link to={`/plataforma/${p.slug}`} className="flex items-center gap-3 font-semibold hover:text-accent">
                      <PlatformMark platform={p} size="sm" /> {p.name}
                    </Link>
                  </th>
                  {durations.map((d) => {
                    const plan = p.plans.find((x) => x.months === d.months)
                    return (
                      <td key={d.months} className="px-6 py-4">
                        {plan ? (
                          <button
                            type="button"
                            onClick={order(p, plan)}
                            className="press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display font-semibold tabular-nums hover:bg-wa hover:text-ink-950"
                          >
                            {formatPEN(plan.price)}
                          </button>
                        ) : (
                          <span className="px-3 text-ink-700">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="mt-8 grid gap-3 md:hidden">
          {platforms.map((p) => (
            <li key={p.id} className="rounded-3xl border border-ink-800 bg-ink-900/60 p-4">
              <Link to={`/plataforma/${p.slug}`} className="flex items-center gap-3 font-semibold">
                <PlatformMark platform={p} size="sm" /> {p.name}
              </Link>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {p.plans.map((plan) => (
                  <button
                    type="button"
                    key={plan.id}
                    onClick={order(p, plan)}
                    className="press rounded-2xl border border-ink-700 px-2 py-2.5 text-center active:bg-ink-800"
                  >
                    <span className="block text-xs text-ink-300">{plan.label}</span>
                    <span className="block font-display font-semibold tabular-nums">{formatPEN(plan.price)}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 flex items-center gap-2 text-sm text-ink-500">
          <IconWhatsApp width={16} height={16} /> Al tocar un precio pides 1 perfil de ese plan por WhatsApp.
        </p>
      </section>
    </>
  )
}
