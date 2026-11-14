# Assets Reference

Condensed from the original `CONFIG_HACKATHON.txt` files (those are git-ignored). Do not open the binaries; use this file.
Paths are relative to `frontend/public/`.

## Candidate landing sites (`models/<site>/`)
Each folder has `<site>_15km.glb`, `<site>_heightmap_16bit.png` (uint16), `<site>_preview.png`, `<site>_meta.json`.
- 15 km x 15 km at 1:1 scale (meters), 501x501 grid (30 m/px), 251,001 vertices, 500k triangles, ~14 MB each.
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

## Lander (`models/lander/lander.glb`, ~14.7 MB, 13 meshes, 10 PBR materials, no external textures)
- Pivot is offset: to put the feet at Y = 0 use `clone.position.set(2.0, 67.037, -67.037)`. Native height ~140 units, leg radius ~80.
- Scale: 0.016 in the regional South Pole view (~2.24 units tall); 0.032 inspection close-up; 0.010 to 0.015 in the 15 km site scenes.
- In the regional view: `landerY = groundY + 0.08`; ground ring at `groundY + 0.02`; comm beam from `landerY + 2.2` up to length 7.0.
- Optional: Draco compression (`gltf-pipeline -d`) would cut it to ~1.5-2 MB.

## Celestial (`models/celestial/`)
- `Earth.glb` (~12.9 MB). Earth sits 1-6 deg above the horizon at the South Pole (libration, ~14-day cycle).
- Typical scene values: Earth scale 0.8-1.2 at distance ~120-180, position [-60, 15, -90]; Sun position [120, 8, -60] (grazing ~1.5 deg).
- These are visual placeholders: real directions must come from the ephemerides.

## Textures
- `models/moon_texture/textures/moon_meteor_01_{diff,nor,rough,ao}_2k.jpg`: PBR regolith. Intended for an anti-tiling stochastic shader
  (double rotation ~28 deg) with distance fade beyond ~280 m, anisotropy 16x, applied to the site meshes.
- `textures/lroc_color_16bit_srgb_8k.tif` (8192x4096 color) and `textures/ldem_16_uint.tif` (16-bit DEM): global Moon sphere.
  **Git-ignored.** Sphere radius 2.0, 384x384 segments, displacementScale 0.05, displacementBias -0.015, bumpScale 0.03, roughness 0.92,
  metalness 0.02, rotation [0, -PI/2, 0]. Loaded with `TIFFLoader`.

## Ephemerides (`data/ephemerides/ephemerides_3yr.bin`, 1,683,520 bytes)
- 210,440 records x 8 bytes (inferred from file size: 2 x float32 each). Hourly 2026-2029, Sun and Earth, 4 sites.
- Exact layout (field order, record order) is not documented: check the generator script in `backend/app/scripts/` before reading it.

## Known gaps
- The original configs mention `models/celestial/Sun.glb`, `models/markers/mappin.glb` and `map_pointer.glb`, but those files are not in the folder yet.
- Original configs state 20 m/px as the native LOLA resolution, while the meshes are resampled to 30 m/px (`*_meta.json`).
