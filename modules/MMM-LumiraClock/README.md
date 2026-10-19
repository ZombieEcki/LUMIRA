# MMM-LumiraClock

Uhr für LUMIRA in **16 Designs** (digital und analog), ersetzt das
MagicMirror-Modul `clock`. Datum und Wochentag ein-/ausblendbar, 24 h oder
12 h, Sekunden optional, „wie bisher“ im Layout oder frei platziert.

Anleitung, Designs und Fehlerbehebung: [docs/UHR.md](../../docs/UHR.md).

## Aufbau

- **Einstellungen** kommen live aus `~/.lumira/clock.json` (LUMIRA-Portal,
  Bildschirm → Uhr), `node_helper.js` liest per `fs.watch` und schickt sie
  bereinigt an die Anzeige.
- `clock-view.js` / `clock-view.css` – die 16 Designs aus gemeinsamen
  Bausteinen, Formate (deutsch), Bereinigung der Einstellungen (`clean`).
  Dieselben Dateien zeichnen im Portal Auswahl und Vorschau
  (`lumira-portal/public/clock-view.*`, Test prüft Gleichheit); das Portal
  nutzt `clean` auch beim Speichern.
- „Wie bisher“ (`anchor: "auto"`): die Uhr steht im Platz des Moduls
  (`position: "top_left"`). Frei: eine Kachel am `<body>` (position: fixed,
  z-index 5 wie die Wetter-Kacheln) mit `data-lumira-tile="Uhr"` – daran
  erkennen Wetter und Sprüche die Uhr bei ihren Überschneidungs-Hinweisen.
- Aktualisierung genau beim Minuten- bzw. Sekundenwechsel, keine Animationen.
- Rückmeldung (Überschneidungen, außerhalb des Bildschirms) nach
  `~/.lumira/clock-mirror.json`.

## config.js

```js
{ module: "MMM-LumiraClock", position: "top_left" }
```
