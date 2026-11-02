import ChannelHero from '../components/home/ChannelHero.jsx'
import Lineup from '../components/home/Lineup.jsx'
import OrderBuilder from '../components/home/OrderBuilder.jsx'
import PackPicker from '../components/home/PackPicker.jsx'
import FaqIndex from '../components/home/FaqIndex.jsx'
import LocalProof from '../components/home/LocalProof.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'

export default function Home() {
  usePageTitle(null)
  return (
    <>
      <ChannelHero />
      <Lineup />
      <OrderBuilder />
      <PackPicker />
      <FaqIndex />
      <LocalProof />
    </>
  )
}
