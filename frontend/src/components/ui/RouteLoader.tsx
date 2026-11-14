import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useProgress } from '@react-three/drei'
import { SceneLoader } from './SceneLoader'

const MIN_MS = 2000 // the loader is always shown at least this long
const MAX_MS = 20000 // safety net if an asset never reports as finished
const FADE_MS = 500

const TITLES: Record<string, string> = {
  '/vista-lunar': 'VISTA LUNAR',
  '/vista-polar': 'POLO SUR',
  '/vista-sitio': 'SITIO DE ATERRIZAJE',
}

function titleFor(pathname: string) {
  const base = '/' + pathname.split('/')[1]
  return TITLES[base]
}

/**
 * Covers the screen with the loading animation on every view change (and the first load):
 * at least MIN_MS, and until the assets tracked by drei's loading manager are done.
 */
export function RouteLoader() {
  const { pathname } = useLocation()
  const { active } = useProgress()
  const [readyPath, setReadyPath] = useState<string | null>(null)
  const [mounted, setMounted] = useState(true)
  const [minPath, setMinPath] = useState<string | null>(null)
  const [shownState, setShownState] = useState({ path: '', value: 0 })

  // Derived, so the overlay covers the new view in the very same render as the navigation.
  // (minElapsed is keyed by path so a stale "true" from the previous navigation can't end the loader early.)
  const loading = readyPath !== pathname
  const minElapsed = minPath === pathname

  // Loading is complete: minimum time reached and nothing left to load.
  const complete = loading && minElapsed && !active
  const completeRef = useRef(false)
  const loadingRef = useRef(true)
  completeRef.current = complete
  loadingRef.current = loading

  // Timers per navigation: minimum duration and the safety net.
  useEffect(() => {
    const min = setTimeout(() => setMinPath(pathname), MIN_MS)
    const max = setTimeout(() => setReadyPath(pathname), MAX_MS)
    return () => {
      clearTimeout(min)
      clearTimeout(max)
    }
  }, [pathname])

  // Bar animation: eases toward a target on a ~30 fps timer, so it never jumps. (A timer rather than
  // requestAnimationFrame: rAF stops in background tabs and would stall the loader.)
  // Target = the elapsed fraction of MIN_MS, so the bar fills evenly over the minimum time and is held at 99%
  // until loading is really complete (assets done). The fade-out starts only once the bar has reached 100%.
  useEffect(() => {
    let value = 0
    let last = performance.now()
    const start = last
    setShownState({ path: pathname, value: 0 })
    const frame = () => {
      const now = performance.now()
      const dt = Math.min(1, (now - last) / 1000)
      last = now
      const timePct = Math.min(99, ((now - start) / MIN_MS) * 100)
      const target = completeRef.current ? 100 : timePct
      value += (target - value) * (1 - Math.exp(-dt * (completeRef.current ? 14 : 7)))
      setShownState({ path: pathname, value })
      if (!loadingRef.current) clearInterval(timer) // ended by the safety net
      else if (completeRef.current && value >= 99.5) {
        clearInterval(timer)
        setShownState({ path: pathname, value: 100 })
        setReadyPath(pathname)
      }
    }
    const timer = setInterval(frame, 33)
    return () => clearInterval(timer)
  }, [pathname])

  // Keep the overlay mounted during the fade-out.
  useEffect(() => {
    if (loading) {
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), FADE_MS)
    return () => clearTimeout(t)
  }, [loading])

  if (!loading && !mounted) return null

  // Right after a navigation the state still holds the previous bar value for one frame: show 0 then.
  const shown = shownState.path === pathname ? shownState.value : 0

  return <SceneLoader progress={shown} title={titleFor(pathname)} hidden={!loading} />
}
