import { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { cartReducer } from '../lib/cartReducer.js'
import { cartTotal } from '../lib/whatsapp.js'

const STORAGE_KEY = 'lokistream:cart'
const CartContext = createContext(null)

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(cartReducer, undefined, loadCart)
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      /* storage unavailable (private mode): cart still works in memory */
    }
  }, [items])

  const value = useMemo(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.profiles, 0),
      total: cartTotal(items),
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      add: (item) => dispatch({ type: 'add', item }),
      setProfiles: (key, profiles) => dispatch({ type: 'setProfiles', key, profiles }),
      remove: (key) => dispatch({ type: 'remove', key }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [items, isOpen],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
