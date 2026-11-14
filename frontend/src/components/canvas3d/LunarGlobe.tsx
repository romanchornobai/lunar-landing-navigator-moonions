import { Suspense } from 'react'
import * as THREE from 'three'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { TIFFLoader } from 'three/examples/jsm/loaders/TIFFLoader.js'

// NASA SVS CGI Moon Kit (https://svs.gsfc.nasa.gov/4720/): LROC WAC color + LOLA DEM (16-bit).
// Sphere radius 2.0 scene units; relief params from ASSETS.md.
const COLOR_URL = '/textures/lroc_color_16bit_srgb_8k.tif'
const ELEVATION_URL = '/textures/ldem_16_uint.tif'

function Moon() {
  const [colorMap, elevationMap] = useLoader(TIFFLoader, [COLOR_URL, ELEVATION_URL]) as THREE.Texture[]
  colorMap.colorSpace = THREE.SRGBColorSpace

  return (
    <mesh rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
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
      shadows
      camera={{ position: [0, -1.2, 4.0], fov: 45 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: '100vw', height: '100vh' }}
    >
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[8, 4, 6]} intensity={2.8} castShadow />
      <directionalLight position={[-8, -2, -6]} intensity={0.3} />
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />
      <Suspense fallback={null}>
        <Moon />
      </Suspense>
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={2.4} maxDistance={10.0} />
    </Canvas>
  )
}
