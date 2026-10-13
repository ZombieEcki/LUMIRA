# Regenradar und Wetterwarnungen auf dem Spiegel

Eigenes Wettermodul `MMM-LumiraWeather` mit zwei unabhängigen Kacheln:

- **Regenradar** – Niederschlag rund um euren Ort, läuft automatisch durch:
  von „vorher“ (bis 2 h zurück) über **„jetzt“** bis zur **Vorhersage
  (+2 h)**, dann wieder von vorn. Mit Zeitleiste, Uhrzeit, Standort-Punkt
  und Legende (Leicht / Mäßig / Stark).
- **Wetterwarnungen** – die amtlichen Warnungen des DWD genau für euren Ort:
  Art (z. B. Gewitter, Sturmböen, Glätte), Warnstufe (Farbe), Beginn/Ende,
  Gebiet, auf Wunsch eine kurze Beschreibung.

Beide Kacheln sind halbtransparente „Glas“-Flächen; der Hintergrund bleibt
sichtbar. Einstellungen im Portal unter **Spiegel → Radar & Warnungen** –
sie wirken nach wenigen Sekunden auf dem Spiegel, ohne Neustart.

## 1. Einrichten

1. LUMIRA aktualisieren (Info → LUMIRA → Aktualisieren oder per SSH
   `cd ~/LUMIRA && git pull && ./install.sh`).
2. Portal → **Spiegel → Radar & Warnungen** → „Auf dem Spiegel zeigen“ an.
3. Regenradar und/oder Warnungen einzeln ein- oder ausschalten
   (nur Radar, nur Warnungen oder beides).
4. Position und Größe einstellen, dabei die **Vorschau** (Live-Bild vom
   Spiegel) beobachten.
5. Passt alles, das bisherige Regenradar unter Spiegel → Module
   („Regenradar“) ausschalten.

Der Standort kommt aus **Spiegel → Standort & Wetter** und wird automatisch
übernommen.

## 2. Einstellungen

| Bereich | Einstellung |
|---|---|
| Regenradar | Karte: **DWD** (schlicht, dunkel, Grenzen) oder **OpenStreetMap** (mit Straßen und Orten, dunkel eingefärbt) · Ausschnitt (sehr weit bis Ort, mit km-Angabe) · Durchlaufen an/aus · Zurück 0–2 h · Vorhersage 0–2 h · Tempo · Legende/Zeitleiste |
| Warnungen | Ohne Warnung: ausblenden oder dezenter Hinweis · ab Warnstufe (gelb/orange/rot/violett) · höchstens 1–6 Warnungen · Beschreibung an/aus |
| Je Kachel | **Position** (9 Felder: oben/mittig/unten × links/mittig/rechts) · **Abstand** waagerecht und senkrecht in px · **Breite** und **Höhe** in px · **Deckkraft** des Hintergrunds 0–100 % · **Schriftgröße** |

Die Abstände zählen vom gewählten Rand (z. B. „oben rechts“: Abstand vom
oberen und vom rechten Rand). Bei „mittig“ verschieben sie die Kachel von der
Mitte aus.

**Überschneidungen:** Der Spiegel prüft nach jeder Änderung, ob eine Kachel
Uhr, Familienplan, Kalender, Wetter, Nachrichten oder Sprüche überdeckt oder
über den Bildschirmrand ragt, und meldet das ins Portal (Hinweis unter der
Vorschau).

## 3. Datenquellen

Alles vom **Deutschen Wetterdienst** (Open Data, kostenlos, ohne Schlüssel,
Quellenangabe „DWD“ auf der Karte):

| Was | Quelle | Aktualisierung |
|---|---|---|
| Radar | WMS `maps.dwd.de/geoserver/dwd/wms`, Ebene `Niederschlagsradar` (Analyse + Vorhersage) | alle 5 min; angezeigt in 10-min-Schritten |
| Zeitachse | `…/dwd/Niederschlagsradar/ows?request=GetCapabilities` (≈ 40 KB) | alle 5 min |
| Warnungen | WFS `maps.dwd.de/geoserver/dwd/ows`, `Warnungen_Gemeinden`, Abfrage genau für den Standort | alle 5 min |
| Grundkarte DWD | WMS-Ebenen `Laender`, `Warngebiete_Kreise` | einmal je Ausschnitt |
| Grundkarte OSM | Kacheln von `tile.openstreetmap.org` (© OpenStreetMap-Mitwirkende) | vom Browser zwischengespeichert |

**Grenzen:** Der DWD liefert die Radar-Vorhersage für etwa **2 Stunden** –
mehr gibt es nicht. Radar und Warnungen gelten für Deutschland.

## 4. Technik

- `node_helper` holt Warnungen und Zeitachse alle 5 Minuten, die Anzeige
  lädt die Radarbilder direkt beim DWD (PNG, so groß wie die Kachel).
  Fehler blockieren nichts: Die Kachel behält den letzten Stand und zeigt,
  dass die Aktualisierung gerade nicht klappt.
- Einstellungen: `~/.lumira/weather.json` (nur das Portal schreibt),
  Rückmeldung zu Überschneidungen: `~/.lumira/weather-mirror.json` (nur der
  Spiegel schreibt).
- Kein Weichzeichner hinter den Kacheln (kostet den Raspberry Pi 3 zu viel).

## 5. Fehlerbehebung

| Problem | Abhilfe |
|---|---|
| Kacheln erscheinen nicht | „Auf dem Spiegel zeigen“ und die jeweilige Kachel an? Nach einem Update einmal `./install.sh` (das Modul muss in der config.js stehen). |
| Radar bleibt leer / „Radar gerade nicht verfügbar“ | Internet des Spiegels prüfen; `maps.dwd.de` muss erreichbar sein (Werbeblocker?). Kein Niederschlag = leere Karte, das ist richtig. |
| Karte verrutscht / falscher Ort | Standort unter Spiegel → Standort & Wetter neu suchen und speichern. |
| Keine Warnungen, obwohl die WarnWetter-App welche zeigt | „Ab Warnstufe“ prüfen; Warnungen gelten pro Gemeinde – der Standort muss in der richtigen Gemeinde liegen. |
| Animation ruckelt | Tempo „langsam“, Zurück/Vorhersage kürzen (weniger Bilder) oder Karte DWD statt OpenStreetMap. |

Logs: `pm2 logs MagicMirror` (Meldungen beginnen mit `MMM-LumiraWeather`).
