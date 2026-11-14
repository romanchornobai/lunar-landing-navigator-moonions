# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026 (Zaragoza). Web app to compare lunar South Pole landing sites and dates:
Sun/Earth positions against the real local horizon, solar power potential, and Direct-to-Earth (DTE) windows.
Audience: mission planners, educators, general public. Must be intuitive and fast to read.

## Hard constraints (judging)
- All final code written during the event; public repo, MIT license.
- Only real, cited open data (LRO LOLA, JPL Horizons). Never invent or use generic data.
- Pillars: Impact, Creativity, Scientific Validity, Data Use/Relevance, Presentation/Clarity.
- Deliverables are in English (fact sheet, 30 s video or max 7 slides). Deadline: Sunday 23:59.
- Keep `DATA_SOURCES.md` updated whenever a dataset or model is added or changed.

## Concept
3D interactive simulator: orbital Moon view -> pick a site + date (3D globe or 2D map) -> camera drops to
first-person next to the lander -> Sun and Earth move over real terrain; time can be accelerated; terrain
blocking of light/signal gives solar energy and DTE windows.
Plan: (1) build a viewer for each model/view, (2) build the app on top of them.
Out of scope for now: physical lander mockup / USB hardware.

## Stack
- Frontend: React 18.2, TypeScript 5.2, Vite 5.1, Three.js r162, @react-three/fiber 8.16, @react-three/drei 9.102,
  Tailwind 3.4, Radix UI, Lucide, Zustand 4.5 (selected site, `missionDate`, playback speed, telemetry).
  Retro bitmap font IBM EGA 8x8 (Web437) in `frontend/public/fonts/`.
- Backend: Python, FastAPI 0.110, Uvicorn 0.28, Pydantic v2, Skyfield 1.48, NumPy 1.26.
- Data: LOLA DEM; JPL Horizons hourly ephemerides 2026-2029 for the 4 sites (Sun id 10, Earth id 399),
  stored as SQLite in the backend and as a Float32 binary in the frontend (no network calls for interpolation).
- Commands (run in `frontend/`): `npm install`, `npm run dev` (Vite, port 5173, proxies `/api` to :8000), `npm run build` (tsc + vite build), `npm run preview`. Backend (local only, run in `backend/`): `python -m venv .venv`, `.venv/Scripts/python -m pip install -r requirements.txt`, `.venv/Scripts/python -m uvicorn app.main:app --port 8000` (needs the LOLA DEMs in `data/dem/`, see `DATA_SOURCES.md`).

## Layout
- `backend/app/{api,models,scripts,services}`: FastAPI app, data models, data-generation scripts, domain logic.
- `data/ephemerides/csv`, `data/baked`: raw ephemeris CSVs and baked data.
- `frontend/src/{components/canvas3d,components/ui,lib,services,store,utils}`: React app.
- `frontend/public/models/`: site terrain GLBs, lander, Earth, textures. See `ASSETS.md` for parameters.
- `frontend/public/data/ephemerides/ephemerides_3yr.bin`: frontend ephemeris buffer.
- `frontend/public/textures/*.tif`: NASA CGI Moon Kit rasters, **git-ignored** (see `DATA_SOURCES.md`).

## Working rules
- Do exactly what the user asks. If something unrequested seems needed, ask first with a 1-2 line reason.
- Heavy tasks (lots of code): first give a short summary of the plan and what is needed from the user, then wait for OK.
- Light tasks: just do them. If something is unclear, ask before writing.
- After each completed task: commit with a short English message summarizing the change. Pushes to GitHub are done together with the user.
- Language: code, comments, commits and docs in English; chat with the user in Spanish.
- Never read binary assets (`.glb`, `.png`, `.tif`, `.bin`): use `ASSETS.md` and the `*_meta.json` files.
- Never commit `.md` or `.txt` files inside `frontend/public/` (they are git-ignored). Project docs live at the repo root.
- Scientific validity first: state units, frames and data sources in code comments where they matter.
