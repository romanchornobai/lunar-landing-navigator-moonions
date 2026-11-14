import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { X, Crosshair } from 'lucide-react'
import { SciFiHudPanel } from '../ui/SciFiHudPanel'

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
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    return new THREE.Line(geom, mat)
  }, [beaconHeight])

  const latStr = `${Math.abs(coords.latitude).toFixed(3)}° ${coords.latitude < 0 ? 'S' : 'N'}`
  const lonStr = `${Math.abs(coords.longitude).toFixed(3)}° ${coords.longitude < 0 ? 'W' : 'E'}`
  const elevStr = `${coords.elevation_m >= 0 ? '+' : ''}${coords.elevation_m.toLocaleString()} m`

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
          <div
            style={{
              position: 'relative',
              width: '1px',
              height: '1px',
              pointerEvents: 'auto',
            }}
          >
            {/* Keyframe animations matching landing sites */}
            <style>{`
              @keyframes probeLineDrawRight {
                0% { stroke-dashoffset: 140; opacity: 0; }
                100% { stroke-dashoffset: 0; opacity: 1; }
              }
              @keyframes probeLineDrawLeft {
                0% { stroke-dashoffset: 140; opacity: 0; }
                100% { stroke-dashoffset: 0; opacity: 1; }
              }
              @keyframes probeHoloProjectRight {
                0% {
                  opacity: 0;
                  transform: translateY(-50%) scale(0.04, 0.02);
                  filter: brightness(4) drop-shadow(0 0 25px #ffffff) blur(2px);
                }
                100% {
                  opacity: 1;
                  transform: translateY(-50%) scale(1, 1);
                  filter: brightness(1) drop-shadow(0 0 6px rgba(255,255,255,0.4));
                }
              }
              @keyframes probeHoloProjectLeft {
                0% {
                  opacity: 0;
                  transform: translateY(-50%) scale(0.04, 0.02);
                  filter: brightness(4) drop-shadow(0 0 25px #ffffff) blur(2px);
                }
                100% {
                  opacity: 1;
                  transform: translateY(-50%) scale(1, 1);
                  filter: brightness(1) drop-shadow(0 0 6px rgba(255,255,255,0.4));
                }
              }
            `}</style>

            {/* Laser guide line from beacon to panel */}
            <svg
              style={{
                position: 'absolute',
                top: '0px',
                left: direction === 'right' ? '0px' : '-85px',
                width: '85px',
                height: '50px',
                overflow: 'visible',
                pointerEvents: 'none',
              }}
            >
              {direction === 'right' ? (
                <path
                  d="M 0 0 L 25 -22 L 78 -22"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: '140',
                    animation: 'probeLineDrawRight 0.16s ease-out forwards',
                    filter: 'drop-shadow(0 0 6px #ffffff)',
                  }}
                />
              ) : (
                <path
                  d="M 85 0 L 60 -22 L 7 -22"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: '140',
                    animation: 'probeLineDrawLeft 0.16s ease-out forwards',
                    filter: 'drop-shadow(0 0 6px #ffffff)',
                  }}
                />
              )}
              <circle
                cx={direction === 'right' ? 78 : 7}
                cy="-22"
                r="3"
                fill="#ffffff"
                style={{ filter: 'drop-shadow(0 0 8px #ffffff)' }}
              />
            </svg>

            {/* Container with SciFiHudPanel */}
            <div
              style={{
                position: 'absolute',
                ...(direction === 'right'
                  ? { left: '88px', transformOrigin: 'left center' }
                  : { right: '88px', transformOrigin: 'right center' }),
                top: '-22px',
                animation:
                  direction === 'right'
                    ? 'probeHoloProjectRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) both'
                    : 'probeHoloProjectLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
              className="w-[340px] sm:w-[370px]"
            >
              <SciFiHudPanel badgeTitle="TELEMETRÍA // SONDA">
                <div className="font-mono text-xs select-none tracking-wide text-neutral-100">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-white" />
                      <span className="font-bold text-white tracking-widest text-[13px] uppercase">
                        SONDA DE SUPERFICIE
                      </span>
                    </div>
                    <button
                      onClick={onClose}
                      className="text-neutral-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10 cursor-pointer"
                      title="Cerrar panel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Grid Coordenadas */}
                  <div className="grid grid-cols-2 gap-2.5 mb-2.5 p-2.5 rounded bg-white/[0.04] border border-white/15 backdrop-blur-sm">
                    <div>
                      <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
                        LATITUD
                      </span>
                      <span className="text-white font-semibold text-xs tracking-tight">
                        {latStr}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
                        LONGITUD
                      </span>
                      <span className="text-white font-semibold text-xs tracking-tight">
                        {lonStr}
                      </span>
                    </div>
                  </div>

                  {/* Grid Altitud y Coordenadas 3D */}
                  <div className="grid grid-cols-2 gap-2.5 mb-2.5 p-2.5 rounded bg-white/[0.04] border border-white/15 backdrop-blur-sm">
                    <div>
                      <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
                        ALTITUD
                      </span>
                      <span className="text-white font-bold text-xs tracking-tight">
                        {elevStr}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
                        ESCENA 3D
                      </span>
                      <span className="text-neutral-300 font-mono text-[11px]">
                        [{position[0].toFixed(1)}, {position[1].toFixed(1)}, {position[2].toFixed(1)}]
                      </span>
                    </div>
                  </div>

                  {/* Footer metadata */}
                  <div className="mt-3 text-[10px] text-neutral-400 border-t border-white/10 pt-2 flex items-center justify-between">
                    <span className="tracking-wider uppercase text-[9px] text-neutral-300">
                      MODELO CIENTÍFICO LRO LOLA
                    </span>
                    <span className="text-[9px] text-neutral-400">DTM 364 KM</span>
                  </div>
                </div>
              </SciFiHudPanel>
            </div>
          </div>
        </Html>
      </group>
    </group>
  )
}
