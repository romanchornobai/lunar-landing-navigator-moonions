# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026, Zaragoza. Team **Moonions**.

Compare landing sites and dates at the lunar South Pole: when the Sun (solar power) and the Earth (Direct-to-Earth
radio link) are visible above the **real local horizon**, computed from LRO LOLA terrain and JPL Horizons ephemerides.
For mission planners, educators and the general public.

## What it does
- **3D Moon and South Pole views** with published candidate landing points (Artemis III regions, Bussey et al. 2010,
  Gläser et al. 2014, Mahanti et al. 2024), each linked to its source.
- **Site comparison**: share of time with Sun and with Earth visible for every point, 2026-11-14 .. 2029-11-14.
- **First-person site view** next to a lander: Sun and Earth move over the LOLA terrain, time can be accelerated, and
  the HUD shows when the Sun / Earth rise or set behind the terrain.
- **Best point in an area** (local backend): pick any 15 x 15 km square and rank its highest points by Sun + Earth
  visibility.

## Run it
Frontend (from `frontend/`):
```bash
npm install
npm run dev
```
Opens on http://localhost:5173. Everything except the area search runs in the browser, with no network calls for
the visibility model.

Backend for the area search (from `backend/`, needs the LOLA DEMs in `data/dem/`, see `DATA_SOURCES.md`):
```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```
Without the backend, the area search shows "Computation server unavailable"; the rest of the app works.

## Data
- **LRO LOLA** polar DEMs LDEM_85S_20M (20 m/px) and LDEM_80S_40M (40 m/px), NASA PDS Geosciences Node.
- **JPL Horizons** hourly apparent azimuth / elevation of the Sun (10) and Earth (399) for 4 South Pole sites,
  2026-11-14 .. 2029-11-14.
- **NASA Moon Trek** (LRO LROC WAC / NAC) tiles for the 2D map, NASA CGI Moon Kit for the globe.

Full list, processing steps, assumptions and limits: [`DATA_SOURCES.md`](DATA_SOURCES.md). 3D asset parameters:
[`ASSETS.md`](ASSETS.md).

## Validation
| Check | Result |
|---|---|
| Ephemeris buffer vs fresh JPL Horizons queries (4 sites, Sun and Earth, 3 x 48 h windows), `python backend/app/scripts/validate_ephemerides.py` | max 0.00006 deg (Sun), 0.0008 deg (Earth); solar radius is 0.266 deg |
| Connecting Ridge CR1 vs Gläser et al. 2014 (EPSC2014-136-1), 2 m mast | Sun visible 90.8 % (Gläser 92 %), mean visible disc 86.4 % (Gläser 88.1 %). Ours covers 2026-2029, theirs a full 18.6-year cycle |
| Browser vs Python implementation, 5 points, 2026-11-14..2029-11-14 | identical percentages |
| Adaptive vs uniform 20 m ray sampling, 5 sites | max 0.04 deg |

Horizon model: LRO LOLA 20 m DEM near the site (40 m beyond 85 S), 360 rays every 1 deg along great circles up to
200 km, exact spherical geometry. The Sun counts as visible when any part of its disc is above the terrain.

## Use of AI
The code was written during the event by the team with the help of an AI coding assistant (Anthropic's Claude, via
Claude Code), which was also used to search and read the scientific literature and data documentation. All data come
from the cited NASA / JPL sources; no AI-generated data, images or results are shown as real. The team reviewed and
validated the results (see Validation).

## Stack
React, TypeScript, Vite, Three.js (@react-three/fiber, drei), Tailwind, Zustand, Leaflet; Python, FastAPI, NumPy.

## License
[MIT](LICENSE)
