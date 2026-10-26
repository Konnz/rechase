# PWA-Machbarkeit: Was geht im Browser, was nicht?

**Kurzantwort:** Ja, eine PWA kann Geschwindigkeit, Distanz, Fahrzeit, Position und (grob) Höhe live tracken, und das reicht für den Kern von re:chase. Die Einschränkung ist eine andere: **Eine PWA trackt nur zuverlässig, solange sie im Vordergrund läuft und der Bildschirm an ist.** Für eine App, die ohnehin sichtbar am Lenker hängt, ist das akzeptabel, solange wir das Display aktiv wach halten. Bluetooth-Sensoren funktionieren auf Android, aber **nicht auf dem iPhone**.

Stand: Oktober 2026. Browser-Verhalten ändert sich; die Punkte unten sollten im ersten Tech-Spike auf echten Geräten (mind. 1 iPhone, 1 Android) bestätigt werden.

## Übersicht

| Fähigkeit | Android (Chrome) | iPhone (Safari / Homescreen-PWA) | Bedeutung für re:chase |
|---|---|---|---|
| GPS-Position (`watchPosition`) | ✅ ca. 1 Hz | ✅ ca. 1 Hz | Basis für alles |
| Geschwindigkeit (`coords.speed`) | ✅ meist geliefert, sonst `null` | ✅ meist geliefert | Direkt nutzbar, Fallback berechnen |
| Höhe (`coords.altitude`) | ⚠️ GPS-Höhe, ±10–30 m | ⚠️ GPS-Höhe, ±10–30 m | Live nur geglättet, Höhenmeter per DEM korrigieren |
| Barometer | ❌ keine Web-API | ❌ | Native Phase |
| Tracking bei gesperrtem Bildschirm / im Hintergrund | ❌ stoppt bzw. wird gedrosselt | ❌ stoppt | **Bildschirm muss an bleiben** |
| Bildschirm wach halten (Screen Wake Lock) | ✅ | ✅ (Safari 16.4+, als Homescreen-PWA zuverlässig ab iOS 18.4) | Pflicht im MVP |
| Display-Helligkeit steuern | ❌ | ❌ | Nur „schwarzer Spar-Modus“ möglich |
| Bluetooth-Sensoren (Web Bluetooth) | ✅ Puls, Leistung, Kadenz | ❌ nicht unterstützt | Sensoren im MVP nur Android |
| Töne (Web Audio) | ✅ | ✅ nach erster Berührung | Tonsignale machbar |
| Töne über laufende Musik mischen | ⚠️ meist ok | ⚠️ kann Musik unterbrechen; `navigator.audioSession` (Safari 17+) hilft | Testen |
| Vibration | ✅ | ❌ | Nur Bonus |
| Offline-Speicher (IndexedDB, Service Worker) | ✅ | ✅, als Homescreen-PWA dauerhaft | Fahrten lokal speichern |
| Push-Benachrichtigungen | ✅ | ✅ nur als Homescreen-PWA (iOS 16.4+) | Für „Dein Ghost wurde geschlagen“ |
| Teilen (Web Share API, Links) | ✅ | ✅ | Ideal für den Ghost-Kreislauf |

## Im Detail

### 1. Geschwindigkeit und Position
- `navigator.geolocation.watchPosition` mit `enableHighAccuracy: true` liefert auf beiden Plattformen etwa einen Punkt pro Sekunde.
- `coords.speed` (m/s) kommt vom GNSS-Chip und basiert auf dem Doppler-Effekt. Das ist bei freier Sicht recht genau (ca. ±0,5 km/h) und reagiert schneller als eine Berechnung aus zwei Positionen. Es kann aber `null` sein (Android ohne frischen Fix, Netzwerk-Ortung). **Fallback:** Geschwindigkeit aus Distanz/Zeit der letzten 3–5 Punkte, geglättet.
- `coords.accuracy` mitschreiben und Punkte mit > 25–30 m verwerfen. In Häuserschluchten und Wald springt GPS; ein einfacher Kalman- oder Median-Filter ist Pflicht.
- **Ergebnis für den Ghost-Abstand:** Auf Sekundenbasis ist das genau genug. Auf der Meter-Anzeige sollte man die Zahl auf ganze Meter runden und glätten, damit sie nicht zittert.

### 2. Höhe und Steigung
- `coords.altitude` ist reine GPS-Höhe (WGS84-Ellipsoid, nicht Meereshöhe) mit typischen Fehlern von 10–30 m. iOS liefert oft bessere Werte als Android, verlässlich ist beides nicht.
- Höhenmeter aus Roh-GPS summiert sind meist deutlich zu hoch (Rauschen wird als Anstieg gezählt).
- **Lösung:** Live nur stark geglättet mit Schwelle (z. B. erst ab 3 m Änderung zählen). Nach der Fahrt und für bekannte Strecken: Höhe aus einem Höhenmodell (SRTM/Copernicus DEM) entlang der Linie. Für eine **bekannte Strecke** kennen wir das Profil schon vorab, also kann die Steigung live aus dem Profil an der aktuellen Streckenposition kommen. Das ist sogar besser als ein Barometer.

### 3. Hintergrund und Bildschirmsperre (die größte Einschränkung)
- Es gibt **keine Web-API für Hintergrund-Standort**. Sobald der Bildschirm gesperrt wird oder die App in den Hintergrund geht, liefert iOS keine Positionen mehr; Android drosselt und stoppt nach kurzer Zeit.
- Gegenmaßnahmen im MVP:
  - **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`) hält den Bildschirm an. Muss nach jedem Sichtbarkeitswechsel neu angefordert werden.
  - Lücken erkennen und ehrlich behandeln: Fehlt ein Abschnitt, wird er auf der Strecke interpoliert und die Fahrt als „mit Lücke“ markiert. Gegen einen Ghost zählt sie nur, wenn die Lücke klein ist.
  - Nutzer klar informieren: „Bildschirm bleibt während der Fahrt an. Nicht sperren.“
- Für Pendler, die das Handy in die Tasche stecken, funktioniert die PWA **nicht**. Das ist das stärkste Argument für die spätere native App.

### 4. Akku
- Bildschirm dauerhaft an plus GPS kostet je nach Gerät etwa 10–20 % pro Stunde. Das ist für 1–2 h Fahrt ok, für 4 h knapp.
- Eine PWA kann die Helligkeit nicht regeln. Möglich ist ein **Spar-Modus**: fast schwarzer Screen mit nur der Abstandszahl (OLED spart dann deutlich), der bei Ereignissen (Überholen, Abstand < 5 s) kurz die volle Ansicht zeigt.
- Rendering sparsam halten: Fahrbühne mit 1–2 fps aktualisieren statt 60 fps, die Karte nur bei Bedarf neu zeichnen.

### 5. Bluetooth-Sensoren (Puls, Leistung, Kadenz)
- **Web Bluetooth** funktioniert in Chrome auf Android (und Desktop). Die Standard-Profile sind gut abgedeckt:
  - Herzfrequenz: Service `0x180D`
  - Cycling Power (Leistung, oft inkl. Kadenz): Service `0x1818`
  - Cycling Speed and Cadence: Service `0x1816`
- **Safari/iOS unterstützt Web Bluetooth nicht**, und Apple hat auch keine Pläne dafür angekündigt. Alle iOS-Browser nutzen WebKit, also hilft auch Chrome auf dem iPhone nicht. (Drittanbieter-Browser wie „Bluefy“ sind ein Workaround für Tester, aber nichts für Endnutzer.)
- Auch auf Android: Kopplung erfordert bei jedem Start einen Tipp (Gerät auswählen), Reconnect nach Verbindungsverlust ist umständlich. ANT+ geht gar nicht.
- **Folge:** Sensoren sind im MVP „Android-only, Beta“. Die Sensor-Kacheln in der Fahransicht blenden sich aus, wenn kein Sensor verbunden ist.

### 6. Tonsignale
- **Web Audio API**: kurze, synthetisierte Töne (kein Download nötig). Auf iOS muss der Audio-Kontext durch eine Nutzerberührung freigeschaltet werden, z. B. beim Tippen auf „Start“.
- Risiko: Auf iOS kann Web-Audio die Musik des Nutzers unterbrechen. Mit `navigator.audioSession.type = 'ambient'` (Safari 17+) lässt sich das abmildern; im Tech-Spike prüfen.
- Sprachansagen („Fünf Sekunden zurück“) per `speechSynthesis` sind möglich, aber Qualität und Verhalten schwanken; im MVP lieber feste Tonmuster.

### 7. Offline und Speicher
- **Service Worker** cacht die App selbst; sie startet ohne Netz.
- **IndexedDB** für Fahrten. Eine Stunde mit 1 Hz sind ca. 3.600 Punkte, also wenige hundert KB. Speicher ist kein Problem.
- iOS löscht Website-Daten nach 7 Tagen ohne Nutzung, aber **nicht** bei installierten Homescreen-PWAs. Daher: Installation aktiv anleiten und `navigator.storage.persist()` anfordern. Mittelfristig Backup in die Cloud oder GPX-Export.
- Fahrt **laufend** speichern (alle paar Sekunden), damit ein Absturz oder Tab-Reload keine Fahrt kostet.
- Kartenkacheln für eine gewählte Strecke vorab cachen, damit die Karte auch im Funkloch funktioniert.

### 8. Installation und Plattform
- iOS: „Zum Home-Bildschirm“ muss der Nutzer manuell über das Teilen-Menü machen. Erst dann gibt es Vollbild, dauerhaften Speicher und Push. → Eigener Onboarding-Schritt mit Anleitung.
- Android: Installations-Prompt (`beforeinstallprompt`) möglich.

## Was das für den Backlog bedeutet

1. **Tech-Spike zuerst (Sprint 0):** Minimal-PWA, die 60 min auf echten Geräten aufzeichnet, mit Wake Lock, und Punkte/Geschwindigkeit/Genauigkeit loggt. Ergebnis gegen einen Radcomputer vergleichen. Erst danach UI bauen.
2. **„Bildschirm an“ ist ein Feature, kein Bug:** Wake Lock, Lückenerkennung, Spar-Modus und Onboarding-Hinweis gehören in den MVP.
3. **Höhe aus dem Streckenprofil:** Für bekannte Strecken Steigung und Höhenmeter aus dem DEM, nicht aus GPS.
4. **Sensoren = Android-Beta:** Feature-Detection, iOS-Nutzer sehen einen Hinweis statt leerer Kacheln.
5. **Domänenlogik plattformneutral bauen**, damit die native App sie übernimmt.
6. **Native App (Capacitor) wird ausgelöst durch:** Wunsch nach Tracking mit gesperrtem Bildschirm, Sensoren auf iOS, Display-Dimmen, Apple-Watch/Wear-OS, Läufer-Zielgruppe.
