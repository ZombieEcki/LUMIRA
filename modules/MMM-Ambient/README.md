# MMM-Ambient

Dauerschleife auf dem LUMIRA-Spiegel: ein gezeichnetes **Lagerfeuer** oder ein
eigenes **Video/Bild** – gesteuert im LUMIRA-Portal unter
**Spiegel → Bildschirm** (oder per Schnellschalter in der Karte „Spiegel“ auf
der Startseite).

- **Vollbild:** nur das Medium, über allem.
- **Hintergrund:** Medium abgedunkelt hinter den normalen Modulen.
- **Timer:** aus nach 15 Min … 3 Std oder erst beim Ausschalten.
- **Ton** (nur Videos) wählbar, sonst stumm.
- **Alarm:** MMM-aPagerAlarm (`APAGER_STATE`, Zustand 1) unterbricht sofort;
  danach läuft die Schleife weiter, falls sie noch eingeschaltet ist.
- **Live:** Änderungen im Portal wirken sofort, kein MagicMirror-Neustart.

## So funktioniert es

| Teil | Aufgabe |
|------|---------|
| `lumira-portal/lib/ambient.js` | schreibt Zustand + Mediathek nach `~/.lumira/ambient.json`, Dateien nach `~/.lumira/media/` (Typ wird an den ersten Bytes geprüft, max. 300 MB, max. 20 Medien) |
| `node_helper.js` | liest `ambient.json` (fs.watch), liefert Medien unter `/MMM-Ambient/media/` aus, meldet den Timer-Ablauf pünktlich |
| `payload.js` | `ambient.json` → Anzeige-Zustand (auch im Portal-Test geprüft) |
| `MMM-Ambient.js` | legt die Fläche direkt an den `<body>` (braucht keine Position) |
| `fire.js` | Lagerfeuer als Canvas (160 × 100 Bildpunkte, weich hochskaliert); dieselbe Datei liegt als `lumira-portal/public/ambient-fire.js` für die Vorschau |

## Konfiguration

Wird von `lumira-portal/lib/generate-config.js` automatisch eingetragen:

```js
{
	module: "MMM-Ambient",
	config: {
		interruptOnAlarmPhases: [1],   // aPager-Zustände, die unterbrechen
		backgroundBrightness: 0.45,    // Helligkeit im Hintergrund-Modus
		fadeMs: 1200                   // Ein-/Ausblenden
	}
}
```

## Hinweise für den Raspberry Pi 3

Videos am besten als **MP4 (H.264) in 720p** hochladen – höhere Auflösungen
kann der Pi 3 im Browser oft nicht flüssig abspielen. Das Lagerfeuer kostet
kaum Rechenzeit.
