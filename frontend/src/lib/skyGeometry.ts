/**
 * Sky geometry for the site 3D view: local (azimuth, elevation) -> scene direction, apparent sizes and Earth phase.
 *
 * Scene axes of the site terrain GLBs (checked against LRO LOLA LDEM_85S_20M / 80S_40M, RMS 3-6 m on the 4 sites):
 *   +X = polar stereographic x,  -Z = polar stereographic y,  +Y = up.   (x = r sin(lon), y = r cos(lon))
 * The grid is NOT aligned with local north: at a site of longitude lon, local north (away from the pole) points to
 * scene (sin lon, -cos lon) and east to (cos lon, sin lon). So a body at azimuth az (clockwise from local north) and
 * elevation el is in the scene direction
 *   X = cos(el) sin(az + lon),  Y = sin(el),  Z = -cos(el) cos(az + lon).
 * Polar stereographic is conformal, so angles at the site are true.
 */
import * as THREE from 'three'

const DEG = Math.PI / 180

export function azElToScene(azDeg: number, elDeg: number, siteLonDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = (azDeg + siteLonDeg) * DEG
  const e = elDeg * DEG
  return out.set(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a))
}

/** Apparent solar radius from the Moon, deg (~0.2666 at 1 AU; +-1.7 % over the year, not modelled). */
export const SUN_RADIUS_DEG = 0.266
/** Apparent Earth radius from the Moon, deg: asin(6371 km / 384,400 km) = 0.95 (0.90-1.03 between apogee and perigee). */
export const EARTH_RADIUS_DEG = 0.95

/**
 * Illuminated fraction of the Earth disc seen from the Moon (0 new Earth .. 1 full Earth).
 * Phase angle at the Earth between the Sun and the Moon: cos(alpha) = s . (-e), with s, e the unit directions from the
 * Moon to the Sun and to the Earth (the Sun is ~390 times farther, error < 0.15 deg). k = (1 + cos alpha) / 2.
 */
export function earthIlluminatedFraction(sunDir: THREE.Vector3, earthDir: THREE.Vector3): number {
  return (1 - sunDir.dot(earthDir)) / 2
}
