import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { LANDING_SITES, getSite3DPosition } from '../../data/sites'
import { SiteMarker } from './SiteMarker'

// Regional South Pole cap (lat -90..-84, ~364 km): LOLA-derived 1200x1200 Float32 elevation grid
// (meters, NASA Moon Trek). Geometry params from ASSETS.md.
const BASE = '/models/south_pole'
const GRID = 1200
const TERRAIN_SIZE = 150 // scene units
const MEAN_Z = 24.97 // m, mean elevation subtracted
const SCALE_Y = (TERRAIN_SIZE / GRID) * 1.3 * 1.5 // 0.24375 scene units per m (exaggerated)

function Terrain() {
  const buffer = useLoader(THREE.FileLoader, `${BASE}/lunar_elevation_1200.bin`, (loader) => {
    loader.setResponseType('arraybuffer')
  }) as unknown as ArrayBuffer
  const [albedo, normal, ao] = useLoader(THREE.TextureLoader, [
    `${BASE}/lunar_albedo_2k.png`,
    `${BASE}/lunar_normal_2k.png`,
    `${BASE}/lunar_ao_2k.png`,
  ])

  const elevations = useMemo(() => new Float32Array(buffer), [buffer])

  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, GRID - 1, GRID - 1)
    geom.rotateX(-Math.PI / 2)
    const pos = geom.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, (elevations[i] - MEAN_Z) * SCALE_Y)
    pos.needsUpdate = true
    geom.computeVertexNormals()
    return geom
  }, [elevations])

  // Calculate the exact 3D positions of the candidate landing sites on the terrain
  const sitePositions = useMemo(() => {
    return LANDING_SITES.map((site) => ({
      site,
      position: getSite3DPosition(site, elevations),
    }))
  }, [elevations])

  albedo.colorSpace = THREE.SRGBColorSpace
  normal.colorSpace = THREE.NoColorSpace
  ao.colorSpace = THREE.NoColorSpace

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          map={albedo}
          normalMap={normal}
          normalScale={new THREE.Vector2(1.25, 1.25)}
          aoMap={ao}
          aoMapIntensity={1.2}
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>
      {sitePositions.map(({ site, position }) => (
        <SiteMarker key={site.id} site={site} position={position} />
      ))}
    </group>
  )
}

export default function SouthPoleTerrain() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 80, 115], fov: 45, near: 0.1, far: 2000 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      style={{ width: '100vw', height: '100vh' }}
    >
      <color attach="background" args={['#020408']} />
      <ambientLight color="#ffffff" intensity={0.45} />
      <directionalLight position={[100, 80, 80]} intensity={2.8} color="#ffffff" />
      <directionalLight position={[-80, 50, -60]} intensity={0.65} color="#cbd5e1" />
      <Stars radius={180} depth={80} count={4000} factor={4} saturation={0} fade speed={0.3} />
      <Suspense fallback={null}>
        <Terrain />
      </Suspense>
      <OrbitControls
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={15}
        maxDistance={280}
      />
    </Canvas>
  )
}
