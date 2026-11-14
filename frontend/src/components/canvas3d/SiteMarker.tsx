import { useMemo } from 'react'
import * as THREE from 'three'
import { useNavigate } from 'react-router-dom'
import { type LandingSite, SITE_SCENES_15KM } from '../../data/sites'
import { LanderMarkerWithHud } from '../ui/LanderMarkerWithHud'

interface SiteMarkerProps {
  site: LandingSite
  position: [number, number, number]
  lineHeight?: number
}

const SITE_ROUTE_MAP: Record<string, string> = {
  'shackleton-connecting-ridge': '/vista-sitio/shackleton',
  'malapert-massif': '/vista-sitio/malapert',
  'de-gerlache-rim': '/vista-sitio/degerlache',
  'nobile-rim-1': '/vista-sitio/nobile',
}

export function SiteMarker({ site, position, lineHeight = 4.0 }: SiteMarkerProps) {
  const navigate = useNavigate()

  const siteData = useMemo(() => {
    return {
      id: site.id,
      name: site.name,
      shortName: SITE_SCENES_15KM[site.id]?.shortName || site.name.split('-')[0].trim(),
      description: site.description,
      coordinates: site.coordinates,
      groundPos: new THREE.Vector3(position[0], position[1], position[2]),
      direction: position[0] > 25 ? ('left' as const) : ('right' as const),
    }
  }, [site, position])

  const handleLandOnSite = (siteId: string) => {
    const route = SITE_ROUTE_MAP[siteId]
    if (route) {
      navigate(route)
    } else {
      alert(`Iniciando aproximación a ${site.name}`)
    }
  }

  return (
    <LanderMarkerWithHud
      site={siteData}
      onLandOnSite={handleLandOnSite}
      lineHeight={lineHeight}
    />
  )
}
