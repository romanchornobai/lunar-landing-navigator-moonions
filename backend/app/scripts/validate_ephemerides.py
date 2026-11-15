"""Validate the baked ephemeris buffer against fresh JPL Horizons API queries.

Buffer: frontend/public/data/ephemerides/ephemerides_3yr.bin (format in backend/app/services/ephemeris.py):
hourly apparent topocentric azimuth / elevation of the Sun (Horizons id 10) and Earth (id 399) seen from the 4
ephemeris sites, 2026-11-14T00:00Z .. 2029-11-14T00:00Z.

Query (JPL Horizons API, https://ssd.jpl.nasa.gov/api/horizons.api): observer table, CENTER='coord@301' (user site on
the Moon), COORD_TYPE=GEODETIC, SITE_COORD='E-lon, lat, 0' (altitude 0 on R = 1737.4 km), QUANTITIES=4 (apparent
azimuth, clockwise from north, and elevation, airless), hourly steps. Windows of WINDOW_H hours at the start, middle
and end of the buffer. Prints the max |difference| per site and body, in degrees.

Usage (from repo root):  python backend/app/scripts/validate_ephemerides.py [--window-h 48]
Needs network access to ssd.jpl.nasa.gov. Read-only: writes nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import timedelta
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from app.services.ephemeris import HOURS, SITE_KEYS, SITES, START_UTC, load_ephemerides  # noqa: E402

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODIES = {"sun": "10", "earth": "399"}  # same order as the buffer: 0 Sun, 1 Earth


def horizons_azel(lat: float, lon: float, body: str, h0: int, n: int) -> np.ndarray:
    """(n, 2) apparent azimuth / elevation [deg] from Horizons for hours [h0, h0 + n) of the buffer."""
    t0 = START_UTC + timedelta(hours=h0)
    t1 = t0 + timedelta(hours=n - 1)
    params = {
        "format": "json", "COMMAND": f"'{body}'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'", "COORD_TYPE": "GEODETIC", "SITE_COORD": f"'{lon % 360:.6f},{lat:.6f},0'",
        "START_TIME": f"'{t0:%Y-%m-%d %H:%M}'", "STOP_TIME": f"'{t1:%Y-%m-%d %H:%M}'", "STEP_SIZE": "'1 h'",
        "QUANTITIES": "'4'", "CSV_FORMAT": "YES", "ANG_FORMAT": "DEG",
    }
    with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(params)}", timeout=60) as r:
        text = json.load(r)["result"]
    if "$$SOE" not in text:
        raise RuntimeError(f"Horizons returned no table:\n{text[:2000]}")
    rows = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    # CSV columns: date, solar flag, lunar flag, azimuth, elevation
    out = np.array([[float(c) for c in row.split(",")[3:5]] for row in rows])
    if out.shape != (n, 2):
        raise RuntimeError(f"expected {n} rows, got {out.shape[0]}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--window-h", type=int, default=48, help="hours per window (default 48)")
    args = ap.parse_args()
    n = args.window_h
    starts = (0, (HOURS - n) // 2, HOURS - n)

    eph = load_ephemerides()
    worst = {b: [0.0, 0.0] for b in BODIES}
    for si, key in enumerate(SITE_KEYS):
        lat, lon = SITES[key]
        for bi, (bname, bid) in enumerate(BODIES.items()):
            d_az = d_el = 0.0
            for h0 in starts:
                ref = horizons_azel(lat, lon, bid, h0, n)
                ours = eph[si, bi, h0:h0 + n]
                d_az = max(d_az, float(np.max(np.abs((ours[:, 0] - ref[:, 0] + 180.0) % 360.0 - 180.0))))
                d_el = max(d_el, float(np.max(np.abs(ours[:, 1] - ref[:, 1]))))
            worst[bname] = [max(worst[bname][0], d_az), max(worst[bname][1], d_el)]
            print(f"{key:11s} {bname:5s}  max |d az| {d_az:.5f} deg   max |d el| {d_el:.5f} deg")
    print(f"\n{len(starts)} windows x {n} h per site and body.")
    for b, (a, e) in worst.items():
        print(f"ALL {b:5s}  max |d az| {a:.5f} deg   max |d el| {e:.5f} deg  (solar radius 0.266 deg)")


if __name__ == "__main__":
    main()
