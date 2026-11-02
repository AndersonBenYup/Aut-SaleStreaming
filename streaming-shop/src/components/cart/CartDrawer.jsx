import { useEffect, useRef, useState } from 'react'
import { useCart } from '../../context/CartContext.jsx'
import { formatPEN } from '../../lib/format.js'
import { lineTotal } from '../../lib/whatsapp.js'
import { useCatalog } from '../../context/CatalogContext.jsx'
import { useCheckout } from '../../context/CheckoutContext.jsx'
import Button from '../ui/Button.jsx'
import Modal from '../ui/Modal.jsx'
import QuantitySelector from '../ui/QuantitySelector.jsx'
import PlatformMark from '../ui/PlatformMark.jsx'
import { IconClose, IconTrash, IconWhatsApp, IconCart } from '../ui/Icons.jsx'

export default function CartDrawer() {
  const { getPlatformById } = useCatalog()
  const { checkout } = useCheckout()
  const { items, total, isOpen, close, setProfiles, remove, clear } = useCart()
  const [confirm, setConfirm] = useState(false)
  const panel = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const onKey = (e) => e.key === 'Escape' && !confirm && close()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, close, confirm])

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-black/60 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={close}
        aria-hidden
      />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Mi carrito"
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={`fixed inset-y-0 right-0 z-[61] flex w-full max-w-md flex-col bg-ink-900 outline-none transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between bg-ink-850 px-5 py-4">
          <h2 className="text-lg font-semibold">Mi carrito</h2>
          <button type="button" onClick={close} className="grid size-10 place-items-center rounded-full hover:bg-ink-800" aria-label="Cerrar carrito">
            <IconClose />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-ink-800 text-ink-300"><IconCart /></span>
            <p className="font-semibold">Tu carrito está vacío</p>
            <p className="text-sm text-ink-300">Elige una plataforma y la cantidad de perfiles que necesitas.</p>
            <Button variant="ghost" size="sm" to="/#catalogo" onClick={close}>Ver catálogo</Button>
          </div>
        ) : (
          <ul className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {items.map((item) => {
              const platform = getPlatformById(item.platformId)
              return (
                <li key={item.key} className="flex gap-3 rounded-2xl p-3 hover:bg-ink-850">
                  {platform && <PlatformMark platform={platform} size="sm" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{item.platformName}</p>
                        <p className="text-sm text-ink-300">{item.planLabel} · {formatPEN(item.unitPrice)} por perfil</p>
                      </div>
                      <button type="button" onClick={() => remove(item.key)} className="grid size-8 place-items-center rounded-full text-ink-500 hover:bg-ink-800 hover:text-ink-100" aria-label={`Quitar ${item.platformName}`}>
                        <IconTrash width={16} height={16} />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <QuantitySelector size="sm" value={item.profiles} onChange={(n) => setProfiles(item.key, n)} />
                      <span className="font-display font-semibold tabular-nums">{formatPEN(lineTotal(item))}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {items.length > 0 && (
          <footer className="space-y-3 bg-ink-850 px-5 py-5">
            <div className="flex items-baseline justify-between">
              <span className="text-ink-300">Total</span>
              <span className="font-display text-2xl font-bold tabular-nums">{formatPEN(total)}</span>
            </div>
            <Button variant="whatsapp" size="lg" className="w-full" onClick={() => { close(); checkout({ items }, { onDone: clear }) }}>
              <IconWhatsApp /> Pedir por WhatsApp
            </Button>
            <Button variant="subtle" size="sm" className="w-full" onClick={() => setConfirm(true)}>
              Vaciar carrito
            </Button>
          </footer>
        )}
      </aside>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="¿Vaciar el carrito?" labelledBy="vaciar-title">
        <p className="mt-2 text-sm text-ink-300">Se eliminarán todos los productos agregados.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Cancelar</Button>
          <Button size="sm" onClick={() => { clear(); setConfirm(false) }}>Vaciar</Button>
        </div>
      </Modal>
    </>
  )
}
