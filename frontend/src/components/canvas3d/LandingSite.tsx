import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Stars, useGLTF } from '@react-three/drei'

// Candidate landing sites: LRO LOLA 15 km x 15 km terrain at 1:1 scale (meters), site center at [0,0,0].
// Ground normals are in scene axes (Y up). See ASSETS.md / DATA_SOURCES.md.
// lat / lon: site at the mesh centre (deg); profile: id of its LOLA horizon in data/horizonProfiles.json.
export const SITES = {
  cr1: {
    glb: '/models/connecting_ridge_cr1/connecting_ridge_cr1_15km.glb',
    normal: [0.0251, 0.9997, 0.0082],
    lat: -89.4395,
    lon: -137.1934,
    profile: 'connecting-ridge-cr1',
  },
  malapert: {
    glb: '/models/malapert_massif/malapert_massif_15km.glb',
    normal: [0.0742, 0.9965, -0.0373],
    lat: -85.99,
    lon: 2.93,
    profile: 'malapert',
  },
  degerlache: {
    glb: '/models/de_gerlache_rim/de_gerlache_rim_15km.glb',
    normal: [0.0076, 0.9953, 0.0965],
    lat: -88.71,
    lon: -68.7,
    profile: 'degerlache',
  },
  nobile: {
    glb: '/models/nobile_rim_1/nobile_rim_1_15km.glb',
    normal: [-0.2347, 0.9716, -0.0312],
    lat: -85.25,
    lon: 35.8,
    profile: 'nobile',
  },
} as const

export type SiteKey = keyof typeof SITES

const LANDER_URL = '/models/lander/lander.glb'
const TEX = '/models/moon_texture/textures'
const SUN_DISTANCE = 3000 // m, directional light placement distance (only the direction matters)

// Placeholder Sun direction (azimuth clockwise from north = -Z, elevation above the local horizon, degrees).
// TODO: drive from the JPL Horizons ephemerides (Sun id 10) once the store/ephemeris layer exists.
const DEFAULT_SUN_AZIMUTH_DEG = 116.6
const DEFAULT_SUN_ELEVATION_DEG = 3.3

function Terrain({ glb }: { glb: string }) {
  const { scene } = useGLTF(glb)
  const [diffuse, normal, rough, ao] = useLoader(THREE.TextureLoader, [
    `${TEX}/moon_meteor_01_diff_2k.jpg`,
    `${TEX}/moon_meteor_01_nor_2k.jpg`,
    `${TEX}/moon_meteor_01_rough_2k.jpg`,
    `${TEX}/moon_meteor_01_ao_2k.jpg`,
  ])

  const terrain = useMemo(() => {
    for (const tex of [diffuse, normal, rough, ao]) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.generateMipmaps = true
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.anisotropy = 16 // clamped to the GPU maximum; sharp at grazing angles
    }
    diffuse.colorSpace = THREE.SRGBColorSpace
    normal.colorSpace = THREE.NoColorSpace
    // aoMap reads the mesh's first UV set (channel 0): the terrain GLBs only have one, so no uv2 copy is needed.
    ao.channel = 0

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5a606a'),
      map: diffuse,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughnessMap: rough,
      roughness: 0.92,
      metalness: 0.02,
      aoMap: ao,
      aoMapIntensity: 1.2,
      flatShading: false,
    })

    // Anti-tiling (double sampling, second layer rotated 28 deg) + distance fade to plain geological color.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        /* glsl */ `
        const mat2 rotAntiTile = mat2(0.8829, -0.4695, 0.4695, 0.8829);
        vec2 uvA = vMapUv * 260.0;
        vec2 uvB = rotAntiTile * (vMapUv * 367.0) + vec2(0.381, 0.593);
        vec3 organicMicro = mix(texture2D(map, uvA).rgb, texture2D(map, uvB).rgb, 0.5);
        // 1 UV = 15,000 m of terrain; the lander sits at the UV center.
        float distToLander = distance(vMapUv, vec2(0.5, 0.5)) * 15000.0;
        // 0-1200 m: sharp micro-texture; 1200-3500 m: smooth transition; >3500 m: plain color, no visible repetition.
        float microWeight = 1.0 - smoothstep(1200.0, 3500.0, distToLander);
        vec3 distantGeology = vec3(0.36, 0.38, 0.42);
        vec3 finalAlbedo = mix(distantGeology, organicMicro * 1.05, microWeight);
        diffuseColor.rgb *= finalAlbedo * 1.05;
        `,
      )
    }

    const clone = scene.clone(true)
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh
        m.material = material
        m.receiveShadow = true
        // The terrain is a 30 m/px heightfield: it cannot self-shadow within the 60 m shadow window, and
        // casting would re-draw the whole mesh into the shadow map every frame. Only the lander casts.
        m.castShadow = false
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

  // Align +Y with the ground normal so the lander sits on the slope.
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...groundNormal).normalize())
    return q
  }, [groundNormal])

  return (
    <group position={[0, 0, 0]} quaternion={quaternion}>
      <group scale={0.1} rotation={[0, 0.35, 0]}>
        <primitive object={clone} />
      </group>
      {/* Beacon on the top antenna (lander is 13.4 m tall at scale 0.1) */}
      <mesh position={[0, 14.5, 0]}>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <pointLight position={[0, 14.5, 0]} color="#38bdf8" intensity={2.5} distance={150} />
    </group>
  )
}

function Lights({ azimuthDeg, elevationDeg }: { azimuthDeg: number; elevationDeg: number }) {
  if (elevationDeg <= 0) {
    // Night vision (NVG): Sun below the horizon
    return (
      <>
        <ambientLight color="#4ade80" intensity={1.4} />
        <directionalLight position={[150, 260, 160]} color="#86efac" intensity={2.8} />
        <directionalLight position={[-2500, 3000, -2500]} color="#22c55e" intensity={1.6} />
      </>
    )
  }

  const phi = THREE.MathUtils.degToRad(azimuthDeg)
  const elev = THREE.MathUtils.degToRad(elevationDeg)
  const x = SUN_DISTANCE * Math.cos(elev) * Math.sin(phi)
  const y = Math.max(-100, SUN_DISTANCE * Math.sin(elev))
  const z = -SUN_DISTANCE * Math.cos(elev) * Math.cos(phi)
  const intensity = Math.max(1.0, Math.min(3.6, 1.8 + elevationDeg * 0.35))

  return (
    <>
      <ambientLight color="#ffffff" intensity={0.38} />
      <directionalLight
        position={[x, y, z]}
        color="#ffffff"
        intensity={intensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00015}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={SUN_DISTANCE * 2}
      />
      <directionalLight position={[-3000, 1000, -2500]} color="#94a3b8" intensity={0.42} />
    </>
  )
}

interface LandingSiteProps {
  siteKey?: SiteKey
  /** Sun azimuth in degrees, clockwise from north (-Z). */
  sunAzimuthDeg?: number
  /** Sun elevation above the local horizon in degrees. <= 0 switches to night vision (NVG). */
  sunElevationDeg?: number
}

export default function LandingSite({
  siteKey = 'cr1',
  sunAzimuthDeg = DEFAULT_SUN_AZIMUTH_DEG,
  sunElevationDeg = DEFAULT_SUN_ELEVATION_DEG,
}: LandingSiteProps) {
  const site = SITES[siteKey]
  const isNightVision = sunElevationDeg <= 0

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        filter: isNightVision ? 'brightness(1.1) contrast(1.25) saturate(220%)' : undefined,
      }}
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 6, 22], fov: 50, near: 0.5, far: 35000 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[isNightVision ? '#021808' : '#010306']} />
        <Lights azimuthDeg={sunAzimuthDeg} elevationDeg={sunElevationDeg} />
        <Stars radius={28000} depth={4000} count={6000} factor={6} saturation={0} fade speed={0.1} />
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
    </div>
  )
}
