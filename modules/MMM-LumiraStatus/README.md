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
