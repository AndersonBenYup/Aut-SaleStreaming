import { useState } from 'react'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import Button from '../components/ui/Button.jsx'
import { IconWhatsApp, IconClock, IconPin, IconMail } from '../components/ui/Icons.jsx'
import { useCatalog } from '../context/CatalogContext.jsx'
import { contactMessage } from '../lib/whatsapp.js'
import { usePageTitle } from '../lib/usePageTitle.js'


const field =
  'mt-1.5 w-full rounded-2xl border border-ink-700 bg-ink-900 px-4 py-3 text-base text-ink-100 placeholder:text-ink-500 focus:border-accent focus:outline-none aria-[invalid=true]:border-red-400'

export default function Contact() {
  const { packs, platforms, site, waUrl } = useCatalog()
  const topics = ['Consulta general', ...platforms.map((p) => p.name), ...packs.map((p) => p.name), 'Soporte / garantía', 'Renovación']
  usePageTitle('Contacto')
  const [form, setForm] = useState({ name: '', topic: topics[0], message: '' })
  const [error, setError] = useState('')

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    if (form.name.trim().length < 2) {
      setError('Escribe tu nombre para saber cómo llamarte.')
      return
    }
    setError('')
    window.open(waUrl(contactMessage(form)), '_blank', 'noopener,noreferrer')
  }

  const info = [
    { icon: IconClock, label: 'Horario', value: site.hours },
    { icon: IconPin, label: 'Ubicación', value: `${site.city} · atención online a todo el país` },
    { icon: IconMail, label: 'Correo', value: site.email, href: `mailto:${site.email}` },
  ]

  return (
    <section className="container-x grid gap-12 pb-8 pt-14 sm:pt-20 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <SectionHeading eyebrow="Contacto" title="Hablemos por WhatsApp">
          Llena el formulario y se abrirá un chat con tu mensaje listo para enviar. No guardamos tus datos.
        </SectionHeading>
        <a
          href={waUrl('Hola, tengo una consulta.')}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex items-center gap-4 rounded-3xl border border-ink-800 bg-ink-900 p-5 hover:border-wa"
        >
          <span className="grid size-12 place-items-center rounded-full bg-wa text-ink-950"><IconWhatsApp width={24} height={24} /></span>
          <span>
            <span className="block text-sm text-ink-300">WhatsApp directo</span>
            <span className="block font-display text-lg font-semibold">+{site.whatsapp}</span>
          </span>
        </a>
        <dl className="mt-6 space-y-4">
          {info.map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex gap-3">
              <Icon className="mt-0.5 shrink-0 text-accent" />
              <div>
                <dt className="text-sm text-ink-500">{label}</dt>
                <dd>{href ? <a className="hover:text-accent" href={href}>{value}</a> : value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      <form onSubmit={submit} noValidate className="rounded-3xl border border-ink-700 bg-ink-900/60 p-5 sm:p-8">
        <div>
          <label htmlFor="name" className="text-sm font-semibold">Tu nombre</label>
          <input
            id="name"
            className={field}
            value={form.name}
            onChange={update('name')}
            autoComplete="given-name"
            placeholder="Ej. Ana"
            aria-invalid={!!error}
            aria-describedby={error ? 'name-error' : undefined}
          />
          {error && <p id="name-error" className="mt-1.5 text-sm text-red-400">{error}</p>}
        </div>
        <div className="mt-5">
          <label htmlFor="topic" className="text-sm font-semibold">¿Sobre qué es tu consulta?</label>
          <select id="topic" className={field} value={form.topic} onChange={update('topic')}>
            {topics.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="mt-5">
          <label htmlFor="message" className="text-sm font-semibold">Mensaje <span className="font-normal text-ink-500">(opcional)</span></label>
          <textarea
            id="message"
            rows={5}
            className={`${field} resize-y`}
            value={form.message}
            onChange={update('message')}
            placeholder="Cuéntanos qué necesitas…"
            maxLength={600}
          />
        </div>
        <Button type="submit" variant="whatsapp" size="lg" className="mt-6 w-full">
          <IconWhatsApp /> Enviar por WhatsApp
        </Button>
      </form>
    </section>
  )
}
