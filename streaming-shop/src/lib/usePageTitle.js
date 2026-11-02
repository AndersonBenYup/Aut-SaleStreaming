import { useEffect } from 'react'
import site from '../data/site.json'

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${site.brand}` : `${site.brand} · Streaming premium`
  }, [title])
}
