import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import LunarGlobe from './components/canvas3d/LunarGlobe'
import SouthPoleTerrain from './components/canvas3d/SouthPoleTerrain'
import LandingSite, { SITES, type SiteKey } from './components/canvas3d/LandingSite'

// /vista-sitio/:siteKey where siteKey is one of shackleton | malapert | degerlache | nobile
// Optional query for testing the lighting: ?az=<deg>&el=<deg> (el <= 0 gives night vision).
function LandingSiteRoute() {
  const { siteKey } = useParams()
  const [params] = useSearchParams()
  const key = (siteKey && siteKey in SITES ? siteKey : 'shackleton') as SiteKey
  const az = params.get('az')
  const el = params.get('el')
  return (
    <LandingSite
      siteKey={key}
      sunAzimuthDeg={az !== null ? Number(az) : undefined}
      sunElevationDeg={el !== null ? Number(el) : undefined}
    />
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/vista-lunar" element={<LunarGlobe />} />
      <Route path="/vista-polar" element={<SouthPoleTerrain />} />
      <Route path="/vista-sitio" element={<LandingSiteRoute />} />
      <Route path="/vista-sitio/:siteKey" element={<LandingSiteRoute />} />
      <Route path="*" element={<Navigate to="/vista-lunar" replace />} />
    </Routes>
  )
}
