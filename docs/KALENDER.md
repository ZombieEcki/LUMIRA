# Kalender auf dem Bildschirm

Eigenes Kalendermodul `MMM-LumiraCalendar`. Es ersetzt das MagicMirror-Modul
`calendar`:
- **beliebig viele Kalender** gleichzeitig (iCloud, Google, Outlook, Verein,
  Ferien …), zu einer Übersicht zusammengeführt;
- **12 Designs**, darunter zwei schlichte;
- **Farbe und Symbol je Kalender**;
- Zeitraum und Anzahl getrennt einstellbar;
- frei platzierbar.

Alles im Portal unter **Bildschirm → Kalender**. Änderungen sind nach wenigen
Sekunden auf dem Bildschirm, ohne Neustart. Der Bildschirm zeigt nur an; er
braucht keinen Touch. Es wird nur gelesen, nie ein Termin angelegt, geändert
oder gelöscht.

**Nach dem Update** übernimmt LUMIRA die bisherigen Kalender-Links (bis zu 3)
einmalig. Der Kalender steht **wie bisher unten links** als Liste mit der
Überschrift „Familienkalender“ (bzw. „Kalender“) und zeigt höchstens 5
Termine.

## 1. Kalender hinzufügen

Portal → **Bildschirm → Kalender** → *Eure Kalender* → **+ Kalender
hinzufügen**:

1. **Kalender-Link** einfügen (siehe unten) und **Testen**. Das Portal zeigt
   den Namen des Kalenders, die Anzahl der Termine und die nächsten drei.
2. **Name** vergeben (wird beim Testen vorgeschlagen), **Farbe** und
   **Symbol** wählen.
3. Optional pro Kalender:
   - **Titel zeigen** aus: auf dem Bildschirm steht nur „Belegt“, z. B. für
     den Arbeitskalender;
   - **Uhrzeit zeigen**;
   - **Ort zeigen**.
4. **Hinzufügen.** Die Termine erscheinen nach wenigen Sekunden.

Jeder Kalender lässt sich einzeln **ein-/ausschalten**, **bearbeiten** (den
Link ändert nur, wer einen neuen einfügt), **entfernen** und mit ↑/↓
**sortieren**. Steht derselbe Termin in zwei Kalendern, erscheint er nur
einmal, mit der Farbe des oberen Kalenders.

### Wo finde ich den Link?

| Anbieter | Weg | Link |
|---|---|---|
| **iCloud / Apple** | Kalender-App → beim Kalender (i) → „Öffentlicher Kalender“ an → Link teilen | `webcal://p…-caldav.icloud.com/published/…` |
| **Google** | calendar.google.com am Computer → Einstellungen des Kalenders → „Kalender integrieren“ → *Privatadresse im iCal-Format* | `https://calendar.google.com/calendar/ical/…/basic.ics` |
| **Outlook / Microsoft 365** | outlook.com → Einstellungen → Kalender → Freigegebene Kalender → „Kalender veröffentlichen“ → *ICS* | `https://outlook.office365.com/owa/calendar/…/calendar.ics` |
| **Feiertage, Ferien, Verein** | Abo-Link der Seite (Endung `.ics` oder `webcal://`) | – |

`webcal://` versteht LUMIRA direkt (erst über https, notfalls über http). Eine
bloße Kalender-Webseite ohne Abo-Link geht nicht.

**Sicherheit:** Diese Links sind geheim wie ein Passwort.
- Sie liegen nur in `~/.lumira/calendar.json`, lesbar nur für den Benutzer
  (Rechte 600).
- Sie gehen nach dem Speichern nie mehr an den Browser zurück; das Portal
  zeigt nur `p52-caldav.icloud.com/…`.
- In Logs und Fehlermeldungen stehen nur Name und Rechner, nie der Link.

## 2. Design

Die Auswahl zeigt alle 12 Designs mit euren echten Terminen:

| Nr. | Design | Nr. | Design |
|---|---|---|---|
| 1 | Monat klassisch (Punkte in Kalenderfarbe) | 7 | Nur heute, minimal |
| 2 | **Monat schlicht** (heute grau, neutrale Punkte) | 8 | Großes Datum + Liste |
| 3 | Monat + Terminliste | 9 | Woche als Tabelle (Mo–So) |
| 4 | **Tagesliste schlicht** (feine Linien, keine Farben) | 10 | Woche quer (Spalten mit Farbbalken) |
| 5 | Agenda (Heute / Morgen / …) | 11 | Tages-Zeitstrahl |
| 6 | Nächste Termine kompakt | 12 | Übersicht (Heute / Morgen / Woche) |

**Bewusst weggelassen** (Vorlage): Pfeile zum Blättern (kein Touch – es gilt
immer der aktuelle Monat bzw. die aktuelle Woche) und Fotos je Termin (die
Symbole leisten dasselbe ohne Bildpflege).

## 3. Termine: Zeitraum und Anzahl

Karte *Termine*:

- **Zeitraum**: nur heute, heute und morgen, nächste 7 / 14 Tage, nächster
  Monat oder eine eigene Anzahl Tage (1–62).
- **Höchstens angezeigt**: 3, 5, 8, 10, 15, 20 oder ein eigener Wert (1–100).
  Beide wirken **getrennt**, z. B. „nächste 7 Tage, höchstens 5“. Gibt es mehr,
  steht „+ 3 weitere Termine“ darunter (abschaltbar).
- Die **Monats- und Wochenansichten** zeigen immer den ganzen Monat bzw. die
  ganze Woche. Die Anzahl begrenzt dort nur die Liste daneben (Design 3) bzw.
  die Einträge je Tag.
- **Ganztägige Termine**, **heute schon vorbei** (blass), **Uhrzeit**,
  **Endzeit**, **Ort**, **lange Titel umbrechen** (sonst „…“): je ein Schalter.
- **Kalender erkennbar an**: Farbe, Symbol, beides oder nichts. Die schlichten
  Designs zeigen bewusst keine Farben.
- **Überschrift** (leer = wie im Design) und **Abruf** alle 5–60 Minuten.

## 4. Position, Größe, Aussehen

- **Wie bisher**: unten links im MagicMirror-Layout, wie der alte Kalender.
- **9 Felder** plus **Abstände** in px oder % des Bildschirms: frei, unabhängig
  von den anderen Modulen.
- **Breite**, **Höhe höchstens**, **Schriftgröße**, **Abstand zwischen
  Terminen**, **Innenabstand**.
- **Dunkle Glasfläche**, **Deckkraft**, **Trennlinien**.

**Nichts wird abgeschnitten:** Passt nicht alles hinein, wird die Schrift etwas
kleiner (bis 70 %). Reicht das nicht, fallen Termine von hinten weg und zählen
zu „+ N weitere“. Die Vorschau und das Live-Bild sagen das, ebenso
Überschneidungen mit Uhr, Wetter, Familienplan & Co.

## 5. Ausfälle

- **Fällt ein Kalender aus**, laufen die anderen weiter. Der ausgefallene zeigt
  seinen letzten Stand, auf dem Bildschirm klein als „Name: Stand 12:30“
  markiert.
- **Im Portal** steht die verständliche Ursache, z. B. „Zugriff verweigert – ist
  der Kalender freigegeben?“ oder „Kalender nicht gefunden – Link prüfen“.
- **MagicMirror bleibt bedienbar:** Ein Netzwerkfehler hält ihn nie an. Abgerufen
  wird nacheinander, mit 20 s Zeitlimit je Kalender.

## 6. Technik

- **Modul:** `modules/MMM-LumiraCalendar`, in der config.js
  `{ module: "MMM-LumiraCalendar", position: "bottom_left" }` (nur, wenn der
  Schalter „Kalender“ an ist).
- **Dateien:**
  - `~/.lumira/calendar.json`: Einstellungen und Quellen mit Links (schreibt
    nur das Portal, Rechte 600);
  - `calendar-data.json`: aufbereitete Termine ohne Links, für den schnellen
    Start und die Vorschau;
  - `calendar-mirror.json`: Rückmeldung der Anzeige.
- **Kalender lesen** (`ics.js`, ohne zusätzliche Bibliothek):
  - Wiederholungen: täglich, wöchentlich mit Wochentagen, monatlich, z. B.
    „letzter Freitag“, und jährlich;
  - Intervall, Anzahl und Ende;
  - ausgelassene (EXDATE) und verlegte Einzeltermine (RECURRENCE-ID);
  - abgesagte Termine fallen weg;
  - ganztägige und mehrtägige Termine;
  - Zeitzonen mit Sommer-/Winterzeit, auch die Windows-Namen von Outlook.
  - Nicht unterstützt (selten): BYSETPOS, BYWEEKNO, BYYEARDAY.
- **Für die Sprüche:** Die Termine gehen wie beim alten Kalender als
  `CALENDAR_EVENTS` hinaus, damit die Kalender-Anlässe weiter funktionieren.
- **API:**
  - `GET/PUT /api/calendar`;
  - `POST /api/calendar/sources`, `PUT/DELETE /api/calendar/sources/:id`;
  - `PUT /api/calendar/order`;
  - `POST /api/calendar/test`;
  - `GET /api/calendar/events`.
- **Später geplant:** CalDAV mit App-Passwort (private iCloud-Kalender ohne
  Freigabe, Nextcloud, ownCloud, Radicale, Baïkal).

## 7. Sicherung und zurück zum alten Kalender

- **Sichern:** `~/.lumira/calendar.json` (enthält die Links – sicher
  aufbewahren).
- **Zurück:** Das alte Kalendermodul ist Teil von MagicMirror und bleibt
  installiert. LUMIRA auf den Stand vor dem Kalendermodul zurücksetzen
  (`git checkout <commit>` in `~/LUMIRA`, dann `./install.sh`). Die bisherigen
  Links stehen weiter in `settings.json`.

## 8. Fehlerbehebung

| Problem | Abhilfe |
|---|---|
| „Zugriff verweigert“ | Kalender beim Anbieter freigeben bzw. veröffentlichen (siehe Tabelle oben), Link neu kopieren. |
| „Kalender nicht gefunden“ | Link vollständig kopiert? Bei iCloud nach Aus-/Einschalten der Freigabe entsteht ein neuer Link. |
| „Das ist kein Kalender-Abo“ | Es wurde eine Webseite statt des Abo-Links eingefügt (Google: die *Privatadresse im iCal-Format*). |
| Termine fehlen | Zeitraum und „Höchstens“ prüfen; Kalender eingeschaltet? Ganztägige an? Hinweis „passen nicht hinein“ in der Vorschau? |
| Uhrzeiten um eine Stunde verschoben | Zeitzone des Pi prüfen: `timedatectl` (z. B. `sudo timedatectl set-timezone Europe/Berlin`). |
| Kein Kalender auf dem Bildschirm | Bildschirm → Übersicht: „Kalender“ an? Nach dem Update einmal `./install.sh`. Logs: `pm2 logs MagicMirror` (`MMM-LumiraCalendar`). |
