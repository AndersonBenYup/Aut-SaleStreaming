import { Link } from 'react-router-dom'
import { useCatalog } from '../../context/CatalogContext.jsx'

// A single quiet line: what this is, a few links, the year.
export default function Footer() {
  const { site, waUrl } = useCatalog()
  return (
    <footer className="mt-[20svh] px-4 pb-6 text-[15px] sm:px-8 lg:mt-[30svh]">
      <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr] lg:items-baseline lg:gap-6">
        <p className="text-ink-300">{site.brand} · streaming por WhatsApp desde {site.city}</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-ink-100">
          <li><Link className="hover:text-accent" to="/planes">Planes</Link></li>
          <li><Link className="hover:text-accent" to="/faq">Preguntas</Link></li>
          <li><Link className="hover:text-accent" to="/contacto">Contacto</Link></li>
          <li>
            <a className="hover:text-accent" href={waUrl('Hola')} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </li>
        </ul>
        <p className="text-ink-300 lg:text-right">
          © {new Date().getFullYear()} · Las marcas y logos pertenecen a sus dueños
        </p>
      </div>
    </footer>
  )
}
