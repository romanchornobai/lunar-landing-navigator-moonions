"""Local FastAPI server: best landing point search inside a South Pole area.

Run from backend/:  .venv/Scripts/python -m uvicorn app.main:app --port 8000
(the Vite dev server proxies /api to :8000). Needs the git-ignored LOLA DEMs in data/dem/ (see DATA_SOURCES.md).
"""

from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api.area import router as area_router
from .services import area_search, ephemeris, terrain


@asynccontextmanager
async def lifespan(app: FastAPI):
    workers = int(os.environ.get("AREA_SEARCH_WORKERS", os.cpu_count() or 4))
    app.state.dems = terrain.open_dems()
    app.state.eph = ephemeris.load_ephemerides()
    app.state.workers = workers
    app.state.pool = ProcessPoolExecutor(workers, initializer=area_search.worker_init)
    # Start every worker now (opens DEMs + ephemerides once per process) so the first request is not slower.
    list(app.state.pool.map(area_search.worker_ping, range(workers)))
    yield
    app.state.pool.shutdown(cancel_futures=True)


app = FastAPI(title="Lunar Landing Site Navigator API", version="0.1.0", lifespan=lifespan)
app.include_router(area_router)
