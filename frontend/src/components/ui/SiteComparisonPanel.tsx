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

const ANIMATION_MS = 7000 // the whole period is played day by day in this time, whatever its length
const HOUR_MS = 3600 * 1000

/** Cumulative hours with Sun / Earth visible at the end of each day, per point. */
interface ComparisonRun {
  startMs: number
  nDays: number
  hoursAtDay: Int32Array // hours elapsed at the end of day d
  lit: Record<string, { sun: Int32Array; earth: Int32Array }>
}

function buildRun(startDay: string, endDay: string): ComparisonRun | null {
  const startMs = Date.parse(`${startDay}T00:00:00Z`)
  const endMs = Date.parse(`${endDay}T00:00:00Z`) + 24 * HOUR_MS // end day included
  const h0 = Math.max(0, Math.round((startMs - EPHEMERIS_START_MS) / HOUR_MS))
  const h1 = Math.min(EPHEMERIS_HOURS, Math.round((endMs - EPHEMERIS_START_MS) / HOUR_MS))
  if (h1 <= h0) return null
  const n = h1 - h0
  const nDays = Math.ceil(n / 24)
  const hoursAtDay = new Int32Array(nDays)
  for (let d = 0; d < nDays; d++) hoursAtDay[d] = Math.min((d + 1) * 24, n)
  const lit: ComparisonRun['lit'] = {}
  for (const c of COLUMNS) {
    const series = visibilitySeries(c.id, h0, h1, DEFAULT_MAST_M)
    if (!series) return null
    const cum = { sun: new Int32Array(nDays), earth: new Int32Array(nDays) }
    let sun = 0
    let earth = 0
    for (let i = 0; i < n; i++) {
      sun += series.sun[i]
      earth += series.earth[i]
      if ((i + 1) % 24 === 0 || i === n - 1) {
        const d = Math.floor(i / 24)
        cum.sun[d] = sun
        cum.earth[d] = earth
      }
    }
    lit[c.id] = cum
  }
  return { startMs: EPHEMERIS_START_MS + h0 * HOUR_MS, nDays, hoursAtDay, lit }
}

/** Full-width bar: white = share of the elapsed time with visibility, red = without. */
function VisibilityBar({ ratio }: { ratio: number | null }) {
  return (
    <div className="w-full flex flex-col items-center gap-1.5 px-3">
      <div className="w-full h-3.5 p-[2px] border border-white/70 bg-black/60 rounded-[1px]">
        <div className="w-full h-full flex overflow-hidden">
          {ratio !== null && (
            <>
              <div className="h-full bg-white" style={{ width: `${ratio * 100}%`, boxShadow: '0 0 6px rgba(255,255,255,0.7)' }} />
              <div className="h-full bg-red-500/90 flex-1" />
            </>
          )}
        </div>
      </div>
      <span className="text-[12px] font-bold tracking-[0.12em] text-white tabular-nums">
        {ratio === null ? '—' : `${Math.round(ratio * 100)} %`}
      </span>
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
  const [day, setDay] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const raf = useRef<number | null>(null)

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
  }, [])

  // EMPEZAR: compute every point at once (hourly, LOLA horizon + JPL Horizons) and play it day by day in 7 s.
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
    setDay(0)
    setRunning(true)
    const t0 = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - t0) / ANIMATION_MS)
      setDay(Math.min(r.nDays - 1, Math.floor(progress * r.nDays)))
      if (progress < 1) raf.current = requestAnimationFrame(tick)
      else {
        raf.current = null
        setRunning(false)
      }
    }
    raf.current = requestAnimationFrame(tick)
  }, [startDay, endDay])

  const currentDate = run ? new Date(run.startMs + (day + 1) * 24 * HOUR_MS - HOUR_MS).toISOString().slice(0, 10) : null

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
        {(run || error) && (
          <div className="basis-full text-center text-[11px] tracking-[0.25em] text-neutral-300">
            {error ??
              `DÍA ${day + 1} / ${run!.nDays} · ${currentDate}`}
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
                {COLUMNS.map((c) => {
                  const lit = run?.lit[c.id]
                  const ratio = run && lit ? lit[row.key][day] / run.hoursAtDay[day] : null
                  return (
                    <div key={`${row.key}-${c.id}`} className="h-36 border-l border-b border-white/10 flex items-center">
                      <VisibilityBar ratio={ratio} />
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
          <p className="mt-3 text-center font-mono text-[10px] tracking-[0.18em] text-neutral-400">
            BLANCO: CON SOL / TIERRA VISIBLE · ROJO: SIN · MÁSTIL {DEFAULT_MAST_M} M · HORIZONTE LRO LOLA 100 KM · SOL Y
            TIERRA JPL HORIZONS
          </p>
        </SciFiHudPanel>
      </div>
    </div>
  )
}
