import { X, Scan } from 'lucide-react'
import { SciFiHudPanel } from './SciFiHudPanel'
import { LedButton } from './LedButton'
import type { AreaSearchResult } from '../../services/areaSearch'
import { AREA_SIZE_KM } from '../../lib/southPoleGrid'

export type AreaComputeState =
  | { status: 'idle' }
  | { status: 'computing'; done: number; total: number }
  | { status: 'done'; result: AreaSearchResult; total: number; period: [string, string] | null }
  | { status: 'error'; message: string }

interface AreaHoloPanelProps {
  center: { latitude: number; longitude: number; elevation_m: number | null }
  state: AreaComputeState
  direction: 'left' | 'right'
  onCompute: () => void
  onClose: () => void
}

const fmtLat = (v: number) => `${Math.abs(v).toFixed(3)}° ${v < 0 ? 'S' : 'N'}`
const fmtLon = (v: number) => `${Math.abs(v).toFixed(3)}° ${v < 0 ? 'W' : 'E'}`
const pct = (v: number) => `${Math.round(v * 100)} %`
const days = (h: number) => `${(h / 24).toFixed(1)} d`
const signed = (m: number) => `${m >= 0 ? '+' : ''}${Math.round(m).toLocaleString()} m`

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-0.5">{label}</span>
      <span className={`text-white text-xs tracking-tight ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</span>
    </div>
  )
}

/** Holographic panel of a selected 15 x 15 km area: CALCULAR button, progress and best point found. */
export function AreaHoloPanel({ center, state, direction, onCompute, onClose }: AreaHoloPanelProps) {
  const best = state.status === 'done' ? state.result.best : null

  return (
    <div style={{ position: 'relative', width: '1px', height: '1px', pointerEvents: 'auto' }}>
      <style>{`
        @keyframes areaLineDraw { 0% { stroke-dashoffset: 140; opacity: 0; } 100% { stroke-dashoffset: 0; opacity: 1; } }
        @keyframes areaHoloProject {
          0% { opacity: 0; transform: translateY(-50%) scale(0.04, 0.02); filter: brightness(4) drop-shadow(0 0 25px #ffffff) blur(2px); }
          100% { opacity: 1; transform: translateY(-50%) scale(1, 1); filter: brightness(1) drop-shadow(0 0 6px rgba(255,255,255,0.4)); }
        }
      `}</style>

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
          style={{ strokeDasharray: '140', animation: 'areaLineDraw 0.16s ease-out forwards', filter: 'drop-shadow(0 0 6px #ffffff)' }}
        />
        <circle cx={direction === 'right' ? 78 : 7} cy="-22" r="3" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 8px #ffffff)' }} />
      </svg>

      <div
        style={{
          position: 'absolute',
          ...(direction === 'right'
            ? { left: '88px', transformOrigin: 'left center' }
            : { right: '88px', transformOrigin: 'right center' }),
          top: '-22px',
          animation: 'areaHoloProject 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
        className="w-[350px] sm:w-[380px]"
      >
        <SciFiHudPanel badgeTitle="ÁREA DE BÚSQUEDA">
          <div className="font-mono text-xs select-none tracking-wide text-neutral-100">
            <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Scan className="w-4 h-4 text-sky-300" />
                <span className="font-bold text-white tracking-widest text-[13px] uppercase">
                  ÁREA {AREA_SIZE_KM} × {AREA_SIZE_KM} KM
                </span>
              </div>
              <button
                onClick={onClose}
                className="text-neutral-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10 cursor-pointer"
                title="Cerrar área"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-2.5 p-2.5 rounded bg-white/[0.04] border border-white/15">
              <Cell label="CENTRO" value={`${fmtLat(center.latitude)} · ${fmtLon(center.longitude)}`} />
              <Cell label="ALTITUD CENTRO" value={center.elevation_m === null ? 'N/D' : `≈ ${signed(center.elevation_m)}`} />
            </div>

            {best && (
              <div className="mb-2.5 p-2.5 rounded bg-sky-400/[0.07] border border-sky-300/40 space-y-2.5">
                <span className="text-[10px] text-sky-300 block uppercase tracking-[0.25em] font-bold">MEJOR PUNTO</span>
                <div className="grid grid-cols-2 gap-2.5">
                  <Cell label="COORDENADAS" value={`${fmtLat(best.lat)} · ${fmtLon(best.lon)}`} />
                  <Cell label="ALTITUD (LOLA)" value={signed(best.ground_height_m)} />
                  <Cell label="SOL + TIERRA A LA VEZ" value={pct(best.sun_and_dte)} strong />
                  <Cell label="PENDIENTE" value={`${best.slope_deg.toFixed(1)}°`} />
                  <Cell label="SOL VISIBLE" value={pct(best.sun_any)} />
                  <Cell label="TIERRA VISIBLE (DTE)" value={pct(best.dte)} />
                  <Cell label="NOCHE MÁS LARGA" value={days(best.longest_dark_h)} />
                  <Cell label="APAGÓN DTE MÁS LARGO" value={days(best.longest_dte_blackout_h)} />
                </div>
                {state.status === 'done' && (
                  <p className="text-[9px] leading-snug text-neutral-400">
                    {state.total} candidatos · {state.period ? `${state.period[0].slice(0, 10)} → ${state.period[1].slice(0, 10)}` : ''} ·
                    mástil {state.result.model.mast_m} m · {state.result.elapsed_s.toFixed(1)} s · LRO LOLA + JPL HORIZONS
                  </p>
                )}
              </div>
            )}

            {state.status === 'error' && (
              <p className="mb-2.5 text-[11px] leading-snug text-red-300">{state.message}</p>
            )}

            {state.status !== 'done' && (
              <LedButton
                className="w-full h-9 text-xs"
                onClick={state.status === 'computing' ? undefined : onCompute}
              >
                {state.status === 'computing'
                  ? `CALCULANDO… ${state.total ? Math.round((state.done / state.total) * 100) : 0} %`
                  : state.status === 'error'
                    ? 'REINTENTAR'
                    : 'CALCULAR'}
              </LedButton>
            )}
          </div>
        </SciFiHudPanel>
      </div>
    </div>
  )
}
