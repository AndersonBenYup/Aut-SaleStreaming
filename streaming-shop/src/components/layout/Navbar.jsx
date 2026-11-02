import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCart } from '../../context/CartContext.jsx'
import { useCatalog } from '../../context/CatalogContext.jsx'
import { IconCart, IconClose, IconMenu, IconArrow } from '../ui/Icons.jsx'

const links = [
  { to: '/#catalogo', label: 'Catálogo' },
  { to: '/planes', label: 'Planes' },
  { to: '/faq', label: 'Preguntas' },
  { to: '/contacto', label: 'Contacto' },
]

export function Logo() {
  const { site } = useCatalog()
  return (
    <Link to="/" className="press flex shrink-0 items-center gap-2" aria-label={`${site.brand}, inicio`}>
      {/* Mismo logo que la intro (public/logos/lokistream.webp, 920×535, recortado de public/photos/LOGO.jpg) */}
      <img src="/logos/lokistream.webp" alt="" width="920" height="535" className="h-12 w-auto select-none" draggable="false" />
      <span className="translate-y-[2px] font-display text-[13px] font-bold tracking-[0.32em] text-[#e9c46a]" aria-hidden>
        STREAM
      </span>
    </Link>
  )
}

export default function Navbar() {
  const { count, open } = useCart()
  const [menu, setMenu] = useState(false)
  const location = useLocation()

  useEffect(() => setMenu(false), [location])
  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : ''
  }, [menu])

  const linkCls = ({ isActive }) =>
    `rounded-full px-3 py-2 text-sm transition-colors ${isActive && !location.hash ? 'text-ink-100' : 'text-ink-300 hover:text-ink-100'}`

  return (
    <header className="sticky top-0 z-50">
      <div className="bg-ink-950">
        <nav className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8" aria-label="Principal">
          <Logo />
          <ul className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) => linkCls({ isActive: isActive && !l.to.includes('#') })}
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={open}
              className="relative grid size-10 place-items-center rounded-full border border-ink-700 hover:border-ink-500"
              aria-label={`Abrir carrito, ${count} perfiles`}
            >
              <IconCart />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-ink-950 tabular-nums">
                  {count}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className="grid size-10 place-items-center rounded-full border border-ink-700 md:hidden"
              aria-expanded={menu}
              aria-controls="menu-movil"
              aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
            >
              {menu ? <IconClose /> : <IconMenu />}
            </button>
          </div>
        </nav>
      </div>
      {menu && (
        <div id="menu-movil" className="absolute inset-x-0 top-full z-40 h-dvh bg-ink-950 md:hidden">
          <ul className="container-x flex flex-col gap-1 pt-4">
            {links.map((l, i) => (
              <li key={l.to} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <Link to={l.to} className="flex items-center justify-between py-4 font-display text-2xl font-semibold">
                  {l.label}
                  <IconArrow className="text-ink-500" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}
