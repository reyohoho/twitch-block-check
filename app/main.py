"""Twitch Block Check — FastAPI server.

Endpoints mirror the original https://probe.trolling.website/ API so the
frontend drop-in replacement continues to work.
"""
from __future__ import annotations

import hashlib
import json as _json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, Header, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, geo, stats

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
log = logging.getLogger("twitch-block-check")

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(
    title="Twitch Block Check",
    description="Crowdsourced detection of Twitch blocking (HTTPS + WebSocket + HLS) in Russia",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ========== Models ==========
class ReportGeo(BaseModel):
    ip: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    org: Optional[str] = None
    loc: Optional[str] = None
    timezone: Optional[str] = None
    manual_geo: bool = False


class ReportResult(BaseModel):
    domain: str
    category: Optional[str] = None
    asn: Optional[str] = None
    status: str
    ms: int = 0
    twitch_cat: Optional[str] = None
    proto: Optional[str] = None
    tags: list[str] = []
    dynamic: bool = False  # True for runtime CDN discovery (clip/vod/live), saved as is_dynamic in DB


class ReportPayload(BaseModel):
    ts: Optional[str] = None
    geo: Optional[ReportGeo] = None
    ua: Optional[str] = Field(None, max_length=500)
    timeout_ms: Optional[int] = None
    results: list[ReportResult]


# ========== Startup ==========
@app.on_event("startup")
def _startup() -> None:
    db.init()
    log.info("DB initialised at %s", db.DB_PATH)


# ========== Helpers ==========
def _client_ip(request: Request, x_forwarded_for: Optional[str]) -> str:
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else ""


def _hash_ip(ip: str) -> str:
    salt = os.environ.get("IP_HASH_SALT", "twitch-block-check")
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:32]


def _parse_loc(loc: Optional[str]) -> tuple[Optional[float], Optional[float]]:
    if not loc:
        return None, None
    try:
        lat_s, lon_s = loc.split(",", 1)
        return float(lat_s), float(lon_s)
    except Exception:
        return None, None


# ========== API ==========
@app.get("/api/ping")
async def api_ping() -> dict:
    return {"ok": True}


@app.get("/api/geo")
async def api_geo(
    request: Request,
    force: int = 0,
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For"),
) -> JSONResponse:
    ip = _client_ip(request, x_forwarded_for)
    log.info("geo request ip=%s x_forwarded_for=%s", ip, x_forwarded_for)
    data = await geo.lookup(ip, force=bool(force))
    if not data:
        log.warning("geo lookup failed ip=%s", ip)
        return JSONResponse({"error": "geo_lookup_failed"}, status_code=200)
    log.info("geo result ip=%s city=%s region=%s country=%s org=%s", ip, data.get("city"), data.get("region"), data.get("country"), data.get("org"))
    return JSONResponse(data)


@app.post("/api/report")
async def api_report(
    payload: ReportPayload,
    request: Request,
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For"),
) -> dict:
    if not payload.results:
        return {"ok": False, "error": "no_results"}
    if len(payload.results) > 2000:
        return {"ok": False, "error": "too_many_results"}

    ip = _client_ip(request, x_forwarded_for)
    g = payload.geo or ReportGeo()
    lat, lon = _parse_loc(g.loc)
    ts = payload.ts or datetime.now(timezone.utc).isoformat()

    with db.get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO reports (ts, ip_hash, country, region, city, org, lat, lon, timezone,
                                 manual_geo, timeout_ms, ua)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ts,
                _hash_ip(ip),
                g.country,
                g.region,
                g.city,
                g.org,
                lat,
                lon,
                g.timezone,
                int(bool(g.manual_geo)),
                payload.timeout_ms,
                payload.ua,
            ),
        )
        report_id = cur.lastrowid
        conn.executemany(
            """
            INSERT INTO results (report_id, domain, category, twitch_cat, proto, asn, status, ms, tags, is_dynamic)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    report_id,
                    r.domain[:255],
                    r.category,
                    r.twitch_cat,
                    r.proto,
                    r.asn,
                    r.status,
                    int(r.ms or 0),
                    _json.dumps(r.tags, ensure_ascii=False) if r.tags else None,
                    1 if r.dynamic else 0,
                )
                for r in payload.results
            ],
        )
        conn.commit()

    ndyn = sum(1 for r in payload.results if r.dynamic)
    log.info(
        "report saved id=%s results=%d dynamic_rows=%d region=%s city=%s",
        report_id, len(payload.results), ndyn, g.region, g.city,
    )
    return {"ok": True, "report_id": report_id}


@app.get("/api/report/{report_id}")
async def api_get_report(report_id: int) -> JSONResponse:
    """Fetch a stored report by ID for share/permalink feature."""
    import json as _j
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, ts, city, region, country, org, timeout_ms FROM reports WHERE id = ?",
            (report_id,)
        ).fetchone()
        if not row:
            return JSONResponse({"error": "not found"}, status_code=404)
        results = conn.execute(
            "SELECT domain, category, twitch_cat, proto, asn, status, ms, tags, is_dynamic FROM results WHERE report_id = ?",
            (report_id,)
        ).fetchall()
    return JSONResponse({
        "id":      row["id"],
        "ts":      row["ts"],
        "city":    row["city"],
        "region":  row["region"],
        "country": row["country"],
        "org":     row["org"],
        "timeout_ms": row["timeout_ms"],
        "results": [
            {
                "domain":     r["domain"],
                "category":   r["category"],
                "twitch_cat": r["twitch_cat"],
                "proto":      r["proto"] or "https",
                "asn":        r["asn"] or "?",
                "status":     r["status"] or "timeout",
                "ms":         int(r["ms"] or 0),
                "tags":       _safe_json_list(r["tags"], _j),
                "dynamic":    bool(r["is_dynamic"]),
            }
            for r in results
        ],
    })


def _safe_json_list(raw: str | None, _j) -> list:
    if not raw:
        return []
    try:
        v = _j.loads(raw)
        return v if isinstance(v, list) else []
    except Exception:
        return []


@app.get("/api/stats-filters")
async def api_stats_filters() -> dict:
    return stats.stats_filters()


@app.get("/api/stats-priority")
async def api_stats_priority(
    city: Optional[str] = None,
    org: Optional[str] = None,
    period: Optional[str] = Query(None, pattern="^(day|week|month)$"),
) -> dict:
    return stats.stats_priority(city=city, org=org, period=period)


@app.get("/api/map-data")
async def api_map_data(
    period: Optional[str] = Query(None, pattern="^(day|week|month)$"),
) -> dict:
    return stats.map_data(period=period)


@app.get("/api/city-data")
async def api_city_data(
    period: Optional[str] = Query(None, pattern="^(day|week|month)$"),
) -> dict:
    return stats.city_data(period=period)


@app.get("/api/region-isps")
async def api_region_isps(
    region: Optional[str] = None,
    city: Optional[str] = None,
) -> dict:
    return stats.region_isps(region=region, city=city)


# ========== Static frontend ==========
# Explicit routes are registered *before* the StaticFiles mount so they take
# precedence. The SPA bundle must always revalidate, otherwise users get a
# stale JS after deploys.
@app.get("/")
async def index() -> FileResponse:
    return FileResponse(
        STATIC_DIR / "index.html",
        headers={"Cache-Control": "no-store, must-revalidate"},
    )


@app.get("/static/app.js")
async def static_app_js() -> FileResponse:
    return FileResponse(
        STATIC_DIR / "app.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"},
    )


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/targets.json")
async def targets_json() -> FileResponse:
    return FileResponse(STATIC_DIR / "targets.json", media_type="application/json")


@app.get("/russia.geojson")
async def russia_geojson() -> FileResponse:
    return FileResponse(
        STATIC_DIR / "russia.geojson",
        media_type="application/geo+json",
        headers={"Cache-Control": "public, max-age=604800"},
    )


@app.get("/favicon.ico")
async def favicon() -> Response:
    # 204 must not carry a body per RFC 9110 §15.3.5 — return an empty Response.
    return Response(status_code=204)


_GQL_URL = "https://gql.twitch.tv/gql"
_GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"
_CLIP_QUERY_HASH = "4f35f1ac933d76b1da008c806cd5546a7534dfaff83e033a422a81f24e5991b3"
_VOD_TOKEN_HASH  = "0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712"
_GQL_HEADERS = {
    "client-id": _GQL_CLIENT_ID,
    "content-type": "application/json",
    "Origin": "https://www.twitch.tv",
    "Referer": "https://www.twitch.tv/",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}


@app.post("/api/clip-cdn")
async def clip_cdn(request: Request) -> JSONResponse:
    """Resolve CDN domain(s) for a Twitch clip by slug via GQL proxy."""
    import httpx

    body = await request.json()
    slug = str(body.get("slug", "")).strip()
    if not slug:
        return JSONResponse({"error": "slug required"}, status_code=400)

    payload = [
        {
            "operationName": "VideoAccessToken_Clip",
            "variables": {"platform": "web", "slug": slug},
            "extensions": {
                "persistedQuery": {"version": 1, "sha256Hash": _CLIP_QUERY_HASH}
            },
        }
    ]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_GQL_URL, json=payload, headers=_GQL_HEADERS)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)

    clip = (data[0] if isinstance(data, list) else {}).get("data", {}).get("clip")
    if not clip:
        return JSONResponse({"error": "clip not found", "slug": slug}, status_code=404)

    domains: set[str] = set()
    for q in clip.get("videoQualities") or []:
        try:
            domains.add(urlparse(q["sourceURL"]).hostname)
        except Exception:
            pass
    try:
        tv = _json.loads(clip["playbackAccessToken"]["value"])
        if tv.get("clip_uri"):
            domains.add(urlparse(tv["clip_uri"]).hostname)
    except Exception:
        pass

    return JSONResponse({"slug": slug, "domains": sorted(d for d in domains if d)})


@app.post("/api/live-cdn")
async def live_cdn(request: Request) -> JSONResponse:
    """Resolve CDN domain(s) for a Twitch live stream via GQL token + usher manifest."""
    import httpx

    body = await request.json()
    channel = str(body.get("channel", "")).strip().lstrip("/").lower()
    if not channel:
        return JSONResponse({"error": "channel required"}, status_code=400)

    # Step 1 — get live stream access token
    payload = [{
        "operationName": "PlaybackAccessToken",
        "variables": {
            "isLive": True, "login": channel,
            "isVod": False, "vodID": "", "playerType": "site",
        },
        "extensions": {"persistedQuery": {"version": 1, "sha256Hash": _VOD_TOKEN_HASH}},
    }]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_GQL_URL, json=payload, headers=_GQL_HEADERS)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)

    token_data = (data[0] if isinstance(data, list) else {}).get("data", {}).get("streamPlaybackAccessToken")
    if not token_data:
        return JSONResponse({"error": "stream not found or channel offline", "channel": channel}, status_code=404)

    sig   = token_data["signature"]
    token = token_data["value"]

    # Step 2 — fetch HLS master manifest from usher
    usher_url = f"https://usher.ttvnw.net/api/channel/hls/{channel}.m3u8"
    params = {"sig": sig, "token": token, "allow_source": "true",
              "allow_spectre": "true", "fast_bread": "true", "p": "12345"}
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                usher_url, params=params,
                headers={"User-Agent": _GQL_HEADERS["User-Agent"]},
            )
            manifest = resp.text
    except Exception as exc:
        return JSONResponse({"error": f"usher: {exc}", "channel": channel}, status_code=502)

    # Step 3 — extract CDN hostnames from manifest lines
    domains: set[str] = set()
    for line in manifest.splitlines():
        line = line.strip()
        if line.startswith("https://"):
            try:
                domains.add(urlparse(line).hostname)
            except Exception:
                pass

    return JSONResponse({"channel": channel, "domains": sorted(d for d in domains if d)})


@app.post("/api/vod-cdn")
async def vod_cdn(request: Request) -> JSONResponse:
    """Resolve CDN domain(s) for a Twitch VOD via GQL token + usher manifest."""
    import httpx

    body = await request.json()
    video_id = str(body.get("video_id", "")).strip()
    if not video_id:
        return JSONResponse({"error": "video_id required"}, status_code=400)

    # Step 1 — get playback access token
    payload = [{
        "operationName": "PlaybackAccessToken",
        "variables": {
            "isLive": False, "login": "",
            "isVod": True, "vodID": video_id, "playerType": "site",
        },
        "extensions": {"persistedQuery": {"version": 1, "sha256Hash": _VOD_TOKEN_HASH}},
    }]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_GQL_URL, json=payload, headers=_GQL_HEADERS)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=502)

    token_data = (data[0] if isinstance(data, list) else {}).get("data", {}).get("videoPlaybackAccessToken")
    if not token_data:
        return JSONResponse({"error": "vod not found or access denied", "video_id": video_id}, status_code=404)

    sig   = token_data["signature"]
    token = token_data["value"]

    # Step 2 — fetch HLS master manifest from usher
    usher_url = f"https://usher.ttvnw.net/vod/{video_id}"
    params = {"sig": sig, "token": token, "allow_source": "true",
              "allow_spectre": "true", "p": "12345"}
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                usher_url, params=params,
                headers={"User-Agent": _GQL_HEADERS["User-Agent"]},
            )
            manifest = resp.text
    except Exception as exc:
        return JSONResponse({"error": f"usher: {exc}", "video_id": video_id}, status_code=502)

    # Step 3 — extract CDN hostnames from manifest lines
    domains: set[str] = set()
    for line in manifest.splitlines():
        line = line.strip()
        if line.startswith("https://"):
            try:
                domains.add(urlparse(line).hostname)
            except Exception:
                pass

    return JSONResponse({"video_id": video_id, "domains": sorted(d for d in domains if d)})


@app.get("/healthz")
async def healthz() -> dict[str, Any]:
    with db.get_conn() as conn:
        rc = conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
    return {"ok": True, "reports": rc}
