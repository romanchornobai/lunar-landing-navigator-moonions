"""Area search endpoints.

GET  /api/health                 server and data status
POST /api/area-search            JSON body (AreaSearchRequest) -> final result only
GET  /api/area-search/stream     same parameters as query string -> Server-Sent Events:
                                   event 'start'      area, period and candidate list
                                   event 'candidate'  one per evaluated point (progress)
                                   event 'result'     ranking and best point (with its horizon)
                                   event 'error'      validation / runtime error
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..models.schemas import AreaSearchRequest
from ..services.area_search import run_area_search

router = APIRouter(prefix="/api")


@router.get("/health")
def health(request: Request) -> dict:
    st = request.app.state
    return {"status": "ok", "workers": st.workers, "dems": [d.name for d in st.dems],
            "ephemeris_hours": int(st.eph.shape[2])}


@router.post("/area-search")
async def area_search(req: AreaSearchRequest, request: Request) -> dict:
    st = request.app.state
    result = None
    try:
        async for ev in run_area_search(st.pool, st.dems, req.to_query()):
            if ev["event"] == "result":
                result = ev["data"]
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return result


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


@router.get("/area-search/stream")
async def area_search_stream(request: Request, req: AreaSearchRequest = Depends()) -> StreamingResponse:
    st = request.app.state

    async def events():
        try:
            async for ev in run_area_search(st.pool, st.dems, req.to_query()):
                if await request.is_disconnected():
                    break
                yield _sse(ev["event"], ev["data"])
        except ValueError as e:
            yield _sse("error", {"detail": str(e)})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
