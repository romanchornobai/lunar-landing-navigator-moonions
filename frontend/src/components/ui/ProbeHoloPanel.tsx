import { X, Crosshair } from 'lucide-react'
import { SciFiHudPanel } from './SciFiHudPanel'

export interface ProbeCoords {
  latitude: number // deg, planetocentric (IAU Moon)
  longitude: number // deg east, -180..180
  elevation_m: number | null // m, approx. LOLA height from the regional grid (+-261 m); null outside it
}

interface ProbeHoloPanelProps {
  coords: ProbeCoords
  direction: 'left' | 'right'
  /** Fourth cell of the panel: scene position in 3D, polar X/Y in 2D. */
  extra: { label: string; value: string }
  onClose: () => void
}

/**
 * Holographic "SURFACE PROBE" panel anchored at a 1x1 px origin (the probed point).
 * Shared by the 3D terrain probe (drei Html) and the 2D polar map probe.
 */
export function ProbeHoloPanel({ coords, direction, extra, onClose }: ProbeHoloPanelProps) {
  const latStr = `${Math.abs(coords.latitude).toFixed(3)}° ${coords.latitude < 0 ? 'S' : 'N'}`
  const lonStr = `${Math.abs(coords.longitude).toFixed(3)}° ${coords.longitude < 0 ? 'W' : 'E'}`
  const elevStr =
    coords.elevation_m === null
      ? 'N/A'
      : `≈ ${coords.elevation_m >= 0 ? '+' : ''}${coords.elevation_m.toLocaleString()} m`

  return (
    <div
      style={{
        position: 'relative',
        width: '1px',
        height: '1px',
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes probeLineDraw {
          0% { stroke-dashoffset: 140; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes probeHoloProject {
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

      {/* Laser guide line from the probed point to the panel */}
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
        <path
          d={direction === 'right' ? 'M 0 0 L 25 -22 L 78 -22' : 'M 85 0 L 60 -22 L 7 -22'}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: '140',
            animation: 'probeLineDraw 0.16s ease-out forwards',
            filter: 'drop-shadow(0 0 6px #ffffff)',
          }}
        />
        <circle
          cx={direction === 'right' ? 78 : 7}
          cy="-22"
          r="3"
          fill="#ffffff"
          style={{ filter: 'drop-shadow(0 0 8px #ffffff)' }}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          ...(direction === 'right'
            ? { left: '88px', transformOrigin: 'left center' }
            : { right: '88px', transformOrigin: 'right center' }),
          top: '-22px',
          animation: 'probeHoloProject 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
        className="w-[340px] sm:w-[370px]"
      >
        <SciFiHudPanel badgeTitle="TELEMETRY">
          <div className="font-mono text-xs select-none tracking-wide text-neutral-100">
            <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-white" />
                <span className="font-bold text-white tracking-widest text-[13px] uppercase">
                  SURFACE PROBE
                </span>
              </div>
              <button
                onClick={onClose}
                className="text-neutral-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10 cursor-pointer"
                title="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-2.5 p-2.5 rounded bg-white/[0.04] border border-white/15 backdrop-blur-sm">
              <div>
                <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
                  LATITUDE
                </span>
                <span className="text-white font-semibold text-xs tracking-tight">{latStr}</span>
              </div>
              <div>
                <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
                  LONGITUDE
                </span>
                <span className="text-white font-semibold text-xs tracking-tight">{lonStr}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-2.5 p-2.5 rounded bg-white/[0.04] border border-white/15 backdrop-blur-sm">
              <div>
                <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
                  ALTITUDE
                </span>
                <span className="text-white font-bold text-xs tracking-tight">{elevStr}</span>
              </div>
              <div>
                <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">
                  {extra.label}
                </span>
                <span className="text-neutral-300 font-mono text-[11px]">{extra.value}</span>
              </div>
            </div>

            <div className="mt-3 text-[10px] text-neutral-400 border-t border-white/10 pt-2 flex items-center justify-between">
              <span className="tracking-wider uppercase text-[9px] text-neutral-300">
                LRO LOLA SCIENTIFIC MODEL
              </span>
              <span className="text-[9px] text-neutral-400">ALTITUDE ±260 M</span>
            </div>
          </div>
        </SciFiHudPanel>
      </div>
    </div>
  )
}
