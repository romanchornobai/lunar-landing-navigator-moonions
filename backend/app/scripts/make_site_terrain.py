"""Build a 15 km x 15 km site terrain GLB (1:1 metres, site at the origin) from the LRO LOLA polar DEMs.

Same layout as the other site meshes (see ASSETS.md):
  - 501 x 501 vertices, 30 m spacing, aligned with the polar stereographic grid: scene +X = polar x, scene -Z = polar y,
    +Y up. Heights are bilinear LOLA heights (LDEM_85S_20M where it covers, else LDEM_80S_40M) minus the height at the
    site, so the site sits at Y = 0. Flat projection: heights are relative to the sphere R = 1737.4 km, no curvature.
  - UV in [0, 1] over the square (1 UV = 15 km), site at (0.5, 0.5): the terrain shader fades its micro-texture by
    distance to the UV centre.
  - Vertex normals from central differences of the grid.
Writes <out>.raw.glb (uncompressed) and the *_meta.json; then compress with gltf-transform (see DATA_SOURCES.md).

Usage (from repo root):
  python backend/app/scripts/make_site_terrain.py --key connecting_ridge_cr1 --lat -89.4395 --lon -137.1934 \
      --name "Connecting Ridge (CR1)"
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from app.services.terrain import open_dems, polar_xy, sample_terrain  # noqa: E402

N = 501
STEP_M = 30.0
HALF_M = (N - 1) * STEP_M / 2  # 7500 m


def glb_bytes(pos: np.ndarray, nrm: np.ndarray, uv: np.ndarray, idx: np.ndarray) -> bytes:
    """Minimal glTF 2.0 binary: one mesh, one primitive (POSITION, NORMAL, TEXCOORD_0, uint32 indices)."""
    blobs = [pos.astype("<f4").tobytes(), nrm.astype("<f4").tobytes(), uv.astype("<f4").tobytes(),
             idx.astype("<u4").tobytes()]
    views, offset = [], 0
    for i, b in enumerate(blobs):
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(b),
                      "target": 34963 if i == 3 else 34962})
        offset += len(b)
    nv = len(pos)
    gltf = {
        "asset": {"version": "2.0", "generator": "make_site_terrain.py (LRO LOLA GDR)"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": "terrain"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3}]}],
        "buffers": [{"byteLength": offset}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": nv, "type": "VEC3",
             "min": pos.min(0).tolist(), "max": pos.max(0).tolist()},
            {"bufferView": 1, "componentType": 5126, "count": nv, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": nv, "type": "VEC2"},
            {"bufferView": 3, "componentType": 5125, "count": len(idx), "type": "SCALAR"},
        ],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    binary = b"".join(blobs)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key", required=True)
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--name", required=True)
    args = ap.parse_args()

    dems = open_dems()
    cx, cy = (float(v) for v in polar_xy(args.lat, args.lon))
    off = np.linspace(-HALF_M, HALF_M, N)
    X, Zs = np.meshgrid(off, off)  # scene X (columns) and scene Z (rows)
    H = sample_terrain(dems, cx + X, cy - Zs)  # scene -Z = polar +y
    if np.isnan(H).any():
        raise SystemExit("terrain outside DEM coverage")
    h0 = float(sample_terrain(dems, np.array([cx]), np.array([cy]))[0])
    Y = H - h0

    gx = np.gradient(Y, STEP_M, axis=1)  # dY/dX
    gz = np.gradient(Y, STEP_M, axis=0)  # dY/dZ
    nrm = np.stack([-gx, np.ones_like(Y), -gz], axis=-1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)

    pos = np.stack([X, Y, Zs], axis=-1).reshape(-1, 3)
    uv = np.stack([(X + HALF_M) / (2 * HALF_M), (Zs + HALF_M) / (2 * HALF_M)], axis=-1).reshape(-1, 2)
    i = np.arange(N - 1)
    r, c = np.meshgrid(i, i, indexing="ij")
    a = (r * N + c).ravel()
    b, cc, d = a + 1, a + N, a + N + 1
    idx = np.stack([a, cc, b, b, cc, d], axis=-1).ravel()  # counter-clockwise seen from +Y

    out_dir = ROOT / "frontend" / "public" / "models" / args.key
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{args.key}_15km.raw.glb").write_bytes(glb_bytes(pos, nrm.reshape(-1, 3), uv, idx))

    # Ground normal at the site (scene axes) from one 30 m grid step each side, as used by the lander.
    k = N // 2
    g = np.array([-(Y[k, k + 1] - Y[k, k - 1]) / (2 * STEP_M), 1.0, -(Y[k + 1, k] - Y[k - 1, k]) / (2 * STEP_M)])
    g /= np.linalg.norm(g)
    meta = {
        "site_key": args.key, "name": args.name,
        "coordinates": {"lat": args.lat, "lon": args.lon},
        "polar_projection_meters": {"cx": round(cx, 2), "cy": round(cy, 2)},
        "area_size_meters": {"width": 15000, "height": 15000, "span_km": 15.0},
        "grid_size": [N, N], "resolution_meters_per_pixel": STEP_M,
        "elevation": {"datum": "LOLA sphere R = 1737400 m", "center_abs_meters": round(h0, 1),
                      "min_abs_meters": round(float(H.min()), 1), "max_abs_meters": round(float(H.max()), 1),
                      "relief_span_meters": round(float(H.max() - H.min()), 1), "relative_at_center": 0.0},
        "ground_normal_scene": [round(float(v), 4) for v in g],
        "source": "LRO LOLA GDR LDEM_85S_20M / LDEM_80S_40M (NASA PDS Geosciences Node), bilinear, "
                  "backend/app/scripts/make_site_terrain.py",
    }
    (out_dir / f"{args.key}_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
