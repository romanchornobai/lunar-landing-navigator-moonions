/**
 * Background prefetch of the heavy assets of every view, started once the first view has finished loading, so the
 * next view opens from memory instead of downloading. Each call must use the same loader and URL list (same order)
 * as the component that uses it, because the react-three-fiber loader cache is keyed by both.
 */
import * as THREE from 'three'
import { useLoader } from '@react-three/fiber'
import { useGLTF, useProgress } from '@react-three/drei'
import { SOUTH_POLE_ELEVATION_URL, loadSouthPoleElevation } from './southPoleElevation'

const SOUTH_POLE_TEXTURES = [
  '/models/south_pole/lunar_albedo_2k.jpg',
  '/models/south_pole/lunar_normal_2k.webp',
  '/models/south_pole/lunar_ao_2k.jpg',
] // SouthPoleTerrain.tsx
const REGOLITH_TEXTURES = [
  '/models/moon_texture/textures/moon_meteor_01_diff_2k.jpg',
  '/models/moon_texture/textures/moon_meteor_01_nor_2k.jpg',
  '/models/moon_texture/textures/moon_meteor_01_rough_2k.jpg',
  '/models/moon_texture/textures/moon_meteor_01_ao_2k.jpg',
] // LandingTerrainModel.tsx
const GLOBE_TEXTURES = ['/textures/moon_color_4k.jpg', '/textures/moon_elevation_4k.png'] // LunarGlobe.tsx
const MODELS = [
  '/models/lander/lander.glb',
  '/models/icons/sun_model.glb?v=2',
  '/models/icons/earth.glb?v=2',
  '/models/celestial/Earth.glb?v=2',
  '/models/connecting_ridge_cr1/connecting_ridge_cr1_15km.glb',
  '/models/malapert_massif/malapert_massif_15km.glb',
  '/models/de_gerlache_rim/de_gerlache_rim_15km.glb',
  '/models/nobile_rim_1/nobile_rim_1_15km.glb',
]

let started = false

/** Starts the prefetch once per page load (later calls do nothing). Order: South Pole view, site view, globe. */
export function prefetchAllViews(delayMs = 1500): void {
  if (started) return
  started = true
  const run = () => {
    // Wait until the current view has stopped loading (a view can load in several suspense steps).
    if (useProgress.getState().active) {
      window.setTimeout(run, 500)
      return
    }
    useLoader.preload(THREE.FileLoader, SOUTH_POLE_ELEVATION_URL, (loader) => {
      ;(loader as THREE.FileLoader).setResponseType('arraybuffer')
    })
    loadSouthPoleElevation()
    useLoader.preload(THREE.TextureLoader, SOUTH_POLE_TEXTURES)
    for (const url of MODELS) useGLTF.preload(url)
    useLoader.preload(THREE.TextureLoader, REGOLITH_TEXTURES)
    useLoader.preload(THREE.TextureLoader, GLOBE_TEXTURES)
  }
  window.setTimeout(run, delayMs)
}
