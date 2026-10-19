# MMM-LumiraCalendar

Kalender für LUMIRA in **12 Designs** aus beliebig vielen Kalender-Abos (ICS:
iCloud, Google, Outlook, Vereine, Ferien …). Er ersetzt das MagicMirror-Modul
`calendar`. Farbe und Symbol gibt es je Kalender, Zeitraum und maximale Anzahl
sind getrennt einstellbar. Der Kalender steht „wie bisher“ im Layout oder frei
platziert. Er ist eine reine Anzeige und liest nur.

Anleitung, Designs, Links finden, Fehlerbehebung: [docs/KALENDER.md](../../docs/KALENDER.md).

## Aufbau

- **Einstellungen und Quellen** (mit den geheimen Links) kommen aus
  `~/.lumira/calendar.json` (LUMIRA-Portal, Bildschirm → Kalender).
  `node_helper.js` liest die Datei per `fs.watch`.
  - Er holt die aktiven Kalender im eingestellten Abstand nacheinander ab.
  - Bei einem Ausfall behält er den letzten Stand.
  - Er schickt Termine **ohne Links** an die Anzeige. Dieselben Termine
    schreibt er nach `~/.lumira/calendar-data.json`.
- `ics.js` liest die Kalender (Wiederholungen, Ausnahmen, verlegte Termine,
  Zeitzonen mit Sommerzeit, Windows-Zonen von Outlook) ohne Bibliothek. Im
  Portal liegt eine Kopie als `lumira-portal/lib/calendar-ics.js`; der Test
  prüft, dass beide ab Zeile 3 gleich sind.
- `calendar-view.js` / `calendar-view.css` enthalten:
  - die 12 Designs, die Auswahl der Termine und die Bereinigung;
  - `fit()`: erst die Schrift bis 70 % verkleinern, dann Termine weglassen
    („+ N weitere“), nie abschneiden.

  Dieselben Dateien nutzt das Portal für Auswahl und Vorschau
  (`public/calendar-view.*`, Test prüft Gleichheit).
- **„Wie bisher“** (`anchor: "auto"`): Der Kalender steht im Platz des Moduls
  (`position: "bottom_left"`).
- **Frei platziert:** eine Kachel am `<body>` (fixed, z-index 5) mit
  `data-lumira-tile="Kalender"`. Daran erkennen Uhr, Wetter und Sprüche den
  Kalender für ihre Überschneidungs-Hinweise.
- Für andere Module gehen die Termine als `CALENDAR_EVENTS` hinaus, im Format
  des alten Kalenders: `title`, `startDate`/`endDate` in ms als Text,
  `fullDayEvent`, `location`, `calendarName`.
- Die Rückmeldung (Überschneidungen, außerhalb des Bildschirms, weggelassene
  Termine) geht nach `~/.lumira/calendar-mirror.json`.

## config.js

```js
{ module: "MMM-LumiraCalendar", position: "bottom_left" }
```
