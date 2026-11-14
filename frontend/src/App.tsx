import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import LunarGlobe from './components/canvas3d/LunarGlobe'
import SouthPoleTerrain from './components/canvas3d/SouthPoleTerrain'
import { SITES, type SiteKey } from './components/canvas3d/LandingSite'
import { LandingSceneClean } from './components/canvas3d/LandingSceneClean'
import { RouteLoader } from './components/ui/RouteLoader'

// /vista-sitio/:siteKey where siteKey is one of shackleton | malapert | degerlache | nobile
function LandingSiteRoute() {
  const { siteKey } = useParams()
  const key = (siteKey && siteKey in SITES ? siteKey : 'shackleton') as SiteKey
  const site = SITES[key]
  return (
    <LandingSceneClean
      siteId={key}
      modelPath={site.glb}
      groundNormal={[...site.normal] as [number, number, number]}
    />
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/vista-lunar" element={<LunarGlobe />} />
        <Route path="/vista-polar" element={<SouthPoleTerrain />} />
        <Route path="/vista-sitio" element={<LandingSiteRoute />} />
        <Route path="/vista-sitio/:siteKey" element={<LandingSiteRoute />} />
        <Route path="*" element={<Navigate to="/vista-lunar" replace />} />
      </Routes>
      <RouteLoader />
    </>
  )
}
