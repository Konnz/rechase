# re:chase – Produktkonzept (Stand: Oktober 2026, Entwurf v0.1)

## 1. Idee in einem Satz

re:chase macht jede bekannte Radstrecke zum Live-Duell: Deine Bestzeit (oder die eines anderen) fährt als **Ghost** sichtbar vor oder hinter dir, und verglichen wird fair nach **Bewegungszeit**, sodass eine rote Ampel keine Bestzeit kostet.

Der Name: *re* = noch einmal fahren, *Re:* = auf einen geteilten Ghost mit der eigenen Fahrt antworten.

## 2. Zielgruppe und Nutzungssituation

**Primär:** Rennrad- und Gravelfahrer mit Handy am Lenker, die regelmäßig ähnliche Strecken fahren (Hausrunde, Pendelweg, Trainingsrunde).

Daraus folgen harte Rahmenbedingungen für das Produkt:

- Das Handy ist **montiert, Display an, im Sonnenlicht**, Blick für maximal eine Sekunde.
- Bedienung mit Handschuhen, oft feuchte Finger → große Touch-Ziele (≥ 44 px), kaum Interaktion während der Fahrt.
- Fahrten dauern 30 min bis 3 h → Akku ist ein echtes Thema.
- Strecken wiederholen sich, aber nie exakt (Abkürzung, andere Ampelphase, Umleitung).

**Später:** Läufer, dann mit Fokus auf Watch und Audio statt Display.

## 3. Positionierung

| | Strava Live Segments | Wahoo/Garmin-Rad-Computer | **re:chase** |
|---|---|---|---|
| Vergleich | nur vordefinierte Segmente | Segmente, teils Course-Ghost | ganze Strecke und Teilstücke, automatisch |
| Ampeln | zählen voll | zählen voll | **Auto-Pause, beide halten an** |
| Darstellung | Zahlen | Zahlen | **Rennspiel-Ansicht mit sichtbarem Ghost** |
| Hardware | Abo + Gerät | Gerät | nur Handy |

**Kern-USP:** faire Bewegungszeit plus sichtbarer Ghost. Alles andere ist Standard-Tracking und muss nur „gut genug“ sein.

## 4. Kernkonzepte

### 4.1 Fahrt (Ride)
Eine aufgezeichnete Fahrt: GPS-Punkte mit Zeitstempel, Geschwindigkeit, Höhe, optional Sensorwerte. Jeder Punkt ist als *bewegt* oder *pausiert* markiert.

### 4.2 Strecke (Route)
Eine geometrische Linie, die man wiederholt fährt. Entsteht aus einer Fahrt (MVP: manuell „als Strecke merken“, später automatisch erkannt). Eine Strecke hat beliebig viele Fahrten; die schnellste nach Bewegungszeit ist die **Bestzeit**.

### 4.3 Ghost
Eine Referenzfahrt auf einer Strecke, abgebildet als Funktion **Streckendistanz → Bewegungszeit**. Das ist der entscheidende Kniff: Der Ghost wird nicht über die Uhrzeit abgespielt, sondern über die *zurückgelegte Distanz entlang der Strecke* und die *eigene Bewegungszeit*.

- **Abstand in Sekunden** = meine Bewegungszeit bei Distanz *d* − Ghost-Bewegungszeit bei Distanz *d*
- **Abstand in Metern** = Ghost-Distanz bei meiner aktuellen Bewegungszeit − meine Distanz
- „Du holst 0,9 s/km auf“ = Ableitung des Zeitabstands über die letzten ~500 m

Weil der Ghost über die Bewegungszeit läuft, „hält er automatisch mit an“, wenn ich an der Ampel stehe.

### 4.4 Faire Auto-Pause
- Pause, wenn Geschwindigkeit < ~3 km/h für ≥ 3 s; Weiterfahrt bei > ~5 km/h (Hysterese gegen Flattern).
- GPS-Drift im Stand (Sprünge von 5–20 m) darf keine Bewegung erzeugen → Positionssprünge mit schlechter Genauigkeit verwerfen.
- Pausen werden in der Fahrt gespeichert, damit Ghost-Vergleich und Statistiken dieselbe Logik nutzen.
- Anzeige: „Auto-Pause aktiv · Ampelstopps zählen nicht“ (siehe Mockup).

### 4.5 Streckenzuordnung (Map-Matching light)
Während der Fahrt wird die aktuelle Position auf die Referenzlinie projiziert (nächster Punkt innerhalb eines Korridors von ca. 30 m, nur vorwärts suchend). Verlässt der Fahrer den Korridor länger als ~200 m, pausiert das Duell („Abseits der Strecke“) und nimmt es beim Wiedereinstieg auf.

### 4.6 Teilen („Re:“)
Ein Ghost wird per Link geteilt. Der Empfänger öffnet den Link, sieht Strecke, Zeit und Herausforderer und fährt dagegen. Nach der Fahrt kann er seine eigene Fahrt als Antwort zurückschicken. Der Kreislauf: fremden Ghost einholen → eigenen Ghost freigeben.

Gerade hier ist eine PWA im Vorteil: Ein Link öffnet die App sofort, ohne Store-Installation.

## 5. Screens und Informationsarchitektur

```
Start (Strecken-Liste)
 ├─ Freie Fahrt starten ──────────────► Fahransicht (ohne Ghost)
 ├─ Strecke wählen ─► Ghost wählen ───► Fahransicht (Duell) ◄──► Karte im Folgemodus
 │                                         │
 │                                         ▼
 │                                    Fahrt beenden ─► Zusammenfassung ─► Teilen / Als Strecke merken
 ├─ Geteilter Ghost (per Link) ───────► Ghost-Vorschau ─► Fahransicht (Duell)
 └─ Einstellungen (Sensoren, Töne, Farben, Figur, Auto-Pause)
```

### Vorhanden (Mockups im Ordner `design/`)
1. **Fahransicht / Duell** – Kopfzeile mit Streckenname und Bestzeit, großer Abstand in Metern (64 px) und Sekunden, Trend „du holst auf“, Verfolgerperspektive mit Ghost-Figur, Mini-Karte oben rechts (tippbar), Fortschrittsbalken mit Ghost-Marker, Kacheln Tempo / Fahrzeit / Distanz / Höhenmeter (jeweils mit Bestzeit-Vergleichswert), Sensor-Kacheln Puls / Leistung / Kadenz, Auto-Pause-Hinweis.
2. **Karte im Folgemodus** – große Karte mit eigener Spur, Ghost-Spur, Rundenübersicht, Zentrieren-Button, Bottom-Sheet mit Abstand und Kennzahlen, Button „Zur Fahransicht“.
3. **Figuren-Varianten** – Pfeil, Lichtpunkt, Plakette (DU/BZ), Rennfahrer. Empfehlung für den MVP: **Pfeil** (ruhig, auch bei kleiner Größe eindeutig) mit Plakette als Option; Rennfahrer erst, wenn die Perspektive animiert wird.

### Fehlen noch (für den MVP nötig)
- Start / Streckenliste mit Bestzeiten
- Vor dem Start: GPS-Fix-Status, Ghost-Auswahl, Sensor-Status, Hinweis „Bildschirm bleibt an“
- Fahransicht **ohne** Ghost (freie Fahrt) und Zustand „Abseits der Strecke“
- Zusammenfassung nach der Fahrt (Ergebnis gegen den Ghost, Zwischenstände, „Als Strecke merken“, „Ghost teilen“)
- Ghost-Vorschau beim Öffnen eines geteilten Links
- Onboarding: Standortfreigabe, Installation auf dem Homescreen (iOS-Anleitung), Ton-Freigabe
- Einstellungen

## 6. Designprinzipien (aus dem Projektziel, konkretisiert)

| Prinzip | Umsetzung |
|---|---|
| In einer Sekunde ablesbar | Eine Hauptzahl pro Screen (Abstand), Barlow Condensed, Kontrast ≥ 7:1 |
| Farbe als Signal | Du = Orange `#FF7A1A`, Ghost = Hellblau `#A9C1FF`; Ghost immer zusätzlich gestrichelt/transparent (farbenblind-tauglich) |
| Kurze Tonsignale | Überholen, Überholt-werden, Abstand < 5 s, jede 10-s-Änderung, Ziel |
| Akku schonen | Dunkles UI (OLED), ruhiger „Spar-Modus“ mit nur Abstand groß auf Schwarz; Hochfahren der Details bei Ereignissen. *Echtes Dimmen der Hintergrundbeleuchtung ist in einer PWA nicht möglich, siehe Machbarkeit.* |
| Sicherheit | Keine Kamera-AR, keine Interaktion während der Fahrt nötig, Töne statt Blick |

## 7. Technische Zielarchitektur (Vorschlag)

- **Frontend:** TypeScript, React oder Svelte, Vite, PWA (Service Worker, Manifest). Karte mit **MapLibre GL** und Vektor-Tiles (z. B. OpenFreeMap/MapTiler), Offline-Cache für Kacheln der gewählten Strecke.
- **Fahrbühne:** Canvas 2D oder SVG für die Straßenperspektive; kein WebGL nötig für den MVP.
- **Domänenlogik als reine TS-Bibliothek** (Auto-Pause, Glättung, Map-Matching, Ghost-Interpolation), komplett ohne Browser-APIs testbar. Diese Bibliothek wird später 1:1 in der nativen App weiterverwendet.
- **Speicher:** IndexedDB (via Dexie), lokal-zuerst. Fahrten bleiben auf dem Gerät, bis man teilt.
- **Backend (erst für Teilen):** schlankes BaaS (z. B. Supabase: Auth, Postgres/PostGIS, Storage) für geteilte Ghosts und Links.
- **Höhenmeter:** GPS-Höhe ist zu ungenau für saubere Höhenmeter; nach der Fahrt mit einem Höhenmodell (DEM) korrigieren, live nur geglättet anzeigen.
- **Weg zur nativen App:** Dieselbe Web-App mit **Capacitor** verpacken und nur die Teile nativ ersetzen, die im Browser fehlen (Hintergrund-GPS, BLE auf iOS, Display-Helligkeit, Audio-Ducking). So wird der native Schritt eine Erweiterung, kein Neubau.

## 8. Erfolgsmessung für den MVP

- Anteil der Fahrten, die ohne GPS-Lücke durchlaufen (Ziel ≥ 95 %)
- Abweichung der Bewegungszeit gegenüber einem Garmin/Wahoo auf derselben Fahrt (Ziel < 2 %)
- Wie oft eine Strecke erneut gegen den Ghost gefahren wird (Wiederholungsrate)
- Für Teilen: Anteil geöffneter Links, die zu einer Fahrt führen; Anteil Antworten („Re:“)

## 9. Offene Fragen

1. Soll im MVP schon geteilt werden (braucht Backend und Accounts), oder reicht zunächst „gegen mich selbst“ mit GPX-Import?
2. Welche Figur als Standard: Pfeil oder Plakette?
3. Wie streng ist „gleiche Strecke“? Gilt eine Fahrt mit 300 m Umleitung noch als Versuch?
4. Strava-Import (eigene alte Fahrten als Ghosts) – lohnt sich das früh als Wachstumshebel?
5. Datenschutz beim Teilen: Start/Ende automatisch kürzen (Wohnort verschleiern)?
