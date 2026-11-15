import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import ViewCanvas from './ViewCanvas'

// 15 km x 15 km LOLA terrain, 1:1 scale in meters, origin at the site center. See ASSETS.md.
export const SITES = ['connecting_ridge_cr1', 'malapert_massif', 'de_gerlache_rim', 'nobile_rim_1'] as const
export type SiteId = (typeof SITES)[number]

const LANDER_SCALE = 12 // native ~140 units -> ~1.7 units tall visually in meters scene (x1000 of 0.012)

function Lander() {
  const { scene } = useGLTF('/models/lander/lander.glb')
  const clone = useMemo(() => scene.clone(true), [scene])
  // Pivot offset from ASSETS.md puts the feet at Y = 0.
  return (
    <group scale={LANDER_SCALE / 1000}>
      <primitive object={clone} position={[2.0, 67.037, -67.037]} />
    </group>
  )
}

function Terrain({ site }: { site: SiteId }) {
  const { scene } = useGLTF(`/models/${site}/${site}_15km.glb`)
  return <primitive object={scene} position={[0, 0, 0]} />
}

export default function SiteView({ site }: { site: SiteId }) {
  return (
    <ViewCanvas camera={{ position: [6, 3, 6], near: 0.05, far: 30000 }} minDistance={1} maxDistance={8000}>
      <ambientLight intensity={0.45} />
      <directionalLight position={[120, 8, -60]} intensity={2.8} />
      <Terrain site={site} />
      <Lander />
    </ViewCanvas>
  )
}
