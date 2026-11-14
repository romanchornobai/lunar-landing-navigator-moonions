import { useMemo, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { type LandingSite, SITE_SCENES_15KM } from '../../data/sites'
import { SciFiHudPanel } from '../ui/SciFiHudPanel'
import { TerminalCardContent } from '../ui/TerminalCardContent'

interface SiteMarkerProps {
  site: LandingSite
  position: [number, number, number]
  lineHeight?: number
}

const SITE_ROUTE_MAP: Record<string, string> = {
  'shackleton-connecting-ridge': '/vista-sitio/shackleton',
  'shackleton-center-psr': '/vista-sitio/shackleton',
  'malapert-massif': '/vista-sitio/malapert',
  'de-gerlache-rim': '/vista-sitio/degerlache',
  'nobile-rim-1': '/vista-sitio/nobile',
}

export function SiteMarker({ site, position, lineHeight = 4.5 }: SiteMarkerProps) {
  const navigate = useNavigate()
  const [isLanderHovered, setIsLanderHovered] = useState(false)
  const [isOverHud, setIsOverHud] = useState(false)
  const landerRef = useRef<THREE.Group>(null)
  const { scene } = useGLTF('/models/lander/lander.glb')

  const isHovered = isLanderHovered || isOverHud

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
    if (landerRef.current && isHovered) {
      landerRef.current.rotation.y += delta * 1.5
    }
  })

  // Format site data for TerminalCardContent
  const siteData = useMemo(() => {
    return {
      id: site.id,
      name: site.name,
      shortName: SITE_SCENES_15KM[site.id]?.shortName || site.name.split('-')[0].trim(),
      description: site.description,
      scientificInterest: site.scientific_interest,
      coordinates: site.coordinates,
    }
  }, [site])

  const handleAction = () => {
    const route = SITE_ROUTE_MAP[site.id]
    if (route) {
      navigate(route)
    } else {
      alert(`Iniciando aproximación a ${site.name}`)
    }
  }

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
          setIsLanderHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setIsLanderHovered(false)
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

        {/* Aerospace Sci-Fi HUD Panel anchored to the lander */}
        {isHovered && (
          <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{ position: 'relative', width: '1px', height: '1px', pointerEvents: 'auto' }}>
              <div
                className="w-[350px] sm:w-[390px]"
                style={{ position: 'absolute', left: '88px', top: '-22px' }}
              >
                <SciFiHudPanel
                  badgeTitle="TELEMETRÍA"
                  onMouseEnter={() => setIsOverHud(true)}
                  onMouseLeave={() => setIsOverHud(false)}
                >
                  <TerminalCardContent
                    site={siteData}
                    actionLabel="ALUNIZAR // 15 KM"
                    onAction={handleAction}
                  />
                </SciFiHudPanel>
              </div>
            </div>
          </Html>
        )}
      </group>
    </group>
  )
}

useGLTF.preload('/models/lander/lander.glb')
