import { useMemo } from 'react'
import * as THREE from 'three'
import { useNavigate } from 'react-router-dom'
import { type LandingSite } from '../../data/sites'
import { LanderMarkerWithHud } from '../ui/LanderMarkerWithHud'

interface SiteMarkerProps {
  site: LandingSite
  position: [number, number, number]
  lineHeight?: number
}

export function SiteMarker({ site, position, lineHeight = 4.0 }: SiteMarkerProps) {
  const navigate = useNavigate()

  const siteData = useMemo(() => {
    return {
      id: site.id,
      name: site.name,
      shortName: site.shortName,
      kind: site.kind,
      description: site.description,
      sources: site.sources,
      coordinates: site.coordinates,
      groundPos: new THREE.Vector3(position[0], position[1], position[2]),
      direction: position[0] > 25 ? ('left' as const) : ('right' as const),
    }
  }, [site, position])

  // ALUNIZAR only where the 15 km first-person terrain exists (scene_key); hidden otherwise.
  const sceneKey = site.scene_key
  const handleLandOnSite = sceneKey ? () => navigate(`/vista-sitio/${sceneKey}`) : undefined

  return <LanderMarkerWithHud site={siteData} onLandOnSite={handleLandOnSite} lineHeight={lineHeight} />
}
