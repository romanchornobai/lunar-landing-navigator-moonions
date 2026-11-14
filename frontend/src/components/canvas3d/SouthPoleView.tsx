import { useEffect, useMemo, useState } from 'react'
import { useLoader } from '@react-three/fiber'
import { PlaneGeometry, TextureLoader } from 'three'
import ViewCanvas from './ViewCanvas'

// Regional South Pole cap (lat -90..-84), LROC/LOLA DTM via NASA Moon Trek. See ASSETS.md.
const GRID = 1200
const SIZE = 150
const Y_OFFSET = 24.97
const Y_SCALE = 0.24375

function Terrain({ elevation }: { elevation: Float32Array }) {
  const [albedo, normal, ao] = useLoader(TextureLoader, [
    '/models/south_pole/lunar_albedo_2k.png',
    '/models/south_pole/lunar_normal_2k.png',
    '/models/south_pole/lunar_ao_2k.png',
  ])
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(SIZE, SIZE, GRID - 1, GRID - 1)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, (elevation[i] - Y_OFFSET) * Y_SCALE)
    pos.needsUpdate = true
    g.computeVertexNormals()
    g.setAttribute('uv1', g.attributes.uv)
    return g
  }, [elevation])
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        map={albedo}
        normalMap={normal}
        aoMap={ao}
        aoMapIntensity={1.2}
        normalScale={[1.25, 1.25] as never}
        roughness={0.92}
        metalness={0.02}
      />
    </mesh>
  )
}

export default function SouthPoleView() {
  const [elevation, setElevation] = useState<Float32Array | null>(null)
  useEffect(() => {
    fetch('/models/south_pole/lunar_elevation_1200.bin')
      .then((r) => r.arrayBuffer())
      .then((b) => setElevation(new Float32Array(b)))
  }, [])
  return (
    <ViewCanvas camera={{ position: [0, 80, 115], far: 2000 }} minDistance={5} maxDistance={400}>
      <ambientLight intensity={0.45} />
      <directionalLight position={[100, 80, 80]} intensity={2.8} />
      <directionalLight position={[-80, 50, -60]} intensity={0.65} color="#cbd5e1" />
      {elevation && <Terrain elevation={elevation} />}
    </ViewCanvas>
  )
}
