# re:chase – Architektur und Deployment (Entwurf v0.1)

Ziel: so wenig Infrastruktur wie möglich, solange der MVP lokal im Browser läuft, und ein klarer Weg zu Backend und nativer App. Betrieb auf einem eigenen VPS.

## Überblick

```
Handy (PWA)                                   VPS (Docker Compose)
┌──────────────────────────┐                  ┌─────────────────────────────────┐
│ apps/web                 │   HTTPS          │ Caddy (TLS, statische Dateien)  │
│  UI, Karte (MapLibre)    │ ───────────────► │   /        → PWA (dist)         │
│  packages/core           │                  │   /api/*   → api (ab R2)        │
│  IndexedDB (Fahrten)     │                  │   /dem/*   → elevation (ab R2)  │
│  Service Worker (Cache)  │                  ├─────────────────────────────────┤
└──────────────────────────┘                  │ api: Node/TS (Fastify oder Hono)│
          │                                   │ db:  PostgreSQL + PostGIS       │
          │ Kartenkacheln                     │ elevation: DEM-Dienst           │
          ▼                                   │ backup: nächtliches pg_dump     │
   OpenFreeMap (extern, anfangs)              └─────────────────────────────────┘
```

## Repository-Struktur (Monorepo, pnpm workspaces)

```
apps/
  web/        PWA: Vite + TypeScript + React (oder Svelte), MapLibre GL
  api/        ab R2: REST-API für geteilte Ghosts, Konten, Sync
packages/
  core/       reine TS-Domänenlogik: GPS-Filter, Auto-Pause, Map-Matching,
              Ghost-Interpolation, Streckenerkennung; keine Browser-APIs
infra/
  docker-compose.yml, Caddyfile, Backup-Skript
design/       Mockups und Tokens
docs/         Konzept, Machbarkeit, Backlog, Architektur
```

`packages/core` ist das Herzstück. Es wird von der PWA, der API (z. B. Validierung geteilter Fahrten) und später der nativen App (Capacitor) gemeinsam genutzt und ist mit aufgezeichneten Echtfahrten als Testdaten vollständig unit-testbar.

## Komponenten nach Release

| Komponente | R0/R1 | R2 | Später |
|---|---|---|---|
| Caddy + statische PWA | ✅ | ✅ | ✅ |
| Kartenkacheln | OpenFreeMap extern | OpenFreeMap extern | ggf. PMTiles-Extrakt (DACH) auf dem VPS |
| API (Fastify/Hono) | – | ✅ | ✅ |
| PostgreSQL + PostGIS | – | ✅ | ✅ (Streckenerkennung, Leaderboards) |
| Auth | – | Magic Link per E-Mail (SMTP-Dienst nötig) | + Apple/Google-Login |
| Höhenmodell-Dienst | – (live GPS geglättet) | ✅ Copernicus DEM 30 m für die Region | ✅ |
| Push | – | Web Push (VAPID) | + native Push |

## Datenmodell (ab R2, vereinfacht)

- `users` (id, name, email, created_at)
- `routes` (id, owner_id, name, geom `LineString`, length_m, elevation_profile)
- `rides` (id, user_id, route_id, started_at, moving_time_s, total_time_s, distance_m, track `LineStringZM` oder komprimierte Punktliste, privacy_trim_m)
- `ghosts` (id, ride_id, share_token, created_at, expires_at)
- `replies` (id, ghost_id, ride_id) – die „Re:“-Antworten

Lokal (IndexedDB) liegen dieselben Strukturen, sodass Sync später nur ein Abgleich ist.

## Deployment

1. Push auf `main` → GitHub Actions: Lint, Typecheck, Tests, Build.
2. Images (`web` mit Caddy, `api`) nach GitHub Container Registry.
3. Per SSH auf dem VPS: `docker compose pull && docker compose up -d`.
4. Preview: optional eigene Subdomain für den `develop`-Stand zum Testen auf dem Handy.

Voraussetzungen auf dem VPS: Docker + Compose, eine (Sub-)Domain mit A/AAAA-Record auf den Server, Ports 80/443 offen, ein Deploy-SSH-Key als GitHub-Secret.

Größe: Für R1 reicht jeder kleine VPS (1 vCPU, 1 GB RAM). Ab R2 mit Postgres und DEM-Dienst sind 2 GB RAM und ca. 10 GB Platte (DEM für Deutschland ca. 2–3 GB) sinnvoll.

## Betrieb

- Backups: nächtliches `pg_dump`, 14 Tage aufbewahren, zusätzlich extern kopieren.
- Monitoring: Uptime-Check von außen, Caddy-Logs; Fehler-Tracking im Frontend (z. B. selbst gehostetes GlitchTip) erst bei Feldtest.
- Datenschutz: Server in der EU, keine Drittanbieter-Analytics, Kartenkacheln ohne Tracking (OpenFreeMap), Löschfunktion pro Konto.

## Warum nicht …

- **Supabase selbst gehostet:** bringt Auth und Storage mit, ist aber ein Dutzend Container und für einen kleinen VPS schwergewichtig. Eine eigene kleine API ist hier überschaubarer.
- **Serverless/Vercel:** ginge für die PWA, aber der VPS ist vorhanden, und PostGIS sowie der DEM-Dienst brauchen ohnehin einen Server.
- **Eigener Kartenserver von Anfang an:** viel Aufwand ohne Nutzen im MVP; OpenFreeMap reicht.
