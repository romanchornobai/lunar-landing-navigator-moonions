import { useEffect, useRef } from 'react'
import { Route } from 'lucide-react'

/**
 * Sun / Earth visibility around the mission date at the site (hourly, same model as the HUD: Sun = any part of the
 * disc above the LOLA horizon, Earth = centre above it). White = visible, red = hidden. The blue marker is the current
 * date; clicking the strip jumps to that hour. Shows at a glance what a landing a few days earlier or later would get.
 */
interface VisibilityWindowStripProps {
  sun: Uint8Array
  earth: Uint8Array
  /** Index (hour) of the current date inside the arrays. */
  nowIndex: number
  /** Days shown before / after the current date (labels). */
  spanDays: number
  onPick: (hourOffset: number) => void
  showPaths: boolean
  onTogglePaths: () => void
}

const W = 360
const ROW_H = 5

function Row({ data }: { data: Uint8Array }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, ROW_H)
    const n = data.length
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = data[i] ? 'rgba(255,255,255,0.92)' : 'rgba(239,68,68,0.75)'
      const x0 = Math.floor((i / n) * W)
      const x1 = Math.ceil(((i + 1) / n) * W)
      ctx.fillRect(x0, 0, x1 - x0, ROW_H)
    }
  }, [data])
  return <canvas ref={ref} width={W} height={ROW_H} className="block w-full" style={{ height: ROW_H }} />
}

export function VisibilityWindowStrip({
  sun,
  earth,
  nowIndex,
  spanDays,
  onPick,
  showPaths,
  onTogglePaths,
}: VisibilityWindowStripProps) {
  const n = sun.length
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * n)
    onPick(i - nowIndex)
  }
  const nowPct = n ? (nowIndex / n) * 100 : 50

  return (
    <div className="flex items-center gap-3 font-mono text-[9px] tracking-[0.2em] text-neutral-400 select-none pointer-events-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
      <div className="flex flex-col gap-[5px] text-right leading-[5px]">
        <span>SUN</span>
        <span>EARTH</span>
      </div>
      <div className="relative w-[200px] sm:w-[360px] cursor-pointer" onClick={pick} title="Click to jump to that date">
        <div className="flex flex-col gap-[5px]">
          <Row data={sun} />
          <Row data={earth} />
        </div>
        <div
          className="absolute -top-1 -bottom-1 w-[2px] bg-sky-300 shadow-[0_0_6px_#7dd3fc]"
          style={{ left: `${nowPct}%` }}
        />
        <div className="absolute top-full mt-1 left-0 right-0 flex justify-between text-[8px] text-neutral-500">
          <span>−{spanDays} D</span>
          <span>+{spanDays} D</span>
        </div>
      </div>
      <button
        onClick={onTogglePaths}
        title="Show the Sun and Earth paths of the next 30 days in the sky"
        className={`flex items-center gap-1 px-1.5 py-0.5 border transition-colors cursor-pointer ${
          showPaths
            ? 'border-sky-300 text-sky-200 shadow-[0_0_8px_rgba(125,211,252,0.6)]'
            : 'border-white/30 text-neutral-300 hover:text-white hover:border-white/70'
        }`}
      >
        <Route className="w-3 h-3" />
        PATHS
      </button>
    </div>
  )
}
