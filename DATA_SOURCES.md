# Data Sources

Every dataset and model used by the app, with provenance. Update this file whenever a source is added or changed.

## Scientific data

| Data | Used for | Source | Local files |
|---|---|---|---|
| LRO LOLA polar stereographic DEM (GDR `ldem_85s_20m`, 20 m/px native, R = 1737.4 km) | 15 km x 15 km terrain of the 4 candidate sites (Shackleton Connecting Ridge, Malapert Massif, De Gerlache/Faustini Rim, Nobile Rim 1), resampled to 501x501 (30 m/px) | NASA Planetary Data System, Geosciences Node (WUSTL), LRO LOLA | `frontend/public/models/<site>/*.glb`, `*_heightmap_16bit.png`, `*_meta.json` |
| LRO LOLA GDR polar stereographic DEMs `LDEM_85S_20M` (20 m/px, to 85 S) and `LDEM_80S_40M` (40 m/px, to 80 S), DATA_SET_ID `LRO-L-LOLA-4-GDR-V1.0`, 16-bit DN x 0.5 m relative to R = 1737.4 km, frame "Mean Earth/Polar Axis of DE421" | 360 deg topographic horizon H(theta) of each site, rays of 100 km with lunar curvature correction (20 m grid near the sites, 40 m grid where the 85 S grid ends: far field of Malapert and Nobile) | NASA PDS Geosciences Node, https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ | Source: `data/dem/ldem_85s_20m.img`, `ldem_80s_40m.img` + `.lbl` (**git-ignored**, ~920 MB). Result: `frontend/src/data/horizonProfiles.json` |
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

Check with our own model (2 m mast, 2026-11..2029-11, `backend/app/services`): CR1 lit 92 % of the time, mean 88 %
(Gläser: 92 %, 88.1 %). Bussey's points (Kaguya topography, 2-decimal coordinates = +-300 m) give 41-60 % at the exact
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
The script (NumPy only) writes `frontend/src/data/horizonProfiles.json`: for each site, its LOLA ground height and, for
mast heights of 2, 4 and 6 m, the horizon angle every 1 deg of azimuth (clockwise from local north) with the distance of
the terrain point that sets it. Method: `h_obs = h_terrain + h_mast`; along each azimuth (great circle, 20 m steps,
20 m to 100 km) `alpha = atan(((h_m - h_obs) - d^2 / (2 R)) / d)` and `H(theta) = max alpha`.

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
2. Per candidate (process pool): horizon every 1 deg with 100 km rays and the curvature correction above
   (`services/terrain.py`; ray samples every 20 m up to 2 km, then every 0.5 % of the distance: max 0.04 deg difference
   with uniform 20 m sampling on 5 test sites); hourly Sun / Earth directions from the JPL Horizons buffer of the nearest
   of the 4 sites, re-projected on the candidate's local horizon (`services/ephemeris.py`; Earth parallax error
   < |distance to that site| / 356,000 km, e.g. 0.002 deg at 15 km); Sun disc fraction (R = 0.266 deg) and DTE line of
   sight (`services/visibility.py`); ground slope from the DEM (reported, not filtered).
3. Ranking by share of hours with Sun and Earth visible at once (or Sun mean visible fraction, or DTE).
Timing on a 12-core laptop: ~6 s for 150 candidates, ~11.5 s for 300.

## 3D assets and textures: provenance to verify
These have no recorded origin or license yet. Confirm and fill in before the final submission.

- [ ] `models/lander/lander.glb`: "reference Artemis lunar lander model", author/license unknown.
- [ ] `models/celestial/Earth.glb`: author/license unknown.
- [ ] `models/moon_texture/textures/moon_meteor_01_*_2k.jpg`: photogrammetric PBR regolith, author/license unknown.
