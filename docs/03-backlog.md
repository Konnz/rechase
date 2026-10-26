# re:chase – Backlog (Entwurf v0.1)

## Releases im Überblick

| Release | Ziel | Kernfrage |
|---|---|---|
| **R0 – Tech-Spike** | Beweisen, dass PWA-Tracking am Lenker zuverlässig genug ist | Halten GPS, Wake Lock und Akku eine Stunde durch? |
| **R1 – MVP „Duell gegen mich“** | Eigene Strecke wiederholen und live gegen die eigene Bestzeit fahren | Macht der Ghost Spaß, und ist der Vergleich fair? |
| **R2 – MVP+ „Re:“** | Ghost per Link teilen und beantworten | Entsteht der Kreislauf aus Einholen und Freigeben? |
| **Später** | Automatische Streckenerkennung, native App, Sensoren auf iOS, Läufer | Skalieren und Reibung abbauen |

Prioritäten: **M** = Must (ohne geht der Release nicht), **S** = Should, **C** = Could.
Größe: grobe Schätzung in T-Shirt-Größen (S/M/L/XL).

---

## R0 – Tech-Spike (1–2 Wochen)

| ID | Story | Prio | Größe |
|---|---|---|---|
| R0-1 | Als Entwickler will ich eine Minimal-PWA (Manifest, Service Worker, installierbar), damit wir auf echten Geräten testen können. | M | S |
| R0-2 | Als Entwickler will ich Position, `speed`, `altitude`, `accuracy` und Zeitstempel mit 1 Hz in IndexedDB loggen und als GPX/CSV exportieren. | M | S |
| R0-3 | Als Entwickler will ich den Bildschirm per Wake Lock wach halten und Lücken (Sperre, Hintergrund) protokollieren. | M | S |
| R0-4 | Als Entwickler will ich 3 Testfahrten pro Plattform (iPhone, Android) mit Referenz-Radcomputer vergleichen (Distanz, Bewegungszeit, Speed, Akku/h). | M | M |
| R0-5 | Als Entwickler will ich Web Bluetooth mit einem Pulsgurt und einem Powermeter auf Android testen. | S | S |
| R0-6 | Als Entwickler will ich testen, ob Web-Audio-Töne auf iOS laufende Musik unterbrechen. | S | S |

**Ergebnis:** kurzer Bericht mit Go/No-Go und Grenzwerten (Genauigkeitsfilter, Auto-Pause-Schwellen).

---

## R1 – MVP „Duell gegen mich“

### Epic E1: Tracking-Kern
| ID | Story | Prio | Größe |
|---|---|---|---|
| E1-1 | Als Fahrer will ich eine Fahrt mit einem Tipp starten und beenden, damit ich ohne Umstände losfahren kann. | M | S |
| E1-2 | Als Fahrer will ich vor dem Start sehen, ob GPS einen guten Fix hat, damit die Aufnahme nicht mit Sprüngen beginnt. | M | S |
| E1-3 | Als Fahrer will ich live Geschwindigkeit, Fahrzeit, Distanz sehen, gefiltert gegen GPS-Sprünge. | M | M |
| E1-4 | Als Fahrer will ich Höhenmeter und aktuelle Steigung sehen (live geglättet, für bekannte Strecken aus dem Höhenprofil). | S | M |
| E1-5 | Als Fahrer will ich, dass die Fahrt laufend gespeichert wird, damit ein Absturz oder Reload nichts verliert. | M | S |
| E1-6 | Als Fahrer will ich, dass der Bildschirm während der Fahrt an bleibt (Wake Lock, automatisch neu angefordert). | M | S |
| E1-7 | Als Fahrer will ich einen Hinweis, wenn Tracking unterbrochen wurde (z. B. Bildschirm gesperrt). | M | S |

### Epic E2: Faire Auto-Pause (USP)
| ID | Story | Prio | Größe |
|---|---|---|---|
| E2-1 | Als Fahrer will ich, dass die Zeit automatisch stoppt, wenn ich stehe, und weiterläuft, wenn ich losfahre (mit Hysterese). | M | M |
| E2-2 | Als Fahrer will ich, dass GPS-Drift im Stand nicht als Bewegung zählt. | M | M |
| E2-3 | Als Fahrer will ich sichtbar sehen, dass Auto-Pause aktiv ist („Ampelstopps zählen nicht“) und wann pausiert ist. | M | S |
| E2-4 | Als Fahrer will ich in der Zusammenfassung Bewegungszeit und Gesamtzeit getrennt sehen. | M | S |
| E2-5 | Als Fahrer will ich die Schwellwerte der Auto-Pause einstellen können. | C | S |

### Epic E3: Strecken und Bestzeiten
| ID | Story | Prio | Größe |
|---|---|---|---|
| E3-1 | Als Fahrer will ich eine beendete Fahrt „als Strecke merken“ und benennen (z. B. „Hausrunde Isar“). | M | S |
| E3-2 | Als Fahrer will ich eine Liste meiner Strecken mit Bestzeit und Anzahl Versuche sehen. | M | S |
| E3-3 | Als Fahrer will ich, dass jede neue Fahrt auf einer Strecke automatisch mit der Bestzeit verglichen und ggf. neue Bestzeit wird. | M | M |
| E3-4 | Als Fahrer will ich beim Start eine Strecke vorgeschlagen bekommen, deren Startpunkt in meiner Nähe liegt. | S | M |
| E3-5 | Als Fahrer will ich eine GPX-Datei (z. B. aus Strava/Garmin exportiert) importieren und als Ghost nutzen. | S | M |
| E3-6 | Als Fahrer will ich Fahrten als GPX exportieren. | S | S |

### Epic E4: Ghost-Duell (Fahransicht)
| ID | Story | Prio | Größe |
|---|---|---|---|
| E4-1 | Als Fahrer will ich meine Position live auf die Referenzstrecke projiziert bekommen (Korridor, nur vorwärts). | M | L |
| E4-2 | Als Fahrer will ich den Abstand zum Ghost groß in Metern und Sekunden sehen, farbcodiert je nachdem, wer vorne liegt. | M | M |
| E4-3 | Als Fahrer will ich den Trend sehen („du holst 0,9 s/km auf“). | S | S |
| E4-4 | Als Fahrer will ich die Rennspiel-Ansicht mit meiner Figur und der Ghost-Figur vor oder hinter mir sehen (Figur „Pfeil“). | M | L |
| E4-5 | Als Fahrer will ich die Kennzahlen-Kacheln mit dem Bestzeit-Vergleichswert sehen (Tempo „BZ 33,0“, Fahrzeit „BZ 42:13“). | M | M |
| E4-6 | Als Fahrer will ich einen Fortschrittsbalken mit meiner und der Ghost-Position sehen. | M | S |
| E4-7 | Als Fahrer will ich sehen, wenn ich die Strecke verlassen habe, und dass das Duell beim Wiedereinstieg weiterläuft. | M | M |
| E4-8 | Als Fahrer will ich zwischen den Figur-Varianten wählen (Pfeil, Plakette, Lichtpunkt, Rennfahrer). | C | S |
| E4-9 | Als Fahrer will ich die Farben für mich und den Ghost wählen (z. B. für Farbsehschwäche). | C | S |

### Epic E5: Karte
| ID | Story | Prio | Größe |
|---|---|---|---|
| E5-1 | Als Fahrer will ich eine Mini-Karte oben rechts in der Fahransicht mit meiner Spur, Ghost-Position und Strecke. | M | M |
| E5-2 | Als Fahrer will ich per Tipp auf die Mini-Karte die große Karte im Folgemodus öffnen und zurück zur Fahransicht wechseln. | M | M |
| E5-3 | Als Fahrer will ich die Karte auf mich zentrieren können, nachdem ich sie verschoben habe. | S | S |
| E5-4 | Als Fahrer will ich, dass die Kartenkacheln einer Strecke vorab gecacht werden, damit die Karte im Funkloch geht. | S | M |

### Epic E6: Tonsignale
| ID | Story | Prio | Größe |
|---|---|---|---|
| E6-1 | Als Fahrer will ich einen kurzen Ton, wenn ich den Ghost überhole oder er mich überholt. | M | S |
| E6-2 | Als Fahrer will ich einen Ton, wenn der Abstand unter eine Schwelle schrumpft (z. B. < 5 s) oder sich deutlich ändert. | S | S |
| E6-3 | Als Fahrer will ich Töne in den Einstellungen ein- und ausschalten. | M | S |

### Epic E7: Akku und Ablesbarkeit
| ID | Story | Prio | Größe |
|---|---|---|---|
| E7-1 | Als Fahrer will ich einen Spar-Modus (fast schwarz, nur Abstand groß), der bei Ereignissen kurz die volle Ansicht zeigt. | S | M |
| E7-2 | Als Fahrer will ich, dass die Ansicht sparsam rendert (wenige Updates pro Sekunde), damit der Akku hält. | M | S |
| E7-3 | Als Fahrer will ich alle Hauptwerte auch im Sonnenlicht lesen können (Kontrast-Check gegen Designtokens). | M | S |

### Epic E8: Fahrt-Zusammenfassung
| ID | Story | Prio | Größe |
|---|---|---|---|
| E8-1 | Als Fahrer will ich nach der Fahrt das Ergebnis gegen den Ghost sehen (gewonnen/verloren, um wie viel). | M | S |
| E8-2 | Als Fahrer will ich einen Abstandsverlauf über die Strecke sehen (wo habe ich Zeit gewonnen/verloren). | S | M |
| E8-3 | Als Fahrer will ich die Fahrt verwerfen können. | M | S |

### Epic E9: Onboarding und PWA-Grundlagen
| ID | Story | Prio | Größe |
|---|---|---|---|
| E9-1 | Als neuer Nutzer will ich verstehen, warum die App Standort braucht, und die Freigabe erteilen. | M | S |
| E9-2 | Als iPhone-Nutzer will ich eine Anleitung, wie ich re:chase auf den Home-Bildschirm lege (sonst gehen Daten nach 7 Tagen verloren). | M | S |
| E9-3 | Als Nutzer will ich den Hinweis „Bildschirm bleibt an, nicht sperren“ vor der ersten Fahrt. | M | S |
| E9-4 | Als Nutzer will ich, dass die App offline startet und dauerhaften Speicher anfordert. | M | S |

### Epic E10: Sensoren (Android-Beta)
| ID | Story | Prio | Größe |
|---|---|---|---|
| E10-1 | Als Android-Fahrer will ich einen Pulsgurt koppeln und Puls live sehen. | S | M |
| E10-2 | Als Android-Fahrer will ich ein Powermeter koppeln und Leistung und Kadenz sehen. | C | M |
| E10-3 | Als iPhone-Nutzer will ich verständlich sehen, dass Sensoren erst in der App-Version kommen, statt leerer Kacheln. | S | S |

### Querschnitt
| ID | Story | Prio | Größe |
|---|---|---|---|
| Q-1 | Domänenlogik (Filter, Auto-Pause, Map-Matching, Ghost) als reine TS-Bibliothek mit Unit-Tests und aufgezeichneten Echtfahrten als Testdaten. | M | M |
| Q-2 | Fahrt-Simulator: eine GPX-Datei im Browser „abspielen“, damit man das Duell am Schreibtisch testen kann. | M | M |
| Q-3 | Projekt-Setup: Vite, TypeScript, Lint, CI, Deployment (z. B. Cloudflare Pages/Vercel) mit HTTPS. | M | S |
| Q-4 | Design-Tokens aus den Mockups als CSS-Variablen. | M | S |

---

## R2 – MVP+ „Re:“ (Teilen)

### Epic E11: Ghosts teilen
| ID | Story | Prio | Größe |
|---|---|---|---|
| E11-1 | Als Fahrer will ich meine Bestzeit auf einer Strecke per Link teilen (Web Share API). | M | M |
| E11-2 | Als Empfänger will ich den Link öffnen und ohne Installation eine Vorschau sehen (Strecke, Zeit, Herausforderer). | M | M |
| E11-3 | Als Empfänger will ich gegen den geteilten Ghost fahren. | M | S |
| E11-4 | Als Empfänger will ich nach der Fahrt mit meiner Fahrt antworten („Re:“), sodass der Absender meinen Ghost bekommt. | M | M |
| E11-5 | Als Fahrer will ich eine Benachrichtigung, wenn jemand meinen Ghost geschlagen hat. | S | M |
| E11-6 | Als Fahrer will ich, dass Start und Ende geteilter Fahrten gekürzt werden, damit mein Wohnort nicht sichtbar ist. | M | S |

### Epic E12: Konto und Backend
| ID | Story | Prio | Größe |
|---|---|---|---|
| E12-1 | Als Nutzer will ich mich einfach anmelden (Magic Link oder Apple/Google), um teilen zu können. Ohne Konto funktioniert alles lokal weiter. | M | M |
| E12-2 | Als Nutzer will ich meine Fahrten in die Cloud sichern und auf einem neuen Gerät wiederherstellen. | S | M |
| E12-3 | Backend: geteilte Ghosts speichern, Links erzeugen, Zugriffsrechte (nur per Link sichtbar). | M | M |
| E12-4 | Datenschutz: Einwilligung, Löschen des Kontos und aller Daten (DSGVO). | M | S |

---

## Später

### Epic E13: Automatische Streckenerkennung
- Oft gefahrene Strecken und Teilstücke automatisch erkennen (Clustering überlappender Fahrten).
- Während der Fahrt erkennen, dass man auf ein bekanntes Teilstück einbiegt, und automatisch ein Duell anbieten (Ton + Einblendung).
- Teilstück-Bestzeiten, ohne dass Segmente manuell angelegt werden.

### Epic E14: Native App (Capacitor-Wrapper der PWA)
- Tracking mit gesperrtem Bildschirm und im Hintergrund.
- Bluetooth-Sensoren auf iOS, automatischer Reconnect.
- Display dimmen und bei Ereignissen hochfahren.
- Audio-Ducking (Musik leiser statt unterbrechen), Barometer für Höhe.
- App-Store-Präsenz, Widgets / Live Activities.

### Epic E15: Weitere Ideen
- Strava-Import eigener Fahrten (Wachstumshebel: sofort viele Ghosts).
- Mehrere Ghosts gleichzeitig (eigene Bestzeit + Freund).
- Animierte Rennfahrer-Figur und Straßenverlauf passend zur echten Kurve.
- Sprachansagen.
- Apple Watch / Wear OS, Läufer-Modus mit Audio-Fokus.
- Leaderboards pro Strecke, Gruppen-Challenges.

---

## Vorgeschlagene Reihenfolge

1. **Sprint 0:** R0 komplett, parallel Q-3 und Q-4.
2. **Sprint 1:** E1, E2, E9, Q-1 → man kann fahren und eine faire Zeit aufzeichnen.
3. **Sprint 2:** E3, E4-1 bis E4-3, Q-2 → Duell-Logik läuft im Simulator.
4. **Sprint 3:** E4-4 bis E4-7, E5-1/E5-2, E6-1, E8-1 → erste echte Duellfahrt.
5. **Sprint 4:** Rest der Must/Should aus R1, Feldtest mit 5–10 Fahrern.
6. Danach R2.
