# lunar-landing-navigator-moonions
Nasa space apps project, Zaragoza 2026. Team Moonieons

## Validation
Data provenance, model details and limits are in [`DATA_SOURCES.md`](DATA_SOURCES.md).

| Check | Result |
|---|---|
| Ephemeris buffer vs fresh JPL Horizons queries (4 sites, Sun and Earth, 3 x 48 h windows), `python backend/app/scripts/validate_ephemerides.py` | max 0.00006 deg (Sun), 0.0008 deg (Earth); solar radius is 0.266 deg |
| Connecting Ridge CR1 vs Gläser et al. 2014 (EPSC2014-136-1), 2 m mast | Sun visible 90.8 % (Gläser 92 %), mean visible disc 86.4 % (Gläser 88.1 %). Ours covers 2026-2029, theirs a full 18.6-year cycle |
| Browser vs Python implementation, 5 points, 2026-11-14..2029-11-14 | identical percentages |
| Adaptive vs uniform 20 m ray sampling, 5 sites | max 0.04 deg |

Horizon model: LRO LOLA 20 m DEM near the site (40 m beyond 85 S), 360 rays every 1 deg along great circles up to
200 km, exact spherical geometry. The Sun counts as visible when any part of its disc is above the terrain.
