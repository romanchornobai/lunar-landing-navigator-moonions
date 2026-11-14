import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { X, Crosshair } from 'lucide-react'

interface TerrainProbeMarkerProps {
  position: [number, number, number]
  coords: {
    latitude: number
    longitude: number
    elevation_m: number
  }
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
    const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 })
    return new THREE.Line(geom, mat)
  }, [beaconHeight])

  const latStr = `${Math.abs(coords.latitude).toFixed(3)}° ${coords.latitude < 0 ? 'S' : 'N'}`
  const lonStr = `${Math.abs(coords.longitude).toFixed(3)}° ${coords.longitude < 0 ? 'W' : 'E'}`
  const elevStr = `${coords.elevation_m >= 0 ? '+' : ''}${coords.elevation_m.toLocaleString()} m`

  return (
    <group position={position}>
      {/* Ground contact pulsing rings */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.55, 32]} />
        <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 0.95, 32]} />
        <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.4} />
      </mesh>

      {/* Vertical glowing beacon line */}
      <primitive object={lineObject} />

      {/* Beacon top glowing bead */}
      <group position={[0, beaconHeight, 0]}>
        <mesh>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshBasicMaterial color="#38bdf8" toneMapped={false} />
        </mesh>
        <pointLight color="#38bdf8" intensity={2.0} distance={40} />

        {/* Floating holographic coordinates panel */}
        <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{ position: 'relative', width: '1px', height: '1px', pointerEvents: 'auto' }}>
            <div
              className="w-[300px] select-none text-white font-mono backdrop-blur-md bg-black/85 border border-[#38bdf8]/60 rounded-lg p-3 shadow-[0_0_20px_rgba(56,189,248,0.25)]"
              style={{ position: 'absolute', left: '16px', top: '-60px' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#38bdf8]/30 pb-1.5 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#38bdf8] tracking-widest uppercase">
                  <Crosshair className="w-3.5 h-3.5 text-[#38bdf8] animate-spin" style={{ animationDuration: '6s' }} />
                  <span>SONDA LUNAR</span>
                </div>
                <button
                  onClick={onClose}
                  className="text-neutral-400 hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
                  title="Cerrar marcador"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Data Grid */}
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center py-0.5 px-1.5 rounded bg-white/[0.04] border border-white/10">
                  <span className="text-neutral-400">LATITUD</span>
                  <span className="text-white font-semibold tracking-wide">{latStr}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 px-1.5 rounded bg-white/[0.04] border border-white/10">
                  <span className="text-neutral-400">LONGITUD</span>
                  <span className="text-white font-semibold tracking-wide">{lonStr}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 px-1.5 rounded bg-white/[0.04] border border-white/10">
                  <span className="text-neutral-400">ALTITUD</span>
                  <span className="text-cyan-300 font-bold tracking-wide">{elevStr}</span>
                </div>
                <div className="flex justify-between items-center py-0.5 px-1.5 rounded bg-white/[0.04] border border-white/10 text-[10px]">
                  <span className="text-neutral-500">ESCENA 3D</span>
                  <span className="text-neutral-300">
                    [{position[0].toFixed(1)}, {position[1].toFixed(1)}, {position[2].toFixed(1)}]
                  </span>
                </div>
              </div>

              <div className="mt-2 text-[9px] text-[#38bdf8]/60 text-center tracking-widest uppercase">
                NASA LRO LOLA // DTM 364 KM
              </div>
            </div>
          </div>
        </Html>
      </group>
    </group>
  )
}
