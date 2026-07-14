# Installation – MMM-aPagerAlarm

## Voraussetzungen

- Raspberry Pi (3/4/5) mit installiertem [MagicMirror²](https://docs.magicmirror.builders/)
- Node.js (kommt mit MagicMirror)
- aPager PRO (für den Echtbetrieb)
- Raspberry Pi dauerhaft eingeschaltet, Netzwerkzugang

## 1. Modul kopieren

Den Ordner `MMM-aPagerAlarm` in das `modules`-Verzeichnis legen:

```
~/MagicMirror/modules/MMM-aPagerAlarm/
```

## 2. Abhängigkeiten installieren

```bash
cd ~/MagicMirror/modules/MMM-aPagerAlarm
npm install
```

Damit werden `express` und `body-parser` installiert (für den Webhook-Server).

## 3. (Optional) Alarmton hinterlegen

Eine `alarm.mp3` in den Ordner `sounds/` legen. Siehe `sounds/README.txt`.
Aus urheberrechtlichen Gründen ist keine mp3 enthalten.

## 4. Modul in config.js aktivieren

`~/MagicMirror/config/config.js` öffnen und im `modules`-Array ergänzen:

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

> Achte auf das Komma nach der schließenden Klammer `},`, wenn weitere Module folgen.

Alle Optionen: siehe [CONFIG.md](CONFIG.md).

## 5. MagicMirror neu starten

```bash
pm2 restart MagicMirror
# oder, je nach Setup:
# cd ~/MagicMirror && npm start
```

In der Konsole sollte erscheinen:

```
MMM-aPagerAlarm: Webhook-Server läuft auf Port 8090, Alarm-Endpunkt /alarm, Clear-Endpunkt /clear
```

## 6. Testalarm senden

Im Browser (oder auf dem Pi):

```
http://<raspberry-ip>:8090/alarm?keyword=B2%20-%20Zimmerbrand&unit=Florian%20Musterstadt
```

Das rote Alarmfenster sollte sofort mittig erscheinen.

## 7. aPager Webhook einrichten

Siehe [WEBHOOK.md](WEBHOOK.md).

## Fehlerbehebung

| Symptom | Ursache / Lösung |
|---------|------------------|
| `Cannot GET /alarm` | Falscher Port – MagicMirror belegt 8080. `webhookPort: 8090` verwenden. |
| Health-Check ok, aber kein Fenster | Modul nicht in `config.js` aktiv oder MagicMirror nicht neu gestartet. |
| Startzeile fehlt in der Konsole | `npm install` nicht ausgeführt oder Port belegt (`EADDRINUSE`). |
| Kein Ton | `alarm.mp3` fehlt in `sounds/`, oder Browser blockiert Autoplay (im Electron-Kiosk normalerweise ok). |
| Fenster bleibt zu lange/kurz | Zeiten über `alarmDuration`, `infoDuration`, `returnDuration` anpassen. |

**Health-Check:**

```
http://<raspberry-ip>:8090/apager/health
```

**Laufenden Einsatz manuell beenden:**

```
http://<raspberry-ip>:8090/clear
```
