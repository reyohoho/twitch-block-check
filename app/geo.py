"""IP-to-geo lookup with in-memory TTL cache and provider fallback.

Supported providers (set the preferred order via GEO_PROVIDER, or
GEO_PROVIDERS for an explicit comma-separated chain):
  ip-api    – ip-api.com        free, HTTP only, 45 req/min (default)
  ipwho     – ipwho.is          free, HTTPS, soft rate limit
  ipapi     – ipapi.co          free, HTTPS, 1000 req/day
  ipinfo    – ipinfo.io         free 50k/mo, HTTPS, needs IPINFO_TOKEN

The first provider in the chain is tried first; on hard failure (HTTP 429,
network error, or empty payload) the lookup transparently falls through to
the next provider. Providers that 429 are put in a short cooldown so we
don't keep hammering them while they're shouting at us.

For private/loopback IPs (local dev, Docker bridge) each provider falls back
to auto-detecting the server's own public IP.
"""
from __future__ import annotations

import ipaddress
import logging
import os
import time
from typing import Awaitable, Callable, Optional

import httpx

log = logging.getLogger("twitch-block-check.geo")

_CACHE: dict[str, tuple[float, dict]] = {}
_NEG_CACHE: dict[str, float] = {}             # IP → epoch_until
_PROVIDER_COOLDOWN: dict[str, float] = {}     # provider name → epoch_until

_TTL          = int(os.environ.get("GEO_CACHE_TTL", "3600"))
_NEG_TTL      = int(os.environ.get("GEO_NEG_CACHE_TTL", "60"))      # don't retry a failing IP for N s
_COOLDOWN_S   = int(os.environ.get("GEO_PROVIDER_COOLDOWN", "120")) # park a 429-ing provider for N s
_HTTP_TIMEOUT = float(os.environ.get("GEO_HTTP_TIMEOUT", "5.0"))

_IPINFO_TOKEN = os.environ.get("IPINFO_TOKEN", "")

# GEO_PROVIDERS overrides everything; otherwise GEO_PROVIDER picks the head
# of a sensible default fallback chain.
_DEFAULT_CHAIN = ("ip-api", "ipwho", "ipapi", "ipinfo")


def _build_chain() -> tuple[str, ...]:
    explicit = os.environ.get("GEO_PROVIDERS", "").strip()
    if explicit:
        chain = tuple(p.strip().lower() for p in explicit.split(",") if p.strip())
        return chain or _DEFAULT_CHAIN
    head = os.environ.get("GEO_PROVIDER", "ip-api").strip().lower() or "ip-api"
    rest = tuple(p for p in _DEFAULT_CHAIN if p != head)
    return (head,) + rest


_CHAIN = _build_chain()


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


def _provider_available(name: str) -> bool:
    if name == "ipinfo" and not _IPINFO_TOKEN:
        return False
    until = _PROVIDER_COOLDOWN.get(name, 0.0)
    return until <= time.time()


def _mark_cooldown(name: str) -> None:
    _PROVIDER_COOLDOWN[name] = time.time() + _COOLDOWN_S
    log.warning("geo provider %s rate-limited, cooldown %ss", name, _COOLDOWN_S)


async def lookup(ip: str, force: bool = False) -> Optional[dict]:
    """Return geo dict for an IP address (or the caller's public IP) or None.

    Shape matches the frontend contract:
    {ip, city, region, country, loc, org, timezone}
    """
    cache_key = ip if ip and _is_public(ip) else "__self__"
    now = time.time()

    if not force:
        hit = _CACHE.get(cache_key)
        if hit and now - hit[0] < _TTL:
            return hit[1]
        neg_until = _NEG_CACHE.get(cache_key, 0.0)
        if neg_until > now:
            return None

    pub = ip if _is_public(ip) else ""

    for provider in _CHAIN:
        if not _provider_available(provider):
            continue
        fn = _PROVIDERS.get(provider)
        if fn is None:
            continue
        try:
            data = await fn(pub)
        except httpx.HTTPError as e:
            log.info("geo provider %s http error: %s", provider, e)
            data = None
        except Exception as e:
            log.warning("geo provider %s unexpected error: %s", provider, e)
            data = None
        if data:
            _CACHE[cache_key] = (now, data)
            _NEG_CACHE.pop(cache_key, None)
            return data

    # all providers exhausted — short-cache the failure to spare the upstream
    _NEG_CACHE[cache_key] = now + _NEG_TTL
    return None


def _record_status(provider: str, status: int) -> None:
    if status == 429:
        _mark_cooldown(provider)


async def _lookup_ipapi(ip: str) -> Optional[dict]:
    """ip-api.com — free, HTTP only, 45 req/min."""
    path = ip if ip else ""
    url = (
        "http://ip-api.com/json/"
        f"{path}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,org,as,query"
    )
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        r = await client.get(url)
        _record_status("ip-api", r.status_code)
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


async def _lookup_ipwho(ip: str) -> Optional[dict]:
    """ipwho.is — free, HTTPS, soft rate limit, no key required."""
    url = f"https://ipwho.is/{ip}" if ip else "https://ipwho.is/"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        r = await client.get(url)
        _record_status("ipwho", r.status_code)
        if r.status_code != 200:
            return None
        d = r.json()
    if not d.get("success"):
        # Some 429-class denials come back as 200 + {"success": false}.
        msg = (d.get("message") or "").lower()
        if "rate" in msg or "limit" in msg or "quota" in msg:
            _mark_cooldown("ipwho")
        return None
    asn = d.get("connection", {}).get("asn") or ""
    isp = d.get("connection", {}).get("isp") or d.get("connection", {}).get("org") or ""
    org = f"AS{asn} {isp}".strip() if asn else isp
    return {
        "ip": d.get("ip") or ip,
        "city": d.get("city") or "",
        "region": d.get("region") or "",
        "country": d.get("country_code") or "",
        "loc": f"{d.get('latitude', 0)},{d.get('longitude', 0)}",
        "org": org,
        "timezone": d.get("timezone", {}).get("id") or "",
    }


async def _lookup_ipapi_co(ip: str) -> Optional[dict]:
    """ipapi.co — free, HTTPS, 1000 req/day, no key required."""
    url = f"https://ipapi.co/{ip}/json/" if ip else "https://ipapi.co/json/"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        r = await client.get(url, headers={"User-Agent": "probe-tool/1.0"})
        _record_status("ipapi", r.status_code)
        if r.status_code != 200:
            return None
        d = r.json()
    if d.get("error"):
        # ipapi.co reports daily-quota exhaustion via {"error": true, "reason": "RateLimited"}
        reason = (d.get("reason") or "").lower()
        if "rate" in reason or "limit" in reason or "quota" in reason:
            _mark_cooldown("ipapi")
        return None
    asn = d.get("asn") or ""
    isp = d.get("org") or ""
    org = f"{asn} {isp}".strip() if asn else isp
    return {
        "ip": d.get("ip") or ip,
        "city": d.get("city") or "",
        "region": d.get("region") or "",
        "country": d.get("country_code") or "",
        "loc": f"{d.get('latitude', 0)},{d.get('longitude', 0)}",
        "org": org,
        "timezone": d.get("timezone") or "",
    }


async def _lookup_ipinfo(ip: str) -> Optional[dict]:
    """ipinfo.io — free 50k/mo, HTTPS, requires IPINFO_TOKEN."""
    url = f"https://ipinfo.io/{ip}/json" if ip else "https://ipinfo.io/json"
    params = {"token": _IPINFO_TOKEN} if _IPINFO_TOKEN else None
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        r = await client.get(url, params=params)
        _record_status("ipinfo", r.status_code)
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


_PROVIDERS: dict[str, Callable[[str], Awaitable[Optional[dict]]]] = {
    "ip-api": _lookup_ipapi,
    "ipwho":  _lookup_ipwho,
    "ipapi":  _lookup_ipapi_co,
    "ipinfo": _lookup_ipinfo,
}
