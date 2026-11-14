import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { ProbeHoloPanel, type ProbeCoords } from '../ui/ProbeHoloPanel'

interface TerrainProbeMarkerProps {
  position: [number, number, number]
  coords: ProbeCoords
  onClose: () => void
  beaconHeight?: number
}

export function TerrainProbeMarker({
  position,
  coords,
  onClose,
  beaconHeight = 5.5,
}: TerrainProbeMarkerProps) {
  const lineObject = useMemo(() => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, beaconHeight, 0)]
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    return new THREE.Line(geom, mat)
  }, [beaconHeight])

  const direction = position[0] > 25 ? 'left' : 'right'

  return (
    <group position={position}>
      {/* Ground contact pulsing rings in white */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.55, 32]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.05, 32]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.4} />
      </mesh>

      {/* Vertical glowing white beacon line */}
      <primitive object={lineObject} />

      {/* Beacon top glowing bead */}
      <group position={[0, beaconHeight, 0]}>
        <mesh>
          <sphereGeometry args={[0.38, 16, 16]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <pointLight color="#ffffff" intensity={2.0} distance={40} />

        {/* Floating holographic coordinates panel (matches candidate sites HUD) */}
        <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
          <ProbeHoloPanel
            coords={coords}
            direction={direction}
            extra={{
              label: 'ESCENA 3D',
              value: `[${position[0].toFixed(1)}, ${position[1].toFixed(1)}, ${position[2].toFixed(1)}]`,
            }}
            onClose={onClose}
          />
        </Html>
      </group>
    </group>
  )
}
