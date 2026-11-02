import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import Home from './pages/Home.jsx'
import PlatformDetail from './pages/PlatformDetail.jsx'
import Plans from './pages/Plans.jsx'
import Faq from './pages/Faq.jsx'
import Contact from './pages/Contact.jsx'
import NotFound from './pages/NotFound.jsx'
import BrandIntro from './components/home/BrandIntro.jsx'

export default function App() {
  return (
    <>
      <BrandIntro />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="plataforma/:slug" element={<PlatformDetail />} />
          <Route path="planes" element={<Plans />} />
          <Route path="faq" element={<Faq />} />
          <Route path="contacto" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  )
}
