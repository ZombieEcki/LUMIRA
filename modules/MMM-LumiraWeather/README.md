# MMM-LumiraWeather

Regenradar (DWD, animiert von „vorher“ über „jetzt“ bis +2 h) und amtliche
Wetterwarnungen (DWD) als zwei frei platzierbare, halbtransparente Kacheln.

Anleitung, Datenquellen und Fehlerbehebung: [docs/WETTER.md](../../docs/WETTER.md).

## Aufbau

- **Einstellungen** kommen live aus `~/.lumira/weather.json` (LUMIRA-Portal,
  Spiegel → Radar & Warnungen), `node_helper.js` liest per `fs.watch`.
- `node_helper.js` holt alle 5 min die Warnungen (WFS, Punkt = Standort) und
  die Zeitachse des Radars; die Anzeige lädt die Radarbilder direkt (WMS).
- `payload.js` – Bereinigung der Einstellungen, Radar-Zeitpunkte,
  Aufbereitung der Warnungen (als `lumira-portal/lib/weather-shared.js` auch
  im Portal, Test prüft Gleichheit).
- `geo.js` – Kartenausschnitt in Web-Mercator: BBOX für die WMS-Bilder und
  OpenStreetMap-Kacheln aus derselben Rechnung (auch im Portal als
  `public/weather-geo.js` für die km-Angabe).
- Die Kacheln hängen am `<body>` (position: fixed); die Position in der
  config.js spielt keine Rolle. Nach jeder Änderung meldet die Anzeige
  Überschneidungen mit anderen Modulen nach `~/.lumira/weather-mirror.json`.

## config.js

```js
{ module: "MMM-LumiraWeather" }
```

Erzeugt das Portal immer; angezeigt wird erst, wenn es im Portal eingeschaltet ist.
