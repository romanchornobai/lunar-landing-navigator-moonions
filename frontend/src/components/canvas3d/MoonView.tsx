import { useLoader } from '@react-three/fiber'
import { TIFFLoader } from 'three/examples/jsm/loaders/TIFFLoader.js'
import ViewCanvas from './ViewCanvas'

// Global Moon: NASA SVS CGI Moon Kit (LROC WAC color + LOLA DEM). See DATA_SOURCES.md.
function Moon() {
  const [color, displacement] = useLoader(TIFFLoader, [
    '/textures/lroc_color_16bit_srgb_8k.tif',
    '/textures/ldem_16_uint.tif',
  ])
  return (
    <mesh rotation={[0, -Math.PI / 2, 0]}>
      <sphereGeometry args={[2, 384, 384]} />
      <meshStandardMaterial
        map={color}
        displacementMap={displacement}
        displacementScale={0.05}
        displacementBias={-0.015}
        bumpMap={displacement}
        bumpScale={0.03}
        roughness={0.92}
        metalness={0.02}
      />
    </mesh>
  )
}

export default function MoonView() {
  return (
    <ViewCanvas camera={{ position: [0, 0, 6], far: 100 }} minDistance={2.5} maxDistance={20}>
      <ambientLight intensity={0.25} />
      <directionalLight position={[10, 4, 8]} intensity={3} />
      <Moon />
    </ViewCanvas>
  )
}
