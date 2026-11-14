import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { useSouthPoleElevation } from '../../lib/southPoleElevation'

// Low-poly preview of the regional South Pole terrain (same LOLA grid as the main 3D view,
// decimated 1200 -> 150 samples per side). Used inside the round view toggle.
const GRID = 1200
const STEP = 8
const SUB = GRID / STEP
const SIZE = 150
const MEAN_Z = 24.97
const SCALE_Y = 0.24375

function Terrain({ elevations }: { elevations: Float32Array }) {
  const group = useRef<THREE.Group>(null)
  const albedo = useLoader(THREE.TextureLoader, '/models/south_pole/lunar_albedo_2k.png')
  albedo.colorSpace = THREE.SRGBColorSpace

  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(SIZE, SIZE, SUB - 1, SUB - 1)
    geom.rotateX(-Math.PI / 2)
    const pos = geom.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const row = Math.floor(i / SUB) * STEP
      const col = (i % SUB) * STEP
      pos.setY(i, (elevations[row * GRID + col] - MEAN_Z) * SCALE_Y)
    }
    pos.needsUpdate = true
    geom.computeVertexNormals()
    return geom
  }, [elevations])

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.12
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <meshStandardMaterial map={albedo} roughness={0.92} metalness={0.02} />
      </mesh>
    </group>
  )
}

export default function MiniSouthPoleTerrain() {
  const elevations = useSouthPoleElevation()
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 95, 95], fov: 45, near: 1, far: 600 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[100, 80, 80]} intensity={2.8} />
      <directionalLight position={[-80, 50, -60]} intensity={0.65} color="#cbd5e1" />
      <Suspense fallback={null}>{elevations && <Terrain elevations={elevations} />}</Suspense>
    </Canvas>
  )
}
