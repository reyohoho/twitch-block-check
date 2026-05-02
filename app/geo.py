"""IP-to-geo lookup via ip-api.com with in-memory TTL cache.

Behaviour:
- For a public routable IP → look it up directly.
- For loopback/private/link-local IPs (typical when the server is hit from
  the same host without a reverse proxy, or inside Docker's bridge network),
  we instead ask ip-api.com for the *caller's* public IP (no explicit IP
  in the query), which returns whatever the ip-api service sees as our
  outbound IP. This is good enough for local development and single-host
  deployments; in production put a reverse proxy in front that forwards
  X-Forwarded-For and we will see the real client IP.
"""
from __future__ import annotations

import ipaddress
import os
import time
from typing import Optional

import httpx

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL = int(os.environ.get("GEO_CACHE_TTL", "3600"))

_PROVIDER = os.environ.get("GEO_PROVIDER", "ip-api").lower()
_IPINFO_TOKEN = os.environ.get("IPINFO_TOKEN", "")


def _is_public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        addr.is_loopback
        or addr.is_private
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


async def lookup(ip: str, force: bool = False) -> Optional[dict]:
    """Return geo dict for an IP address (or the caller's public IP) or None.

    Shape matches the frontend contract:
    {ip, city, region, country, loc, org, timezone}
    """
    cache_key = ip if ip and _is_public(ip) else "__self__"
    now = time.time()
    if not force and cache_key in _CACHE:
        ts, data = _CACHE[cache_key]
        if now - ts < _TTL:
            return data

    try:
        if _PROVIDER == "ipinfo" and _IPINFO_TOKEN:
            data = await _lookup_ipinfo(ip if _is_public(ip) else "")
        else:
            data = await _lookup_ipapi(ip if _is_public(ip) else "")
    except Exception:
        return None

    if data:
        _CACHE[cache_key] = (now, data)
    return data


async def _lookup_ipapi(ip: str) -> Optional[dict]:
    # Empty ip → ip-api reports the caller's IP (i.e. our server's outbound IP).
    path = ip if ip else ""
    url = (
        "http://ip-api.com/json/"
        f"{path}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,org,as,query"
    )
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.get(url)
        if r.status_code != 200:
            return None
        d = r.json()
    if d.get("status") != "success":
        return None
    asn_full = d.get("as") or ""
    as_parts = asn_full.split(" ", 1)
    as_num = as_parts[0] if as_parts and as_parts[0].startswith("AS") else ""
    isp = d.get("isp") or d.get("org") or ""
    org = f"{as_num} {isp}".strip() if as_num else isp
    return {
        "ip": d.get("query") or ip,
        "city": d.get("city") or "",
        "region": d.get("regionName") or "",
        "country": d.get("countryCode") or "",
        "loc": f"{d.get('lat', 0)},{d.get('lon', 0)}",
        "org": org,
        "timezone": d.get("timezone") or "",
    }


async def _lookup_ipinfo(ip: str) -> Optional[dict]:
    # Empty ip → ipinfo returns the caller's own IP data.
    url = f"https://ipinfo.io/{ip}/json" if ip else "https://ipinfo.io/json"
    params = {"token": _IPINFO_TOKEN} if _IPINFO_TOKEN else None
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.get(url, params=params)
        if r.status_code != 200:
            return None
        d = r.json()
    return {
        "ip": d.get("ip") or ip,
        "city": d.get("city") or "",
        "region": d.get("region") or "",
        "country": d.get("country") or "",
        "loc": d.get("loc") or "",
        "org": d.get("org") or "",
        "timezone": d.get("timezone") or "",
    }
