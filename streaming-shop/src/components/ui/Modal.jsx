import { useEffect, useRef } from 'react'

export default function Modal({ open, onClose, title, children, labelledBy = 'modal-title' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector('button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="animate-rise relative w-full max-w-sm rounded-3xl border border-ink-700 bg-ink-900 p-6"
      >
        <h2 id={labelledBy} className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
