# MMM-LumiraStatus

Zeigt den Betriebsmodus des [LUMIRA Self-Service-Portals](../../lumira-portal)
direkt auf dem Spiegel an (siehe [concept/selfservice.md](../../concept/selfservice.md)
Abschnitt 5):

- **SETUP** (Ersteinrichtung oder WLAN-Rückfall): große Karte mit Anleitung
  und WLAN-QR-Code für den Access Point `LUMIRA-Setup`.
- **FAMILY** (Normalbetrieb): eine sehr kleine, dezente Zeile
  (`⚙ lumira.local`), per `showStatusHint: false` abschaltbar.

Pollt dafür `lumira-portal`s `GET /api/status` (Standard: alle 5 Sekunden,
`127.0.0.1:8092`, läuft auf demselben Gerät).

## Installation

Wird von `install.sh` automatisch mit installiert (siehe README.md im
Projekt-Root). Für eine manuelle Installation:

```bash
cd ~/MagicMirror/modules/MMM-LumiraStatus
npm install
```

## Live-Bild für das Portal

Das Portal zeigt auf der Startseite (Karte „Spiegel“, Umschalter
**Live / Aufbau**) alle 5 Sekunden ein Bild davon, was der Spiegel gerade
zeigt. Dafür stellt dieses Modul `GET /lumira/screenshot` auf dem
MagicMirror-Server (Port 8080) bereit, siehe [screenshot.js](screenshot.js):

- Aufnahme über Electron (`webContents.capturePage`), unabhängig von
  X11/Wayland. Ohne Fenster (`serveronly`) ersatzweise per `grim`.
- JPEG, lange Seite max. 800 px. Höchstens alle 1,5 s eine neue Aufnahme,
  gleichzeitige Anfragen teilen sich eine.
- Nur Anfragen vom eigenen Gerät (`127.0.0.1`). Im Heimnetz geht das Bild nur
  über das PIN-geschützte Portal raus (`GET /api/mirror/screenshot`).
- Aufnahmen gibt es nur, solange jemand die Startseite offen hat.

## Konfiguration

```js
{
	module: "MMM-LumiraStatus",
	position: "bottom_right",
	config: {
		portalUrl: "http://lumira.local:8092",
		statusUrl: "http://127.0.0.1:8092/api/status",
		pollInterval: 5000,
		showStatusHint: true
	}
}
```

Wird automatisch mit den richtigen Werten von
[`lumira-portal/lib/generate-config.js`](../../lumira-portal/lib/generate-config.js)
erzeugt – normalerweise nichts von Hand anzupassen.
