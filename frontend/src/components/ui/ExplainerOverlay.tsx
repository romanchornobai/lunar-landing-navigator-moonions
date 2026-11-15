import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

/** Steps of /explainer.html in `?embed=1` mode; the page reports the real number when it is ready. */
const DEFAULT_STEPS = 11

interface ExplainerOverlayProps {
  /** Closes the animations and returns to the south pole view. */
  onProceed: () => void
}

/**
 * Full-screen black cover with the explainer animations, opened on demand from the info button (which also asks the
 * browser for fullscreen). PROCEED plays the next part; after the last one the cover closes and the view returns.
 * Space / right arrow do the same as PROCEED; Esc closes at any time. Each part shows its title, what it means and
 * the data it comes from (the iframe page).
 */
export function ExplainerOverlay({ onProceed }: ExplainerOverlayProps) {
  const [part, setPart] = useState(-1) // -1: black, waiting for the first PROCEED
  const [total, setTotal] = useState(DEFAULT_STEPS)
  const frame = useRef<HTMLIFrameElement>(null)
  const ready = useRef(false)
  const [shown, setShown] = useState(false) // the page stays invisible until it is in embed mode

  const send = useCallback((index: number) => {
    if (ready.current) frame.current?.contentWindow?.postMessage({ type: 'explainer-step', index }, '*')
  }, [])

  /** Next part; after the last one, close. */
  const proceed = useCallback(() => {
    if (part >= total - 1) onProceed()
    else setPart((p) => Math.min(total - 1, p + 1))
  }, [part, total, onProceed])

  useEffect(() => send(part), [part, send])

  // Leaving the animations leaves browser fullscreen too
  useEffect(
    () => () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    },
    [],
  )

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
      if (e.code === 'Space' || e.key === 'ArrowRight') {
        proceed()
        e.preventDefault?.()
      }
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
  }, [proceed, send, part, onProceed])

  const last = part >= total - 1

  return (
    <div className="absolute inset-0 z-[20000000] bg-black">
      <iframe
        ref={frame}
        src="/explainer.html?embed=1"
        title="How the best point is computed"
        className={`absolute inset-0 w-full h-full border-0 ${shown ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Top left: position in the animations */}
      {part >= 0 && (
        <div className="absolute top-6 left-6 z-10 font-mono text-[10px] tracking-[0.2em] text-neutral-400 select-none pointer-events-none">
          PART {part + 1} / {total}
        </div>
      )}

      {/* Top right: PROCEED plays the next part; after the last one it closes the animations */}
      <div className="absolute top-6 right-6 z-10">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={proceed}
          aria-label={last ? 'Close the animations' : 'Proceed to the next part'}
          className="h-11 px-6 flex items-center gap-2 font-mono text-[13px] font-bold tracking-[0.25em] text-white border border-white/80 hover:bg-white hover:text-black transition-colors cursor-pointer drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
        >
          PROCEED
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
