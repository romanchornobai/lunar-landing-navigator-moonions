import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useProgress } from '@react-three/drei'
import { SceneLoader } from './SceneLoader'

const MIN_MS = 2000 // the loader is always shown at least this long
const MAX_MS = 20000 // safety net if an asset never reports as finished
const FADE_MS = 500
const FINISH_MS = 300 // time the bar takes to reach 100% before the fade-out starts

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
 * The bar and rings animate by themselves on the compositor (see SceneLoader); this component only decides
 * when loading is complete and when to fade out.
 */
export function RouteLoader() {
  const { pathname } = useLocation()
  const { active } = useProgress()
  const [readyPath, setReadyPath] = useState<string | null>(null)
  const [mounted, setMounted] = useState(true)
  const [minPath, setMinPath] = useState<string | null>(null)

  // Derived, so the overlay covers the new view in the very same render as the navigation.
  // (minElapsed is keyed by path so a stale "true" from the previous navigation can't end the loader early.)
  const loading = readyPath !== pathname
  const minElapsed = minPath === pathname

  // Loading is complete: minimum time reached and nothing left to load.
  const complete = loading && minElapsed && !active

  // Timers per navigation: minimum duration and the safety net.
  useEffect(() => {
    const min = setTimeout(() => setMinPath(pathname), MIN_MS)
    const max = setTimeout(() => setReadyPath(pathname), MAX_MS)
    return () => {
      clearTimeout(min)
      clearTimeout(max)
    }
  }, [pathname])

  // When complete the bar finishes to 100% (250 ms); then fade out.
  useEffect(() => {
    if (!complete) return
    const t = setTimeout(() => setReadyPath(pathname), FINISH_MS)
    return () => clearTimeout(t)
  }, [complete, pathname])

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

  return (
    <SceneLoader
      key={pathname}
      durationMs={MIN_MS}
      done={complete || !loading}
      title={titleFor(pathname)}
      hidden={!loading}
    />
  )
}
