import { Navigate, Route, Routes } from 'react-router-dom'
import LunarGlobe from './components/canvas3d/LunarGlobe'
import SouthPoleTerrain from './components/canvas3d/SouthPoleTerrain'

export default function App() {
  return (
    <Routes>
      <Route path="/vista-lunar" element={<LunarGlobe />} />
      <Route path="/vista-polar" element={<SouthPoleTerrain />} />
      <Route path="*" element={<Navigate to="/vista-lunar" replace />} />
    </Routes>
  )
}
