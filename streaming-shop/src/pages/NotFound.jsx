import Button from '../components/ui/Button.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'

export default function NotFound() {
  usePageTitle('Página no encontrada')
  return (
    <section className="container-x flex flex-col items-center py-28 text-center">
      <p className="font-display text-8xl font-bold text-ink-800">404</p>
      <h1 className="mt-4 text-3xl font-semibold">Esta página no está en cartelera</h1>
      <p className="mt-2 text-ink-300">El enlace no existe o la plataforma ya no está disponible.</p>
      <Button className="mt-8" to="/#catalogo">Ver catálogo</Button>
    </section>
  )
}
