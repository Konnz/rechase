# re:chase – Community, Gamification und Fairness (Entwurf v0.1, 27.10.2026)

Dieses Dokument sammelt alles, was aus dem Solo-Duell ein Spiel mit anderen macht: mehrere Chaser pro Strecke, Strecken erobern, Ränge, Badges, Punkte, Tonsignale, Radklassen, Anti-Cheat und Teilen (auch auf Strava). Die Einordnung in Releases steht im [Backlog](03-backlog.md).

Leitplanke für alles hier: **Fairness vor Spektakel.** Die faire Auto-Pause ist der Kern von re:chase. Gamification darf das nicht untergraben, also keine Punkte für Rasen an Ampeln, an Kreuzungen oder bergab.

---

## 1. Mehrere Chaser auf einer Strecke

- Auf einer beliebten Strecke fahren mehrere **benannte Ghosts** mit: zum Beispiel deine Bestzeit, der aktuelle Besitzer der Strecke, dein Rivale und Freunde.
- Vor dem Start wählst du bis zu **5 Ghosts** aus einer Liste („Wer ist hier schon gefahren?“, sortiert nach Zeit und nach Nähe zu deinem Tempo).
- Ein Ghost ist das **Ziel** (hervorgehoben, auf ihn bezieht sich die große Abstandszahl), die anderen sind Statisten mit Namensschild.
- Darstellung: Alle fremden Ghosts tragen die Ghost-Familie (hellblau, transparent, gestrichelt), nur das Namensschild unterscheidet sie. Dein eigener Ghost bekommt eine zweite Ghost-Farbe (z. B. `#7FE3FF`).
- Abstandsanzeige: groß der Abstand zum Ziel-Ghost, klein „Platz 3 von 6“ und der Abstand zum nächsten Ghost vor und hinter dir.

## 2. Eigenen Ghost wählen: letzte Fahrt, Durchschnitt, Bestzeit

| Modus | Bedeutung | Gut für |
|---|---|---|
| **Letzte Fahrt** | Deine vorige Fahrt auf dieser Strecke | „Heute besser als gestern“ |
| **Durchschnitt** | Mittel deiner letzten N Fahrten (Standard 5) | Realistischer Gegner an normalen Tagen |
| **Bestzeit** | Dein persönlicher Rekord | Volle Attacke |

Technisch ist der Durchschnitt ein **gemittelter Ghost**: Für jede Distanz entlang der Strecke wird die Bewegungszeit der letzten N Fahrten gemittelt. Das passt direkt zum bestehenden Ghost-Modell (Distanz → Bewegungszeit) in `packages/core`.

Zusätzliche Idee: **Ultimativer Ghost**, zusammengesetzt aus deinen besten Abschnitten. Er ist die theoretische Bestzeit und damit der härteste Gegner.

## 3. Strecken und Gebiete erobern

### Strecken
- Jede öffentliche Strecke hat genau **einen Besitzer**: den Chaser mit der schnellsten gültigen Bewegungszeit in seiner Radklasse (siehe 6).
- Wer die Zeit schlägt, **erobert** die Strecke. Der bisherige Besitzer bekommt eine Benachrichtigung („Deine Hausrunde Isar wurde erobert, hol sie dir zurück!“) mit dem Ghost des Eroberers.
- **Herausfordern:** Du kannst einem Besitzer eine Challenge schicken („Re: Hausrunde Isar“). Er hat zum Beispiel 7 Tage Zeit, zu verteidigen.
- **Verteidigen statt horten:** Fährt der Besitzer seine Strecke 6 Wochen nicht, wird sie „offen“. Die Zeit bleibt stehen, aber jeder, der unter 105 % davon bleibt, übernimmt sie. So bleiben Strecken lebendig.

### Gebiete
- Gebiete sind Kacheln auf der Karte (z. B. Hexagone mit ca. 1 km Durchmesser, H3-Raster) oder Stadtteile.
- Ein Gebiet gehört dem Chaser, der dort **die meisten Strecken besitzt**. Gleichstand: wer zuerst dort war.
- Auf der Karte erscheinen Gebiete in der Farbe ihres Besitzers. Das ist der „Risiko“-Moment: Man sieht, was man holen kann.
- Später können **Teams oder Clubs** gemeinsam Gebiete halten.

### Sicherheitsregeln für Eroberungen
- **Abfahrten zählen nicht** für Besitz und Rangpunkte (Abschnitte mit mehr als ca. 4 % Gefälle über 300 m werden neutralisiert). Das ist die Lehre aus den Strava-Abfahrts-KOMs.
- Abschnitte mit vielen Kreuzungen oder durch verkehrsberuhigte Zonen können als „neutral“ markiert werden. Die Zeit läuft dort, aber nur im Durchschnittstempo der Strecke, sodass Rasen dort nichts bringt.

## 4. Ränge

Ränge zeigen, wie erfolgreich jemand ist, nicht nur wie schnell. Vorschlag mit sechs Stufen und thematischen Namen:

| Rang | Bedingung (Beispiel) |
|---|---|
| **Rookie** | Registriert, erste Fahrt |
| **Chaser** | 10 Duelle gefahren |
| **Jäger** | 3 Strecken erobert |
| **Revierchef** | ein Gebiet gehalten |
| **Phantom** | 25 Strecken gleichzeitig im Besitz |
| **Legende** | Top 1 % der Saison |

- Grundlage ist **Saison-XP** (siehe 7). Saisons laufen ein Quartal, danach werden die Ränge neu ausgefahren. Badges bleiben für immer.
- Ränge gelten je Radklasse (Bio und E-Bike getrennt).

## 5. Badges

Badges belohnen Meilensteine und lenken auf Funktionen, die man sonst übersieht.

| Gruppe | Badges |
|---|---|
| **Erste Schritte** | Erste Fahrt · Erste Strecke gemerkt · Neue Strecke freigeschaltet · Erster Ghost geteilt |
| **Duell** | Eigenen Ghost besiegt · Durchschnitt geschlagen · Ultimativen Ghost geschlagen · Knapp! (mit weniger als 1 s gewonnen) · Aufholjagd (mehr als 20 s Rückstand gedreht) |
| **Challenges** | Erste Challenge angeboten · Erste Challenge angenommen · Erste Challenge gewonnen · Re:Re:Re: (dreimal hin und her) |
| **Revier** | Erste Strecke erobert · Strecke verteidigt · Gebiet gehalten · 10 Strecken im Besitz |
| **Ausdauer** | Wochenserie 4 / 12 / 52 · 100 km im Monat · Bei Regen gefahren (Wetterdaten) · Frühaufsteher (Start vor 6 Uhr) |
| **Fair Play** | Ampel-Zen (10 Ampelstopps in einer Fahrt und trotzdem Bestzeit) · Gentle Chaser (Challenge verloren und trotzdem geantwortet) |

Badges werden in der Zusammenfassung nach der Fahrt kurz eingeblendet, nie während der Fahrt.

## 6. Radklassen (Onboarding)

Damit E-Bikes nicht gegen Muskelkraft antreten, gibt es Radklassen:

| Klasse | Typen | Wertung |
|---|---|---|
| **Muskelkraft** | Rennrad, Gravel, MTB, Trekking/Stadtrad | gemeinsame Wertung, filterbar nach Typ |
| **E-Bike** | Pedelec bis 25 km/h | eigene Wertung |
| **S-Pedelec** | bis 45 km/h | eigene Wertung |

- Im Onboarding gibst du dein **Standardrad** an. Viele haben mehrere Räder, deshalb lässt es sich **pro Fahrt** vor dem Start umstellen (ein Tipp, Vorauswahl = zuletzt genutzt).
- Strecken-Besitz, Ränge und Ranglisten gelten je Klasse. Wer gegen einen Ghost einer anderen Klasse fährt, darf das (Spaß), aber es zählt nicht für Besitz und Rang.
- Die Anti-Cheat-Plausibilität (unten) prüft auch, ob die Fahrt zur gewählten Klasse passt.

## 7. Punkte (XP) und Ziele

Punkte machen jede Fahrt wertvoll, auch wenn man den Ghost nicht schlägt.

| Quelle | Punkte (Beispiel) |
|---|---|
| Jeder bewegte Kilometer | 10 |
| Ghost geschlagen | 50, gegen Bestzeit 100 |
| **Abschnitts-PR** (persönlicher Rekord auf einem Teilstück) | 20 je Abschnitt |
| Fahrtziel erreicht (siehe unten) | 30 je Ziel |
| Strecke erobert / verteidigt | 200 / 100 |
| Challenge beantwortet (auch verloren) | 25 |
| Wochenserie gehalten | 50 |

**Fahrtziele** werden vor der Fahrt vorgeschlagen (maximal drei, einer davon passt zum Tagesform-Modus):
- „Bleib die ganze Strecke unter 10 s Rückstand“
- „Negativer Split: zweite Hälfte schneller als die erste“
- „Konstant: Abstand schwankt höchstens ±5 s“
- „Hol am Anstieg X 5 s raus“
- „Schlag deinen Durchschnitt“

Punkte gibt es **nur für Bewegungszeit-Leistungen**. Standzeit und Ampeln sind immer neutral.

## 8. Tonsignale und Mini-Belohnungen während der Fahrt

Während der Fahrt soll man nicht aufs Display schauen müssen. Deshalb gibt es eine kleine, konsistente **Klangsprache** (kurz, unter 400 ms, nicht nervig):

| Ereignis | Klang |
|---|---|
| Ghost überholt | zwei Töne steigend (hell) |
| Vom Ghost überholt | zwei Töne fallend (dunkel) |
| Abstand schrumpft unter 5 s | leises Ticken, wird schneller, je näher („Geigerzähler“) |
| Jeder volle Kilometer in Führung | einzelner kurzer Glockenton |
| Abschnitt beginnt / endet | kurzer Doppelklick / Akkord |
| Abschnitts-PR | kleiner Dreiklang mit „+20“-Einblendung |
| Fahrtziel erreicht | aufsteigende Tonfolge |
| Letzte 500 m | Countdown-Pieptöne bei 500, 300, 100 m |
| Auto-Pause an / aus | sehr leises „Klack“ (abschaltbar) |

- Punkte erscheinen während der Fahrt nur als **kurzes „+20“** am Rand der Straßenansicht (1,5 s), die Summe erst in der Zusammenfassung.
- Lautstärke und einzelne Klänge in den Einstellungen abschaltbar. Später optional Sprachansagen („Fünf Sekunden zurück“).
- Hinweis aus der Machbarkeit: Auf iOS muss der Ton beim Start einmal per Tipp freigeschaltet werden, und Web-Audio kann laufende Musik unterbrechen.

## 9. Anti-Cheat

Sobald andere Chaser Ghosts sehen und Strecken erobern, lohnt sich Schummeln. Erkennung in Stufen, alle auf dem Server, damit sie nicht umgangen werden kann:

**Stufe 1: Plausibilität (ab R2, Pflicht vor jeder öffentlichen Wertung)**
- Höchsttempo je Klasse: z. B. Muskelkraft mehr als 60 km/h über 30 s auf flachem Stück, E-Bike dauerhaft über 30 km/h, alles über 80 km/h.
- **Steigleistung (VAM):** Auf Anstiegen sind mehr als ca. 1.800 Höhenmeter pro Stunde für Muskelkraft unrealistisch. Höhen kommen aus dem Höhenmodell, nicht aus GPS.
- Beschleunigung: Sprünge von 0 auf 40 km/h in 3 s passen zu Auto, nicht zu Rad.
- Teleport: GPS-Lücken mit unmöglicher Durchschnittsgeschwindigkeit.

**Stufe 2: Kontext (R3)**
- **Straßenbahn und Bus:** Fahrt liegt auf Gleisen oder Buslinien (OpenStreetMap) und hält regelmäßig an Haltestellen für 15 bis 40 s.
- **Auto:** Fahrt nutzt Straßen, die für Räder gesperrt sind (Autobahn, Kraftfahrstraße), oder verläuft auf Abschnitten ohne Radweg mit Autotempo.
- **Bewegungssensor:** Das Handy am Lenker vibriert beim Radfahren in einem typischen Muster (DeviceMotion, im Vordergrund auch in der PWA verfügbar). Ein Auto oder eine Bahn fühlt sich anders an. Das ist ein Zusatzsignal, kein alleiniges Urteil.
- Puls oder Leistung, wenn ein Sensor gekoppelt ist: 40 km/h bergauf mit 80 bpm ist auffällig.

**Stufe 3: Community (R3)**
- „Fahrt melden“ an fremden Ghosts, Prüfung durch Admin.

**Folgen:** Eine auffällige Fahrt wird **nicht gelöscht**, sie bleibt privat sichtbar, zählt aber nicht für Besitz, Rang und öffentliche Ghosts. Der Fahrer sieht „In Prüfung“ und kann widersprechen (z. B. „falsche Radklasse gewählt“ und dann umstellen). Kein öffentliches Anprangern.

## 10. Teilen auf Social Media und Strava

### Social Media allgemein
- **Teilen-Karte als Bild:** Nach der Fahrt erzeugt die App ein Bild (Karte der Strecke, Zeit, Abstand zum Ghost, Rang, „Challenge me“-Code). Über die Web Share API landet es direkt in Instagram-Story, WhatsApp, Signal und so weiter. Das geht in der PWA auf iOS und Android.
- **Challenge-Link mit Vorschau:** Der Link `rechase.konnerths.de/c/<code>` zeigt in Messengern eine Vorschaukarte (Open-Graph-Bild, vom Server erzeugt). Wer tippt, landet direkt in der Ghost-Vorschau und kann die Challenge annehmen.
- Datenschutz: Start und Ende werden gekürzt (Privatzonen), damit der Wohnort nicht sichtbar ist.

### Strava: was geht, was nicht

**Das geht:**
- **Fahrt zu Strava hochladen** (Upload-API, Recht `activity:write`). Die Aktivität erscheint im Strava-Feed des Fahrers. In die Beschreibung schreiben wir Ergebnis und Challenge-Link, z. B. „re:chase Hausrunde Isar: Ghost um 12 s geschlagen. Re: mich hier → rechase.konnerths.de/c/AB12“. Das ist der wichtigste Wachstumskanal, weil Strava-Freunde den Link im Feed sehen.
- **Eigene Strava-Fahrten importieren** und als **eigene Ghosts** nutzen (nur für den Fahrer selbst sichtbar).

**Das geht nicht oder nur eingeschränkt:**
- Strava-Daten eines Nutzers **anderen Nutzern zeigen** verbietet Stravas API-Vereinbarung (seit Ende 2024). Ein aus Strava importierter Ghost darf also nicht öffentlich werden und keine Strecke erobern. Öffentliche Ghosts müssen mit re:chase aufgezeichnet sein.
- **Fotos oder Bilder** kann man über die öffentliche API nicht an Aktivitäten hängen. Die Teilen-Karte geht also nicht automatisch zu Strava, nur der Text mit Link.
- Strava-Segmente und ihre Bestenlisten sind für Apps nicht nutzbar.
- Neue Strava-Apps sind zunächst auf sehr wenige verbundene Athleten begrenzt und müssen für mehr Nutzer bei Strava eine Freigabe beantragen. Dazu kommen Abfragelimits (einige hundert Anfragen pro 15 Minuten). Für Uploads reicht das gut.

Die Strava-Bedingungen ändern sich gelegentlich und sollten vor der Umsetzung noch einmal geprüft werden.

## 11. Weitere Ideen

- **Rivalen:** Die App schlägt automatisch Chaser mit ähnlichem Tempo auf deinen Strecken vor. Knappe Duelle machen mehr Spaß als hoffnungslose.
- **Wochenserie mit Joker:** Mindestens eine Duellfahrt pro Woche hält die Serie, ein Joker pro Monat rettet Urlaubswochen.
- **Wochen-Missionen:** „Fahre 3 verschiedene Strecken“, „Schlag 2 fremde Ghosts“, „Erobere ein neues Gebiet“.
- **Gegenwind-Kontext:** Die Zusammenfassung zeigt Wind und Temperatur (Wetterdienst). Das ändert nicht die Wertung, erklärt aber eine schlechte Zeit („16 km/h Gegenwind auf dem Rückweg“).
- **Pendler-Liga:** eigene Wochenwertung für Arbeitswege. Wer täglich pendelt, sammelt so viele Duelle.
- **Revanche-Knopf:** Nach einer verlorenen Challenge gleich „Revanche“ setzen, der Gegner bekommt Bescheid.
- **Ghost-Kommentar:** Der Besitzer einer Strecke kann seinem Ghost einen kurzen Spruch mitgeben, der beim Überholen eingeblendet wird.
- **Saisonfinale:** Am Ende einer Saison eine Woche mit doppelten Punkten auf den beliebtesten Strecken der Stadt.
- **Clubs:** Teams halten gemeinsam Gebiete und sehen eine Team-Karte.
- **Staffel-Chase:** Freunde fahren eine Strecke nacheinander, der Ghost des Vorgängers ist jeweils der nächste Gegner. Am Ende zählt die Team-Summe.
