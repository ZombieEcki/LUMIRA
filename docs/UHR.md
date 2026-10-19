# Uhr auf dem Bildschirm

Eigenes Uhrmodul `MMM-LumiraClock`. Es ersetzt die MagicMirror-Uhr (`clock`):
**16 Designs** von klassisch digital bis analog, rund und kreativ, frei
platzierbar, Datum und Wochentag ein-/ausblendbar, 24 h (Standard) oder 12 h,
Sekunden optional. Alles im Portal unter **Bildschirm → Uhr**; Änderungen
sind nach wenigen Sekunden auf dem Bildschirm, ohne Neustart.

Nach dem Update steht die neue Uhr **wie bisher oben links** (Design
„Klassisch Digital“), der Familienplan darunter. Die alte Uhr wird nicht mehr
geladen; der Schalter „Uhr“ unter Bildschirm → Übersicht gilt weiter.

## 1. Design wählen

Portal → **Bildschirm → Uhr** → *Design*. Die Auswahl zeigt alle 16 Designs mit
der echten Uhrzeit. Beim Wechsel wird die empfohlene Breite gesetzt, danach
ist sie frei änderbar.

| Nr. | Design | Nr. | Design |
|---|---|---|---|
| 1 | Klassisch Digital | 9 | Kreis mit Datum (blauer Leuchtring) |
| 2 | Elegant Minimal (dünn, Linie mit Punkt) | 10 | Transparent / Glas |
| 3 | Modern mit Rahmen (Karte) | 11 | Elegant mit Linie (Raute) |
| 4 | Analog Klassisch (Zahlen 12/3/6/9) | 12 | Kreativ / Modern (Farbring) |
| 5 | Analog Modern (Leuchtring) | 13 | Seitlich mit Wochentag |
| 6 | Digital mit Wochentag | 14 | Elegant Rund (warmer Ring) |
| 7 | Kompakt (Uhrzeit \| Datum) | 15 | Dünn & Minimal |
| 8 | Vertikal (Stunden über Minuten) | 16 | Kreativ mit Rahmen (Neon) |

**Abweichungen von der Vorlage:** Design 12 nutzt eine kräftige kursive Schrift
statt einer Pinselschrift (keine zusätzliche Schriftdatei nötig). Leuchtringe
und Leuchtrahmen sind feste Schatten ohne Animation – das sieht gleich aus und
belastet den Raspberry Pi 3 nicht.

## 2. Uhrzeit, Datum, Wochentag

Karte *Uhrzeit & Datum*:

- **Zeitformat**: 24 Stunden (`15:58`, Standard) oder 12 Stunden (`3:58 PM`).
- **Datum**: lang („Mittwoch, 8. Juli 2026“) oder kurz („Mi, 08.07.2026“).
- **Sekunden**: digital als kleine Zahl, analog als Sekundenzeiger.
- **Wochentag** und **Datum** einzeln ein-/ausschalten – nur Wochentag, nur
  Datum, beides oder nichts.
- **Uhrzeit zusätzlich als Zahl** (nur analoge Designs): unter dem Zifferblatt.

## 3. Position und Größe

Karte *Position & Größe*:

- **Wie bisher**: im MagicMirror-Layout oben links, wie die alte Uhr; was dort
  noch steht (Familienplan), rückt darunter.
- **9 Felder** (oben/mittig/unten × links/mittig/rechts): frei auf dem
  Bildschirm, unabhängig von den anderen Modulen. Dazu **Abstand** waagerecht
  und senkrecht in **px oder % des Bildschirms**.
- **Breite** und **Höhe höchstens**, **Schriftgröße** (50–300 %, vergrößert die
  ganze Uhr), **Abstand Uhrzeit–Datum**, **Innenabstand**.

**Nichts wird abgeschnitten:** Passt die Uhr nicht in Breite und Höhe, wird die
Schrift automatisch kleiner; die Vorschau sagt dann, um wie viel. In den
Kreis-Designs schrumpft bei Bedarf nur der Text im Kreis.

Die Vorschau zeigt das Design in echter Größe und darunter das **Live-Bild**
vom Bildschirm. Steht die frei platzierte Uhr über Wetter, Familienplan,
Kalender & Co. oder ragt sie hinaus, steht dort ein Hinweis.

## 4. Aussehen

- **Dunkle Glasfläche** hinter jedem Design (bessere Lesbarkeit).
- **Deckkraft der Fläche** 0–100 % – gilt für die Designs mit eigener Fläche
  (3, 7, 10, 16), die Kreise und die Glasfläche. 0 % = ganz durchsichtig.
- **Linienstärke** 1–8 px für Linien, Rahmen und Ringe.
- **Akzentfarbe** für Ringe, Leuchtrahmen und den Sekundenzeiger; *Wie im
  Design* stellt die Farbe des Designs wieder her.

## 5. Technik

- Modul `modules/MMM-LumiraClock`, in der config.js
  `{ module: "MMM-LumiraClock", position: "top_left" }` (nur, wenn der Schalter
  „Uhr“ an ist).
- Einstellungen: `~/.lumira/clock.json` (schreibt nur das Portal),
  Rückmeldung der Anzeige: `~/.lumira/clock-mirror.json`.
- Aktualisiert wird nur, wenn sich die Anzeige ändert: einmal pro Minute, mit
  Sekunden einmal pro Sekunde. Keine Internetverbindung nötig – die Uhrzeit
  kommt vom Raspberry Pi (Zeitzone/NTP des Systems).
- API: `GET /api/clock`, `PUT /api/clock` (Teiländerungen, verständliche
  Fehlermeldungen).

## 6. Zurück zur alten Uhr

Die alte MagicMirror-Uhr ist Teil von MagicMirror und bleibt installiert. Wer
sie zurück möchte, setzt LUMIRA auf den Stand vor dem Uhrmodul zurück
(`git checkout <commit>` im Ordner `~/LUMIRA`, dann `./install.sh`) oder trägt
in einer eigenen config.js wieder `{ module: "clock", position: "top_left" }`
ein.

## 7. Fehlerbehebung

| Problem | Abhilfe |
|---|---|
| Keine Uhr zu sehen | Bildschirm → Übersicht: „Uhr“ an? Nach dem Update einmal `./install.sh` (das Modul muss in der config.js stehen). |
| Falsche Uhrzeit | Zeitzone und Uhrzeit des Pi prüfen: `timedatectl` (Zeitzone z. B. `sudo timedatectl set-timezone Europe/Berlin`). |
| Uhr zu klein, Hinweis „Schrift verkleinert“ | Breite oder „Höhe höchstens“ vergrößern oder Datum kürzer stellen. |
| Uhr überdeckt den Familienplan | „Wie bisher“ wählen oder die freie Position verschieben – das Live-Bild zeigt es sofort. |
| Änderungen kommen nicht an | `pm2 logs MagicMirror` auf `MMM-LumiraClock` prüfen; `~/.lumira/clock.json` muss lesbar sein. |
