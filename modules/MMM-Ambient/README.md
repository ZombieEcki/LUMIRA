# MMM-Ambient

Dauerschleife auf dem LUMIRA-Spiegel: ein gezeichnetes **Lagerfeuer**, ein
eigenes **Video/Bild** oder ein **YouTube-Video** – gesteuert im LUMIRA-Portal unter
**Spiegel → Bildschirm** (oder per Schnellschalter in der Karte „Spiegel“ auf
der Startseite).

- **Vollbild:** nur das Medium, über allem.
- **Hintergrund:** Medium abgedunkelt hinter den normalen Modulen.
- **Timer:** aus nach 15 Min … 3 Std oder erst beim Ausschalten.
- **Ton** (nur Videos) wählbar, sonst stumm.
- **Alarm:** MMM-aPagerAlarm (`APAGER_STATE`, Zustand 1) unterbricht sofort;
  danach läuft die Schleife weiter, falls sie noch eingeschaltet ist.
- **Live:** Änderungen im Portal wirken sofort, kein MagicMirror-Neustart.

## YouTube

Im Portal unter Mediathek → „+ YouTube“ einen Link einfügen (watch?v=…,
youtu.be/…, shorts/…, live/…; eine Startzeit wie `&t=90` wird übernommen).
Ohne eigenen Namen holt das Portal den Videotitel. Auf dem Spiegel läuft das
Video über `youtube-nocookie.com` eingebettet: stumm (außer „Ton“ ist an),
Endlosschleife, ohne Bedienelemente, auf Spiegelgröße gezoomt. Braucht
Internet; auf dem Raspberry Pi 3 kann YouTube ruckeln, ab Pi 4 läuft es flüssig.

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

**GIFs** ruckeln auf dem Pi, weil der Browser jedes Bild auf dem Prozessor
entpacken und hochrechnen muss. Das Portal wandelt sie beim Hochladen deshalb
automatisch in ein MP4 um (ffmpeg, H.264, höchstens 1280 px breit). Dafür muss
ffmpeg installiert sein – `install.sh` erledigt das, auf älteren Geräten
einmalig `sudo apt install ffmpeg`.
