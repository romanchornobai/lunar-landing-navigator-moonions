import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Moon, SatelliteDish } from 'lucide-react'
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

const ANIMATION_MS = 3500 // the whole period is played in this time, whatever its length
const REVEAL_MS = 450 // bars cascade in before the playback starts
const STAGGER_MS = 60 // delay between consecutive columns
const HOUR_MS = 3600 * 1000

/** Hourly cumulative hours with Sun / Earth visible, per point, over the chosen period. */
interface ComparisonRun {
  startMs: number
  hours: number
  nDays: number
  lit: Record<string, { sun: Int32Array; earth: Int32Array }>
  /** Raw hourly visibility (1 = visible), kept for the per-site detail view. */
  series: Record<string, { sun: Uint8Array; earth: Uint8Array }>
}

function buildRun(startDay: string, endDay: string): ComparisonRun | null {
  const startMs = Date.parse(`${startDay}T00:00:00Z`)
  const endMs = Date.parse(`${endDay}T00:00:00Z`) + 24 * HOUR_MS // end day included
  const h0 = Math.max(0, Math.round((startMs - EPHEMERIS_START_MS) / HOUR_MS))
  const h1 = Math.min(EPHEMERIS_HOURS, Math.round((endMs - EPHEMERIS_START_MS) / HOUR_MS))
  if (h1 <= h0) return null
  const n = h1 - h0
  const lit: ComparisonRun['lit'] = {}
  const all: ComparisonRun['series'] = {}
  for (const c of COLUMNS) {
    const series = visibilitySeries(c.id, h0, h1, DEFAULT_MAST_M)
    if (!series) return null
    all[c.id] = series
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
  return { startMs: EPHEMERIS_START_MS + h0 * HOUR_MS, hours: n, nDays: Math.ceil(n / 24), lit, series: all }
}

/** Longest run of consecutive hours with value 0 (no visibility) [h]. Runs cut by the period edges count as-is. */
function longestGap(s: Uint8Array): number {
  let best = 0
  let cur = 0
  for (let i = 0; i < s.length; i++) {
    cur = s[i] ? 0 : cur + 1
    if (cur > best) best = cur
  }
  return best
}

/** Hours -> "N h" below 48 h, otherwise "N.N days" (Earth days of 24 h). */
const fmtHours = (h: number) => (h < 48 ? `${h} h` : `${(h / 24).toFixed(1)} days`)

/** One canvas strip: each pixel column = share of its hours with visibility (white) vs. none (dim red). */
function TimelineStrip({ data }: { data: Uint8Array }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const w = (cv.width = Math.max(1, Math.round(cv.clientWidth * devicePixelRatio)))
    const h = (cv.height = Math.max(1, Math.round(cv.clientHeight * devicePixelRatio)))
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    const n = data.length
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x * n) / w)
      const b = Math.max(a + 1, Math.floor(((x + 1) * n) / w))
      let on = 0
      for (let i = a; i < b; i++) on += data[i]
      const f = on / (b - a)
      ctx.fillStyle = `rgba(239,68,68,${0.55 * (1 - f)})`
      ctx.fillRect(x, 0, 1, h)
      ctx.fillStyle = `rgba(255,255,255,${f})`
      ctx.fillRect(x, 0, 1, h)
    }
  }, [data])
  return <canvas ref={ref} className="w-full h-[18px] block" />
}

/** Per-site detail page shown inside the comparison panel once the run is over. */
function SiteDetail({ siteId, run, onBack }: { siteId: string; run: ComparisonRun; onBack: () => void }) {
  const site = SITES_IN_3D.find((s) => s.id === siteId)!
  const s = run.series[siteId]
  const stats = React.useMemo(() => {
    let both = 0
    for (let i = 0; i < s.sun.length; i++) both += s.sun[i] & s.earth[i]
    const n = s.sun.length
    const sun = run.lit[siteId].sun[n - 1]
    const earth = run.lit[siteId].earth[n - 1]
    return { n, sun, earth, both, nightMax: longestGap(s.sun), noEarthMax: longestGap(s.earth) }
  }, [s, run, siteId])
  const endDate = new Date(run.startMs + (stats.n - 1) * HOUR_MS).toISOString().slice(0, 10)
  const startDate = new Date(run.startMs).toISOString().slice(0, 10)
  const { latitude, longitude, elevation_m } = site.coordinates
  // Entrance: each block fades/slides in a little after the previous one
  const enter = (i: number): React.CSSProperties => ({ animation: `cmpDetailIn 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms both` })

  return (
    <div className="font-mono text-white select-none">
      <style>{`@keyframes cmpDetailIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>

      {/* Title bar: back arrow + site name + LOLA position */}
      <div className="flex items-center gap-4 pb-3 border-b border-white/25" style={enter(0)}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to comparison"
          className="w-9 h-9 shrink-0 flex items-center justify-center border border-white/40 hover:border-white hover:bg-white hover:text-black transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <div className={`text-[16px] font-bold tracking-[0.18em] truncate ${site.kind === 'science' ? 'text-sky-400' : ''}`}>
            {site.name.toUpperCase()}
          </div>
          <div className="text-[10px] tracking-[0.2em] text-neutral-400 tabular-nums">
            {latitude.toFixed(2)}° · {longitude.toFixed(2)}° · {elevation_m} M
          </div>
        </div>
      </div>

      {/* Rings: share of the period with Sun / Earth / both visible */}
      <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 pt-6">
        <Ring label="SUN" value={stats.sun / stats.n} delay={1} model={CELESTIAL_MODELS.sun} style={enter(1)} />
        <Ring label="EARTH" value={stats.earth / stats.n} delay={2} model={CELESTIAL_MODELS.earth} earthLight style={enter(2)} />
        <Ring label="SUN + EARTH" value={stats.both / stats.n} delay={3} style={enter(3)} />
      </div>

      {/* Longest stretches without Sun / without Earth */}
      <div className="flex flex-wrap justify-center gap-3 pt-5" style={enter(4)}>
        <div className="flex items-center gap-2 border border-white/15 px-3 py-1.5">
          <Moon size={14} className="text-neutral-400" />
          <span className="text-[9px] tracking-[0.22em] text-neutral-400">LONGEST NIGHT</span>
          <span className="text-[14px] tabular-nums">{fmtHours(stats.nightMax)}</span>
        </div>
        <div className="flex items-center gap-2 border border-white/15 px-3 py-1.5">
          <SatelliteDish size={14} className="text-neutral-400" />
          <span className="text-[9px] tracking-[0.22em] text-neutral-400">LONGEST WITHOUT EARTH</span>
          <span className="text-[14px] tabular-nums">{fmtHours(stats.noEarthMax)}</span>
        </div>
      </div>

      {/* Timeline of the whole period: white = visible, red = hidden */}
      <div className="flex flex-col gap-2 pt-6" style={enter(5)}>
        {(['sun', 'earth'] as const).map((k) => (
          <div key={k} className="flex items-center gap-3">
            <span className="w-14 text-[9px] tracking-[0.22em] text-neutral-400">{k === 'sun' ? 'SUN' : 'EARTH'}</span>
            <div className="flex-1 min-w-0">
              <TimelineStrip data={s[k]} />
            </div>
          </div>
        ))}
        <div className="flex justify-between pl-[68px] text-[9px] tracking-[0.15em] text-neutral-500 tabular-nums">
          <span>{startDate}</span>
          <span>{endDate}</span>
        </div>
      </div>

      {site.sources[0] && (
        <a
          href={site.sources[0].url}
          target="_blank"
          rel="noreferrer"
          className="block pt-4 text-center text-[9px] tracking-[0.08em] text-neutral-500 hover:text-white underline underline-offset-2"
          style={enter(6)}
        >
          {site.sources[0].label}
        </a>
      )}
    </div>
  )
}

/** Ring gauge: white arc = share of the period with visibility, red track = without. Fills in on mount. */
function Ring({
  label,
  value,
  delay,
  model,
  earthLight = false,
  style,
}: {
  label: string
  value: number
  delay: number
  model?: string
  earthLight?: boolean
  style?: React.CSSProperties
}) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value))
    return () => cancelAnimationFrame(id)
  }, [value])
  const r = 52
  const len = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center gap-2" style={style}>
      <div className="relative w-[132px] h-[132px]">
        <svg viewBox="0 0 132 132" className="absolute inset-0 -rotate-90">
          <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(239,68,68,0.55)" strokeWidth="7" />
          <circle
            cx="66"
            cy="66"
            r={r}
            fill="none"
            stroke="#fff"
            strokeWidth="7"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - shown)}
            style={{
              transition: `stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1) ${delay * 80 + 150}ms`,
              filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.6))',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {model && (
            <div className="w-9 h-9">
              <SpinningModelCanvas url={model} earthLight={earthLight} />
            </div>
          )}
          <span className="text-[22px] font-light leading-none tabular-nums">{Math.round(value * 100)}%</span>
        </div>
      </div>
      <span className="text-[10px] tracking-[0.25em] text-neutral-400">{label}</span>
    </div>
  )
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
  const [detailId, setDetailId] = useState<string | null>(null) // site shown in the detail page, null = table
  const raf = useRef<number | null>(null)

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
  }, [])

  // START: compute every point at once (hourly, LOLA horizon + JPL Horizons) and play the period in 7 s.
  const start = useCallback(async () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    setError(null)
    try {
      await loadEphemeridesBuffer()
    } catch {
      setError('Could not load the ephemerides')
      return
    }
    const r = buildRun(startDay, endDay)
    if (!r) {
      setError('Date range outside the ephemerides')
      return
    }
    setRun(r)
    setDetailId(null)
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
        <DateField label="START" value={startDay} min={MIN_DAY} max={MAX_DAY} onChange={changeStart} />
        <span className="text-neutral-500 text-lg select-none">→</span>
        <DateField label="END" value={endDay} min={MIN_DAY} max={MAX_DAY} onChange={changeEnd} />
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="h-[34px] px-6 disabled:opacity-60 disabled:cursor-default bg-white text-black text-[12px] font-black tracking-[0.3em] uppercase cursor-pointer transition-all hover:shadow-[0_0_18px_rgba(255,255,255,0.7)] active:scale-95"
          style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
        >
          {running ? 'COMPUTING…' : 'START'}
        </button>
        {error && <div className="basis-full text-center text-[11px] tracking-[0.25em] text-red-300">{error}</div>}
        {run && !error && (
          <div className="basis-full flex flex-col items-center gap-1.5 pt-1">
            <div className="relative w-[min(420px,60vw)] h-[2px] bg-white/15">
              <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="text-[11px] tracking-[0.25em] text-neutral-300 tabular-nums">
              DAY {currentDay} / {run.nDays} · {currentDate}
            </div>
          </div>
        )}
      </div>

      <div className="w-[min(1000px,92vw)]" onClick={(e) => e.stopPropagation()}>
        <SciFiHudPanel badgeTitle={detailId ? 'DETAIL' : 'COMPARISON'}>
          {detailId && run && finished ? (
            <SiteDetail siteId={detailId} run={run} onBack={() => setDetailId(null)} />
          ) : (
          <>
          <style>{`@keyframes cmpTableIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
          <div
            className="grid font-mono text-white select-none"
            style={{ gridTemplateColumns: `88px repeat(${COLUMNS.length}, minmax(0, 1fr))`, animation: 'cmpTableIn 0.3s ease-out both' }}
          >
            {/* Header row: empty corner + site names (clickable once the run is over -> detail page) */}
            <div />
            {COLUMNS.map((c) => (
              <div
                key={c.id}
                className={`py-3 px-1 text-center text-[11px] sm:text-[12px] font-bold tracking-[0.18em] border-b border-white/25 ${
                  c.science ? 'text-sky-400' : ''
                }`}
                title={c.science ? 'Permanently shadowed zone (science interest, not a landing site)' : undefined}
              >
                {finished ? (
                  <button
                    type="button"
                    onClick={() => setDetailId(c.id)}
                    className="tracking-[0.18em] font-bold cursor-pointer underline decoration-white/30 underline-offset-4 hover:decoration-current hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.6)] transition-all"
                  >
                    {c.label}
                  </button>
                ) : (
                  c.label
                )}
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
            % OF TIME WITH SUN / EARTH VISIBLE · MAST {DEFAULT_MAST_M} M
            {finished ? ' · CLICK A SITE FOR DETAILS' : ''}
          </p>
          </>
          )}
        </SciFiHudPanel>
      </div>
    </div>
  )
}
