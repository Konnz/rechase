# Design-Referenzen

Exportierte Mockups aus dem Design-Tool. Sie sind **Referenz, kein Produktionscode**: Farben, Schriftgrößen, Abstände und Radien sollen in der App nachgebaut werden, das Markup selbst wird nicht übernommen.

Ansehen: im Ordner `mockups/` einen lokalen Server starten (`python3 -m http.server`) und die Datei im Browser öffnen.

| Datei | Inhalt |
|---|---|
| `mockups/Main.dc.html` | Fahransicht „Duell gegen die Bestzeit“: Abstand groß, Straße in Verfolgerperspektive, Mini-Karte, Kennzahlen-Kacheln, Auto-Pause-Hinweis |
| `mockups/Karte.dc.html` | Karte im Folgemodus: große Karte mit Fahrer- und Ghost-Position, Bottom-Sheet mit Abstand und drei Kennzahlen |
| `mockups/Figuren.dc.html` | Vier Varianten für Fahrer- und Ghost-Figur (Pfeil, Lichtpunkt, Plakette, Rennfahrer) |
| `mockups/Figur.dc.html` | Die Figur als Einzelkomponente (wird von den anderen Dateien eingebunden) |

## Design-Tokens (aus den Mockups abgelesen)

| Token | Wert | Verwendung |
|---|---|---|
| `bg` | `#0D0F12` | Seitenhintergrund |
| `surface` | `#171A1F` | Kacheln, Bottom-Sheet |
| `surface-2` | `#111418` / `#12151A` | Fahrbühne, Karte |
| `text` | `#F2F4F7` | Primärtext |
| `text-muted` | `#9AA3AF` | Labels, Einheiten |
| `you` | `#FF7A1A` (Alternativen `#E8FF4A`, `#FF5C8A`) | Fahrer |
| `ghost` | `#A9C1FF` (Alternativen `#7FE3FF`, `#D7D9E0`) | Ghost / Bestzeit |
| `rec` | `#FF453A` | Aufnahme-Punkt |
| Schrift Zahlen | Barlow Condensed 600/700 | Werte (64 px Abstand, 42 px Kacheln) |
| Schrift Text | Barlow 400–600 | Labels, Fließtext |
| Radien | 14–20 px | Kacheln, Bühne |

Ghost-Darstellung: gleiche Form wie der Fahrer, aber 30 % Deckkraft und gestrichelte Kontur in der Ghost-Farbe.
