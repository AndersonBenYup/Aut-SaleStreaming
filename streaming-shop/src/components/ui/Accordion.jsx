import { useId, useState } from 'react'
import { IconChevron } from './Icons.jsx'

export default function Accordion({ items, defaultOpen = 0 }) {
  const [open, setOpen] = useState(defaultOpen)
  const base = useId()
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = open === i
        const btnId = `${base}-b${i}`
        const panelId = `${base}-p${i}`
        return (
          <div key={item.q} className="rounded-3xl bg-ink-900">
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left font-sans text-base font-semibold sm:px-6"
              >
                {item.q}
                <IconChevron className={`shrink-0 text-ink-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-accent' : ''}`} />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-ink-300 sm:px-6">{item.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
