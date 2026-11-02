import Accordion from '../components/ui/Accordion.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Button from '../components/ui/Button.jsx'
import { IconWhatsApp } from '../components/ui/Icons.jsx'
import { useCatalog } from '../context/CatalogContext.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'

export default function Faq() {
  const { faq, waUrl } = useCatalog()
  usePageTitle('Preguntas frecuentes')
  return (
    <section className="container-x max-w-3xl pb-8 pt-14 sm:pt-20">
      <SectionHeading eyebrow="Ayuda" title="Preguntas frecuentes">
        Si tu duda no está aquí, escríbenos y te respondemos en minutos.
      </SectionHeading>
      <div className="mt-10">
        <Accordion items={faq} />
      </div>
      <div className="mt-10 flex flex-col items-start gap-4 rounded-3xl border border-ink-800 bg-ink-900 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">¿Aún tienes dudas?</p>
          <p className="text-sm text-ink-300">Te atendemos por WhatsApp todos los días.</p>
        </div>
        <Button variant="whatsapp" href={waUrl('Hola, tengo una pregunta que no está en las preguntas frecuentes.')}>
          <IconWhatsApp width={18} height={18} /> Preguntar
        </Button>
      </div>
    </section>
  )
}
