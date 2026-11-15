import { X, Scan } from 'lucide-react'
import { SciFiHudPanel } from './SciFiHudPanel'
import { LedButton } from './LedButton'
import type { AreaCandidateStats, AreaSearchResult } from '../../services/areaSearch'
import { AREA_SIZE_KM } from '../../lib/southPoleGrid'

export type AreaComputeState =
  | { status: 'idle' }
  | { status: 'computing'; done: number; total: number }
  | { status: 'done'; result: AreaSearchResult; total: number; period: [string, string] | null }
  | { status: 'error'; message: string }

/** Custom coordinates typed by the user, evaluated by the backend (GET /api/point). */
export type PointState =
  | { lat: number; lon: number; status: 'loading' }
  | { lat: number; lon: number; status: 'done'; stats: AreaCandidateStats }
  | { lat: number; lon: number; status: 'error'; message: string }

interface AreaHoloPanelProps {
  center: { latitude: number; longitude: number; elevation_m: number | null }
  point?: PointState | null
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

const RANK_LABEL = { sun_and_dte: 'SUN + EARTH', sun_mean_fraction: 'SUNLIGHT', dte: 'EARTH (DTE)' } as const

/** Range of the ranking value over all evaluated points, with the colour scale of the 3D columns (AreaHeatmap). */
function AreaSpread({ result }: { result: AreaSearchResult }) {
  const key = result.rank_key ?? 'sun_and_dte'
  const values = result.all.map((p) => p[key])
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return (
    <div className="pt-2 border-t border-white/10">
      <span className="text-[9px] text-neutral-400 block uppercase tracking-widest mb-1">
        {RANK_LABEL[key]} ACROSS THIS AREA · {values.length} POINTS
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-red-400">{pct(lo)}</span>
        <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-red-500 to-white" />
        <span className="text-xs font-bold text-white">{pct(hi)}</span>
      </div>
      <p className="mt-1 text-[9px] leading-snug text-neutral-400">A few hundred metres can change the result this much.</p>
    </div>
  )
}

/** Holographic panel of a selected 15 x 15 km area: COMPUTE button, progress and best point found. */
export function AreaHoloPanel({ center, point, state, direction, onCompute, onClose }: AreaHoloPanelProps) {
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
        <SciFiHudPanel badgeTitle="SEARCH AREA">
          <div className="font-mono text-xs select-none tracking-wide text-neutral-100">
            <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Scan className="w-4 h-4 text-sky-300" />
                <span className="font-bold text-white tracking-widest text-[13px] uppercase">
                  AREA {AREA_SIZE_KM} × {AREA_SIZE_KM} KM
                </span>
              </div>
              <button
                onClick={onClose}
                className="text-neutral-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10 cursor-pointer"
                title="Close area"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-2.5 p-2.5 rounded bg-white/[0.04] border border-white/15">
              <Cell label="CENTER" value={`${fmtLat(center.latitude)} · ${fmtLon(center.longitude)}`} />
              <Cell label="CENTER ALTITUDE" value={center.elevation_m === null ? 'N/A' : `≈ ${signed(center.elevation_m)}`} />
            </div>

            {point && (
              <div className="mb-2.5 p-2.5 rounded bg-amber-300/[0.07] border border-amber-300/50 space-y-2.5">
                <span className="text-[10px] text-amber-300 block uppercase tracking-[0.25em] font-bold">YOUR POINT</span>
                <Cell label="COORDINATES" value={`${fmtLat(point.lat)} · ${fmtLon(point.lon)}`} />
                {point.status === 'loading' && (
                  <p className="text-[11px] text-neutral-300">Computing its horizon and 3 years of Sun and Earth…</p>
                )}
                {point.status === 'error' && <p className="text-[11px] leading-snug text-red-300">{point.message}</p>}
                {point.status === 'done' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <Cell label="SUN + EARTH AT ONCE" value={pct(point.stats.sun_and_dte)} strong />
                    <Cell label="ALTITUDE (LOLA)" value={signed(point.stats.ground_height_m)} />
                    <Cell label="SUN VISIBLE" value={pct(point.stats.sun_any)} />
                    <Cell label="EARTH VISIBLE (DTE)" value={pct(point.stats.dte)} />
                    <Cell label="LONGEST NIGHT" value={days(point.stats.longest_dark_h)} />
                    <Cell label="LONGEST DTE BLACKOUT" value={days(point.stats.longest_dte_blackout_h)} />
                  </div>
                )}
              </div>
            )}

            {best && (
              <div className="mb-2.5 p-2.5 rounded bg-sky-400/[0.07] border border-sky-300/40 space-y-2.5">
                <span className="text-[10px] text-sky-300 block uppercase tracking-[0.25em] font-bold">BEST POINT</span>
                <div className="grid grid-cols-2 gap-2.5">
                  <Cell label="COORDINATES" value={`${fmtLat(best.lat)} · ${fmtLon(best.lon)}`} />
                  <Cell label="ALTITUDE (LOLA)" value={signed(best.ground_height_m)} />
                  <Cell label="SUN + EARTH AT ONCE" value={pct(best.sun_and_dte)} strong />
                  <Cell label="SLOPE" value={`${best.slope_deg.toFixed(1)}°`} />
                  <Cell label="SUN VISIBLE" value={pct(best.sun_any)} />
                  <Cell label="EARTH VISIBLE (DTE)" value={pct(best.dte)} />
                  <Cell label="LONGEST NIGHT" value={days(best.longest_dark_h)} />
                  <Cell label="LONGEST DTE BLACKOUT" value={days(best.longest_dte_blackout_h)} />
                </div>
                {state.status === 'done' && state.result.all?.length > 1 && <AreaSpread result={state.result} />}
                {state.status === 'done' && (
                  <p className="text-[9px] leading-snug text-neutral-400">
                    {state.total} candidates · {state.period ? `${state.period[0].slice(0, 10)} → ${state.period[1].slice(0, 10)}` : ''} ·
                    mast {state.result.model.mast_m} m · {state.result.elapsed_s.toFixed(1)} s · LRO LOLA + JPL HORIZONS
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
                  ? `COMPUTING… ${state.total ? Math.round((state.done / state.total) * 100) : 0} %`
                  : state.status === 'error'
                    ? 'RETRY'
                    : 'COMPUTE'}
              </LedButton>
            )}
          </div>
        </SciFiHudPanel>
      </div>
    </div>
  )
}
