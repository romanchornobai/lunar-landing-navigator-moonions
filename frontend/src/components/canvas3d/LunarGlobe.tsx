import { Suspense } from 'react'
import * as THREE from 'three'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'

// NASA SVS CGI Moon Kit (https://svs.gsfc.nasa.gov/4720/): LROC WAC color + LOLA DEM.
// Browser-native 8-bit derivatives of the 16-bit TIFFs (same resolution; see DATA_SOURCES.md),
// decoded off the main thread with GPU mipmaps. Sphere radius 2.0 scene units; relief params from ASSETS.md.
const COLOR_URL = '/textures/moon_color_8k.jpg' // 8192x4096 sRGB
const ELEVATION_URL = '/textures/moon_elevation_8bit.png' // 5760x2880 grey, LOLA DEM

function Moon() {
  const [colorMap, elevationMap] = useLoader(THREE.TextureLoader, [COLOR_URL, ELEVATION_URL])
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  colorMap.colorSpace = THREE.SRGBColorSpace
  colorMap.anisotropy = Math.min(8, maxAniso)
  elevationMap.colorSpace = THREE.NoColorSpace

  return (
    <mesh rotation={[0, -Math.PI / 2, 0]}>
      <sphereGeometry args={[2, 384, 384]} />
      <meshStandardMaterial
        map={colorMap}
        displacementMap={elevationMap}
        displacementScale={0.05}
        displacementBias={-0.015}
        bumpMap={elevationMap}
        bumpScale={0.03}
        roughness={0.92}
        metalness={0.02}
      />
    </mesh>
  )
}

export default function LunarGlobe() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, -1.2, 4.0], fov: 45 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      style={{ width: '100vw', height: '100vh' }}
    >
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[8, 4, 6]} intensity={2.8} />
      <directionalLight position={[-8, -2, -6]} intensity={0.3} />
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />
      <Suspense fallback={null}>
        <Moon />
      </Suspense>
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={2.4} maxDistance={10.0} />
    </Canvas>
  )
}
