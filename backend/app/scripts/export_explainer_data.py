"""Export the real data behind the "How it works" explainer animations (frontend/public/explainer.html).

Runs the same area search as the API (services/area_search.py) on a 15 x 15 km square centred on Connecting Ridge CR1
and keeps every intermediate product the animations show, so nothing on screen is invented:
  1. Candidates: 20 m LOLA grid of the square, its 240 m cells, the highest pixel of each cell, the 150 highest.
  2. Horizon of the winning point: one full ray profile (d, h, alpha) and H(theta) with the blocking point of every
     azimuth, on a 400 x 400 km LOLA hillshade around it.
  3. Sun / Earth tracks at the winner (JPL Horizons, transformed as in services/ephemeris.py) for a 45-day window,
     with the visible solar-disc fraction f and the DTE flag of every hour.
  4. Hourly Sun / DTE state of the 10 best candidates over the 3 years (2 bits per hour) and their statistics.

Data: LRO LOLA LDEM_85S_20M / LDEM_80S_40M (NASA PDS Geosciences Node) and the baked JPL Horizons ephemerides, see
DATA_SOURCES.md. Map images are grayscale PNGs (hillshade, light from the upper left at 35 deg altitude, and heights
normalised 0..255 between the min and max of the area), embedded as base64.

Usage (from repo root, needs data/dem/):
    backend/.venv/Scripts/python backend/app/scripts/export_explainer_data.py
Output: data/baked/explainer_data.json, and the same JSON injected into frontend/public/explainer.html between the
markers of its <script id="explainer-data"> tag (if that file exists).
"""

from __future__ import annotations

import base64
import json
import math
import os
import re
import struct
import sys
import time
import zlib
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from app.services import area_search, ephemeris, terrain  # noqa: E402
from app.services.visibility import (SUN_RADIUS_DEG, dte_visible, horizon_at, longest_run,  # noqa: E402
                                     sun_visible_fraction)

OUT_JSON = ROOT / "data" / "baked" / "explainer_data.json"
HTML = ROOT / "frontend" / "public" / "explainer.html"

CENTER = (-89.4395, -137.1934)  # Connecting Ridge CR1 (Gläser et al. 2014), see DATA_SOURCES.md
REGION_HALF_M = 200_000.0  # regional hillshade: +-200 km (= ray length) around the winner
REGION_BLOCK = 25  # 40 m DEM pixels averaged per regional pixel -> 1 km/px
WINDOW_H = 45 * 24  # Sun / Earth animation window
TOP_N = 10


# ---------------------------------------------------------------- helpers
def png_gray(a: np.ndarray) -> str:
    """8-bit grayscale PNG (row 0 = top) as a base64 data URI."""
    a = np.ascontiguousarray(a, dtype=np.uint8)
    h, w = a.shape
    raw = b"".join(b"\x00" + a[i].tobytes() for i in range(h))

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    return "data:image/png;base64," + base64.b64encode(png).decode()


def hillshade(z: np.ndarray, px_m: float, az_deg: float = 315.0, alt_deg: float = 35.0,
              z_factor: float = 1.0) -> np.ndarray:
    """Standard hillshade of a height grid with row 0 = top (north-up image, +x right). Returns 0..255.
    z_factor exaggerates the relief for display only."""
    g_row, g_col = np.gradient(z * z_factor, px_m)  # rows grow downwards
    dzdx, dzdy = g_col, -g_row  # x right, y up
    norm = np.sqrt(dzdx ** 2 + dzdy ** 2 + 1.0)
    az, alt = math.radians(az_deg), math.radians(alt_deg)
    lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
    s = (-dzdx * lx - dzdy * ly + lz) / norm
    return np.clip(s * 255.0, 0, 255)


def norm8(z: np.ndarray) -> tuple[np.ndarray, float, float]:
    lo, hi = float(np.nanmin(z)), float(np.nanmax(z))
    return np.clip((z - lo) / (hi - lo) * 255.0, 0, 255), lo, hi


def pack2(states: np.ndarray) -> str:
    """2-bit states (bit0 Sun visible, bit1 DTE), 4 per byte, first hour in the low bits. Base64."""
    s = np.asarray(states, dtype=np.uint8)
    s = np.concatenate([s, np.zeros((-len(s)) % 4, dtype=np.uint8)]).reshape(-1, 4)
    b = s[:, 0] | (s[:, 1] << 2) | (s[:, 2] << 4) | (s[:, 3] << 6)
    return base64.b64encode(b.astype(np.uint8).tobytes()).decode()


def r(v, n):
    return [round(float(x), n) for x in v]


# ---------------------------------------------------------------- 1. candidates
def area_grid(dems, q: area_search.AreaQuery):
    """Same grid and cells as area_search.find_candidates (kept identical, checked below)."""
    cx, cy = terrain.polar_xy(q.lat, q.lon)
    half = q.size_km * 500.0
    step = terrain.DEM_SPECS[0].scale_m
    xs = np.arange(cx - half, cx + half, step)
    ys = np.arange(cy - half, cy + half, step)
    k = max(1, int(round(q.cell_m / step)))
    n = (len(xs) // k) * k
    xs, ys = xs[:n], ys[:n]
    X, Y = np.meshgrid(xs, ys)
    H = terrain.sample_terrain(dems, X.ravel(), Y.ravel()).reshape(X.shape)
    nb = n // k
    blocks = H.reshape(nb, k, nb, k).transpose(0, 2, 1, 3).reshape(nb, nb, k * k)
    idx, top = blocks.argmax(axis=2), blocks.max(axis=2)
    return xs, ys, H, k, nb, idx, top


# ---------------------------------------------------------------- 2. regional hillshade
def region_map(dems, lat, lon):
    dem = dems[1]  # 40 m grid, covers +-200 km around any point near the pole
    x, y = terrain.polar_xy(lat, lon)
    s, l = dem.pixel(np.array([x]), np.array([y]))
    half_px = int(REGION_HALF_M / dem.scale)
    s0, l0 = int(round(s[0])) - half_px, int(round(l[0])) - half_px
    nb = 2 * half_px // REGION_BLOCK
    out = np.zeros((nb, nb))
    for i in range(nb):  # strip-wise block mean (the full window is 10000 x 10000 px)
        strip = dem.dn[l0 + i * REGION_BLOCK: l0 + (i + 1) * REGION_BLOCK, s0: s0 + nb * REGION_BLOCK]
        out[i] = strip.astype(np.float64).reshape(REGION_BLOCK, nb, REGION_BLOCK).mean(axis=(0, 2)) * 0.5
    px_m = dem.scale * REGION_BLOCK
    # polar (x, y) of the image's top-left corner (row 0 = largest y)
    x_left = (s0 - dem.offset) * dem.scale
    y_top = (dem.offset - l0) * dem.scale
    return out, px_m, x_left, y_top


def main() -> None:
    t0 = time.perf_counter()
    dems = terrain.open_dems()
    eph = ephemeris.load_ephemerides()
    q = area_search.AreaQuery(lat=CENTER[0], lon=CENTER[1])
    q.validate()

    # ---- 1. candidates
    xs, ys, H, k, nb, idx, top = area_grid(dems, q)
    n = len(xs)
    cands = area_search.find_candidates(dems, q)
    flat_top = top.ravel()
    order = np.argsort(-flat_top)[: q.candidates]
    cell_r, cell_c = np.divmod(np.arange(nb * nb), nb)
    ii, jj = np.divmod(idx.ravel(), k)
    pr, pc = cell_r * k + ii, cell_c * k + jj  # grid row (ys ascending) / column of each cell maximum
    # image rows run top-down (largest y first)
    img_row = (n - 1) - pr
    # check: same candidates as the API
    lat_c, lon_c = terrain.polar_latlon(xs[pc[order]], ys[pr[order]])
    assert np.allclose(lat_c, [c["lat"] for c in cands]) and np.allclose(lon_c, [c["lon"] for c in cands])

    Himg = H[::-1]  # row 0 = north edge (largest y)
    Hds = Himg.reshape(n // 2, 2, n // 2, 2).mean(axis=(1, 3))  # 40 m/px for the images
    hs = hillshade(Hds, 40.0, alt_deg=30.0, z_factor=2.0)
    hn, hlo, hhi = norm8(Hds)
    # the 12 x 12 pixels of the cell holding the highest candidate (inset of animation 1)
    best_cell = int(order[0])
    br, bc = divmod(best_cell, nb)
    cell_h = H[br * k:(br + 1) * k, bc * k:(bc + 1) * k][::-1]
    print(f"grid {n} x {n} px, {nb * nb} cells of {k} px, candidates {len(cands)} "
          f"({time.perf_counter() - t0:.1f} s)")

    # ---- evaluate the candidates exactly as the API does
    h0, h1 = 0, ephemeris.HOURS
    with ProcessPoolExecutor(max_workers=os.cpu_count(), initializer=area_search.worker_init) as pool:
        res = list(pool.map(area_search.evaluate_candidate,
                            [(c["lat"], c["lon"], q.mast_m, h0, h1) for c in cands]))
    for c_i, rr in enumerate(res):
        rr["height_rank"] = c_i  # candidates arrive sorted by height
    ranked = sorted(res, key=lambda rr: (rr["sun_and_dte"], rr["sun_mean_fraction"]), reverse=True)
    best = ranked[0]
    print(f"evaluated {len(res)} candidates ({time.perf_counter() - t0:.1f} s); best {best['lat']}, {best['lon']} "
          f"sun&dte {best['sun_and_dte']:.3f}")

    def grid_pos(lat, lon):
        x, y = terrain.polar_xy(lat, lon)
        return float((x - xs[0]) / 20.0 / (n - 1)), float(((n - 1) - (y - ys[0]) / 20.0) / (n - 1))

    # ---- 2. horizon of the winner: all rays, to pick a didactic profile and to place the blockers on the map
    blat, blon = cands[best["height_rank"]]["lat"], cands[best["height_rank"]]["lon"]  # full precision
    az = area_search.AZIMUTHS
    d = area_search.RAY_DISTANCES
    h_ground = terrain.ground_height(dems, blat, blon)
    h_obs = h_ground + q.mast_m
    rlat, rlon = terrain.destination(blat, blon, az, d)
    rx, ry = terrain.polar_xy(rlat, rlon)
    hm = terrain.sample_terrain(dems, rx, ry)
    delta = d / terrain.R_MOON_M
    alpha = np.degrees(np.arctan2((terrain.R_MOON_M + hm) * np.cos(delta) - (terrain.R_MOON_M + h_obs),
                                  (terrain.R_MOON_M + hm) * np.sin(delta)))
    alpha = np.where(np.isnan(alpha), -np.inf, alpha)
    kmax = np.argmax(alpha, axis=1)
    Hdeg = alpha[np.arange(len(az)), kmax]
    assert np.allclose(Hdeg, best["horizon_deg"], atol=1e-3)

    # didactic ray: blocker 10-120 km away and a HIGHER terrain point further out that the curvature hides
    best_score, prof_i = -np.inf, int(np.argmax(Hdeg))
    for i in range(len(az)):
        kb = kmax[i]
        if not (10_000 <= d[kb] <= 120_000):
            continue
        beyond = hm[i, kb + 1:]
        if beyond.size and np.nanmax(beyond) > hm[i, kb] + 300:
            score = Hdeg[i] + 0.002 * (np.nanmax(beyond) - hm[i, kb]) / 100
            if score > best_score:
                best_score, prof_i = score, i
    hidden_j = None
    beyond = hm[prof_i, kmax[prof_i] + 1:]
    if beyond.size and np.nanmax(beyond) > hm[prof_i, kmax[prof_i]]:
        hidden_j = int(kmax[prof_i] + 1 + np.nanargmax(beyond))
    valid = ~np.isnan(hm[prof_i])

    reg, reg_px_m, x_left, y_top = region_map(dems, blat, blon)
    reg_hs = hillshade(reg, reg_px_m, alt_deg=30.0, z_factor=2.0)
    reg_n = reg.shape[0]

    def reg_uv(x, y):
        return (x - x_left) / reg_px_m / reg_n, (y_top - y) / reg_px_m / reg_n

    bx, by = terrain.polar_xy(blat, blon)
    cu, cv = reg_uv(bx, by)
    blk_u, blk_v = reg_uv(rx[np.arange(len(az)), kmax], ry[np.arange(len(az)), kmax])
    # local north / east directions on the map (unit vectors in image uv, from a point 5 km away)
    nl, nlo = terrain.destination(blat, blon, np.array([0.0, 90.0]), np.array([5000.0]))
    nx, ny = terrain.polar_xy(nl[:, 0], nlo[:, 0])
    nu, nv = reg_uv(nx, ny)
    north = [float(nu[0] - cu), float(nv[0] - cv)]
    east = [float(nu[1] - cu), float(nv[1] - cv)]

    # ---- 3. Sun / Earth at the winner
    tr = ephemeris.tracks_at(eph, blat, blon, h0, h1)
    Hs = horizon_at(Hdeg, tr.sun_az)
    f = sun_visible_fraction(tr.sun_el, Hs)
    dte = dte_visible(tr.earth_el, horizon_at(Hdeg, tr.earth_az))
    sun = f > 0
    # window with both a sunset and a DTE loss, as many state changes as possible
    trans = np.concatenate([[0], (np.diff(sun.astype(int)) != 0) | (np.diff(dte.astype(int)) != 0)]).cumsum()
    w0_best, sc_best = 0, -1
    for w0 in range(0, len(f) - WINDOW_H, 24):
        w = slice(w0, w0 + WINDOW_H)
        if (~sun[w]).sum() < 24 or (~dte[w]).sum() < 24 or sun[w].sum() < 24 * 5:
            continue
        sc = trans[w0 + WINDOW_H - 1] - trans[w0]
        if sc > sc_best:
            w0_best, sc_best = w0, sc
    w = slice(w0_best, w0_best + WINDOW_H)
    fw = f[w]
    setting = [i for i in range(len(fw) - 1) if 0 < fw[i] < 1 and fw[i + 1] < fw[i]]
    # the animation plays the window up to a real partial sunset: take the latest one with f near 0.5
    mid = [i for i in setting if 0.25 < fw[i] < 0.75]
    partial_i = (max(mid) if mid else max(setting)) if setting else int(np.argmin(np.abs(fw - 0.5)))
    print(f"  up to it: {(~sun[w][:partial_i]).sum()} h without Sun, {(~dte[w][:partial_i]).sum()} h without DTE")
    print(f"window starts at hour {w0_best} ({sc_best} state changes), partial-disc hour {partial_i} f={fw[partial_i]:.2f}")

    # ---- 4. top 10 hourly states
    top = []
    for rr in ranked[:TOP_N]:
        c_full = cands[rr["height_rank"]]
        t2 = ephemeris.tracks_at(eph, c_full["lat"], c_full["lon"], h0, h1)
        hz = np.asarray(rr["horizon_deg"])
        s2 = sun_visible_fraction(t2.sun_el, horizon_at(hz, t2.sun_az)) > 0
        e2 = dte_visible(t2.earth_el, horizon_at(hz, t2.earth_az))
        u, v = grid_pos(rr["lat"], rr["lon"])
        dark = ~s2
        mm = np.concatenate(([False], dark, [False]))
        edges = np.flatnonzero(np.diff(mm.astype(np.int8)))
        runs = edges[1::2] - edges[::2]
        jlong = int(np.argmax(runs)) if runs.size else 0
        top.append({
            "lat": rr["lat"], "lon": rr["lon"], "u": round(u, 4), "v": round(v, 4),
            "ground_height_m": rr["ground_height_m"], "height_rank": rr["height_rank"],
            "slope_deg": rr["slope_deg"],
            **{kk: rr[kk] for kk in ("sun_any", "sun_full", "sun_mean_fraction", "dte", "sun_and_dte",
                                     "longest_dark_h", "longest_dte_blackout_h")},
            "longest_dark_start_h": int(edges[::2][jlong]) if runs.size else 0,
            "states": pack2(s2.astype(np.uint8) | (e2.astype(np.uint8) << 1)),
        })
        assert longest_run(dark) == rr["longest_dark_h"]

    start = ephemeris.START_UTC
    data = {
        "description": "Real data of the explainer animations, generated by "
                       "backend/app/scripts/export_explainer_data.py. Do not edit by hand.",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": [
            "LRO LOLA GDR LDEM_85S_20M / LDEM_80S_40M, LRO-L-LOLA-4-GDR-V1.0 (NASA PDS Geosciences Node)",
            "JPL Horizons hourly apparent az/el of the Sun (10) and Earth (399), 2026-11-14..2029-11-14",
        ],
        "model": {"r_moon_m": terrain.R_MOON_M, "mast_m": q.mast_m, "sun_radius_deg": SUN_RADIUS_DEG,
                  "az_step_deg": area_search.AZ_STEP_DEG, "ray_max_m": float(d[-1]),
                  "ray_samples": int(len(d)), "hours": int(len(f)), "start_utc": start.isoformat()},
        "area": {
            "center": list(CENTER), "center_name": "Connecting Ridge CR1", "size_km": q.size_km,
            "pixel_m": 20.0, "grid_px": int(n), "cell_px": int(k), "cell_m": float(k * 20), "cells_per_side": int(nb),
            "pixels": int(n * n), "cells": int(nb * nb), "candidates": len(cands),
            "hillshade": png_gray(hs), "height": png_gray(hn), "image_px": int(Hds.shape[0]),
            "height_min_m": round(hlo, 1), "height_max_m": round(hhi, 1),
            # every cell maximum: image coords (0..1, row 0 = top) and height
            "cell_u": r(pc / (n - 1), 4), "cell_v": r(img_row / (n - 1), 4), "cell_h": r(flat_top, 1),
            "order": [int(i) for i in order],  # cell indices of the 150 candidates, highest first
            "inset_cell": best_cell, "inset_heights": r(cell_h.ravel(), 1),
        },
        "horizon": {
            "lat": blat, "lon": blon, "ground_height_m": round(h_ground, 1),
            "horizon_deg": r(Hdeg, 3), "blocker_m": [int(round(float(v), -1)) for v in d[kmax]],
            "profile": {"az": float(az[prof_i]), "d_m": r(d[valid], 0), "h_m": r(hm[prof_i][valid], 1),
                        "blocker_index": int(np.flatnonzero(valid).tolist().index(kmax[prof_i])),
                        "hidden_index": (int(np.flatnonzero(valid).tolist().index(hidden_j))
                                         if hidden_j is not None else None)},
            "region": {"hillshade": png_gray(reg_hs), "px": int(reg_n), "px_m": reg_px_m,
                       "center_uv": [round(cu, 5), round(cv, 5)], "north_uv": north, "east_uv": east,
                       "blocker_u": r(blk_u, 5), "blocker_v": r(blk_v, 5)},
        },
        "sky": {
            "start_hour": int(w0_best), "start_utc": (start + timedelta(hours=w0_best)).isoformat(),
            "sun_az": r(tr.sun_az[w], 3), "sun_el": r(tr.sun_el[w], 3),
            "earth_az": r(tr.earth_az[w], 3), "earth_el": r(tr.earth_el[w], 3),
            "f": r(fw, 3), "dte": [int(v) for v in dte[w]], "partial_index": int(partial_i),
            "ephemeris_site": tr.source_site,
        },
        "ranking": {"rank_key": "sun_and_dte", "top": top,
                    "validation": {"site": "Connecting Ridge CR1", "model_sun": 0.908, "model_mean_disc": 0.864,
                                   "published_sun": 0.92, "published_mean_disc": 0.881,
                                   "reference": "Glaser et al. 2014, EPSC2014-136-1"}},
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, separators=(",", ":"))
    OUT_JSON.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {OUT_JSON.relative_to(ROOT)} ({len(text) / 1024:.0f} KB, {time.perf_counter() - t0:.1f} s)")
    if HTML.exists():
        html = HTML.read_text(encoding="utf-8")
        pat = re.compile(r'(<script id="explainer-data" type="application/json">)(.*?)(</script>)', re.S)
        if not pat.search(html):
            raise SystemExit(f"{HTML} has no <script id=\"explainer-data\"> tag")
        HTML.write_text(pat.sub(lambda m: m.group(1) + text + m.group(3), html, count=1), encoding="utf-8")
        print(f"injected into {HTML.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
