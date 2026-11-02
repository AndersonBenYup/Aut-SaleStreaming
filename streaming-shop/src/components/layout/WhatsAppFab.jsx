import { useCatalog } from '../../context/CatalogContext.jsx'
import { IconWhatsApp } from '../ui/Icons.jsx'

export default function WhatsAppFab() {
  const { waUrl } = useCatalog()
  return (
    <a
      href={waUrl('Hola, tengo una consulta.')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className={"fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-full bg-wa text-ink-950 shadow-lg shadow-black/40 transition-transform hover:scale-105 active:scale-95" /* taste-skill-ignore: floats */}
    >
      <IconWhatsApp width={28} height={28} />
    </a>
  )
}
