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
  'malapert-massif': '/vista-sitio/malapert',
  'de-gerlache-rim': '/vista-sitio/degerlache',
  'nobile-rim-1': '/vista-sitio/nobile',
}

export function SiteMarker({ site, position, lineHeight = 4.5 }: SiteMarkerProps) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const landerRef = useRef<THREE.Group>(null)
  const { scene } = useGLTF('/models/lander/lander.glb')

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  const handlePointerEnter = () => {
    clearCloseTimeout()
    setIsOpen(true)
    document.body.style.cursor = 'pointer'
  }

  const handlePointerLeave = () => {
    clearCloseTimeout()
    // 600ms grace period to easily move the cursor across to the HUD
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
      document.body.style.cursor = 'auto'
    }, 600)
  }

  // Clean up timers and cursor on unmount
  useEffect(() => {
    return () => {
      clearCloseTimeout()
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

  // Gentle rotation while open/hovered
  useFrame((_, delta) => {
    if (landerRef.current && isOpen) {
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
          handlePointerEnter()
        }}
        onPointerOut={() => {
          handlePointerLeave()
        }}
      >
        {/* Hit-box around the lander to make hover interaction easy */}
        <mesh visible={false} position={[0, 1.2, 0]}>
          <sphereGeometry args={[2.8, 12, 12]} />
        </mesh>

        {/* Small lander model (scale ~0.018, height ~2.5 units) */}
        <group ref={landerRef}>
          <group scale={0.018}>
            <primitive object={clonedLander} />
          </group>
        </group>

        {/* Aerospace Sci-Fi HUD Panel anchored to the lander */}
        {isOpen && (
          <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{ position: 'relative', width: '1px', height: '1px', pointerEvents: 'auto' }}>
              {/* Invisible interactive bridge area covering the path from lander to HUD */}
              <div
                style={{
                  position: 'absolute',
                  left: '-30px',
                  top: '-40px',
                  width: '130px',
                  height: '140px',
                }}
                onMouseEnter={handlePointerEnter}
                onMouseLeave={handlePointerLeave}
              />

              <div
                className="w-[350px] sm:w-[390px]"
                style={{ position: 'absolute', left: '88px', top: '-22px' }}
                onMouseEnter={handlePointerEnter}
                onMouseLeave={handlePointerLeave}
              >
                <SciFiHudPanel
                  badgeTitle="TELEMETRÍA"
                  onMouseEnter={handlePointerEnter}
                  onMouseLeave={handlePointerLeave}
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
