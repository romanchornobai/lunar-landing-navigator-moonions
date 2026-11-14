# Assets Reference

Condensed from the original `CONFIG_HACKATHON.txt` files (those are git-ignored). Do not open the binaries; use this file.
Paths are relative to `frontend/public/`.

## Candidate landing sites (`models/<site>/`)
Each folder has `<site>_15km.glb`, `<site>_heightmap_16bit.png` (uint16), `<site>_preview.png`, `<site>_meta.json`.
- 15 km x 15 km at 1:1 scale (meters), source grid 501x501 (30 m/px, 251,001 vertices, 500k triangles).
  The shipped GLBs are simplified to 81k-146k triangles (max geometric error ~1 m) and meshopt-compressed (0.4-0.8 MB each),
  see "Optimization" below.
- Origin is the exact site center at [0, 0, 0]: the lander sits at Y = 0. Elevations are relative to the site center.
- Source: LRO LOLA GDR polar stereographic, datum = lunar sphere R 1737.4 km (see `DATA_SOURCES.md`).

| Folder | Site | Lat / Lon | Polar proj. (cx, cy) m | Center abs. elev. m | Min .. Max abs. m |
|---|---|---|---|---|---|
| `shackleton_rim` | Shackleton Connecting Ridge | -89.54 / 129.20 | 10809.56, -8816.06 | -2318.0 | -2871.5 .. 1311.0 |
| `malapert_massif` | Malapert Massif summit | -85.99 / 2.93 | 6218.06, 121487.27 | 5127.5 | 2017.5 .. 5173.5 |
| `de_gerlache_rim` | Faustini / De Gerlache ridge | -88.71 / -68.70 | -36446.62, 14209.94 | 1765.5 | -706.0 .. 1814.5 |
| `nobile_rim_1` | Nobile crater rim | -85.25 / 35.80 | 84303.20, 116889.27 | 6504.0 | 3854.0 .. 6800.0 |

Load: `useGLTF('/models/<site>/<site>_15km.glb')`, `position=[0,0,0]`.

## South Pole regional cap (`models/south_pole/`)
- `lunar_elevation_1200.bin`: Float32Array 1200x1200 (5.76 MB). Plus `lunar_albedo_2k.png`, `lunar_normal_2k.png`, `lunar_ao_2k.png`.
- Covers lat -90 to -84 (6 deg, ~364 km diameter). Rendered as a PlaneGeometry of 150 units (1199x1199 segments), rotateX(-PI/2).
- Vertex height: `Y = (elev[i] - 24.97) * 0.24375` (terrainSize 150, exaggeration 1.3, scaleY = 150/1200 * 1.3 * 1.5).
- Lat/lon to scene XZ:
  ```
  r = ((90 - |lat|) / 6) * 75;  ang = (-lon - 60) * PI/180;  x = r*cos(ang);  z = r*sin(ang)
  gx = clamp(round((x+75)/150*1199), 0, 1199);  gy = clamp(round((z+75)/150*1199), 0, 1199)
  groundY = (elev[gy*1200 + gx] - 24.97) * 0.24375
  ```
- Calibrated scene positions (X, Y, Z): Shackleton (2.50, 2.68, 1.20); Malapert (45.00, 3.86, 52.00); De Gerlache (-22.0, 0.26, -15.0); Nobile (15.00, -0.44, 62.00).
- Material: roughness 0.92, metalness 0.02, normalScale 1.25, aoMapIntensity 1.2. Keep `castShadow = false` (frustum cuts on large meshes).
- Lights: ambient 0.45; sun directional [100,80,80] intensity 2.8; fill [-80,50,-60] 0.65 #cbd5e1. Camera: [0,80,115], target 0, fov 45, near 0.1, far 2000.

## Lander (`models/lander/lander.glb`, ~2.5 MB, 13 meshes, 10 PBR materials, 1 embedded WebP texture)
- Pivot is offset: to put the feet at Y = 0 use `clone.position.set(2.0, 67.037, -67.037)`. Native height ~140 units, leg radius ~80.
- Scale: 0.016 in the regional South Pole view (~2.24 units tall); 0.032 inspection close-up; 0.010 to 0.015 in the 15 km site scenes.
- In the regional view: `landerY = groundY + 0.08`; ground ring at `groundY + 0.02`; comm beam from `landerY + 2.2` up to length 7.0.
- Simplified from ~450k to ~110k triangles (max error ~3.6 mm at scale 0.1), ~1 MB.

## Celestial (`models/celestial/`)
- `Earth.glb` (~2.3 MB, 4096x3072 WebP color + normal maps). Earth sits 1-6 deg above the horizon at the South Pole (libration, ~14-day cycle).
- Typical scene values: Earth scale 0.8-1.2 at distance ~120-180, position [-60, 15, -90]; Sun position [120, 8, -60] (grazing ~1.5 deg).
- These are visual placeholders: real directions must come from the ephemerides.

## Textures
- `models/moon_texture/textures/moon_meteor_01_{diff,nor,rough,ao}_2k.jpg`: PBR regolith. Intended for an anti-tiling stochastic shader
  (double rotation ~28 deg) with distance fade beyond ~280 m, anisotropy 16x, applied to the site meshes.
- `textures/moon_color_8k.jpg` (8192x4096 sRGB, ~6.8 MB) and `textures/moon_elevation_8bit.png` (5760x2880 grey, ~5.2 MB):
  global Moon sphere, loaded with `THREE.TextureLoader`. Derived from the git-ignored 16-bit TIFFs
  `lroc_color_16bit_srgb_8k.tif` (243 MB) and `ldem_16_uint.tif` (33 MB) by plain 16 -> 8 bit scaling (value / 256),
  same resolution. DEM range after scaling: 8..161. Sphere radius 2.0, 384x384 segments, displacementScale 0.05, displacementBias -0.015, bumpScale 0.03, roughness 0.92,
  metalness 0.02, rotation [0, -PI/2, 0].

## Ephemerides (`frontend/public/data/ephemerides/ephemerides_3yr.bin`, 1,683,520 bytes)
- Little-endian Float32, records of `[azimuth_deg, elevation_deg]` (azimuth clockwise from north, elevation above the spherical horizon, no terrain).
- Hourly from 2026-11-14T00:00Z to 2029-11-14T00:00Z inclusive: 26,305 hours x 4 sites x 2 bodies = 210,440 records.
- Order `[site][body][hour]`; sites `shackleton, malapert, nobile, degerlache` (same as `data/landing_sites.json`); bodies `sun, earth`.
- The generator script is not in the repo. Layout verified from the data (smooth hourly steps; max Sun elevation ~ colatitude + 1.54 deg;
  Earth azimuth ~ 360 - longitude). Reader: `frontend/src/utils/ephemerisClient.ts` (loaded once, linear interpolation, no network per query).

## Optimization (done 2026-11-14, tuned for an integrated AMD Radeon laptop)
- All GLBs (4 sites, lander, Earth) use `EXT_meshopt_compression` + `KHR_mesh_quantization`
  (`gltf-transform meshopt --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14`). drei `useGLTF` decodes it.
  Position precision on site terrains: 15000 m / 2^16 = 0.23 m horizontal, ~0.06 m vertical (far below LOLA's 30 m/px grid).
  Quantization moves the dequantization into node transforms: do not overwrite node scale/position inside the GLB scenes.
- Lander and Earth textures re-encoded to WebP (`EXT_texture_webp`): color quality 92, normal maps near-lossless.
- Performance pass (site view, Radeon 680M, 1920x1080): 953k -> 266k triangles per frame, ~30 FPS -> 60 FPS (vsync).
  Cause: the 500k-triangle terrain was vertex-bound (sub-pixel triangles far away) and was also re-drawn into the shadow map every frame.
  Fixes: `gltf-transform simplify` (terrain `--error 0.0001` = ~1 m of the ~10.6 km mesh radius, `--lock-border`; lander `--error 0.0003` = ~3.6 mm after scale),
  vertex normals/UVs are kept from the original so shading and micro-texture are unchanged. Terrain no longer casts shadows (only the lander does).
  LOLA vertical accuracy is ~1 m, so the simplification error is within the data uncertainty.
- Originals are in git history (commit before this change). Total GLB size 83 MB -> 12 MB.

## Known gaps
- The original configs mention `models/celestial/Sun.glb`, `models/markers/mappin.glb` and `map_pointer.glb`, but those files are not in the folder yet.
- Original configs state 20 m/px as the native LOLA resolution, while the meshes are resampled to 30 m/px (`*_meta.json`).
