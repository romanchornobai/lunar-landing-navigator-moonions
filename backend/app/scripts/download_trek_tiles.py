"""Download NASA Moon Trek WMTS tiles around the candidate landing sites for offline use.

Layers (South Polar Stereographic, IAU2000:30120, sphere R = 1737.4 km, default028mm tile matrix set):
  - LRO_WAC_Mosaic_SPole60_100m_v02   native zoom 0..5
  - LRO_NAC_Mosaic_SPole85.5_1mp       native zoom 0..11 (~4.2 m/px at 11)

For every zoom level, all tiles intersecting a square of +-RADIUS_KM around each site are saved to
frontend/public/tiles/moon_sp/<layer>/<z>/<row>/<col>.png, plus manifest.json listing what exists
(the 2D map reads local tiles listed there and streams the rest from Trek).

Usage (from repo root):  python backend/app/scripts/download_trek_tiles.py [--radius-km 10]
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SITES_JSON = ROOT / "frontend" / "src" / "data" / "landingSites.json"
OUT_DIR = ROOT / "frontend" / "public" / "tiles" / "moon_sp"

TREK = "https://trek.nasa.gov/tiles/Moon/SP"
LAYERS = {
    "LRO_WAC_Mosaic_SPole60_100m_v02": 5,
    "LRO_NAC_Mosaic_SPole85.5_1mp": 11,
}

R_MOON_M = 1_737_400.0
# From WMTSCapabilities.xml: top-left corner (-1095930, 1095930) m, 256 px tiles,
# level-0 pixel size = ScaleDenominator 3.0578404017857101e7 * 0.28 mm.
ORIGIN_M = 1_095_930.0
TILE0_M = 256 * 3.0578404017857101e7 * 0.00028  # tile edge at zoom 0 (m)


def polar_xy(lat: float, lon: float) -> tuple[float, float]:
    """(lat, lon) deg -> south polar stereographic (x, y) m; lon 0 along +y."""
    r = 2 * R_MOON_M * math.tan(math.radians(90 + lat) / 2)
    return r * math.sin(math.radians(lon)), r * math.cos(math.radians(lon))


def tiles_around(x: float, y: float, radius_m: float, z: int) -> set[tuple[int, int]]:
    size = TILE0_M / 2**z
    c0 = math.floor((x - radius_m + ORIGIN_M) / size)
    c1 = math.floor((x + radius_m + ORIGIN_M) / size)
    r0 = math.floor((ORIGIN_M - (y + radius_m)) / size)
    r1 = math.floor((ORIGIN_M - (y - radius_m)) / size)
    return {(r, c) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)}


def fetch(job: tuple[str, int, int, int]) -> str | None:
    layer, z, row, col = job
    key = f"{z}/{row}/{col}"
    dest = OUT_DIR / layer / str(z) / str(row) / f"{col}.png"
    if dest.exists() and dest.stat().st_size > 0:
        return key
    url = f"{TREK}/{layer}/1.0.0/default/default028mm/{z}/{row}/{col}.png"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "lunar-landing-site-navigator/0.1"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.headers.get_content_type() != "image/png":
                return None
            data = resp.read()
    except urllib.error.HTTPError:
        return None  # 404 = outside the layer coverage
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return key


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--radius-km", type=float, default=10.0)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    sites = json.loads(SITES_JSON.read_text(encoding="utf-8"))
    radius_m = args.radius_km * 1000
    manifest: dict[str, list[str]] = {}

    for layer, max_z in LAYERS.items():
        jobs: set[tuple[str, int, int, int]] = set()
        for site in sites:
            x, y = polar_xy(site["coordinates"]["latitude"], site["coordinates"]["longitude"])
            for z in range(max_z + 1):
                jobs |= {(layer, z, r, c) for r, c in tiles_around(x, y, radius_m, z)}
        print(f"{layer}: {len(jobs)} tiles")
        with ThreadPoolExecutor(args.workers) as pool:
            keys = [k for k in pool.map(fetch, sorted(jobs)) if k]
        manifest[layer] = sorted(keys)
        print(f"  saved {len(keys)} ({len(jobs) - len(keys)} outside coverage)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta = {"radius_km": args.radius_km, "source": TREK, "layers": manifest}
    (OUT_DIR / "manifest.json").write_text(json.dumps(meta), encoding="utf-8")
    print(f"manifest: {OUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
