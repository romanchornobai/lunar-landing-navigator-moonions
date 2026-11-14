"""Sun and Earth directions at any point of the South Pole cap, from the baked JPL Horizons ephemerides (step 1).

Source buffer: frontend/public/data/ephemerides/ephemerides_3yr.bin (see DATA_SOURCES.md / ASSETS.md):
hourly apparent topocentric azimuth / elevation of the Sun (Horizons id 10) and Earth (id 399) from the 4
candidate sites, 2026-11-14T00:00Z .. 2029-11-14T00:00Z inclusive, little-endian Float32, order
[site][body][hour][az, el]; azimuth clockwise from local north, elevation above the spherical horizon.

Any other point P is served from the nearest of the 4 sites S: the direction (az, el) at S is turned into a vector of
the Moon-fixed frame with the local East/North/Up basis of S and projected on the basis of P. This is exact for a
direction fixed in the Moon frame; the only approximation is the topocentric parallax between S and P, bounded by
|SP| / distance: < 0.0001 deg for the Sun and |SP| / 356,000 km for the Earth (0.002 deg at 15 km, 0.02 deg at 150 km),
far below the 0.27 deg solar radius used in the visibility model.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from .terrain import R_MOON_M, REPO_ROOT

EPHEMERIS_PATH = REPO_ROOT / "frontend" / "public" / "data" / "ephemerides" / "ephemerides_3yr.bin"
START_UTC = datetime(2026, 11, 14, tzinfo=timezone.utc)
HOURS = 26305
EARTH_MIN_DISTANCE_KM = 356_000.0  # lunar perigee, bounds the Earth parallax error

# Same order as the buffer (and as frontend/src/utils/ephemerisClient.ts).
SITES = {
    "shackleton": (-89.54, 129.20),
    "malapert": (-85.99, 2.93),
    "nobile": (-85.25, 35.80),
    "degerlache": (-88.71, -68.70),
}
SITE_KEYS = list(SITES)


def load_ephemerides(path: Path = EPHEMERIS_PATH) -> np.ndarray:
    """Returns float64 array [site, body (0 Sun, 1 Earth), hour, (az, el)]."""
    arr = np.fromfile(path, dtype="<f4")
    expected = len(SITES) * 2 * HOURS * 2
    if arr.size != expected:
        raise ValueError(f"{path} has {arr.size} floats, expected {expected}")
    return arr.reshape(len(SITES), 2, HOURS, 2).astype(np.float64)


def hour_index(t: datetime) -> float:
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return (t - START_UTC).total_seconds() / 3600.0


def hour_range(start: datetime | None, end: datetime | None) -> tuple[int, int]:
    """Half-open [h0, h1) range of hourly samples covering [start, end]; clipped to the buffer."""
    h0 = 0 if start is None else int(np.ceil(hour_index(start)))
    h1 = HOURS if end is None else int(np.floor(hour_index(end))) + 1
    h0, h1 = max(0, h0), min(HOURS, h1)
    if h1 <= h0:
        raise ValueError(f"date range outside the ephemeris coverage {START_UTC.isoformat()} .. "
                         f"{(START_UTC + timedelta(hours=HOURS - 1)).isoformat()}")
    return h0, h1


def enu_basis(lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Local East, North, Up unit vectors in the Moon-fixed Cartesian frame (sphere)."""
    p, l = np.radians(lat_deg), np.radians(lon_deg)
    east = np.array([-np.sin(l), np.cos(l), 0.0])
    north = np.array([-np.sin(p) * np.cos(l), -np.sin(p) * np.sin(l), np.cos(p)])
    up = np.array([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)])
    return east, north, up


def transform_azel(az_deg: np.ndarray, el_deg: np.ndarray, src: tuple[float, float], dst: tuple[float, float]):
    """Same Moon-fixed direction seen with the local horizon of dst instead of src. Returns az, el [deg]."""
    az, el = np.radians(az_deg), np.radians(el_deg)
    e, n, u = enu_basis(*src)
    v = (np.cos(el) * np.sin(az))[:, None] * e + (np.cos(el) * np.cos(az))[:, None] * n + np.sin(el)[:, None] * u
    e2, n2, u2 = enu_basis(*dst)
    return np.degrees(np.arctan2(v @ e2, v @ n2)) % 360.0, np.degrees(np.arcsin(np.clip(v @ u2, -1.0, 1.0)))


def surface_distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance on the reference sphere."""
    ua, ub = enu_basis(*a)[2], enu_basis(*b)[2]
    return float(R_MOON_M * np.arccos(np.clip(ua @ ub, -1.0, 1.0)))


def nearest_site(lat: float, lon: float) -> tuple[str, float]:
    dists = {k: surface_distance_m((lat, lon), v) for k, v in SITES.items()}
    key = min(dists, key=dists.get)
    return key, dists[key]


@dataclass
class BodyTracks:
    """Hourly topocentric directions at one point over [h0, h1)."""
    sun_az: np.ndarray
    sun_el: np.ndarray
    earth_az: np.ndarray
    earth_el: np.ndarray
    source_site: str
    source_distance_m: float

    @property
    def earth_parallax_bound_deg(self) -> float:
        return float(np.degrees(self.source_distance_m / (EARTH_MIN_DISTANCE_KM * 1000)))


def tracks_at(eph: np.ndarray, lat: float, lon: float, h0: int, h1: int) -> BodyTracks:
    key, dist = nearest_site(lat, lon)
    si, src = SITE_KEYS.index(key), SITES[key]
    sun_az, sun_el = transform_azel(eph[si, 0, h0:h1, 0], eph[si, 0, h0:h1, 1], src, (lat, lon))
    earth_az, earth_el = transform_azel(eph[si, 1, h0:h1, 0], eph[si, 1, h0:h1, 1], src, (lat, lon))
    return BodyTracks(sun_az, sun_el, earth_az, earth_el, key, dist)
