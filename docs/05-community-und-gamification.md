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
- Jede öffentliche Strecke hat genau **einen Besitzer**: den Chaser mit der schnellsten gültigen Bewegungszeit in seiner Radklasse (siehe 6). Dafür muss die Strecke **komplett** gefahren werden; Teilstücke zählen als Abschnitte (siehe unten).
- Wer die Zeit schlägt, **erobert** die Strecke. Der bisherige Besitzer bekommt eine Benachrichtigung („Deine Hausrunde Isar wurde erobert, hol sie dir zurück!“) mit dem Ghost des Eroberers.
- **Herausfordern:** Du kannst einem Besitzer eine Challenge schicken („Re: Hausrunde Isar“). Er hat zum Beispiel 7 Tage Zeit, zu verteidigen.
- **Verteidigen statt horten:** Fährt der Besitzer seine Strecke 6 Wochen nicht, wird sie „offen“. Die Zeit bleibt stehen, aber jeder, der unter 105 % davon bleibt, übernimmt sie. So bleiben Strecken lebendig.

### Teilstrecken fair werten (Abschnitte)

**Problem:** Eine ganze Strecke von Start bis Ziel zu fahren ist selten, außer auf der eigenen Hausrunde. Häufiger fährt man nur ein Stück einer fremden Strecke mit. Wer aber nach 50 km in den Beinen auf dem letzten Kilometer von jemandem mit frischen Beinen geschlagen wird, verliert unfair.

**Lösung in vier Teilen:**

1. **Virtuelle Start- und Ziellinien mit fliegendem Start.** Abschnitte haben feste Linien quer zur Straße. Die Zeit läuft, sobald man die Startlinie überfährt, und stoppt an der Ziellinie, ganz automatisch. Niemand muss an einem Punkt anhalten oder einen Knopf drücken. Man kann also mitten in einer langen Runde durch einen Abschnitt fahren, und er wird gewertet. Die Auto-Pause gilt auch hier, Ampeln innerhalb des Abschnitts zählen also nicht.
2. **Vorbelastung mitspeichern und zeigen.** Zu jeder Abschnittszeit speichern wir, wie viele Kilometer und Höhenmeter der Fahrer an diesem Tag vorher schon gefahren war. Ghosts zeigen das an, zum Beispiel „Anna · nach 49 km, 620 hm“. Es gibt drei **Wertungsklassen**:
   - **Frisch:** weniger als 10 km davor
   - **Mittel:** 10 bis 40 km davor
   - **Ausdauer:** mehr als 40 km davor

   Standardmäßig bekommst du nur Ghosts mit ähnlicher Vorbelastung als Gegner und als Bestenliste. Alle anderen kann man trotzdem wählen. Optional und erst nach Tests mit echten Daten: ein kleiner Zeitbonus je Vor-Kilometer (z. B. 0,1 % je 10 km, höchstens 3 %).
3. **Abschnitte für alle, Strecken nur komplett.** Abschnittszeiten kann jeder holen, mitten in jeder Fahrt. Dafür gibt es Punkte und **Abschnitts-Kronen** (schnellste Zeit je Abschnitt, Radklasse und Wertungsklasse). Eine **Strecke erobern** kann dagegen nur, wer sie komplett von Start bis Ziel fährt. Damit bleibt das Revier denen, die sich die ganze Runde vornehmen.
4. **Abschnitte sind 1 bis 10 km lang.** Kürzer als 1 km macht GPS-Ungenauigkeit (ein paar Meter an den Linien) einen zu großen Anteil aus, länger als 10 km fährt man selten zufällig komplett mit. Lange Strecken werden in mehrere Abschnitte geteilt, an natürlichen Grenzen wie Kreuzungen, Anstiegen und Kurven.

Mit der späteren automatischen Streckenerkennung (E13) entstehen Abschnitte von selbst dort, wo viele Chaser fahren.

### Gebiete
- Gebiete sind Kacheln auf der Karte (z. B. Hexagone mit ca. 1 km Durchmesser, H3-Raster) oder Stadtteile.
- Ein Gebiet gehört dem Chaser, der dort **die meisten Strecken besitzt**. Gleichstand: wer zuerst dort war.
- Auf der Karte erscheinen Gebiete in der Farbe ihres Besitzers. Das ist der „Risiko“-Moment: Man sieht, was man holen kann.
- Später können **Teams oder Clubs** gemeinsam Gebiete halten.

### Sicherheitsregeln für Eroberungen
- **Abfahrten zählen nicht** für Besitz und Rangpunkte (Abschnitte mit mehr als ca. 4 % Gefälle über 300 m werden neutralisiert). Das ist die Lehre aus den Strava-Abfahrts-KOMs.
- Stadtstücke mit vielen Kreuzungen, Ampeln oder Fußgängerzonen werden **neutral**: kein Abschnitts-Duell, keine Krone, keine Punkte. Auf einer ganzen Strecke läuft die Zeit dort weiter, aber nur im Durchschnittstempo der Strecke, sodass Rasen dort nichts bringt.
- Chaser können Abschnitte als **gefährlich melden**; nach wenigen Meldungen werden sie vorläufig neutral.
- Ein kurzer **Sicherheitshinweis** im Onboarding und Nutzungsbedingungen mit Haftungshinweis, vor R3 rechtlich geprüft.
- Die faire Auto-Pause hilft hier sogar: Wer an der roten Ampel hält, verliert keine Zeit, es gibt also keinen Grund, durchzufahren.

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

Umgesetzt in `packages/core/src/plausibility.ts` (läuft in der App, später unverändert auf dem Server). Grenzen, an der Probefahrt mit dem Pixel 10 Pro gegengeprüft (dort höchstens 28 km/h über 30 s und 22 km/h über 5 min):

| | Muskelkraft | E-Bike | S-Pedelec |
|---|---|---|---|
| 30 s Bewegungszeit, jede Steigung | 80 km/h | 80 km/h | 80 km/h |
| 30 s, ohne Gefälle (ab −2 %) | 60 km/h | 45 km/h | 60 km/h |
| 5 min, ohne Gefälle | 48 km/h | 33 km/h | 52 km/h |
| Steigleistung über 5 min, ab 100 Hm | 1.800 m/h | 3.200 m/h | 4.000 m/h |
| 0 auf 40 km/h, danach 10 s über 35 km/h | unter 5 s | unter 5 s | unter 5 s |
| Positionssprung über eine Lücke ab 5 s und 200 m | über 80 km/h | über 80 km/h | über 80 km/h |

Höhen kommen vorerst aus dem GPS, mit gleitendem Median gegen Sprünge; fehlen sie, gilt die Strecke als flach. Fällt eine Fahrt auf, wird geprüft, ob sie zu einer anderen Klasse passt, und diese vorgeschlagen; passt sie zu keiner, lautet der Hinweis „Auto oder Bahn“. Stadtverkehr bis 50 km/h mit Halten (Tram, Bus, Auto) erkennt erst Stufe 2.

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
