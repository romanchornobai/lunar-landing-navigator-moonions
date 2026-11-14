import { useEffect, useState } from 'react'
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
  const { active, progress } = useProgress()
  const [readyPath, setReadyPath] = useState<string | null>(null)
  const [mounted, setMounted] = useState(true)
  const [minPath, setMinPath] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  // Derived, so the overlay covers the new view in the very same render as the navigation.
  // (minElapsed is keyed by path so a stale "true" from the previous navigation can't end the loader early.)
  const loading = readyPath !== pathname
  const minElapsed = minPath === pathname

  // Restart the clock on every navigation.
  useEffect(() => {
    setElapsed(0)
    const start = performance.now()
    const tick = setInterval(() => setElapsed(performance.now() - start), 50)
    const min = setTimeout(() => setMinPath(pathname), MIN_MS)
    const max = setTimeout(() => setReadyPath(pathname), MAX_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(min)
      clearTimeout(max)
    }
  }, [pathname])

  // Done: minimum time reached and nothing left to load.
  useEffect(() => {
    if (loading && minElapsed && !active) setReadyPath(pathname)
  }, [loading, minElapsed, active, pathname])

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

  // Bar follows the real asset progress but fills smoothly over MIN_MS; held at 90% until actually done.
  const timePct = Math.min(100, (elapsed / MIN_MS) * 100)
  const shown = loading ? Math.min(90, Math.max(progress, timePct * 0.9)) : 100

  return <SceneLoader progress={shown} title={titleFor(pathname)} hidden={!loading} />
}
