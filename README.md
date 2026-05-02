# Twitch Block Check

Краудсорсинговая проверка блокировок Twitch в России. Проверяет:

- **HTTPS-эндпоинты**: `www.twitch.tv`, `gql.twitch.tv`, `id.twitch.tv`, `passport.twitch.tv` и т.д.
- **WebSocket-чат**: `wss://irc-ws.chat.twitch.tv/`, `wss://pubsub-edge.twitch.tv/v1`, `wss://eventsub.wss.twitch.tv/ws`
- **HLS / Streaming**: `usher.ttvnw.net`, `video-weaver.*.hls.ttvnw.net` (Amsterdam, Frankfurt, London, Prague, Warsaw, …)
- **CDN / Клипы / Ассеты**: `static-cdn.jtvnw.net`, `clips-media-assets2.twitch.tv`, `badges.twitch.tv`, …

Агрегирует результаты по регионам и провайдерам (ASN), рисует карту России и
показывает, у каких ISP Twitch чаще всего режется ТСПУ/DPI.

Форк идеи [probe.trolling.website](https://probe.trolling.website/), заточенный
исключительно под домены/вебсокеты Twitch (чат + стримы).

## Архитектура

| Компонент | Что делает |
|-----------|-----------|
| `app/main.py` | FastAPI приложение, роуты `/api/*`, раздаёт фронт |
| `app/db.py` | Схема SQLite, WAL-режим, таблицы `reports` и `results` |
| `app/geo.py` | IP-to-geo lookup через `ip-api.com` или `ipinfo.io` |
| `app/stats.py` | Агрегаты по регионам, городам, провайдерам, периодам |
| `app/static/index.html` | SPA-интерфейс |
| `app/static/app.js` | JS-клиент: probe HTTPS/WSS, рендер, submit |
| `app/static/targets.json` | Список Twitch доменов и эджей |
| `app/static/russia.geojson` | Контуры регионов РФ для карты Leaflet |

## Как работает проверка

- **HTTPS**: `fetch(url, {mode:"no-cors"})` + fallback `<img src="/favicon.ico">`.
  Успех = ресурс загрузился, ошибка < 20 мс = локальный фильтр (adblock/ext),
  abort по таймауту = timeout, иначе = blocked.
- **WSS**: `new WebSocket(url)` → событие `open` = OK; `error` / ранний `close` = blocked;
  таймаут = timeout. Это отдельный механизм, потому что ТСПУ часто режет именно
  WebSocket-апгрейд чата, а HTTPS-домен при этом может отвечать.
- После теста клиент шлёт `POST /api/report` с агрегированным payload
  (IP сервер хэширует перед хранением).

## Запуск

### Docker Compose (рекомендованный путь)

```bash
cp .env.example .env
# при желании поправьте IP_HASH_SALT, PORT и т.п.

docker compose up -d --build
# http://localhost:8000/
```

Данные лежат в `./data/probe.sqlite3` (volume). Для сброса статистики —
`docker compose down && rm -rf data/ && docker compose up -d`.

### Без Docker (локально)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DB_PATH=./data/probe.sqlite3 uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Переменные окружения

| Ключ | По умолчанию | Назначение |
|------|--------------|-----------|
| `PORT` | `8000` | Порт на хосте (docker-compose) |
| `DB_PATH` | `/data/probe.sqlite3` | Файл SQLite |
| `GEO_PROVIDER` | `ip-api` | `ip-api` или `ipinfo` |
| `IPINFO_TOKEN` | `""` | Токен для ipinfo.io |
| `IP_HASH_SALT` | `change-me-please` | Соль для SHA-256 хеша IP |
| `LOG_LEVEL` | `INFO` | Уровень логов uvicorn/app |
| `GEO_CACHE_TTL` | `3600` | TTL in-memory кеша geo-lookup (сек) |

## API

| Метод | URL | Что делает |
|-------|-----|-----------|
| GET | `/api/ping` | `{"ok":true}` — используется фронтом для детекции доступности сервера через VPN |
| GET | `/api/geo[?force=1]` | geo-lookup клиентского IP |
| POST | `/api/report` | приём отчёта (payload описан в `app/main.py::ReportPayload`) |
| GET | `/api/stats-filters` | списки городов/провайдеров для дропдаунов |
| GET | `/api/stats-priority[?city&org&period]` | агрегаты по доменам для вкладки «Статистика» |
| GET | `/api/map-data[?period]` | агрегаты по регионам РФ |
| GET | `/api/city-data[?period]` | агрегаты по городам РФ |
| GET | `/api/region-isps?region=\|city=` | разбивка по провайдерам |
| GET | `/healthz` | health check (в т.ч. для Docker HEALTHCHECK) |

Параметр `period` принимает значения `day` / `week` / `month`.

## Reverse-proxy (production)

За Nginx/Caddy/Traefik обязательно форвардите `X-Forwarded-For` — иначе
`/api/geo` будет возвращать IP прокси. Пример Nginx:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP       $remote_addr;
proxy_set_header Host            $host;
proxy_pass http://127.0.0.1:8000;
```

Приложение уже запускается с `--proxy-headers --forwarded-allow-ips "*"`.

## Лицензия и credits

- Идея и исходный дизайн UI/аналитики: [probe.trolling.website](https://probe.trolling.website/).
- GeoJSON контуров РФ взят оттуда же (`/russia.geojson`).
- Leaflet.js: © CARTO tiles.
