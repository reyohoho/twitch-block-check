"""Aggregation queries for the /api/stats-*, /api/map-data, /api/city-data endpoints."""
from __future__ import annotations

import sqlite3
from typing import Optional

from . import db


_PERIODS = {
    "day":   "-1 days",
    "week":  "-7 days",
    "month": "-30 days",
}


def _period_clause(period: Optional[str]) -> tuple[str, tuple]:
    if period and period in _PERIODS:
        return " AND r.ts >= datetime('now', ?)", (_PERIODS[period],)
    return "", ()


# ipinfo.io → russia.geojson `name_latin` aliases.
#
# ipinfo's `region` field uses short / colloquial names ("Tatarstan",
# "Bashkortostan", "Udmurtia", ...) while the GeoJSON we render against
# uses formal names ("Republic of Tatarstan", "Udmurt Republic", ...).
# Without this map the corresponding regions silently disappear from the
# choropleth even though city-level aggregates show their reports.
_REGION_ALIASES: dict[str, str] = {
    # Republics
    "Bashkortostan":         "Republic of Bashkortostan",
    "Buryatia":              "Republic of Buryatia",
    "Chuvashia":             "Chuvash Republic",
    "Dagestan":              "Republic of Dagestan",
    "Ingushetia":            "Republic of Ingushetia",
    "Kabardino-Balkaria":    "Kabardino-Balkar Republic",
    "Karachay-Cherkessia":   "Karachay-Cherkess Republic",
    "Mariy-El Republic":     "Mari El Republic",
    "Sakha Republic":        "Sakha (Yakutia) Republic",
    "Tatarstan":             "Republic of Tatarstan",
    "Tyva Republic":         "Tuva Republic",
    "Udmurtia":              "Udmurt Republic",
    # Oblasts / krais where ipinfo and the GeoJSON disagree on the suffix
    "Kaliningrad":              "Kaliningrad Oblast",
    "Kemerovo Oblast–Kuzbass":  "Kemerovo Oblast",
    # Transliteration mismatch ("Mansiysk" vs "Mansi", "Ugra" vs "Yugra")
    "Khanty-Mansiysk Autonomous Okrug – Ugra": "Khanty–Mansi Autonomous Okrug – Yugra",
}


def _normalize_region(name: str) -> str:
    return _REGION_ALIASES.get(name, name)


def _region_db_aliases(geojson_name: str) -> list[str]:
    """Return every DB-side region name that maps to the given GeoJSON name.

    The frontend passes us the formal `name_latin` value (e.g. "Republic of
    Tatarstan") when the user clicks a polygon, but the DB stores ipinfo's
    short form ("Tatarstan") and sometimes both spellings coexist. We need
    to query for *all* of them.
    """
    aliases = [src for src, dst in _REGION_ALIASES.items() if dst == geojson_name]
    aliases.append(geojson_name)  # also match rows that already use the formal name
    # Preserve order, dedupe.
    seen: set[str] = set()
    out: list[str] = []
    for a in aliases:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out


def map_data(period: Optional[str] = None) -> dict:
    """Aggregate by region: total/ok/blocked/timeout counts split by ru/intl category."""
    pc, pa = _period_clause(period)
    sql = f"""
    SELECT
      r.region                                   AS region,
      COUNT(DISTINCT r.id)                       AS reports,
      SUM(CASE WHEN res.category='ru'   THEN 1 ELSE 0 END) AS ru_total,
      SUM(CASE WHEN res.category='ru'   AND res.status='ok'      THEN 1 ELSE 0 END) AS ru_ok,
      SUM(CASE WHEN res.category='ru'   AND res.status='blocked' THEN 1 ELSE 0 END) AS ru_blocked,
      SUM(CASE WHEN res.category='ru'   AND res.status='timeout' THEN 1 ELSE 0 END) AS ru_timeout,
      SUM(CASE WHEN res.category='intl' THEN 1 ELSE 0 END) AS intl_total,
      SUM(CASE WHEN res.category='intl' AND res.status='ok'      THEN 1 ELSE 0 END) AS intl_ok,
      SUM(CASE WHEN res.category='intl' AND res.status='blocked' THEN 1 ELSE 0 END) AS intl_blocked,
      SUM(CASE WHEN res.category='intl' AND res.status='timeout' THEN 1 ELSE 0 END) AS intl_timeout,
      COUNT(res.id)                              AS total,
      SUM(CASE WHEN res.status='ok'      THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN res.status='blocked' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN res.status='timeout' THEN 1 ELSE 0 END) AS timeout
    FROM reports r
    JOIN results res ON res.report_id = r.id
    WHERE r.country='RU' AND r.region IS NOT NULL AND r.region!=''
          AND res.status IN ('ok','blocked','timeout')
          {pc}
    GROUP BY r.region
    """
    out: dict = {}
    with db.get_conn() as conn:
        for row in conn.execute(sql, pa):
            key = _normalize_region(row["region"])
            payload = {k: row[k] for k in row.keys() if k != "region"}
            existing = out.get(key)
            if existing is None:
                out[key] = payload
            else:
                # Two DB region names collapsed to the same GeoJSON key
                # (e.g. "Kaliningrad" + "Kaliningrad Oblast"). Merge counters.
                for k, v in payload.items():
                    existing[k] = (existing.get(k) or 0) + (v or 0)
    return out


def city_data(period: Optional[str] = None) -> dict:
    """Aggregate by city with lat/lon from the most recent report for that city."""
    pc, pa = _period_clause(period)
    sql = f"""
    SELECT
      r.city                                     AS city,
      r.region                                   AS region,
      AVG(r.lat)                                 AS lat,
      AVG(r.lon)                                 AS lon,
      COUNT(DISTINCT r.id)                       AS reports,
      SUM(CASE WHEN res.category='ru'   THEN 1 ELSE 0 END) AS ru_total,
      SUM(CASE WHEN res.category='ru'   AND res.status='ok'      THEN 1 ELSE 0 END) AS ru_ok,
      SUM(CASE WHEN res.category='ru'   AND res.status='blocked' THEN 1 ELSE 0 END) AS ru_blocked,
      SUM(CASE WHEN res.category='ru'   AND res.status='timeout' THEN 1 ELSE 0 END) AS ru_timeout,
      SUM(CASE WHEN res.category='intl' THEN 1 ELSE 0 END) AS intl_total,
      SUM(CASE WHEN res.category='intl' AND res.status='ok'      THEN 1 ELSE 0 END) AS intl_ok,
      SUM(CASE WHEN res.category='intl' AND res.status='blocked' THEN 1 ELSE 0 END) AS intl_blocked,
      SUM(CASE WHEN res.category='intl' AND res.status='timeout' THEN 1 ELSE 0 END) AS intl_timeout,
      COUNT(res.id)                              AS total,
      SUM(CASE WHEN res.status='ok'      THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN res.status='blocked' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN res.status='timeout' THEN 1 ELSE 0 END) AS timeout
    FROM reports r
    JOIN results res ON res.report_id = r.id
    WHERE r.country='RU' AND r.city IS NOT NULL AND r.city!=''
          AND r.lat IS NOT NULL AND r.lon IS NOT NULL
          AND res.status IN ('ok','blocked','timeout')
          {pc}
    GROUP BY r.city
    """
    out: dict = {}
    with db.get_conn() as conn:
        for row in conn.execute(sql, pa):
            out[row["city"]] = {k: row[k] for k in row.keys() if k != "city"}
    return out


def region_isps(region: Optional[str] = None, city: Optional[str] = None) -> dict:
    """ISP breakdown for a region or city."""
    if city:
        where, args = "r.city = ?", (city,)
    elif region:
        # Map the GeoJSON name back to every DB-side spelling that aliases to it.
        names = _region_db_aliases(region)
        placeholders = ",".join("?" * len(names))
        where, args = f"r.region IN ({placeholders})", tuple(names)
    else:
        return {}
    sql = f"""
    SELECT
      r.org                                       AS isp,
      COUNT(DISTINCT r.id)                        AS reports,
      COUNT(res.id)                               AS total,
      SUM(CASE WHEN res.status='ok'      THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN res.status='blocked' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN res.status='timeout' THEN 1 ELSE 0 END) AS timeout
    FROM reports r
    JOIN results res ON res.report_id = r.id
    WHERE {where} AND r.org IS NOT NULL AND r.org!='' AND res.status IN ('ok','blocked','timeout')
    GROUP BY r.org
    """
    out: dict = {}
    with db.get_conn() as conn:
        for row in conn.execute(sql, args):
            out[row["isp"]] = {k: row[k] for k in row.keys() if k != "isp"}
    return out


def stats_filters() -> dict:
    """Return city list, org list, and per-city org list for dropdown filters."""
    with db.get_conn() as conn:
        cities = [r[0] for r in conn.execute(
            "SELECT DISTINCT city FROM reports WHERE country='RU' AND city IS NOT NULL AND city!='' ORDER BY city"
        )]
        orgs = [r[0] for r in conn.execute(
            "SELECT DISTINCT org FROM reports WHERE country='RU' AND org IS NOT NULL AND org!='' ORDER BY org"
        )]
        rows = conn.execute(
            "SELECT DISTINCT city, org FROM reports WHERE country='RU' AND city IS NOT NULL AND city!='' AND org IS NOT NULL AND org!='' ORDER BY city, org"
        ).fetchall()
    city_orgs: dict[str, list[str]] = {}
    for city, org in rows:
        city_orgs.setdefault(city, []).append(org)
    return {"cities": cities, "orgs": orgs, "city_orgs": city_orgs}


def stats_priority(
    city: Optional[str] = None,
    org: Optional[str] = None,
    period: Optional[str] = None,
) -> dict:
    """Per-domain aggregated stats (for the "Statistics" tab cards)."""
    pc, pa = _period_clause(period)
    conds: list[str] = []
    args: list = []
    if city:
        conds.append("r.city = ?"); args.append(city)
    if org:
        conds.append("r.org = ?");  args.append(org)
    cond = (" AND " + " AND ".join(conds)) if conds else ""
    sql = f"""
    SELECT res.domain        AS domain,
           COUNT(*)          AS total,
           SUM(CASE WHEN res.status='ok'      THEN 1 ELSE 0 END) AS ok,
           SUM(CASE WHEN res.status='blocked' THEN 1 ELSE 0 END) AS blocked,
           SUM(CASE WHEN res.status='timeout' THEN 1 ELSE 0 END) AS timeout,
           MAX(CASE WHEN res.tags IS NOT NULL AND res.tags != 'null' THEN res.tags END) AS tags
    FROM reports r
    JOIN results res ON res.report_id = r.id
    WHERE res.status IN ('ok','blocked','timeout')
          {pc} {cond}
    GROUP BY res.domain
    """
    report_count_sql = f"""
    SELECT COUNT(DISTINCT r.id) FROM reports r
    WHERE 1=1 {pc} {cond}
    """
    dynamic_sql = f"""
    SELECT res.domain        AS domain,
           COUNT(*)          AS total,
           SUM(CASE WHEN res.status='ok'      THEN 1 ELSE 0 END) AS ok,
           SUM(CASE WHEN res.status='blocked' THEN 1 ELSE 0 END) AS blocked,
           SUM(CASE WHEN res.status='timeout' THEN 1 ELSE 0 END) AS timeout,
           MAX(CASE WHEN res.tags IS NOT NULL AND res.tags != 'null' THEN res.tags END) AS tags
    FROM reports r
    JOIN results res ON res.report_id = r.id
    WHERE res.status IN ('ok','blocked','timeout')
          AND COALESCE(res.is_dynamic, 0) = 1
          {pc} {cond}
    GROUP BY res.domain
    """
    domains: dict = {}
    dynamic_domains: dict = {}
    with db.get_conn() as conn:
        for row in conn.execute(sql, (*pa, *args)):
            import json as _j
            raw_tags = row["tags"]
            try:
                tags = _j.loads(raw_tags) if raw_tags else []
            except Exception:
                tags = []
            domains[row["domain"]] = {
                "total":   row["total"]   or 0,
                "ok":      row["ok"]      or 0,
                "blocked": row["blocked"] or 0,
                "timeout": row["timeout"] or 0,
                "tags":    tags,
            }
        for row in conn.execute(dynamic_sql, (*pa, *args)):
            import json as _j
            raw_tags = row["tags"]
            try:
                tags = _j.loads(raw_tags) if raw_tags else []
            except Exception:
                tags = []
            dynamic_domains[row["domain"]] = {
                "total":   row["total"]   or 0,
                "ok":      row["ok"]      or 0,
                "blocked": row["blocked"] or 0,
                "timeout": row["timeout"] or 0,
                "tags":    tags,
            }
        rc = conn.execute(report_count_sql, (*pa, *args)).fetchone()
    return {"report_count": rc[0] if rc else 0, "domains": domains, "dynamic_domains": dynamic_domains}
