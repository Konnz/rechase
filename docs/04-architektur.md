# re:chase – Architektur und Deployment (Entwurf v0.1)

Ziel: so wenig Infrastruktur wie möglich, solange der MVP lokal im Browser läuft, und ein klarer Weg zu Backend und nativer App. Betrieb auf einem eigenen VPS.

## Überblick

Deployment folgt dem Standard für alle Apps auf dem VPS (`85.190.98.62`): Build nur in GitHub Actions, Image in GHCR, Ausrollen per SSH mit Health-Check und automatischem Rollback. Öffentlich erreichbar nur über den vorhandenen nginx mit certbot.

```
Handy (PWA)                                VPS 85.190.98.62
┌──────────────────────────┐               ┌──────────────────────────────────────────┐
│ UI, Karte (MapLibre)     │    HTTPS      │ nginx + certbot (vorhanden, Host)        │
│ packages/core            │ ────────────► │   rechase.konnerths.de → 127.0.0.1:3150  │
│ IndexedDB (Fahrten)      │               ├──────────────────────────────────────────┤
│ Service Worker (Cache)   │               │ Compose-Stack "rechase" (/opt/rechase)   │
└──────────────────────────┘               │  rechase-app   Node-Server, Port 3000    │
          │                                │     /          → PWA (statisch)          │
          │ Kartenkacheln                  │     /healthz   → Health-Check            │
          ▼                                │     /api/*     → API: Konten (ab R2)     │
   OpenFreeMap (extern, anfangs)           │     /data      → SQLite (Volume)         │
                                           └──────────────────────────────────────────┘
```

Ein einziges App-Image enthält die gebaute PWA und den Node-Server. Die API läuft im selben Server. Konten und Sitzungen liegen in SQLite (`node:sqlite`, eingebaut in Node 22) in der Datei `/data/rechase.db` im Volume `data`; kein eigener Datenbank-Container. Postgres mit PostGIS kommt als zweiter Service dazu, wenn Strecken und Ghosts geteilt werden und Geo-Abfragen nötig sind. Das SQL ist dafür bewusst schlicht gehalten.

## Repository-Struktur (Monorepo, pnpm workspaces)

```
apps/
  web/        PWA: Vite + TypeScript + Svelte 5, später MapLibre GL
  server/     Node-Server ohne Abhängigkeiten: liefert die PWA aus, /healthz, ab R2 /api
packages/
  core/       reine TS-Domänenlogik: GPS-Filter, Auto-Pause, Map-Matching,
              Ghost-Interpolation, Streckenerkennung; keine Browser-APIs
deploy/       update.sh (läuft auf dem VPS), nginx-Seite
Dockerfile, compose.yaml, .env.example, .github/workflows/deploy.yml
design/       Mockups und Tokens
docs/         Konzept, Machbarkeit, Backlog, Architektur
```

`packages/core` ist das Herzstück. Es wird von der PWA, der API (z. B. Validierung geteilter Fahrten) und später der nativen App (Capacitor) gemeinsam genutzt und ist mit aufgezeichneten Echtfahrten als Testdaten vollständig unit-testbar.

## Komponenten nach Release

| Komponente | R0/R1 | R2 | Später |
|---|---|---|---|
| App-Container (PWA + Node-Server) | ✅ | ✅ | ✅ |
| Kartenkacheln | OpenFreeMap extern | OpenFreeMap extern | ggf. PMTiles-Extrakt (DACH) auf dem VPS |
| API-Routen im selben Server | – | ✅ | ✅ |
| Datenbank | – | SQLite für Konten, Postgres + PostGIS sobald geteilt wird | ✅ (Streckenerkennung, Leaderboards) |
| Auth | – | E-Mail und Passwort, Google (OpenID Connect) | + Apple, Passwort vergessen per E-Mail (SMTP nötig) |
| Höhenmodell | – (live GPS geglättet) | Copernicus DEM 30 m für die Region, im App-Container oder als eigener Dienst (nach Rücksprache) | ✅ |
| Push | – | Web Push (VAPID) | + native Push |

## Datenmodell (ab R2, vereinfacht)

- `users` (id, email, name = Chaser-Name, bike = Standardrad, created_at, onboarded_at) ✅
- `identities` (provider, subject, user_id, secret): Anmeldewege eines Kontos, z. B. Passwort und Google; später Apple, Strava ✅
- `sessions` (token_hash, user_id, expires_at) ✅
- `routes` (id, owner_id, name, geom `LineString`, length_m, elevation_profile)
- `rides` (id, user_id, route_id, bike, started_at, moving_time_s, total_time_s, distance_m, track `LineStringZM` oder komprimierte Punktliste, privacy_trim_m)
- `ghosts` (id, ride_id, share_token, created_at, expires_at)
- `replies` (id, ghost_id, ride_id) – die „Re:“-Antworten

Lokal (IndexedDB) liegen dieselben Strukturen, sodass Sync später nur ein Abgleich ist.

## Deployment

Siehe Dateien `Dockerfile`, `compose.yaml`, `deploy/update.sh`, `.github/workflows/deploy.yml`.

1. Pull Request: Typecheck, Tests, Build und Image-Build (ohne Push).
2. Push auf `main`: zusätzlich Image `ghcr.io/konnz/rechase` mit Tags `latest` und Commit-SHA.
3. Deploy-Job (nur wenn die Variable `VPS_HOST` gesetzt ist): kopiert `compose.yaml` und `update.sh` nach `/opt/rechase`, rollt aus, wartet auf `healthy`, sonst Rollback.

| Wert | rechase |
|---|---|
| Linux-Nutzer / Stack / Container | `rechase` / `rechase` / `rechase-app` |
| Host-Port | `127.0.0.1:3150` (nächster freier Zehner ab 3150) |
| Health | `/healthz` |
| Grenzen | 256 MB, 0,5 CPU |

**PIN-Sperre:** Solange die App in Entwicklung ist, verlangt der Server eine PIN (`APP_PIN` in `/opt/rechase/.env`). Nach richtiger Eingabe gilt ein Cookie 90 Tage; nach 10 Fehlversuchen ist die Adresse 15 Minuten gesperrt. `/healthz`, Manifest und Icons bleiben frei. Zum Abschalten die Zeile `APP_PIN` in `compose.yaml` entfernen.

Rollback von Hand: `sudo -u rechase /opt/rechase/update.sh <voller-commit-sha>`

Einmalige Einrichtung auf dem VPS: [deploy/EINRICHTUNG.md](../deploy/EINRICHTUNG.md)

## Betrieb

- Backups (ab R2): nächtliches `pg_dump`, 14 Tage aufbewahren, zusätzlich extern kopieren.
- Monitoring: Hub-Dashboard über die Labels `hub.name` und `hub.health`, Container-Logs (json-file, 3 × 10 MB); Fehler-Tracking im Frontend (z. B. selbst gehostetes GlitchTip) erst bei Feldtest.
- Datenschutz: Server in der EU, keine Drittanbieter-Analytics, Kartenkacheln ohne Tracking (OpenFreeMap), Löschfunktion pro Konto. Schriften später selbst hosten statt von Google Fonts laden.

## Warum nicht …

- **Supabase selbst gehostet:** bringt Auth und Storage mit, ist aber ein Dutzend Container und für den geteilten VPS zu schwer.
- **Eigener Kartenserver von Anfang an:** viel Aufwand ohne Nutzen im MVP; OpenFreeMap reicht.
- **Express/Fastify schon jetzt:** Für statische Dateien und einen Health-Check reicht `node:http`. Ein Framework kommt dazu, wenn die API in R2 wächst.
