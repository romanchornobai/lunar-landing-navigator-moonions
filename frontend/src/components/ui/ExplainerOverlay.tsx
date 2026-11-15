import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'

/** Steps of /explainer.html in `?embed=1` mode; the page reports the real number when it is ready. */
const DEFAULT_STEPS = 11

interface ExplainerOverlayProps {
  /** Search progress while computing, null once the result is ready. */
  progress: { done: number; total: number } | null
  onPlay: () => void
}

/**
 * Black full-screen cover shown while the area search runs. It plays the explainer animations one part at a time
 * (Space / right arrow: next step, left arrow: previous; nothing plays until the first Space) and, top right, shows a minimal loader that turns into a Play
 * button when the result is ready.
 */
export function ExplainerOverlay({ progress, onPlay }: ExplainerOverlayProps) {
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
  }, [go, send, part])

  const ratio = progress && progress.total > 0 ? progress.done / progress.total : 0
  const arrow = 'w-12 h-12 flex items-center justify-center text-white transition-opacity cursor-pointer disabled:opacity-20 disabled:cursor-default'

  return (
    <div className="absolute inset-0 z-[20000000] bg-black">
      <iframe
        ref={frame}
        src="/explainer.html?embed=1"
        title="How the best point is computed"
        className={`absolute inset-0 w-full h-full border-0 ${shown ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Top right: minimal loader, then Play */}
      <div className="absolute top-6 right-6 z-10 flex items-center justify-end font-mono select-none">
        {progress ? (
          <div className="flex items-center gap-3 text-white/70 text-xs tracking-widest">
            <div className="w-28 h-[3px] bg-white/20 overflow-hidden">
              <div
                className={`h-full bg-white transition-[width] duration-200 ${progress.total > 0 ? '' : 'w-1/3 animate-pulse'}`}
                style={progress.total > 0 ? { width: `${ratio * 100}%` } : undefined}
              />
            </div>
            <span className="w-9 text-right">{progress.total > 0 ? `${Math.round(ratio * 100)}%` : ''}</span>
          </div>
        ) : (
          <button onMouseDown={(e) => e.preventDefault()}
            onClick={onPlay}
            aria-label="View the computed point"
            className="w-11 h-11 flex items-center justify-center text-white border border-white/80 hover:bg-white hover:text-black transition-colors cursor-pointer drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
          >
            <Play size={20} fill="currentColor" />
          </button>
        )}
      </div>

      {/* Bottom corners: previous / next step */}
      <button className={`${arrow} absolute bottom-5 left-6 z-10`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(-1)} disabled={part <= 0} aria-label="Parte anterior">
        <ChevronLeft size={34} strokeWidth={1.5} />
      </button>
      <button className={`${arrow} absolute bottom-5 right-6 z-10`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(1)} disabled={part === total - 1} aria-label="Parte siguiente">
        <ChevronRight size={34} strokeWidth={1.5} />
      </button>
    </div>
  )
}
