import { Navigate, Route, Routes } from 'react-router-dom'
import LunarGlobe from './components/canvas3d/LunarGlobe'

export default function App() {
  return (
    <Routes>
      <Route path="/vista-lunar" element={<LunarGlobe />} />
      <Route path="*" element={<Navigate to="/vista-lunar" replace />} />
    </Routes>
  )
}
