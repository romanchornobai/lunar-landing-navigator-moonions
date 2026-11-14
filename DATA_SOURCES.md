# Data Sources

Every dataset and model used by the app, with provenance. Update this file whenever a source is added or changed.

## Scientific data

| Data | Used for | Source | Local files |
|---|---|---|---|
| LRO LOLA polar stereographic DEM (GDR `ldem_85s_20m`, 20 m/px native, R = 1737.4 km) | 15 km x 15 km terrain of the 4 candidate sites (Shackleton Connecting Ridge, Malapert Massif, De Gerlache/Faustini Rim, Nobile Rim 1), resampled to 501x501 (30 m/px) | NASA Planetary Data System, Geosciences Node (WUSTL), LRO LOLA | `frontend/public/models/<site>/*.glb`, `*_heightmap_16bit.png`, `*_meta.json` |
| LROC / LOLA polar DTM, 6 deg cap (~364 km) | Regional South Pole terrain, 1200x1200 elevation grid | NASA Moon Trek, https://trek.nasa.gov/moon/ | `frontend/public/models/south_pole/lunar_elevation_1200.bin` and derived albedo/normal/AO 2K maps |
| LRO LROC WAC mosaic v2 (`LRO_WAC_Mosaic_SPole60_100m_v02`, ~100 m/px, to 60 S) LRO LROC NAC mosaic (`LRO_NAC_Mosaic_SPole85.5_1mp`, 1 m/px source, to 85.5 S) and LRO LROC NAC mosaic of Malapert Massif (`LRO_NAC_Mosaic_0_67mpp_Malapert_Massif_SP`, 0.67 m/px source, zoom to ~1 m/px), South Polar Stereographic IAU2000:30120 (R = 1737.4 km) | 2D South Pole map (base mosaic + high-resolution overlay when zoomed in) | NASA Moon Trek WMTS, https://trek.nasa.gov/tiles/Moon/SP/<layer>/1.0.0/WMTSCapabilities.xml (layer index: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon) | `frontend/public/tiles/moon_sp/<layer>/{z}/{row}/{col}.png` + `manifest.json` (**git-ignored**): all zoom levels (WAC 0-5, NAC 0-11, Malapert NAC 0-13) within +-10 km of each candidate site (clipped to each layer extent), read locally; everything else streamed from Trek at runtime. Tile grid in `frontend/src/lib/moonSouthPolarCrs.ts` |
| CGI Moon Kit: LROC WAC color (8192x4096) and LOLA DEM (16-bit) | Global lunar sphere | NASA Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720/ | Source: `frontend/public/textures/lroc_color_16bit_srgb_8k.tif`, `ldem_16_uint.tif` (**git-ignored**). Used by the app: `moon_color_8k.jpg`, `moon_elevation_8bit.png` (8-bit derivatives, same resolution) |
| Hourly topocentric Sun (id 10) and Earth (id 399) positions, 2026-2029, for each site | Sun/Earth azimuth-elevation, insolation and DTE windows | NASA JPL Horizons API, https://ssd.jpl.nasa.gov/horizons/ | `data/ephemerides/csv/`, `frontend/public/data/ephemerides/ephemerides_3yr.bin` |

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

## 3D assets and textures: provenance to verify
These have no recorded origin or license yet. Confirm and fill in before the final submission.

- [ ] `models/lander/lander.glb`: "reference Artemis lunar lander model", author/license unknown.
- [ ] `models/celestial/Earth.glb`: author/license unknown.
- [ ] `models/moon_texture/textures/moon_meteor_01_*_2k.jpg`: photogrammetric PBR regolith, author/license unknown.
