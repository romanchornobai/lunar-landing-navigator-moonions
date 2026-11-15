# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026 · Zaragoza, Spain · Team **Moonions**

**Live app: https://moonions.goodcarpenter.es**

> Where and when should we land at the lunar South Pole to have sunlight for power and the Earth in view for radio?
> Pick a site and a date, and watch the Sun and the Earth move over the real terrain.

## High-level summary
At the lunar South Pole the Sun never rises more than a degree or two above the horizon, so a ridge a few kilometres
away decides whether a lander has power, and the Earth hides behind the same terrain and cuts the radio link.
Lunar Landing Site Navigator turns NASA's own data into an answer anyone can read: for each candidate landing site
and date it shows when the Sun and the Earth are visible above the **real local horizon**, computed from LRO LOLA
terrain and JPL Horizons ephemerides. Sites can be compared side by side, explored in first person next to a lander
with time running faster, and any 15 x 15 km area can be searched for its best landing point.

## What it does
- **From orbit to the ground.** A 3D Moon, then the South Pole with the published candidate landing points (Artemis III
  regions, Bussey et al. 2010, Gläser et al. 2014, Mahanti et al. 2024), each linked to the study it comes from.
- **Compare sites in seconds.** The share of time with the Sun and with the Earth visible, for every point, over
  2026-11-14 .. 2029-11-14, played back as an animated bar chart.
- **Stand next to the lander.** Sun and Earth move over the LOLA terrain at true angular size; time can be sped up or
  reversed, and the HUD tells when each one rises or sets behind the terrain. When the Sun is fully hidden, a
  night-vision view keeps the scene readable.
- **Find the best point in an area.** Select any 15 x 15 km square and the backend ranks its highest points by Sun and
  Earth visibility, with the horizon of the winner.

## Designed for everyone
The navigator is built so that a mission planner, a teacher and someone who has never heard of a DEM can all use it.
- **Minimal by design.** One question per screen, a dark retro interface with few words, and no number on screen
  that is not computed from the data.
- **Readable at a glance.** Results are bars and percentages (white = visible, red = hidden), not tables of angles;
  the detail is there for whoever wants it.
- **Learn by watching.** An animated explainer walks through the method step by step: terrain, horizon, Sun, Earth.
- **No setup.** It runs in a web browser, and all visibility computations for the published sites happen in the page,
  with no server or network calls.
- **Every number has a source.** Each site links to its original study, and the data and their limits are documented
  in [`DATA_SOURCES.md`](DATA_SOURCES.md).

## How it works
1. **Terrain.** LRO LOLA polar DEMs: 20 m/px near the site, 40 m/px beyond 85 S.
2. **Horizon.** From a 2 m mast, 360 rays (one per degree) follow great circles up to 200 km; the horizon in each
   direction is the highest terrain angle, with exact spherical geometry of the Moon.
3. **Sun and Earth.** Hourly apparent azimuth and elevation from JPL Horizons, 2026-2029.
4. **Visibility.** The Sun counts as visible when any part of its disc is above the horizon (the visible share of the
   disc is computed exactly); the Direct-to-Earth link is active when the Earth's centre is above it.

## Validation
| Check | Result |
|---|---|
| Ephemeris buffer vs fresh JPL Horizons queries (4 sites, Sun and Earth, 3 x 48 h windows), `python backend/app/scripts/validate_ephemerides.py` | max 0.00006 deg (Sun), 0.0008 deg (Earth); solar radius is 0.266 deg |
| Connecting Ridge CR1 vs Gläser et al. 2014 (EPSC2014-136-1), 2 m mast | Sun visible 90.8 % (Gläser 92 %), mean visible disc 86.4 % (Gläser 88.1 %). Ours covers 2026-2029, theirs a full 18.6-year cycle |
| Browser vs Python implementation, 5 points, 2026-11-14..2029-11-14 | identical percentages |
| Adaptive vs uniform 20 m ray sampling, 5 sites | max 0.04 deg |

Assumptions and limits (point-like Earth, 1 h time step, no features smaller than the DEM, ...) are listed in
[`DATA_SOURCES.md`](DATA_SOURCES.md).

## NASA data
- **LRO LOLA** GDR polar DEMs LDEM_85S_20M and LDEM_80S_40M, NASA PDS Geosciences Node.
- **JPL Horizons** apparent azimuth / elevation of the Sun (10) and the Earth (399) seen from 4 South Pole sites.
- **NASA Moon Trek** (LRO LROC WAC / NAC) tiles for the 2D map, **NASA CGI Moon Kit** for the globe.

Full list with links, processing steps and versions: [`DATA_SOURCES.md`](DATA_SOURCES.md). 3D asset parameters:
[`ASSETS.md`](ASSETS.md).

## Use of AI
This project is the team's work. The idea, the scientific approach, the architecture, every design and data decision,
and all testing and validation (including the checks against JPL Horizons and the published CR1 study) were done by
the team. We used Anthropic's Claude (through Claude Code) as a coding assistant to turn our ideas and designs into
code faster and to help search the scientific literature. The team directed and reviewed that work at every step:
we decided what to build, checked each change in the app and verified the results against the data. No AI-generated
data, images or results are presented as real; every number comes from the cited NASA / JPL sources.

## Run it locally
Frontend (from `frontend/`):
```bash
npm install
npm run dev
```
Opens on http://localhost:5173. Everything except the area search runs in the browser.

Backend for the area search (from `backend/`, needs the LOLA DEMs in `data/dem/`, see `DATA_SOURCES.md`):
```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```
Without the backend, the area search shows "Computation server unavailable"; the rest of the app works.

## Deployment
The live app runs with Docker Compose (`docker-compose.yml`, `deploy/`): nginx serves the built frontend and proxies
`/api` to the FastAPI backend. The LOLA DEMs (`data/dem/`) and the Moon Trek tiles (`frontend/public/tiles/`) are
mounted from the server, not stored in git. `deploy/update.sh` pulls `main` from GitHub and rebuilds.

## Built with
React, TypeScript, Vite, Three.js (@react-three/fiber, drei), Tailwind, Zustand, Leaflet · Python, FastAPI, NumPy.

## License
[MIT](LICENSE)
