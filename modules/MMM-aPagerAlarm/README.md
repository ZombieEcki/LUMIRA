# MMM-aPagerAlarm

Ein Modul für [MagicMirror²](https://magicmirror.builders/), das Alarmierungen von
**aPager PRO** empfängt und sie **familiengerecht** auf dem Spiegel darstellt.

Das Modul ist **kein reiner Alarmmonitor**, sondern ein **Familien-Informationssystem**:
Im Alltag gehört der Spiegel vollständig der Familie. Die Feuerwehr erscheint nur bei
einer Alarmierung – und verschwindet nach dem Einsatz wieder komplett.

```
Alarmierung → aPager PRO → HTTP POST (Webhook) → Raspberry Pi (node_helper) → MagicMirror
```

## Die vier Zustände

| # | Zustand | Dauer (Standard) | Darstellung |
|---|---------|------------------|-------------|
| 0 | **Familienmodus** | Standard | Nichts sichtbar – Spiegel gehört der Familie |
| 1 | **Alarm** | 15 min | Rotes Overlay, Blaulicht, Ton, Countdown |
| 2 | **… ist im Einsatz** | 4 h | Ruhige Glassmorphism-Karte, alle 5 min eine liebevolle Botschaft |
| 3 | **… war im Einsatz** | 30 min | Grüne, wertschätzende Karte („Willkommen zurück") |

Nach Zustand 3 kehrt das Modul automatisch in den Familienmodus zurück.
Eine erneute Alarmierung innerhalb der 4 Stunden startet alles neu bei Zustand 1.

## Dokumentation

- [INSTALL.md](INSTALL.md) – Installation Schritt für Schritt
- [CONFIG.md](CONFIG.md) – alle Konfigurationsoptionen
- [WEBHOOK.md](WEBHOOK.md) – aPager PRO einrichten & testen
- [CHANGELOG.md](CHANGELOG.md) – Versionsverlauf

## Schnellstart

```bash
cd ~/MagicMirror/modules
git clone <repo> MMM-aPagerAlarm   # oder Ordner hierher kopieren
cd MMM-aPagerAlarm
npm install
```

In `config.js` eintragen (Details in [CONFIG.md](CONFIG.md)):

```js
{
    module: "MMM-aPagerAlarm",
    position: "fullscreen_above",
    config: {
        webhookPort: 8090,
        personName: "Papa"
    }
},
```

MagicMirror neu starten und testen:

```
http://<raspberry-ip>:8090/alarm?keyword=B2%20-%20Zimmerbrand&unit=Florian%20Musterstadt
```

## Projektphilosophie

Die erste Alarmierung bleibt bewusst sachlich und technisch. Die anschließenden
Informationen sind beruhigend, wertschätzend und familienorientiert. Sobald der
Einsatz als beendet angenommen wird, verschwindet die Feuerwehr vollständig und
der Familienmodus wird automatisch wiederhergestellt.

## Lizenz

MIT
