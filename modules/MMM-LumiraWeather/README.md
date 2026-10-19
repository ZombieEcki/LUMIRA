# MMM-LumiraWeather

Drei frei platzierbare Kacheln:

- **Wetteranzeige** – aktuelles Wetter und Vorhersage (Open-Meteo) in einem
  von 12 Designs,
- **Regenradar** (DWD, animiert von „vorher“ über „jetzt“ bis +2 h),
- **Wetterwarnungen** (DWD, amtlich, genau für den Standort).

Anleitung, Designs, Datenquellen und Fehlerbehebung: [docs/WETTER.md](../../docs/WETTER.md).

## Aufbau

- **Einstellungen** kommen live aus `~/.lumira/weather.json` (LUMIRA-Portal,
  Bildschirm → Wetter), `node_helper.js`
  liest per `fs.watch`.
- `node_helper.js` holt alle 5 min die Warnungen (WFS, Punkt = Standort) und
  die Zeitachse des Radars; die Anzeige lädt die Radarbilder direkt (WMS).
  Für die Wetteranzeige alle 10–60 min Open-Meteo, letzter Stand zusätzlich in
  `~/.lumira/weather-data.json`.
- `payload.js` – Bereinigung der Einstellungen, Radar-Zeitpunkte,
  Aufbereitung der Warnungen und der Wetterdaten (als
  `lumira-portal/lib/weather-shared.js` auch im Portal, Test prüft Gleichheit).
- `weather-view.js` / `weather-view.css` – die 12 Designs der Wetteranzeige aus gemeinsamen
  Bausteinen; dieselben Dateien zeichnen im Portal die Vorschau
  (`public/weather-view.*`, Test prüft Gleichheit).
- `weather-geo.js` – Kartenausschnitt in Web-Mercator: BBOX für die WMS-Bilder und
  OpenStreetMap-Kacheln aus derselben Rechnung (auch im Portal als
  `public/weather-geo.js` für die km-Angabe).
- `icons/` – Meteocons von Bas Milius (statisch, MIT, siehe `icons/LICENSE`).
- `backgrounds/` – 9 Landschaftsbilder für „Modern mit Hintergrund“ (960 px).
- Die Kacheln hängen am `<body>` (position: fixed); die Position in der
  config.js spielt keine Rolle. Nach jeder Änderung meldet die Anzeige
  Überschneidungen mit anderen Modulen nach `~/.lumira/weather-mirror.json`.

## config.js

```js
{ module: "MMM-LumiraWeather" }
```

Erzeugt das Portal immer; angezeigt wird erst, was im Portal eingeschaltet ist.
