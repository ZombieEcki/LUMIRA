# MMM-LumiraNews

Nachrichten für LUMIRA, ersetzt das MagicMirror-Modul `newsfeed`: mehrere
RSS-/Atom-Feeds (geprüfte vordefinierte und eigene), ganz unten am Bildschirm,
als kompakte Leiste mit wechselnder Schlagzeile oder als Vorschaukarten.

Anleitung, Feed-Liste, Zeitregel, Fehlerbehebung: [docs/NACHRICHTEN.md](../../docs/NACHRICHTEN.md).

## Aufbau

- `node_helper.js` liest `~/.lumira/news.json` (LUMIRA-Portal, Bildschirm →
  Nachrichten) per `fs.watch`, holt die aktiven Feeds nacheinander, behält bei
  Ausfällen den letzten Stand, entfernt Doppelte und schreibt nach
  `~/.lumira/news-data.json`.
- `rss.js` – RSS 2.0, RDF, Atom ohne Bibliothek; Titel als reiner Text, nur
  http(s)-Links/-Bilder; geprüfte Feeds (`PRESETS`). Im Portal als
  `lumira-portal/lib/news-rss.js` (Test prüft Gleichheit ab Zeile 3).
- `news-view.js` / `news-view.css` – beide Varianten und die Zeitregel
  (ohne Zeitangabe oder > 1 h in der Zukunft: ausgeblendet); auch im Portal
  für die Vorschau (`public/news-view.*`, Test prüft Gleichheit).

## config.js

```js
{ module: "MMM-LumiraNews", position: "bottom_bar" }
```
