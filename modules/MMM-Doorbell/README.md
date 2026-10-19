# MMM-Doorbell

Türklingel für LUMIRA: Klingelt es an der Ring-Klingel, zeigt der Spiegel in der
Bildschirmmitte eine kompakte Meldung, spielt den Klingelton und blendet danach
das Live-Video der Klingel ein – mit Countdown bis zum automatischen Schließen.

Einrichtung, Bedienung, Sicherheit und Fehlerbehebung: [docs/KLINGEL.md](../../docs/KLINGEL.md).

## Aufbau

- Die **Ring-Verbindung läuft im LUMIRA-Portal** (`lumira-portal/lib/ring.js`),
  nicht in MagicMirror. Das Portal schreibt das laufende Klingeln und die
  Einstellungen nach `~/.lumira/doorbell.json`.
- `node_helper.js` liest diese Datei (per `fs.watch`, schreibt nie) und liefert
  über den MagicMirror-Server aus:
  - `/MMM-Doorbell/live/` – HLS-Video und Standbilder (Live-Ordner, auf Linux
    `/dev/shm/lumira-doorbell`)
  - `/MMM-Doorbell/sound/` – den eigenen Klingelton aus `~/.lumira/doorbell/`
- `payload.js` macht aus der Datei den Anzeige-Zustand und lässt nur bekannte
  Adressen durch (vom Portal-Test mitgeprüft).
- `gong.js` – eingebautes „Ding-Dong“ (WebAudio, keine Datei).
- `vendor/hls.light.min.js` – hls.js 1.7.3 (Apache-2.0, siehe `vendor/hls.LICENSE`).

Das Modul braucht keine Position; die Fläche hängt direkt am `<body>`
(z-index 9500: über der Dauerschleife, unter dem Alarm).

## config.js

Erzeugt das Portal, sobald Bildschirm → Türklingel eingeschaltet ist:

```js
{
	module: "MMM-Doorbell",
	config: {
		hideOnAlarmPhases: [1] // während eines aPager-Alarms verborgen
	}
}
```

| Option | Standard | Bedeutung |
|---|---|---|
| `hideOnAlarmPhases` | `[1]` | aPager-Zustände (`APAGER_STATE`), in denen nichts angezeigt wird |
| `fadeMs` | `450` | Ein-/Ausblenden in Millisekunden |

Alles andere (Text, Ton, Größe, Dauer …) kommt live aus dem Portal.
