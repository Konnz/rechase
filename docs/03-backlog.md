# re:chase – Backlog (Entwurf v0.2, 27.10.2026)

## Releases im Überblick

| Release | Ziel | Kernfrage |
|---|---|---|
| **R0 – Tech-Spike** | Beweisen, dass PWA-Tracking am Lenker zuverlässig genug ist | Halten GPS, Wake Lock und Akku eine Stunde durch? |
| **R1 – MVP „Duell gegen mich“** | Eigene Strecke wiederholen und live gegen die eigene Bestzeit fahren | Macht der Ghost Spaß, und ist der Vergleich fair? |
| **Feldtest** (zwischen R1 und R2) | Tester fahren echt, Fahrten landen mit Einwilligung auf dem Server, Adminbereich mit Dashboard und Tester-Strecken | Wo hakt es auf echten Fahrten, und wie gut stimmen GPS und Auto-Pause? |
| **R2 – MVP+ „Re:“** | Konto, Radklasse, Ghost per Link teilen und beantworten, mehrere benannte Ghosts, Teilen auf Social Media und Strava | Entsteht der Kreislauf aus Einholen und Freigeben? |
| **R3 – „Revier“** | Strecken und Gebiete erobern, Ränge, Badges, Punkte, Anti-Cheat Stufe 2 | Hält das Spiel Chaser über Wochen bei der Stange? |
| **Später** | Automatische Streckenerkennung, native App, Sensoren auf iOS, Läufer | Skalieren und Reibung abbauen |

Details zu Community, Gamification, Radklassen, Anti-Cheat und Strava: [05-community-und-gamification.md](05-community-und-gamification.md).

### Neue Ideen vom 27.10. und ihre Einordnung

| # | Idee | Release | Epic |
|---|---|---|---|
| 1 | Mehrere Chaser mit benannten Ghosts auf einer Strecke | R2 | E17 |
| 2 | Strecken und Gebiete erobern, Ränge, Badges | R3 | E19, E20 |
| 3 | Onboarding mit Radtyp, E-Bikes getrennt werten | R2 | E12 |
| 4 | Cheating erkennen (Bahn, Auto) | R2 (Plausibilität), R3 (Kontext) | E21 |
| 5 | Strecken mit Karte, KPIs und „Challenge me“ teilen, auch Strava | R2 | E18 |
| 6 | Mehr Gamification: Töne, Abschnitts-PRs, Punkte, Fahrtziele | R1 (solo), R3 (Punkte, Ränge) | E6, E16, E20 |
| 7 | Eigenen Ghost wählen: letzte Fahrt, Durchschnitt, Bestzeit | R1 | E4 |
| 8 | Neues Layout der Fahransicht, Tippen auf Karte tauscht die Ansicht | R1 | E4, E5 |
| 9 | Registrierung und Login per Google, Apple und manuell | R2 | E12 |
| 10 | Adminbereich mit Datendashboard, in der Testphase mit den Strecken der Tester (27.10. abends) | Feldtest, ausgebaut in R2 | E22 |
| 11 | Teilstrecken fair werten: fliegender Start, Vorbelastung, Abschnitte für alle, Strecken nur komplett | R1 (Vorbelastung mitschreiben), R2 (Abschnitts-Duelle), R3 (Kronen, Eroberung) | E23, E19 |
| 12 | Hintergrund-GPS: native Hülle (Capacitor) vor dem Feldtest prüfen | Feldtest | E14-0 |
| 13 | Import von Garmin und Wahoo, später Garmin-Datenfeld mit Ghost-Abstand | R2 (Import), Später (Datenfeld) | E24 |
| 14 | Kaltstart: wenige Klassen, Gruppen per Einladungslink | R2 | E25 |
| 15 | Sicherheit: keine Wettkampf-Abschnitte auf Abfahrten und Stadtstücken mit vielen Kreuzungen, Meldefunktion, Hinweise | R2 (vor fremden Abschnitts-Duellen) | E26, E19-6 |
| 16 | Privatzonen standardmäßig an vor jedem Teilen | R2 (vor E11) | E11-6 |
| 17 | Challenge-Popup: Die App erkennt während der Fahrt eine Strecke, die ich oder ein anderer Chaser schon gefahren ist, und bietet ein Duell an, das ohne Antippen startet | R1 (eigene Strecken), R2 (fremde Ghosts und Abschnitte) | E27 |

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
| E1-8 | ✅ Als Fahrer will ich die Höhe über dem Meeresspiegel sehen. Android liefert die Höhe über dem WGS84-Ellipsoid, in NRW rund 47 m zu hoch (Probefahrt 27.10.: 97 m statt etwa 50 m). Umgesetzt mit EGM96-Geoid im 1°-Raster (130 KB, offline); iPhone liefert schon Meereshöhe. Für bekannte Strecken später Höhenprofil aus dem Copernicus-Höhenmodell (E1-4). | S | M |

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
| E4-10 | Als Fahrer will ich vor dem Start wählen, gegen welchen eigenen Ghost ich fahre: **letzte Fahrt**, **Durchschnitt** meiner letzten 5 Fahrten oder **Bestzeit**. | M | M |
| E4-11 | Als Fahrer will ich eine Fahransicht, in der die **virtuelle Straße mit mir und dem Ghost den Hauptteil** einnimmt: Tempo oben links, Abstand oben mittig, Mini-Karte oben rechts, unten Fahrzeit netto, Zeit brutto und „Fahrt beenden“. | M | M |
| E4-12 | Als Fahrer will ich einen „Ultimativen Ghost“ aus meinen besten Abschnitten jagen. | C | M |

### Epic E5: Karte
| ID | Story | Prio | Größe |
|---|---|---|---|
| E5-1 | Als Fahrer will ich eine Mini-Karte oben rechts in der Fahransicht mit meiner Spur, Ghost-Position und Strecke. | M | M |
| E5-2 | Als Fahrer will ich per Tipp auf die Mini-Karte die Ansicht tauschen: Die **Karte wird groß**, die Straßenansicht mit mir und dem Ghost wandert **klein nach oben rechts**. Ein Tipp darauf tauscht zurück. | M | M |
| E5-3 | Als Fahrer will ich die Karte auf mich zentrieren können, nachdem ich sie verschoben habe. | S | S |
| E5-4 | Als Fahrer will ich, dass die Kartenkacheln einer Strecke vorab gecacht werden, damit die Karte im Funkloch geht. | S | M |

### Epic E6: Tonsignale
| ID | Story | Prio | Größe |
|---|---|---|---|
| E6-1 | ✅ Als Fahrer will ich einen kurzen Ton, wenn ich den Ghost überhole oder er mich überholt. | M | S |
| E6-2 | ✅ Als Fahrer will ich einen Ton, wenn der Abstand unter eine Schwelle schrumpft (z. B. < 5 s) oder sich deutlich ändert. | S | S |
| E6-3 | ✅ Als Fahrer will ich Töne in den Einstellungen ein- und ausschalten. | M | S |
| E6-4 | ✅ Als Fahrer will ich eine einheitliche Klangsprache: steigend beim Überholen, fallend beim Überholtwerden, schneller werdendes Ticken unter 5 s Abstand, Glockenton je Kilometer in Führung, Countdown auf den letzten 500 m. | S | M |
| E6-5 | ✅ Als Fahrer will ich einzelne Klänge abschalten und die Lautstärke regeln können. | C | S |

### Epic E16: Kleine Belohnungen (solo)
| ID | Story | Prio | Größe |
|---|---|---|---|
| E16-1 | ✅ Als Fahrer will ich auf Teilstücken meiner Strecke **Abschnitts-PRs** erzielen und dafür während der Fahrt einen kurzen Ton und ein „+20“ sehen. Umgesetzt mit automatischen Abschnitten von etwa 1 km (höchstens 10 je Strecke); gewertet nur, wer den Abschnitt nicht verlassen hat. | S | M |
| E16-2 | Als Fahrer will ich vor der Fahrt bis zu drei **Fahrtziele** vorgeschlagen bekommen (z. B. negativer Split, nie mehr als 10 s zurück) und in der Zusammenfassung sehen, welche ich erreicht habe. | S | M |
| E16-3 | Als Fahrer will ich für jede Fahrt **Punkte** bekommen (Kilometer, Ghost geschlagen, Abschnitts-PRs, Ziele) und eine Wochenserie aufbauen. Die Punkte bleiben erhalten, wenn ich später ein Konto anlege. | C | M |

### Epic E27: Challenge unterwegs (Popup bei bekannter Strecke)
Fährt man frei los und biegt auf eine bekannte Strecke oder einen Abschnitt ein, bietet die App ein Duell an. Gestartet wird wie in E23 mit **fliegendem Start** an der virtuellen Startlinie, deshalb muss das Angebot **vor** der Linie kommen. Am Lenker darf nichts ein Antippen verlangen: Ton plus große Einblendung, und ohne Reaktion gilt das Angebot als angenommen. Eigene Strecken ab R1, fremde Ghosts ab R2.

| ID | Story | Prio | Größe |
|---|---|---|---|
| E27-1 | ✅ Als Fahrer will ich, dass die App während einer freien Fahrt erkennt, dass ich auf den **Start einer meiner gemerkten Strecken** (E3) zufahre (Abstand unter ca. 200 m, Fahrtrichtung passt), und mir ein Duell anbietet. | M | M |
| E27-2 | ✅ Als Fahrer will ich das Angebot **ohne Antippen** nutzen: eigener Ton, große Einblendung „Hausrunde Isar · Bestzeit 42:13 · startet an der Linie“, die nach 5 s von selbst angenommen wird. Ablehnen per großer Fläche oder einfach Weiterfahren abseits der Strecke. | M | M |
| E27-3 | ✅ Als Fahrer will ich, dass die Zeit erst beim **Überfahren der Startlinie** läuft (fliegender Start, Auto-Pause gilt) und das Duell ohne Strafe still endet, wenn ich die Strecke verlasse. Gewertet wird nur, wer bis zum Ziel fährt. | M | M |
| E27-4 | ✅ Als Fahrer will ich einstellen, ob Angebote **automatisch starten**, **nur angeboten** werden oder **aus** sind, und einzelne Strecken mit „nicht mehr anbieten“ stummschalten. Pro Fahrt kommt jede Strecke höchstens einmal. | M | S |
| E27-5 | ✅ Als Fahrer will ich, dass als Gegner mein Standard-Ghost aus E4-10 vorgewählt ist (letzte Fahrt, Durchschnitt oder Bestzeit). | S | S |
| E27-6 | (R2) Als Chaser will ich auch bei **öffentlichen Abschnitten und Strecken anderer Chaser** ein Angebot bekommen, z. B. „Anna war hier 12 s schneller, nach 49 km“. Vorgewählt ist der nächste Ghost aus meiner Radklasse und Wertungsklasse (E23-4) oder aus meiner Gruppe (E25). | M | L |
| E27-7 | (R2) Als Plattform will ich nur Abschnitte anbieten, die die Sicherheitsregeln aus E26 erfüllen (keine Abfahrten, keine kreuzungsreichen Stadtstücke), und nie private Fahrten oder Privatzonen anderer verraten (E11-6). | M | S |
| E27-8 | (R2) Als Fahrer will ich, dass die Abschnitte in meiner Nähe beim Losfahren einmal geladen werden, damit die Erkennung ohne Netz und akkuschonend lokal läuft. | S | M |
| E27-9 | Als Fahrer will ich, dass während eines laufenden Duells **kein weiteres Popup** kommt; Abschnitte unterwegs werden still mitgewertet und erst in der Zusammenfassung gezeigt (E23, E8). | S | S |

Umsetzung R1: Angebot ab 200 m vor dem Startpunkt, wenn die Fahrtrichtung höchstens 60° von der Richtung der Strecke abweicht; es fällt weg, wenn man sich weiter als 260 m entfernt oder abbiegt. Die Uhr rastet erst an der Linie ein (fliegender Start). Ein unterwegs angenommenes Duell endet still, wenn man den Start nicht erreicht (über 300 m weg), mehr als 150 m neben die Strecke gerät oder 20 s am Stück neben ihr fährt. Während eines Duells kommt kein Angebot (E27-9, das stille Mitwerten fremder Abschnitte folgt mit R2). Testen am Schreibtisch: „Anfahrt simulieren“ in der Streckenliste.

Grenzen in der PWA: Die Erkennung läuft nur, solange die App offen und der Bildschirm an ist (Wake Lock, siehe E7). Mit der nativen Hülle (E14) geht sie auch im Hintergrund und meldet sich per Ton.

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

## Feldtest (zwischen R1 und R2)

Damit der Feldtest mit 5–10 Fahrern etwas bringt, müssen ihre Fahrten beim Team ankommen. Bisher bleiben Fahrten nur auf dem Handy; Konten gibt es schon (E12-1). Der Upload hier ist der erste Schritt zur Cloud-Sicherung (E12-2) und zum Teilen (E11).

### Vorab: Hintergrund-GPS klären
| ID | Story | Prio | Größe |
|---|---|---|---|
| E14-0 | Spike vor dem Feldtest: Prüfen, ob eine native Hülle (Capacitor) mit Hintergrund-Standort auf iPhone und Android lange Fahrten mit gesperrtem oder gedimmtem Display zuverlässig aufzeichnet, und was sie an Aufwand kostet (Apple-Developer-Konto, Store-Prüfung, TestFlight). Ergebnis: Feldtest als PWA oder schon als Test-App. | M | M |

### Epic E22: Adminbereich und Datendashboard
| ID | Story | Prio | Größe |
|---|---|---|---|
| E22-1 | ✅ Als Tester will ich ausdrücklich einwilligen, dass meine Fahrten für die Testphase hochgeladen und vom Team angesehen werden; die Einwilligung kann ich jederzeit zurückziehen. | M | S |
| E22-2 | ✅ (gzip-JSON in SQLite; ohne Netz geht die Fahrt beim nächsten Öffnen oder Online-Werden hoch) Als Tester will ich, dass beendete Fahrten automatisch hochgeladen werden (bei schlechtem Netz später nachgeholt), samt Rohpunkten, Auto-Pausen, Lücken, Gerät und Browser. | M | M |
| E22-3 | ✅ Als Admin will ich mich mit meinem normalen Konto anmelden und über eine **Admin-Rolle** (per Env-Variable `ADMIN_EMAILS` vergeben) einen geschützten Bereich unter `/admin` öffnen. | M | S |
| E22-4 | ✅ Als Admin will ich eine **Liste der Tester** sehen (Name, Rad, Gerät, Anzahl Fahrten, letzte Fahrt) und je Tester seine Fahrten. | M | M |
| E22-5 | ✅ (Tempo- und Genauigkeitsverlauf als Diagramm, Maus darüber zeigt die Stelle auf der Karte) Als Admin will ich eine **Fahrt auf der Karte** sehen: Spur, Pausen, GPS-Lücken, verworfene Punkte, Tempo- und Genauigkeitsverlauf, Ergebnis gegen den Ghost. | M | L |
| E22-6 | ✅ Als Admin will ich ein **Dashboard** mit Kennzahlen: aktive Tester pro Woche, Fahrten und Kilometer, Duelle und Siegquote, Anteil Fahrten mit Lücken, mittlere GPS-Genauigkeit, Akku pro Stunde (wo messbar), auffällige Fahrten, Aufteilung nach Gerät und Browser. | M | M |
| E22-7 | ✅ Als Admin will ich Fahrten als GPX/CSV herunterladen, um Fehler nachzustellen (z. B. im Simulator Q-2). | S | S |
| E22-8 | Als Admin will ich Widersprüche gegen die Cheating-Erkennung (E21-2) prüfen und eine Fahrt freigeben oder ablehnen. | S | M |
| E22-9 | Als Admin will ich Konten sperren oder löschen und Tester-Daten nach Ende der Testphase gesammelt löschen. | S | S |

**Datenschutz:** Nach dem Feldtest sieht der Adminbereich im Normalbetrieb nur noch **zusammengefasste** Zahlen. Einzelne Strecken bekommt der Admin dann nur noch bei gemeldeten oder auffälligen Fahrten zu sehen (E21-5, E22-8). Fahrten sind Standortdaten und damit personenbezogen.

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
| E11-6 | Als Fahrer will ich **Privatzonen**, die **standardmäßig an** sind: Start und Ende jeder geteilten oder öffentlichen Fahrt werden um einen zufälligen Radius (z. B. 300–800 m) gekürzt, und ich kann feste Zonen (Zuhause, Arbeit) anlegen. Muss fertig sein, bevor irgendetwas geteilt wird. | M | M |

### Epic E12: Konto und Backend
| ID | Story | Prio | Größe |
|---|---|---|---|
| E12-1 | ✅ (E-Mail und Google, Apple fehlt noch) Als Nutzer will ich mich **mit Google, mit Apple oder manuell** (E-Mail und Passwort) registrieren und anmelden, um teilen und mitspielen zu können. Ohne Konto funktioniert alles lokal weiter. | M | M |
| E12-5 | ✅ (ohne Privatzonen, die kommen mit E11-6) Als neuer Nutzer will ich im **Onboarding** meinen Chaser-Namen, mein Standardrad (Rennrad, Gravel, MTB, Trekking, E-Bike bis 25 km/h, S-Pedelec) und meine Privatzonen festlegen. | M | M |
| E12-6 | ✅ Als Fahrer will ich das Rad vor jeder Fahrt mit einem Tipp umstellen können, damit E-Bike-Fahrten getrennt gewertet werden. | M | S |
| E12-2 | Als Nutzer will ich meine Fahrten in die Cloud sichern und auf einem neuen Gerät wiederherstellen. | S | M |
| E12-3 | Backend: geteilte Ghosts speichern, Links erzeugen, Zugriffsrechte (nur per Link sichtbar). | M | M |
| E12-4 | Datenschutz: Einwilligung, Löschen des Kontos und aller Daten (DSGVO). | M | S |
| E12-7 | ✅ Technik: Social Login und Passwort. Umgesetzt ohne Bibliothek (scrypt, Sitzungs-Cookie, Google per OpenID Connect mit PKCE) auf SQLite im Volume `/data`; Umzug nach Postgres, sobald PostGIS gebraucht wird. Hinweis: „Mit Apple anmelden“ braucht ein Apple-Developer-Konto (99 $/Jahr). | M | M |

### Epic E17: Mehrere Chaser auf einer Strecke
| ID | Story | Prio | Größe |
|---|---|---|---|
| E17-1 | Als Fahrer will ich sehen, welche Chaser eine Strecke schon gefahren sind (Name, Zeit, Radklasse). | M | M |
| E17-2 | Als Fahrer will ich bis zu 5 benannte Ghosts gleichzeitig mitfahren lassen und einen davon als **Ziel** wählen. | M | L |
| E17-3 | Als Fahrer will ich während der Fahrt meinen Platz („3 von 6“) und den Abstand zum nächsten Ghost vor und hinter mir sehen. | S | M |
| E17-4 | Als Fahrer will ich nach der Fahrt sehen, wen ich überholt habe. | S | S |

### Epic E18: Teilen auf Social Media und Strava
| ID | Story | Prio | Größe |
|---|---|---|---|
| E18-1 | Als Fahrer will ich nach der Fahrt eine **Teilen-Karte** als Bild (Karte, Zeit, Abstand, Rang, „Challenge me“) erzeugen und über das Teilen-Menü in Instagram, WhatsApp usw. posten. | M | M |
| E18-2 | Als Empfänger will ich, dass ein Challenge-Link in Messengern eine Vorschau zeigt (Open-Graph-Bild vom Server). | S | M |
| E18-3 | Als Fahrer will ich mein Strava-Konto verbinden und Fahrten automatisch zu Strava hochladen, mit Ergebnis und Challenge-Link in der Beschreibung. | S | M |
| E18-4 | Als Fahrer will ich eigene Strava-Fahrten importieren und als **private** Ghosts nutzen (Strava erlaubt nicht, sie anderen zu zeigen). | C | M |

### Epic E23: Faire Abschnitts-Duelle (Teilstrecken)
Hintergrund und Regeln: [Teilstrecken fair werten](05-community-und-gamification.md#teilstrecken-fair-werten-abschnitte).

| ID | Story | Prio | Größe |
|---|---|---|---|
| E23-1 | Als Chaser will ich, dass Abschnitte **virtuelle Start- und Ziellinien** haben und die Zeit beim Überfahren automatisch startet und stoppt (fliegender Start, Auto-Pause gilt weiter), auch mitten in einer längeren Fahrt. | M | L |
| E23-2 | Als Chaser will ich, dass zu jeder Abschnittszeit die **Vorbelastung** gespeichert wird (Kilometer und Höhenmeter vorher an diesem Tag). Ab R1 schon mitschreiben, damit alte Fahrten später passen. | M | S |
| E23-3 | Als Chaser will ich bei fremden Ghosts die Vorbelastung sehen, z. B. „Anna · nach 49 km, 620 hm“. | M | S |
| E23-4 | Als Chaser will ich standardmäßig nur Ghosts und Bestenlisten mit ähnlicher Vorbelastung sehen (Wertungsklassen frisch unter 10 km, mittel 10–40 km, Ausdauer über 40 km), alle anderen aber wählen können. | M | M |
| E23-5 | Als Plattform will ich Abschnitte auf 1–10 km begrenzen und lange Strecken an natürlichen Grenzen teilen. | M | M |
| E23-6 | Optional: kleiner Zeitbonus je Vor-Kilometer (z. B. 0,1 % je 10 km, höchstens 3 %), erst nach Auswertung echter Daten aus dem Feldtest. | C | S |

### Epic E24: Radcomputer (Garmin, Wahoo)
| ID | Story | Prio | Größe |
|---|---|---|---|
| E24-1 | Als Fahrer mit Radcomputer will ich FIT- oder GPX-Dateien hochladen und als Fahrt und Ghost nutzen (Auto-Pause und Bewegungszeit rechnet re:chase selbst). | M | M |
| E24-2 | Als Fahrer will ich mein Garmin- oder Wahoo-Konto verbinden, damit neue Fahrten automatisch ankommen (Garmin Connect Developer Program und Wahoo Cloud API, beide mit Freigabe durch den Anbieter). | S | L |
| E24-3 | Als Fahrer will ich eine re:chase-Strecke als Kurs auf meinen Radcomputer schicken. | C | M |

### Epic E25: Kaltstart (genug Gegner)
| ID | Story | Prio | Größe |
|---|---|---|---|
| E25-1 | Als Plattform will ich mit **wenigen Klassen** starten: nur Muskelkraft und E-Bike; Wertungsklassen nach Vorbelastung (E23-4) erst aktivieren, wenn eine Strecke genug Fahrten hat (z. B. ab 20 Chasern). | M | S |
| E25-2 | Als Chaser will ich Freunde, meinen Radtreff oder Verein per **Einladungslink** in eine **Gruppe** holen, mit eigener Bestenliste auf unseren Strecken. | M | M |
| E25-3 | Als Gruppe will ich unsere Strecken gemeinsam sehen und gegeneinander chasen, auch wenn die Strecke öffentlich noch kaum gefahren wird. | S | M |

### Epic E26: Sicherheit im Straßenverkehr
| ID | Story | Prio | Größe |
|---|---|---|---|
| E26-1 | Als Plattform will ich, dass **Abfahrten** (z. B. mehr als 4 % Gefälle über 300 m) automatisch **keine Wettkampf-Abschnitte** werden. | M | M |
| E26-2 | Als Plattform will ich, dass Stadtstücke mit vielen Kreuzungen, Ampeln oder Fußgängerzonen (aus OpenStreetMap) **neutral** sind: kein Abschnitts-Duell, keine Krone, keine Punkte. | M | M |
| E26-3 | Als Chaser will ich einen Abschnitt als **gefährlich melden** können; ab wenigen Meldungen wird er vorläufig neutral, ein Admin entscheidet endgültig. | M | S |
| E26-4 | Als neuer Nutzer will ich einen kurzen **Sicherheitshinweis** (StVO gilt, nie aufs Display schauen müssen) und Nutzungsbedingungen mit Haftungshinweis bestätigen. Vor R3 rechtlich prüfen lassen. | M | S |
| E26-5 | Als Plattform will ich keine Töne oder Einblendungen, die zum Sprint auffordern, kurz vor Kreuzungen und Ampeln. | S | M |

### Epic E21: Anti-Cheat
| ID | Story | Prio | Größe |
|---|---|---|---|
| E21-1 | Als Chaser will ich, dass öffentliche Ghosts **plausibel** sind: Prüfung von Höchsttempo je Radklasse, Beschleunigung, Steigleistung und GPS-Sprüngen auf dem Server. | M | M |
| E21-2 | Als Fahrer will ich bei einer auffälligen Fahrt sehen, warum sie nicht gewertet wird, und die Radklasse korrigieren oder widersprechen können. | M | S |

Stand 27.10.: Die Prüfung läuft in der App nach jeder Fahrt. Auffällige Fahrten zählen nicht für Bestzeit, Ghost und Abschnitts-PRs, bis der Fahrer das Rad korrigiert oder widerspricht. Der Widerspruch gilt nur für die eigenen Bestzeiten; sobald Fahrten hochgeladen werden (E11), prüft der Server mit derselben Funktion aus `packages/core` und ein Widerspruch geht an den Admin.

---

## R3 – „Revier“

### Epic E19: Strecken und Gebiete erobern
| ID | Story | Prio | Größe |
|---|---|---|---|
| E19-1 | Als Chaser will ich eine öffentliche Strecke **erobern**, indem ich sie **komplett** von Start bis Ziel in der schnellsten gültigen Bewegungszeit meiner Radklasse fahre. Teilstücke zählen nur als Abschnitte (E23). | M | L |
| E19-7 | Als Chaser will ich auf jedem Abschnitt **Abschnitts-Kronen** holen (schnellste Zeit je Abschnitt, Radklasse und Wertungsklasse) und dafür Punkte bekommen, auch wenn ich nur ein Stück der Strecke fahre. | M | M |
| E19-2 | Als Besitzer will ich benachrichtigt werden, wenn meine Strecke erobert wurde, und den Ghost des Eroberers direkt jagen können. | M | M |
| E19-3 | Als Chaser will ich einen Besitzer gezielt **herausfordern**; er hat 7 Tage zum Verteidigen. | S | M |
| E19-4 | Als Chaser will ich auf der Karte **Gebiete** (Hexagone) in der Farbe ihres Besitzers sehen; ein Gebiet gehört dem, der dort die meisten Strecken hält. | S | L |
| E19-5 | Als Plattform will ich, dass Strecken ohne Verteidigung nach 6 Wochen „offen“ werden. | C | S |
| E19-6 | Sicherheit: Abfahrten und als gefährlich markierte Abschnitte zählen nicht für Besitz und Rangpunkte (gleiche Regeln wie E26). | M | M |

### Epic E20: Ränge, Badges und Punkte
| ID | Story | Prio | Größe |
|---|---|---|---|
| E20-1 | Als Chaser will ich einen **Rang** (Rookie bis Legende) je Radklasse, der auf Saison-Punkten beruht. | M | M |
| E20-2 | Als Chaser will ich **Badges** sammeln (z. B. neue Strecke freigeschaltet, erste Challenge angeboten, angenommen, gewonnen, eigenen Ghost besiegt) und sie in meinem Profil zeigen. | M | M |
| E20-3 | Als Chaser will ich Punkte für Eroberungen, Verteidigungen und beantwortete Challenges. | M | S |
| E20-4 | Als Chaser will ich **Rivalen** mit ähnlichem Tempo vorgeschlagen bekommen. | S | M |
| E20-5 | Als Chaser will ich Wochen-Missionen und Saisons mit Ranglisten-Reset. | C | M |

### Anti-Cheat Stufe 2 und 3 (Fortsetzung E21)
| ID | Story | Prio | Größe |
|---|---|---|---|
| E21-3 | Erkennung von **Straßenbahn und Bus** (Fahrt auf Gleisen oder Buslinien laut OpenStreetMap, Halte an Haltestellen) und **Auto** (für Räder gesperrte Straßen, Autotempo). | M | L |
| E21-4 | Bewegungssensor des Handys als Zusatzsignal (Vibrationsmuster am Lenker). | C | M |
| E21-5 | Als Chaser will ich eine verdächtige Fahrt melden können; Prüfung durch Admin. | S | M |

---

## Später

### Epic E13: Automatische Streckenerkennung
- Oft gefahrene Strecken und Teilstücke automatisch erkennen (Clustering überlappender Fahrten).
- Während der Fahrt erkennen, dass man auf ein **nicht angelegtes**, aber oft gefahrenes Teilstück einbiegt, und wie in E27 automatisch ein Duell anbieten. Gemerkte Strecken und Abschnitte deckt schon E27 ab.
- Teilstück-Bestzeiten, ohne dass Segmente manuell angelegt werden; dieselben virtuellen Linien und Regeln wie in E23.

### Epic E14: Native App (Capacitor-Wrapper der PWA)
- Tracking mit gesperrtem Bildschirm und im Hintergrund.
- Bluetooth-Sensoren auf iOS, automatischer Reconnect.
- Display dimmen und bei Ereignissen hochfahren.
- Audio-Ducking (Musik leiser statt unterbrechen), Barometer für Höhe.
- App-Store-Präsenz, Widgets / Live Activities.

### Garmin-Datenfeld (Fortsetzung E24)
- Connect-IQ-Datenfeld für Garmin-Radcomputer, das den Ghost-Abstand live anzeigt; eventuell später auch für Wahoo.

### Epic E15: Weitere Ideen
- Animierte Rennfahrer-Figur und Straßenverlauf passend zur echten Kurve.
- Sprachansagen.
- Apple Watch / Wear OS, Läufer-Modus mit Audio-Fokus.
- Clubs und Teams, die gemeinsam Gebiete halten; Staffel-Chase.
- Pendler-Liga, Gegenwind-Kontext in der Zusammenfassung, Ghost-Kommentare (siehe [Gamification](05-community-und-gamification.md#11-weitere-ideen)).

---

## Vorgeschlagene Reihenfolge

1. **Sprint 0:** R0 komplett, parallel Q-3 und Q-4.
2. **Sprint 1:** E1, E2, E9, Q-1 → man kann fahren und eine faire Zeit aufzeichnen.
3. **Sprint 2:** E3, E4-1 bis E4-3, Q-2 → Duell-Logik läuft im Simulator.
4. **Sprint 3:** E4-4 bis E4-7, E5-1/E5-2, E6-1, E8-1 → erste echte Duellfahrt.
5. **Sprint 4:** Rest der Must/Should aus R1 (inkl. E4-10, E4-11, E16, E27-1 bis E27-5 und E27-9).
   E23-2 (Vorbelastung mitschreiben) läuft schon hier mit, weil es klein ist und spätere Wertungsklassen auf alte Fahrten angewiesen sind.
6. **Vor dem Feldtest:** E14-0 (Hintergrund-GPS, native Hülle ja oder nein).
   **Feldtest:** E22-1 bis E22-6 vor dem Start, dann 2–3 Wochen mit 5–10 Fahrern; E22-7 bis E22-9 nach Bedarf.
7. **R2:** zuerst E12 (Konto, Onboarding, Radklasse) und E21-1/E21-2 (Plausibilität), weil fremde Ghosts erst mit beidem fair sind. Dann E11-6 (Privatzonen) vor allem anderen, was teilt, E25 (Gruppen), E26 (Sicherheit) vor E23, dann E11, E17, E23 (Abschnitts-Duelle mit fremden Ghosts) zusammen mit E27-6 bis E27-8, E24, E18.
8. **R3:** E19 und E20 zusammen, dazu E21-3 bis E21-5.
