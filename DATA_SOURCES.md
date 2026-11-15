# Data Sources

Every dataset and model used by the app, with provenance. Update this file whenever a source is added or changed.

## Scientific data

| Data | Used for | Source | Local files |
|---|---|---|---|
| LRO LOLA polar stereographic DEM (GDR `ldem_85s_20m`, 20 m/px native, R = 1737.4 km) | 15 km x 15 km terrain of the 4 candidate sites (Shackleton Connecting Ridge, Malapert Massif, De Gerlache/Faustini Rim, Nobile Rim 1), resampled to 501x501 (30 m/px) | NASA Planetary Data System, Geosciences Node (WUSTL), LRO LOLA | `frontend/public/models/<site>/*.glb`, `*_heightmap_16bit.png`, `*_meta.json` |
| LRO LOLA GDR polar stereographic DEMs `LDEM_85S_20M` (20 m/px, to 85 S) and `LDEM_80S_40M` (40 m/px, to 80 S), DATA_SET_ID `LRO-L-LOLA-4-GDR-V1.0`, 16-bit DN x 0.5 m relative to R = 1737.4 km, frame "Mean Earth/Polar Axis of DE421" | 360 deg topographic horizon H(theta) of each site, rays of 200 km with exact spherical geometry (20 m grid near the sites, 40 m grid where the 85 S grid ends: far field of Malapert and Nobile) | NASA PDS Geosciences Node, https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ | Source: `data/dem/ldem_85s_20m.img`, `ldem_80s_40m.img` + `.lbl` (**git-ignored**, ~920 MB). Result: `frontend/src/data/horizonProfiles.json` |
| LROC / LOLA polar DTM, ~212 x 212 km square around Shackleton (see georeference below) | Regional South Pole 3D terrain, 1200x1200 elevation grid | NASA Moon Trek, https://trek.nasa.gov/moon/ | `frontend/public/models/south_pole/lunar_elevation_1200.bin` and derived albedo/normal/AO 2K maps |
| LRO LROC WAC mosaic v2 (`LRO_WAC_Mosaic_SPole60_100m_v02`, ~100 m/px, to 60 S) LRO LROC NAC mosaic (`LRO_NAC_Mosaic_SPole85.5_1mp`, 1 m/px source, to 85.5 S) and LRO LROC NAC mosaic of Malapert Massif (`LRO_NAC_Mosaic_0_67mpp_Malapert_Massif_SP`, 0.67 m/px source, zoom to ~1 m/px), South Polar Stereographic IAU2000:30120 (R = 1737.4 km) | 2D South Pole map (base mosaic + high-resolution overlay when zoomed in) | NASA Moon Trek WMTS, https://trek.nasa.gov/tiles/Moon/SP/<layer>/1.0.0/WMTSCapabilities.xml (layer index: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon) | `frontend/public/tiles/moon_sp/<layer>/{z}/{row}/{col}.png` + `manifest.json` (**git-ignored**): all zoom levels (WAC 0-5, NAC 0-11, Malapert NAC 0-13) within +-10 km of each candidate site (clipped to each layer extent), read locally; everything else streamed from Trek at runtime. Tile grid in `frontend/src/lib/moonSouthPolarCrs.ts` |
| CGI Moon Kit: LROC WAC color (8192x4096) and LOLA DEM (16-bit) | Global lunar sphere | NASA Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720/ | Source: `frontend/public/textures/lroc_color_16bit_srgb_8k.tif`, `ldem_16_uint.tif` (**git-ignored**). Used by the app: `moon_color_8k.jpg`, `moon_elevation_8bit.png` (8-bit derivatives, same resolution) |
| Hourly topocentric Sun (id 10) and Earth (id 399) positions, 2026-2029, for each site | Sun/Earth azimuth-elevation, insolation and DTE windows | NASA JPL Horizons API, https://ssd.jpl.nasa.gov/horizons/ | `data/ephemerides/csv/`, `frontend/public/data/ephemerides/ephemerides_3yr.bin` |

### Candidate points (`frontend/src/data/landingSites.json`)
Every coordinate is taken from the cited publication; heights are LRO LOLA `LDEM_85S_20M` (bilinear, m relative to
R = 1737.4 km). The "published" text of each point repeats the source's values and conditions. The UI links each source.

| Point | Lat, Lon (deg, east +) | Source |
|---|---|---|
| Connecting Ridge CR1 (spot 1) | -89.4395, -137.1934 (222.8066 E) | Gläser et al. 2014, EPSC Abstracts 9, EPSC2014-136-1, https://meetingorganizer.copernicus.org/EPSC2014/EPSC2014-136-1.pdf |
| Shackleton rim, Point A | -89.68, -166.0 | Bussey et al. 2010, Icarus 208, 558-564, https://doi.org/10.1016/j.icarus.2010.03.028 |
| Peak near Shackleton, Point D | -88.74, 124.5 | Bussey et al. 2010 (abstract; the body text misprints 99.79 S); area at (-88.79, 124.5) also in Mahanti et al. 2024 |
| De Gerlache rim, Point C | -88.71, -68.7 | Bussey et al. 2010 |
| PSR 4 (permanent shadow, science target) | -88.963, 129.783 | Mahanti et al. 2024, Planet. Sci. J. 5, 62, Table 1 (SP_889630_1297830), https://iopscience.iop.org/article/10.3847/PSJ/ad1b50 |
| Malapert Massif (2D map only) | -85.99, 2.93 | Region named in NASA's Artemis III candidate lists (2022, 2024); approximate region coordinate, NASA publishes no point |
| Nobile Rim 1 (2D map only) | -85.25, 35.80 | Same as Malapert |

Check with our own model (2 m mast, 2026-11..2029-11, `backend/app/services`): CR1 lit 90.8 % of the time, mean
visible disc 86.4 % (Gläser: 92 %, 88.1 %, over a full 18.6-year precession cycle). With 100 km rays we got 91.8 % /
87.9 %: the 200 km rays find terrain beyond 100 km that sets the horizon on 16 % of CR1's azimuths. Bussey's points (Kaguya topography, 2-decimal coordinates = +-300 m) give 41-60 % at the exact
coordinate and >85 % within ~1 km, so the published values refer to the local high, not to that exact pixel.

### Georeference of the regional 3D terrain
The Moon Trek grid had no usable metadata (its notes claimed the -90..-84 cap). It was registered against the LOLA GDR
DEMs above by maximising the Pearson correlation of heights over the whole grid (scale, rotation, mirror and centre
offset): r = 0.979. Result: 2 x 105.95 km square, centre at polar stereographic (14.50, -7.15) km, rotation 359.62 deg,
mirrored rows; height [m] = 208.0 * value - 6339 (residual std 261 m). Implemented in `frontend/src/lib/southPoleGrid.ts`.
The terrain is rendered as stored (mirrored, to keep its original look); site and probe coordinates include the mirror.

### Getting the git-ignored LOLA DEMs and recomputing the horizons
From the repo root (~920 MB):
```
mkdir -p data/dem && cd data/dem
BASE=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img
for f in ldem_85s_20m ldem_80s_40m; do curl -fO $BASE/$f.lbl && curl -fO $BASE/$f.img; done
cd ../.. && python backend/app/scripts/compute_horizon.py
```
The script (NumPy only) writes `frontend/src/data/horizonProfiles.json` for every point of `landingSites.json` (keyed by id)
and for the 4 JPL Horizons ephemeris sites (keyed `shackleton`, `malapert`, `nobile`, `degerlache`, used by the site 3D
view): its LOLA ground height and, for
mast heights of 2, 4 and 6 m, the horizon angle every 1 deg of azimuth (clockwise from local north) with the distance of
the terrain point that sets it. Method: `h_obs = h_terrain + h_mast`; along each azimuth (great circle, 20 m steps,
20 m to 200 km) `alpha = atan2((R + h_m) cos(d/R) - (R + h_obs), (R + h_m) sin(d/R))` (exact on the sphere) and
`H(theta) = max alpha`. Ray samples beyond the 80 S grid are skipped (far field of Malapert and Nobile, see limit 5).

### Getting the git-ignored Moon Trek tiles
Run `python backend/app/scripts/download_trek_tiles.py` from the repo root (optional `--radius-km`). It writes the tiles and
`manifest.json` to `frontend/public/tiles/moon_sp/`. Without them the 2D map still works, streaming every tile from Trek.

### Getting the git-ignored rasters
Download `lroc_color_16bit_srgb_8k.tif` and `ldem_16_uint.tif` from the NASA SVS CGI Moon Kit page above and place them in `frontend/public/textures/`.
The app does not load them directly: it uses the committed 8-bit derivatives (`moon_color_8k.jpg`, JPEG q92 4:4:4; `moon_elevation_8bit.png`),
made with `sharp` by scaling 16-bit values to 8-bit (value / 256). See `ASSETS.md` > Optimization.

## Software
- Skyfield (topocentric ephemerides), NumPy, FastAPI: see `backend/` dependencies.
- Three.js, @react-three/fiber, @react-three/drei, Leaflet 1.9 + react-leaflet 4 (2D polar map): see `frontend/package.json`.

## Processing
All GLBs are meshopt-compressed and quantized with glTF Transform (`@gltf-transform/cli`, MIT); embedded textures re-encoded to WebP. Geometry is not simplified. See `ASSETS.md` > Optimization.

### Best landing point in an area (local backend, `backend/app/`)
`GET /api/area-search/stream` (Server-Sent Events) and `POST /api/area-search` search a square area (default 15 x 15 km)
of the cap (center lat <= -84) for the best point. Not part of the public site: it needs the git-ignored LOLA DEMs.
1. Candidates: the highest LOLA pixel of every 250 m cell; the 150 highest are kept (configurable).
2. Per candidate (process pool): horizon every 1 deg with 200 km rays and the exact spherical geometry above
   (`services/terrain.py`; ray samples every 20 m up to 4 km, then every 0.5 % of the distance: max 0.04 deg difference
   with uniform 20 m sampling on 5 test sites; a 0.5 deg azimuth step changed the shares of CR1 and Nobile Rim 1 by
   < 0.03 percentage points at ~1.7x the cost, so 1 deg is kept); hourly Sun / Earth directions from the JPL Horizons buffer of the nearest
   of the 4 sites, re-projected on the candidate's local horizon (`services/ephemeris.py`; Earth parallax error
   < |distance to that site| / 356,000 km, e.g. 0.002 deg at 15 km); Sun disc fraction (R = 0.266 deg, exact
   circular-segment area above the horizon) and DTE line of
   sight (`services/visibility.py`); ground slope from the DEM (reported, not filtered).
3. Ranking by share of hours with Sun and Earth visible at once (or Sun mean visible fraction, or DTE).
Timing on a 12-core laptop: ~6 s for 150 candidates, ~11.5 s for 300.
Frontend: in the South Pole 3D view the selector button picks a 15 x 15 km square (blue overlay, `AreaHighlight.tsx`);
CALCULAR streams the search from the local backend (`services/areaSearch.ts`, Vite proxies `/api` to :8000), shows the
progress at the top and the best point (beacon + panel). Without the local backend the panel reports it is unavailable.

## Assumptions and limits of the visibility model
Applies to the horizon, Sun and Direct-to-Earth (DTE) results (`backend/app/services`, `frontend/src/lib/visibility.ts`).

1. **Reference frame (checked).** The LOLA GDR DEMs are in the "Mean Earth / Polar Axis of DE421" (ME) frame. A Horizons
   query for a user-defined Moon site (`CENTER=coord@301`, 2026-11-15) reports `Center pole/equ: MEAN_ME (high precision)`,
   DE441, radius 1737.4 km, so both use the mean-Earth frame and the same reference sphere. The remaining difference is
   DE421 vs DE441 lunar orientation. JPL quotes lunar surface coordinates improving from ~100 m to tens of cm with its
   2021 update (https://ssd.jpl.nasa.gov/announcements/an20210929.html). Even 100 m is 0.003 deg, ~100 times below
   the solar radius (0.266 deg). Not measured directly; this is an upper bound taken from that announcement.
2. **Spherical Moon, R = 1737.4 km** (the DEM reference). The horizon angle is computed with the exact spherical
   geometry `atan2((R + h_m) cos(d/R) - (R + h_obs), (R + h_m) sin(d/R))` (it replaced the tangent-plane formula
   `atan((h - h_obs - d^2 / 2R) / d)`, which differed by <= 0.007 deg at 100 km). The DEM heights are relative to
   this sphere, so no other shape model enters.
3. **Earth is a point.** DTE is active when the Earth's centre is above the horizon. The Earth's disc is ~1.8 to 2.05 deg
   across seen from the Moon, so a link can be partly blocked just before/after the reported window. The Sun disc is
   modelled (R = 0.266 deg, constant: the true radius varies +-1.7 % over the year; visible share = exact area of the
   circular segment above a locally straight horizon), the Earth disc is not.
4. **Fixed 2 m mast and 20/40 m DEM.** Boulders, small ridges and anything below the DEM resolution are not in the
   horizon. LOLA has interpolated gaps near the pole. The surface is assumed to be the DEM, no lander footprint.
5. **Coverage.** The DEMs end at 80 deg S (40 m) and 85 deg S (20 m). Ray samples with no DEM are ignored (counted as
   `n_missing`), so a horizon is incomplete for points whose 200 km rays leave the 80 deg S cap (Malapert and Nobile
   toward the equator). Also, the 200 km range cuts off terrain farther away, which can only raise the true horizon.
6. **Ephemerides come from 4 sites.** The Sun/Earth directions of any other point are rotated from the nearest of the 4
   Horizons sites (exact for a direction fixed in the Moon frame; the parallax error is bounded in step 3 above).
   Coverage 2026-11-14 .. 2029-11-14, hourly samples: events shorter than one hour (sunsets, grazing passes) are
   sampled, not resolved.
7. **Illumination only.** Solar power is a visibility proxy (time-averaged visible disc fraction), not a flux or thermal
   model: no panel orientation, albedo or regolith scattering. No shadowing from the lander or from sub-DEM features.
8. **Validation so far.** Adaptive vs uniform ray sampling (5 sites, max 0.04 deg), the browser vs Python
   implementations (identical percentages for 5 points), CR1 against Gläser et al. 2014 (90.8 % vs 92 % lit), and the
   ephemeris buffer against fresh Horizons queries (below, reproducible with
   `python backend/app/scripts/validate_ephemerides.py`). More published points (for example Mazarico et al. 2011
   illumination maps) would strengthen it.

### Ephemeris buffer check (2026-11-15)
`ephemerides_3yr.bin` was compared with new JPL Horizons API queries (`CENTER=coord@301`, `COORD_TYPE=GEODETIC`, altitude 0,
`QUANTITIES=4`, hourly, apparent azimuth / elevation) for the 4 sites, Sun (10) and Earth (399), in three 48 h windows
(start, middle and end of the 2026-11-14 .. 2029-11-14 range; 144 hourly samples per site and body).
Result: max |d azimuth| 0.00006 deg and max |d elevation| 0.00005 deg for the Sun, 0.00006 deg and 0.00082 deg for
the Earth. So the buffer uses the same site coordinates, frame and altitude convention as Horizons, and the differences
are ~300 times below the solar radius (0.266 deg). Small Earth elevation differences are consistent with ephemeris
updates since the buffer was generated (not investigated). Only 3 windows were sampled, not all 26,305 hours.

## 3D assets and textures: provenance to verify
These have no recorded origin or license yet. Confirm and fill in before the final submission.

- [ ] `models/lander/lander.glb`: "reference Artemis lunar lander model", author/license unknown.
- [ ] `models/celestial/Earth.glb`: author/license unknown.
- [ ] `models/moon_texture/textures/moon_meteor_01_*_2k.jpg`: photogrammetric PBR regolith, author/license unknown.

### Site 3D view: Sun and Earth (`frontend/src/components/canvas3d/SkyBodies.tsx`, `LandingSceneClean.tsx`)
Runs in the browser. Sun / Earth (azimuth, elevation) come from the site's own JPL Horizons track (exact for the 4
routes), converted to scene axes with the measured mesh orientation (`lib/skyGeometry.ts`, see `ASSETS.md`). Both are
drawn at true angular size (Sun radius 0.266 deg; Earth 0.95 deg at the mean distance 384,400 km, 0.90-1.03 deg in
reality). A ring at 20 km is raised to the site's LOLA horizon (2 m mast), so the bodies hide behind terrain exactly
when the visibility model says so; the HUD checks and the hover labels use the same model (Sun: any part of the disc;
Earth: centre, DTE), with the next rise / set from the hourly samples (1 h resolution, up to 60 days ahead). The Sun
light is scaled by the exact visible disc fraction; earthshine by the Earth's lit fraction `(1 - s.e) / 2`. The
ambient fill is for legibility only (the Moon has no sky light). Earth's rotation angle is not modelled, only its phase.
Night vision: when no part of the solar disc is above the terrain, the 3D view (terrain, lander, Earth, labels; not the
HUD) gets a green CSS filter, extra fill light, a soft light over the terrain around the lander and a halo plus
lifted unlit side on the Earth, all for legibility. It is a visual aid, not a sensor model.
Routes: `cr1` (Connecting Ridge CR1, Gläser et al. 2014), `malapert`, `degerlache`, `nobile`. CR1 replaced the former
`shackleton` route (-89.54, 129.20), which lies on Shackleton's inner wall (LOLA -2317 m, horizon 14-27 deg all
around, so never sunlit). CR1 directions are re-projected from the Shackleton buffer site (22.6 km away, Earth parallax
< 0.004 deg) with `reprojector` in `lib/visibility.ts`; its horizon is the `connecting-ridge-cr1` profile.

### CR1 site terrain (`frontend/public/models/connecting_ridge_cr1/`)
Built from the same LOLA GDR DEMs with `python backend/app/scripts/make_site_terrain.py --key connecting_ridge_cr1
--lat -89.4395 --lon -137.1934 --name "Connecting Ridge (CR1)"` (501 x 501 vertices, 30 m, bilinear, grid-aligned like
the other meshes), then from `frontend/`:
`npx gltf-transform simplify <raw> <tmp> --ratio 0 --error 0.0001 --lock-border true` and
`npx gltf-transform meshopt <tmp> <out> --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14`.
The other three site meshes came with the project (origin in `ASSETS.md`).

### Comparison table (`frontend/src/components/ui/SiteComparisonPanel.tsx`, `frontend/src/lib/visibility.ts`)
Runs fully in the browser (no backend): for each point and every hour of the chosen dates, the Sun / Earth directions of the
JPL Horizons buffer (nearest of its 4 sites, re-projected on the point's local horizon) are tested against the point's
LOLA horizon (2 m mast). Sun counts as visible when any part of the disc is above the terrain; Earth when its centre is
(DTE). The bars show the cumulative share of elapsed hours with / without visibility, played day by day in 7 s.
Checked against the Python backend over 2026-11-14..2029-11-14: identical percentages for the 5 points.

