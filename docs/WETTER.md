# Wetter auf dem Spiegel

Eigenes Wettermodul `MMM-LumiraWeather` mit drei unabhängigen Kacheln:

- **Wetteranzeige** – aktuelles Wetter und Vorhersage in einem von
  **12 Designs** (Portal: **Spiegel → Wetteranzeige**).
- **Regenradar** – Niederschlag rund um euren Ort, läuft automatisch durch:
  von „vorher“ (bis 2 h zurück) über **„jetzt“** bis zur **Vorhersage
  (+2 h)**, dann wieder von vorn. Mit Zeitleiste, Uhrzeit, Standort-Punkt
  und Legende (Leicht / Mäßig / Stark).
- **Wetterwarnungen** – die amtlichen Warnungen des DWD genau für euren Ort:
  Art (z. B. Gewitter, Sturmböen, Glätte), Warnstufe (Farbe), Beginn/Ende,
  Gebiet, auf Wunsch eine kurze Beschreibung.

Radar und Warnungen stellt ihr unter **Spiegel → Radar & Warnungen** ein.
Alle Kacheln sind frei platzierbar und halbtransparent; Änderungen wirken nach
wenigen Sekunden auf dem Spiegel, ohne Neustart.

## 1. Wetteranzeige einrichten

1. LUMIRA aktualisieren (Info → LUMIRA → Aktualisieren oder per SSH
   `cd ~/LUMIRA && git pull && ./install.sh`).
2. Portal → **Spiegel → Wetteranzeige** → „Auf dem Spiegel zeigen“ an.
   Die neue Anzeige kommt ausgeschaltet; das bisherige Wetter bleibt, bis
   ihr es abschaltet.
3. **Design** wählen: Die Auswahl zeigt alle 12 Designs mit den echten
   Wetterdaten von gerade eben. Beim Wechsel wird die empfohlene Breite
   gesetzt, danach ist sie frei änderbar.
4. **Angezeigte Werte** an- oder abhaken, Vorhersage-Tage und Windeinheit
   wählen.
5. **Aussehen**, Position und Größe einstellen und dabei die **Vorschau**
   beobachten: oben das Design in echter Größe, darunter das Live-Bild vom
   Spiegel.
6. Läuft alles, das bisherige Wetter unter **Spiegel → Module** („Wetter“)
   ausschalten. Solange beide an sind, weist die Seite darauf hin.

Der Standort kommt aus **Spiegel → Standort & Wetter**.

## 2. Die 12 Designs

| Nr. | Design | Inhalt |
|---|---|---|
| 1 | Klassisch | Ort, großes Symbol, Temperatur, gefühlt, Vorhersage mit Höchst-/Tiefstwerten ab heute |
| 2 | Kompakt minimal | wie 1, mittig, Vorhersage ab morgen nur mit Höchstwerten |
| 3 | Modern mit Karte | Ort, Temperatur, gefühlt in einer hellen Karte mit großem Symbol, darunter die Vorhersage |
| 4 | Vertikal / schmal | alles untereinander, Vorhersage als Liste – für schmale Ränder |
| 5 | Transparent minimal | großes Symbol und Temperatur, Ort darunter, Vorhersage ab morgen |
| 6 | Detailliert mit Infos | dazu Luftfeuchtigkeit, Wind, Luftdruck, UV-Index (und auf Wunsch Regen, Sonnenzeiten, Datum/Uhrzeit) |
| 7 | Horizontale Leiste | alles in einer flachen Zeile |
| 8 | Kreis-Design | Ring: wo liegt die Temperatur gerade zwischen Tagestief und Tageshoch |
| 9 | Modern mit Hintergrund | Landschaftsbild passend zum Wetter (siehe unten), darüber Werte und Vorhersage |
| 10 | Klar & groß | sehr großes Symbol und Temperatur, Ort daneben |
| 11 | Icon-only | nur die Vorhersage: Tag, Symbol, Höchstwert |
| 12 | Elegant mit Details | breit: Temperatur, Messwerte mit Symbolen, Vorhersage |

**Abweichungen von der Konzeptgrafik**

- *Kreis-Design:* Die Grafik lässt offen, was der Ring zeigt. Er zeigt die
  aktuelle Temperatur zwischen Tagestief und Tageshoch (beide stehen am Ring).
- *Modern mit Hintergrund:* neun eigene Bilder statt eines festen Fotos:
  sonnig, heiter, bewölkt, Regen, Gewitter, Schnee, Nebel, Morgen-/Abendrot
  (bei klarem Himmel rund um Sonnenauf- und -untergang) und Abenddämmerung
  (klare Nacht). Nachts werden die Wetterbilder abgedunkelt. Die Deckkraft des
  Bildes ist einstellbar (Aussehen).
- *Detailliert:* Datum und Uhrzeit sind abschaltbar (Standard: aus), weil sie
  die Uhr doppeln.
- Detailwerte (Luftfeuchtigkeit, Wind, Luftdruck, UV, Sonne) zeigen die
  Designs 6 und 12; die Regenwahrscheinlichkeit pro Tag zeigen alle Designs
  mit Vorhersage. Was ein Design nicht vorsieht, ist im Portal ausgegraut.
- Wettersymbole: farbige „Meteocons“ von Bas Milius (MIT-Lizenz, liegt in
  `icons/LICENSE`), unbewegt – Animationen wären zu teuer für den Pi 3.

## 3. Einstellungen

| Bereich | Einstellung |
|---|---|
| Wetteranzeige | Design · Werte: Ort, gefühlte Temperatur, Wetterbeschreibung, Nachkommastelle, Luftfeuchtigkeit, Wind, Luftdruck, UV-Index, Regen, Sonnenauf-/-untergang, Datum/Uhrzeit, Stand der Daten · Vorhersage 2–7 Tage · Wind in km/h, m/s oder Beaufort · Aktualisieren alle 10/15/30/60 min · Innenabstand · Rahmen · Schatten · Deckkraft des Bildes (Design 9) |
| Regenradar | Karte: **DWD** (schlicht, dunkel, Grenzen) oder **OpenStreetMap** (mit Straßen und Orten, dunkel eingefärbt) · Ausschnitt (sehr weit bis Ort, mit km-Angabe) · Durchlaufen an/aus · Zurück 0–2 h · Vorhersage 0–2 h · Tempo · Legende/Zeitleiste |
| Warnungen | Ohne Warnung: ausblenden oder dezenter Hinweis · ab Warnstufe (gelb/orange/rot/violett) · höchstens 1–6 Warnungen · Beschreibung an/aus |
| Je Kachel | **Position** (9 Felder: oben/mittig/unten × links/mittig/rechts) · **Abstand** waagerecht und senkrecht in **px oder % des Bildschirms** · **Breite** · **Höhe** (Wetteranzeige und Warnungen: „höchstens“) · **Deckkraft** des Hintergrunds 0–100 % · **Schriftgröße** |

Die Abstände zählen vom gewählten Rand (z. B. „oben rechts“: Abstand vom
oberen und vom rechten Rand). Bei „mittig“ verschieben sie die Kachel von der
Mitte aus. Beim Umstellen von px auf % rechnet das Portal mit der gemeldeten
Bildschirmgröße des Spiegels um.

**Nichts wird abgeschnitten:** Passt der Inhalt der Wetteranzeige nicht in
Breite × Höhe, verkleinert sich die Schrift (bis 55 %). Die Vorschau sagt
dann, auf wie viel Prozent – mehr Höhe oder Breite zeigt sie wieder größer.

**Überschneidungen:** Der Spiegel prüft nach jeder Änderung, ob eine Kachel
Uhr, Familienplan, Kalender, das bisherige Wetter, Nachrichten, Sprüche oder
eine der anderen eigenen Kacheln überdeckt oder über den Bildschirmrand ragt,
und meldet das ins Portal (Hinweis unter der Vorschau).

## 4. Datenquellen

**Wetteranzeige: Open-Meteo** (`api.open-meteo.com`) – für Deutschland u. a.
mit den Wettermodellen des DWD (ICON). Kostenlos für private Nutzung, ohne
Schlüssel, bis 10 000 Abrufe am Tag; LUMIRA braucht bei 15 Minuten rund 100.

| Wert | geliefert |
|---|---|
| Temperatur, gefühlte Temperatur, Wetterlage (WMO-Code), Tag/Nacht | jetzt |
| Luftfeuchtigkeit, Wind (Stärke und Richtung), Luftdruck (Meereshöhe), UV-Index | jetzt |
| Höchst-/Tiefstwert, Wetterlage, Regenwahrscheinlichkeit und -menge, Sonnenauf- und -untergang | je Tag, bis 8 Tage |

Fehlt ein Wert in der Antwort, bleibt er weg – es wird nichts erfunden.
Tage („Heute“, „Mo“ …) und Uhrzeiten gelten in der Zeitzone des Standorts.

**Radar und Warnungen: Deutscher Wetterdienst** (Open Data, kostenlos, ohne
Schlüssel, Quellenangabe „DWD“ auf der Karte):

| Was | Quelle | Aktualisierung |
|---|---|---|
| Radar | WMS `maps.dwd.de/geoserver/dwd/wms`, Ebene `Niederschlagsradar` (Analyse + Vorhersage) | alle 5 min; angezeigt in 10-min-Schritten |
| Zeitachse | `…/dwd/Niederschlagsradar/ows?request=GetCapabilities` (≈ 40 KB) | alle 5 min |
| Warnungen | WFS `maps.dwd.de/geoserver/dwd/ows`, `Warnungen_Gemeinden`, Abfrage genau für den Standort | alle 5 min |
| Grundkarte DWD | WMS-Ebenen `Laender`, `Warngebiete_Kreise` | einmal je Ausschnitt |
| Grundkarte OSM | Kacheln von `tile.openstreetmap.org` (© OpenStreetMap-Mitwirkende) | vom Browser zwischengespeichert |

**Grenzen:** Der DWD liefert die Radar-Vorhersage für etwa **2 Stunden** –
mehr gibt es nicht. Radar und Warnungen gelten für Deutschland.

## 5. Technik

- `node_helper` holt Warnungen und Radar-Zeitachse alle 5 Minuten, die
  Wetterdaten im eingestellten Abstand (nur, wenn die Wetteranzeige an ist).
  Die Anzeige lädt die Radarbilder direkt beim DWD (PNG, so groß wie die Kachel).
- Fehler blockieren nichts: Jede Kachel behält den letzten Stand. Die
  Wetteranzeige wird nach zwei verpassten Abrufen (mindestens 1 Stunde)
  blasser und zeigt „Stand 14:05 · veraltet“; bei Fehlern versucht sie es nach
  3 Minuten erneut.
- Dateien in `~/.lumira/`:
  - `weather.json` – Einstellungen (nur das Portal schreibt),
  - `weather-data.json` – letzte Wetterdaten (nur der Spiegel schreibt; dient
    der Vorschau im Portal und dem Start ohne Internet),
  - `weather-mirror.json` – Rückmeldung zu Überschneidungen (nur der Spiegel).
- Das Portal holt für die Vorschau selbst Daten bei Open-Meteo, wenn der
  Spiegel keine frischen hat (höchstens alle 10 Minuten).
- Kein Weichzeichner hinter den Kacheln (kostet den Raspberry Pi 3 zu viel).

## 6. Datensicherung

Alle Einstellungen stehen in `~/.lumira/weather.json` und überstehen
Neustarts und Updates. Zum Sichern diese Datei kopieren, z. B.:

```bash
cp ~/.lumira/weather.json ~/weather-sicherung.json
```

Zurückspielen: Datei zurückkopieren – der Spiegel übernimmt sie sofort.

## 7. Fehlerbehebung

| Problem | Abhilfe |
|---|---|
| Kacheln erscheinen nicht | Schalter an (Wetteranzeige: eigener Schalter; Radar/Warnungen: „Auf dem Spiegel zeigen“ und die jeweilige Kachel)? Nach einem Update einmal `./install.sh` (das Modul muss in der config.js stehen). |
| „Wetterdaten werden geladen …“ bleibt / „Wetter gerade nicht abrufbar“ | Internet des Spiegels prüfen; `api.open-meteo.com` muss erreichbar sein (Werbeblocker?). Logs: `pm2 logs MagicMirror` (`MMM-LumiraWeather: Open-Meteo: …`). |
| „veraltet“ an der Wetteranzeige | Der letzte Abruf ist über eine Stunde her – wie oben. Der Spiegel versucht es alle 3 Minuten erneut. |
| Schrift der Wetteranzeige zu klein | Höhe oder Breite vergrößern (siehe Hinweis in der Vorschau) oder weniger Werte/Tage zeigen. |
| Radar bleibt leer / „Radar gerade nicht verfügbar“ | Internet des Spiegels prüfen; `maps.dwd.de` muss erreichbar sein (Werbeblocker?). Kein Niederschlag = leere Karte, das ist richtig. |
| Karte verrutscht / falscher Ort | Standort unter Spiegel → Standort & Wetter neu suchen und speichern. |
| Keine Warnungen, obwohl die WarnWetter-App welche zeigt | „Ab Warnstufe“ prüfen; Warnungen gelten pro Gemeinde – der Standort muss in der richtigen Gemeinde liegen. |
| Animation ruckelt | Tempo „langsam“, Zurück/Vorhersage kürzen (weniger Bilder) oder Karte DWD statt OpenStreetMap. |

Logs: `pm2 logs MagicMirror` (Meldungen beginnen mit `MMM-LumiraWeather`).
