import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { LOCAL_CATALOG, catalogApi, fetchRemoteCatalog, mergeCatalog, readCachedCatalog, writeCachedCatalog } from '../lib/catalog.js'

export const SHEETS_API_URL = import.meta.env.VITE_SHEETS_API_URL || ''

const CatalogContext = createContext(null)

/**
 * Carga el catálogo: primero lo último que se vio (caché) o el local, al instante;
 * luego pregunta a la hoja y, si cambió, actualiza la web sin recargar.
 */
export function CatalogProvider({ children }) {
  const [catalog, setCatalog] = useState(() => (SHEETS_API_URL && readCachedCatalog()) || LOCAL_CATALOG)
  const [status, setStatus] = useState(SHEETS_API_URL ? 'loading' : 'local')

  useEffect(() => {
    if (!SHEETS_API_URL) return
    let alive = true
    fetchRemoteCatalog(SHEETS_API_URL)
      .then((raw) => {
        const merged = mergeCatalog(raw)
        if (!alive) return
        if (!merged) {
          setStatus('invalid')
          return
        }
        writeCachedCatalog(raw)
        setCatalog((prev) => (prev.version === merged.version ? prev : merged))
        setStatus('remote')
      })
      .catch(() => alive && setStatus('offline'))
    return () => {
      alive = false
    }
  }, [])

  const value = useMemo(() => ({ ...catalogApi(catalog), status, apiUrl: SHEETS_API_URL }), [catalog, status])
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>')
  return ctx
}
