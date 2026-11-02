# MMM-LumiraTodo

To-do-Liste für LUMIRA in **12 Designs**: mehrere Listen, Kategorien,
Prioritäten, Fälligkeit, Wiederholung, Notizen und Unteraufgaben. Frei
platziert, unabhängig vom Familienplan. Reine Anzeige – gepflegt und abgehakt
wird im LUMIRA-Portal (Extras → To-do bzw. Startseite).

Anleitung und Fehlerbehebung: [docs/TODO.md](../../docs/TODO.md).

## Aufbau

- `node_helper.js` liest `~/.lumira/todo.json` per `fs.watch` (bei kaputter
  Datei bleibt der letzte Stand) und schickt Listen, Kategorien, Aufgaben und
  Anzeige an das Modul. Schreiben, Prüfen und Wiederholungen macht nur das
  Portal (`lumira-portal/lib/todo.js`, mit Backups).
- `todo-view.js` / `todo-view.css` – die 12 Designs, die Auswahl (Listen,
  Erledigte, Zeitraum) und `fit()` (Schrift bis 70 %, dann „+ X weitere“);
  auch im Portal (`public/todo-view.*`, Test prüft Gleichheit).
- Kachel am `<body>` (fixed, z-index 5) mit `data-lumira-tile="To-do"`, damit
  Uhr, Kalender, Wetter und Sprüche sie bei Überschneidungen nennen.
  Rückmeldung nach `~/.lumira/todo-mirror.json`.

## config.js

```js
{ module: "MMM-LumiraTodo" }
```
