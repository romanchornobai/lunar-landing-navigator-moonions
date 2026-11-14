import { Suspense, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Stars, useGLTF } from '@react-three/drei'

// Candidate landing sites: LRO LOLA 15 km x 15 km terrain at 1:1 scale (meters), site center at [0,0,0].
// Ground normals are in scene axes (Y up). See ASSETS.md / DATA_SOURCES.md.
export const SITES = {
  shackleton: {
    glb: '/models/shackleton_rim/shackleton_rim_15km.glb',
    normal: [-0.2871, 0.9229, -0.2567],
  },
  malapert: {
    glb: '/models/malapert_massif/malapert_massif_15km.glb',
    normal: [0.0742, 0.9965, -0.0373],
  },
  degerlache: {
    glb: '/models/de_gerlache_rim/de_gerlache_rim_15km.glb',
    normal: [0.0076, 0.9953, 0.0965],
  },
  nobile: {
    glb: '/models/nobile_rim_1/nobile_rim_1_15km.glb',
    normal: [-0.2347, 0.9716, -0.0312],
  },
} as const

export type SiteKey = keyof typeof SITES

const LANDER_URL = '/models/lander/lander.glb'
const TEX = '/models/moon_texture/textures'

function Terrain({ glb }: { glb: string }) {
  const { scene } = useGLTF(glb)
  const [diffuse, normal, rough, ao] = useLoader(THREE.TextureLoader, [
    `${TEX}/moon_meteor_01_diff_2k.jpg`,
    `${TEX}/moon_meteor_01_nor_2k.jpg`,
    `${TEX}/moon_meteor_01_rough_2k.jpg`,
    `${TEX}/moon_meteor_01_ao_2k.jpg`,
  ])

  const terrain = useMemo(() => {
    for (const t of [diffuse, normal, rough, ao]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 16
    }
    diffuse.colorSpace = THREE.SRGBColorSpace
    normal.colorSpace = THREE.NoColorSpace
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5a606a'),
      map: diffuse,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: rough,
      roughness: 0.94,
      aoMap: ao,
      aoMapIntensity: 1.1,
    })
    const clone = scene.clone(true)
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh
        m.material = material
        m.receiveShadow = true
      }
    })
    return clone
  }, [scene, diffuse, normal, rough, ao])

  return <primitive object={terrain} position={[0, 0, 0]} />
}

function Lander({ groundNormal }: { groundNormal: readonly number[] }) {
  const { scene } = useGLTF(LANDER_URL)
  const clone = useMemo(() => {
    const c = scene.clone(true)
    // Model pivot is offset: this puts the four feet at Y = 0 (ASSETS.md).
    c.position.set(0.0, 67.037, -67.037)
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
    return c
  }, [scene])

  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...groundNormal).normalize())
    return q
  }, [groundNormal])

  useLayoutEffect(() => {
    clone.updateMatrixWorld(true)
  }, [clone])

  return (
    <group position={[0, 0, 0]} quaternion={quaternion}>
      <group scale={0.1} rotation={[0, 0.35, 0]}>
        <primitive object={clone} />
      </group>
    </group>
  )
}

export default function LandingSite({ siteKey = 'shackleton' }: { siteKey?: SiteKey }) {
  const site = SITES[siteKey]
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 6, 22], fov: 48 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      style={{ width: '100vw', height: '100vh' }}
    >
      <color attach="background" args={['#020408']} />
      <ambientLight intensity={0.22} color="#ffffff" />
      <directionalLight
        position={[280, 18, 140]}
        intensity={3.2}
        color="#fffbf0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={700}
      />
      <directionalLight position={[-120, 30, -180]} intensity={0.4} color="#94a3b8" />
      <Stars radius={300} depth={100} count={5000} factor={4} saturation={0} fade speed={0.2} />
      <Suspense fallback={null}>
        <Terrain key={siteKey} glb={site.glb} />
        <Lander groundNormal={site.normal} />
      </Suspense>
      <OrbitControls
        target={[0, 1.5, 0]}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.01}
        minDistance={3}
        maxDistance={250}
      />
    </Canvas>
  )
}
