import { useMemo, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { type LandingSite } from '../../data/sites'

interface SiteMarkerProps {
  site: LandingSite
  position: [number, number, number]
  lineHeight?: number
}

export function SiteMarker({ site, position, lineHeight = 4.5 }: SiteMarkerProps) {
  const [hovered, setHovered] = useState(false)
  const landerRef = useRef<THREE.Group>(null)
  const { scene } = useGLTF('/models/lander/lander.glb')

  // Clean up cursor on unmount
  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [])

  // Minimalist white line from the ground up to the lander
  const lineObject = useMemo(() => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, lineHeight, 0)]
    const geom = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    return new THREE.Line(geom, mat)
  }, [lineHeight])

  // Clone lander scene with pivot adjustment
  const clonedLander = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    // Exact pivot compensation so the legs sit at local Y = 0 (see ASSETS.md)
    clone.position.set(0.0, 67.037, -67.037)
    return clone
  }, [scene])

  // Gentle rotation on hover
  useFrame((_, delta) => {
    if (landerRef.current && hovered) {
      landerRef.current.rotation.y += delta * 1.5
    }
  })

  return (
    <group position={position}>
      {/* Ground contact ring */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.42, 32]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>

      {/* Minimalist vertical white line */}
      <primitive object={lineObject} />

      {/* Interactive area and lander sitting on top of the line */}
      <group
        position={[0, lineHeight, 0]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        {/* Invisible hit-box to make hover interaction smooth and reliable */}
        <mesh visible={false} position={[0, 1.2, 0]}>
          <sphereGeometry args={[2.5, 12, 12]} />
        </mesh>

        {/* Small lander model (scale ~0.018, height ~2.5 units) */}
        <group ref={landerRef}>
          <group scale={0.018}>
            <primitive object={clonedLander} />
          </group>
        </group>

        {/* Hover tooltip displaying site name and coordinates */}
        {hovered && (
          <Html
            position={[0, 3.2, 0]}
            center
            distanceFactor={85}
            style={{ pointerEvents: 'none' }}
          >
            <div className="bg-[#030712]/95 border border-white/80 px-3 py-2 rounded shadow-2xl backdrop-blur-md pointer-events-none text-white whitespace-nowrap font-mono select-none">
              <div className="text-xs font-bold text-white tracking-wider uppercase mb-1 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]">
                {site.name}
              </div>
              <div className="text-[11px] text-cyan-300 font-mono flex items-center gap-3">
                <span>LAT: {site.coordinates.latitude.toFixed(2)}°</span>
                <span>LON: {site.coordinates.longitude.toFixed(2)}°</span>
                <span>
                  ELEV: {site.coordinates.elevation_m > 0 ? `+${site.coordinates.elevation_m}` : site.coordinates.elevation_m}m
                </span>
              </div>
              {site.description && (
                <div className="text-[10px] text-slate-300 max-w-[280px] mt-1 font-sans leading-tight border-t border-white/20 pt-1">
                  {site.description}
                </div>
              )}
            </div>
          </Html>
        )}
      </group>
    </group>
  )
}

useGLTF.preload('/models/lander/lander.glb')
