# re:chase

Tracking-App für Radfahrer, bei der man Bestzeiten auf bekannten Strecken live jagt. Die Bestzeit fährt als **Ghost** sichtbar vor oder hinter dir, und dank fairer Auto-Pause zählt nur die Bewegungszeit: Eine rote Ampel kostet keine Bestzeit.

*re* = die Strecke noch einmal jagen. *Re:* = auf einen geteilten Ghost mit der eigenen Fahrt antworten.

## Dokumentation

- [Produktkonzept](docs/01-konzept.md)
- [PWA-Machbarkeit](docs/02-pwa-machbarkeit.md): Was kann eine Web-App beim Tracking, was nicht?
- [Backlog](docs/03-backlog.md): Epics, User Stories, MVP und später
- [Architektur und Deployment](docs/04-architektur.md): VPS, Monorepo, Komponenten je Release
- [Design-Referenzen](design/README.md): Mockups und Design-Tokens

## Status

R0 Tech-Spike: Die PWA ist ein Tracking-Test (GPS, Auto-Pause, Wake Lock, GPX/CSV-Export). Der MVP wird als PWA gebaut, eine native App folgt später.

## Entwicklung

Voraussetzung: Node 22.

```bash
npm install
npm run dev      # PWA mit Vite, auch im LAN erreichbar
npm test         # Unit-Tests (core, server)
npm run check    # Typecheck
npm run build    # PWA nach build/public, Server nach build/index.js
npm start        # gebaute App auf Port 3000 (mit APP_PIN=… davor: PIN-Sperre)
```

Hinweis: GPS und Service Worker funktionieren im Browser nur über HTTPS oder `localhost`. Zum Testen auf dem Handy also die deployte Version nutzen oder einen HTTPS-Tunnel.

| Ordner | Inhalt |
|---|---|
| `packages/core` | Domänenlogik ohne Browser-APIs: Distanz, faire Auto-Pause, Ghost-Vergleich |
| `apps/web` | PWA (Svelte 5, Vite, vite-plugin-pwa) |
| `apps/server` | Node-Server: liefert die PWA aus, `/healthz`, PIN-Sperre über `APP_PIN` |
| `deploy/`, `Dockerfile`, `compose.yaml` | Deployment auf den VPS, siehe [Architektur](docs/04-architektur.md) |
