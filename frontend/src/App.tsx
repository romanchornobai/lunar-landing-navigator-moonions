import { useEffect } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useProgress } from '@react-three/drei'
import LunarGlobe from './components/canvas3d/LunarGlobe'
import SouthPoleTerrain from './components/canvas3d/SouthPoleTerrain'
import { SITES, type SiteKey } from './components/canvas3d/LandingSite'
import { LandingSceneClean } from './components/canvas3d/LandingSceneClean'
import { RouteLoader } from './components/ui/RouteLoader'
import { prefetchAllViews } from './lib/prefetchAssets'

// /vista-sitio/:siteKey where siteKey is one of cr1 | malapert | degerlache | nobile
function LandingSiteRoute() {
  const { siteKey } = useParams()
  const key = (siteKey && siteKey in SITES ? siteKey : 'cr1') as SiteKey
  return <LandingSceneClean siteId={key} />
}

export default function App() {
  // Once the first view has loaded everything it needs, fetch the other views' assets in the background.
  const { active, total } = useProgress()
  useEffect(() => {
    if (!active && total > 0) prefetchAllViews()
  }, [active, total])

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
