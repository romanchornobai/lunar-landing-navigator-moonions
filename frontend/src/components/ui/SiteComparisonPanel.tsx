import React, { useCallback, useEffect, useRef, useState } from 'react'
import { SciFiHudPanel } from './SciFiHudPanel'
import { CELESTIAL_MODELS, SpinningModelCanvas } from './CelestialReadout'
import { SITES_IN_3D } from '../../data/sites'
import { EPHEMERIS_HOURS, EPHEMERIS_START_MS, loadEphemeridesBuffer } from '../../utils/ephemerisClient'
import { DEFAULT_MAST_M, visibilitySeries } from '../../lib/visibility'

// Columns: the published points on the regional 3D terrain (data/landingSites.json), in file order.
const COLUMNS = SITES_IN_3D.map((s) => ({ id: s.id, label: s.shortName, science: s.kind === 'science' }))

// Rows: Earth (DTE line of sight) and Sun (any part of the disc above the terrain).
const ROWS = [
  { key: 'earth' as const, url: CELESTIAL_MODELS.earth, earthLight: true },
  { key: 'sun' as const, url: CELESTIAL_MODELS.sun, earthLight: false },
]

const ANIMATION_MS = 7000 // the whole period is played in this time, whatever its length
const REVEAL_MS = 450 // bars cascade in before the playback starts
const STAGGER_MS = 60 // delay between consecutive columns
const HOUR_MS = 3600 * 1000

/** Hourly cumulative hours with Sun / Earth visible, per point, over the chosen period. */
interface ComparisonRun {
  startMs: number
  hours: number
  nDays: number
  lit: Record<string, { sun: Int32Array; earth: Int32Array }>
}

function buildRun(startDay: string, endDay: string): ComparisonRun | null {
  const startMs = Date.parse(`${startDay}T00:00:00Z`)
  const endMs = Date.parse(`${endDay}T00:00:00Z`) + 24 * HOUR_MS // end day included
  const h0 = Math.max(0, Math.round((startMs - EPHEMERIS_START_MS) / HOUR_MS))
  const h1 = Math.min(EPHEMERIS_HOURS, Math.round((endMs - EPHEMERIS_START_MS) / HOUR_MS))
  if (h1 <= h0) return null
  const n = h1 - h0
  const lit: ComparisonRun['lit'] = {}
  for (const c of COLUMNS) {
    const series = visibilitySeries(c.id, h0, h1, DEFAULT_MAST_M)
    if (!series) return null
    const cum = { sun: new Int32Array(n), earth: new Int32Array(n) }
    let sun = 0
    let earth = 0
    for (let i = 0; i < n; i++) {
      sun += series.sun[i]
      earth += series.earth[i]
      cum.sun[i] = sun
      cum.earth[i] = earth
    }
    lit[c.id] = cum
  }
  return { startMs: EPHEMERIS_START_MS + h0 * HOUR_MS, hours: n, nDays: Math.ceil(n / 24), lit }
}

/** Smooth playback: slow start and end, constant pace in the middle. */
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Minimal bar: white = share of the elapsed time with visibility, red = without. */
function VisibilityBar({ ratio, best, reveal }: { ratio: number | null; best: boolean; reveal: number }) {
  const pct = ratio === null ? null : ratio * 100
  return (
    <div className="w-full px-3 flex flex-col gap-2">
      <span
        className={`font-mono text-[24px] leading-none font-light tabular-nums ${
          pct === null ? 'text-neutral-700' : best ? 'text-white' : 'text-neutral-400'
        }`}
      >
        {pct === null ? '—' : `${Math.round(pct)}%`}
      </span>
      <div
        className={`relative w-full h-[22px] overflow-hidden origin-left ${pct === null ? 'bg-white/[0.06]' : 'bg-red-500/60'}`}
        style={pct === null ? undefined : { transform: `scaleX(${reveal})`, opacity: reveal }}
      >
        {pct !== null && <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${pct}%` }} />}
      </div>
    </div>
  )
}

interface SiteComparisonPanelProps {
  onClose: () => void
}

// Range covered by the baked JPL Horizons ephemerides (see utils/ephemerisClient.ts), as YYYY-MM-DD (UTC).
const MIN_DAY = '2026-11-14'
const MAX_DAY = '2029-11-14'

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min: string
  max: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="text-[11px] tracking-[0.26em] text-neutral-400">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="bg-black/40 border border-white/30 hover:border-white/70 focus:border-white focus:outline-none focus:shadow-[0_0_14px_rgba(255,255,255,0.3)] text-white text-[13px] tracking-[0.12em] font-bold px-3 h-[34px] rounded-sm transition-all cursor-pointer"
        style={{ colorScheme: 'dark', fontFamily: 'inherit' }}
      />
    </label>
  )
}

/** Full-screen dimmed/blurred overlay with an empty site comparison grid (points x Earth/Sun). */
export const SiteComparisonPanel: React.FC<SiteComparisonPanelProps> = ({ onClose }) => {
  const [startDay, setStartDay] = useState(MIN_DAY)
  const [endDay, setEndDay] = useState(MAX_DAY)
  const [run, setRun] = useState<ComparisonRun | null>(null)
  const [progress, setProgress] = useState(0) // 0..1 of the period played so far
  const [sinceStartMs, setSinceStartMs] = useState(0) // drives the bar entrance cascade
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const raf = useRef<number | null>(null)

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
  }, [])

  // EMPEZAR: compute every point at once (hourly, LOLA horizon + JPL Horizons) and play the period in 7 s.
  const start = useCallback(async () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    setError(null)
    try {
      await loadEphemeridesBuffer()
    } catch {
      setError('No se pudieron cargar las efemérides')
      return
    }
    const r = buildRun(startDay, endDay)
    if (!r) {
      setError('Rango de fechas fuera de las efemérides')
      return
    }
    setRun(r)
    setProgress(0)
    setSinceStartMs(0)
    setRunning(true)
    const tStart = performance.now()
    const t0 = tStart + REVEAL_MS // let the bars appear first
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - t0) / ANIMATION_MS))
      setSinceStartMs(now - tStart)
      setProgress(easeInOut(t))
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else {
        raf.current = null
        setRunning(false)
      }
    }
    raf.current = requestAnimationFrame(tick)
  }, [startDay, endDay])

  // Elapsed hours of the period at the current playback position (at least the first hour)
  const elapsedH = run ? Math.max(1, Math.round(progress * run.hours)) : 0
  const currentDay = run ? Math.min(run.nDays, Math.floor((elapsedH - 1) / 24) + 1) : 0
  const currentDate = run ? new Date(run.startMs + (elapsedH - 1) * HOUR_MS).toISOString().slice(0, 10) : null
  const ratioOf = (id: string, key: 'sun' | 'earth') => (run ? run.lit[id][key][elapsedH - 1] / elapsedH : null)
  const finished = run !== null && !running
  // Entrance of each bar: ease-out over 450 ms after its cascade delay (1 once the run is over)
  const revealAt = (delayMs: number) => {
    if (!running) return 1
    const t = Math.max(0, Math.min(1, (sinceStartMs - delayMs) / 450))
    return 1 - Math.pow(1 - t, 3)
  }
  const bestOf = (key: 'sun' | 'earth') => {
    if (!finished) return null
    let best: string | null = null
    let bestV = -1
    for (const c of COLUMNS) {
      const v = ratioOf(c.id, key) ?? -1
      if (v > bestV + 1e-9) {
        bestV = v
        best = c.id
      }
    }
    return best
  }

  // Keep start <= end: moving one bound past the other drags the other along.
  const changeStart = (v: string) => {
    setStartDay(v)
    if (v > endDay) setEndDay(v)
  }
  const changeEnd = (v: string) => {
    setEndDay(v)
    if (v < startDay) setStartDay(v)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-md"
      style={{ backdropFilter: 'blur(10px) brightness(0.55)', WebkitBackdropFilter: 'blur(10px) brightness(0.55)' }}
      onClick={onClose}
    >
      {/* Date range + start button, top center of the page (the button does nothing yet) */}
      <div
        className="absolute top-6 left-1/2 -translate-x-1/2 w-max max-w-[calc(100vw-260px)] flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <DateField label="INICIO" value={startDay} min={MIN_DAY} max={MAX_DAY} onChange={changeStart} />
        <span className="text-neutral-500 text-lg select-none">→</span>
        <DateField label="FIN" value={endDay} min={MIN_DAY} max={MAX_DAY} onChange={changeEnd} />
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="h-[34px] px-6 disabled:opacity-60 disabled:cursor-default bg-white text-black text-[12px] font-black tracking-[0.3em] uppercase cursor-pointer transition-all hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] active:scale-95"
          style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
        >
          {running ? 'CALCULANDO…' : 'EMPEZAR'}
        </button>
        {error && <div className="basis-full text-center text-[11px] tracking-[0.25em] text-red-300">{error}</div>}
        {run && !error && (
          <div className="basis-full flex flex-col items-center gap-1.5 pt-1">
            <div className="relative w-[min(420px,60vw)] h-[2px] bg-white/15">
              <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="text-[11px] tracking-[0.25em] text-neutral-300 tabular-nums">
              DÍA {currentDay} / {run.nDays} · {currentDate}
            </div>
          </div>
        )}
      </div>

      <div className="w-[min(1000px,92vw)]" onClick={(e) => e.stopPropagation()}>
        <SciFiHudPanel badgeTitle="COMPARATIVA">
          <div
            className="grid font-mono text-white select-none"
            style={{ gridTemplateColumns: `88px repeat(${COLUMNS.length}, minmax(0, 1fr))` }}
          >
            {/* Header row: empty corner + site names */}
            <div />
            {COLUMNS.map((c) => (
              <div
                key={c.id}
                className={`py-3 px-1 text-center text-[11px] sm:text-[12px] font-bold tracking-[0.18em] border-b border-white/25 ${
                  c.science ? 'text-sky-400' : ''
                }`}
                title={c.science ? 'Zona en sombra permanente (interés científico, no aterrizaje)' : undefined}
              >
                {c.label}
              </div>
            ))}

            {/* Earth / Sun rows */}
            {ROWS.map((row) => (
              <React.Fragment key={row.key}>
                <div className="h-36 flex items-center justify-center">
                  <div className="w-16 h-16">
                    <SpinningModelCanvas url={row.url} earthLight={row.earthLight} />
                  </div>
                </div>
                {COLUMNS.map((c, ci) => (
                  <div key={`${row.key}-${c.id}`} className="h-36 border-l border-b border-white/10 flex items-center">
                    <VisibilityBar
                      ratio={ratioOf(c.id, row.key)}
                      best={bestOf(row.key) === c.id}
                      reveal={revealAt(ci * STAGGER_MS + (row.key === 'sun' ? STAGGER_MS / 2 : 0))}
                    />
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
          <p className="mt-3 text-center font-mono text-[10px] tracking-[0.2em] text-neutral-500">
            % DEL TIEMPO CON SOL / TIERRA VISIBLE · MÁSTIL {DEFAULT_MAST_M} M
          </p>
        </SciFiHudPanel>
      </div>
    </div>
  )
}
