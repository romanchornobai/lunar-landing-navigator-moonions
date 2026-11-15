import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Steps of /explainer.html in `?embed=1` mode; the page reports the real number when it is ready. */
const DEFAULT_STEPS = 11

interface ExplainerOverlayProps {
  /** Closes the animations and returns to the south pole view. */
  onProceed: () => void
}

/**
 * Black full-screen cover with the explainer animations, opened on demand from the info button. It plays one part at a
 * time (Space / right arrow: next, left arrow: previous, Esc: proceed). Each part shows its title, what it means and the
 * data it comes from (the iframe page). PROCEED, top right, always closes the cover and returns to the 3D / 2D view.
 */
export function ExplainerOverlay({ onProceed }: ExplainerOverlayProps) {
  const [part, setPart] = useState(-1) // -1: black, waiting for the first Space
  const [total, setTotal] = useState(DEFAULT_STEPS)
  const frame = useRef<HTMLIFrameElement>(null)
  const ready = useRef(false)
  const [shown, setShown] = useState(false) // the page stays invisible until it is in embed mode

  const send = useCallback((index: number) => {
    if (ready.current) frame.current?.contentWindow?.postMessage({ type: 'explainer-step', index }, '*')
  }, [])

  const go = useCallback(
    (delta: number) => setPart((p) => Math.min(total - 1, Math.max(0, p + delta))),
    [total],
  )

  useEffect(() => send(part), [part, send])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'explainer-ready') {
        ready.current = true
        setShown(true)
        if (typeof e.data.total === 'number') setTotal(e.data.total)
        send(part)
      }
    }
    const onKey = (e: { code?: string; key?: string; repeat?: boolean; preventDefault?: () => void }) => {
      if (e.key === 'Escape') {
        onProceed()
        return
      }
      if (e.code === 'Space' || e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else return
      e.preventDefault?.()
    }
    // keys pressed while the iframe has focus are forwarded by explainer.html
    const onFrameKey = (e: MessageEvent) => {
      if (e.data?.type === 'explainer-key' && !e.data.repeat) onKey(e.data)
    }
    window.addEventListener('message', onFrameKey)
    window.addEventListener('message', onMessage)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('message', onFrameKey)
      window.removeEventListener('message', onMessage)
      window.removeEventListener('keydown', onKey)
    }
  }, [go, send, part, onProceed])

  const arrow = 'w-12 h-12 flex items-center justify-center text-white transition-opacity cursor-pointer disabled:opacity-20 disabled:cursor-default'

  return (
    <div className="absolute inset-0 z-[20000000] bg-black">
      <iframe
        ref={frame}
        src="/explainer.html?embed=1"
        title="How the best point is computed"
        className={`absolute inset-0 w-full h-full border-0 ${shown ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Top left: how to step through the parts */}
      <div className="absolute top-6 left-6 z-10 font-mono text-[10px] tracking-[0.2em] text-neutral-400 select-none pointer-events-none">
        {part < 0 ? 'PRESS SPACE TO START' : `PART ${part + 1} / ${total}`} · ← → STEP · ESC PROCEED
      </div>

      {/* Top right: PROCEED, always visible, returns to the south pole view */}
      <div className="absolute top-6 right-6 z-10">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={onProceed}
          aria-label="Proceed to the south pole view"
          className="h-11 px-6 flex items-center gap-2 font-mono text-[13px] font-bold tracking-[0.25em] text-white border border-white/80 hover:bg-white hover:text-black transition-colors cursor-pointer drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
        >
          PROCEED
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Bottom corners: previous / next part */}
      <button className={`${arrow} absolute bottom-5 left-6 z-10`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(-1)} disabled={part <= 0} aria-label="Previous part">
        <ChevronLeft size={34} strokeWidth={1.5} />
      </button>
      <button className={`${arrow} absolute bottom-5 right-6 z-10`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(1)} disabled={part === total - 1} aria-label="Next part">
        <ChevronRight size={34} strokeWidth={1.5} />
      </button>
    </div>
  )
}
