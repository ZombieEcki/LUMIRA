# Webhook & aPager PRO – MMM-aPagerAlarm

Das Modul startet auf dem Raspberry Pi einen kleinen HTTP-Server (Standard-Port **8090**),
der die Alarmierung von aPager PRO entgegennimmt.

## Endpunkte

| Methode | Pfad | Zweck |
|---------|------|-------|
| POST / GET | `/alarm` | Neue Alarmierung auslösen |
| POST / GET | `/clear` | Laufenden Einsatz sofort beenden |
| POST / GET | `/home` | „Zuhause": sofort in Phase 3 („war im Einsatz") springen |
| GET | `/apager/health` | Status-Check (`{"status":"running"}`) |

## aPager PRO konfigurieren

**URL (lokal, im Heimnetz):**

```
http://192.168.xxx.xxx:8090/alarm
```

**URL (von überall, empfohlen – z. B. über Cloudflare Tunnel):**

```
https://deinedomain.de/alarm
```

**Einstellungen in aPager:**

| Einstellung | Wert |
|-------------|------|
| HTTP POST statt GET | ✅ Ein |
| Einheitenkennung übertragen | ✅ Ein |
| Stichwort übertragen | ✅ Ein |

aPager sendet dann z. B.:

```json
{
  "unit": "Florian Musterstadt",
  "keyword": "B2 Zimmerbrand"
}
```

Das Modul akzeptiert auch die deutschen Feldnamen `einheit` und `stichwort`
sowie `application/x-www-form-urlencoded`.

## Felder

| Feld | Alternative | Pflicht | Beschreibung |
|------|-------------|---------|--------------|
| `keyword` | `stichwort` | empfohlen | Einsatzstichwort (z. B. "B2 - Zimmerbrand") |
| `unit` | `einheit` | optional | Einheit (z. B. "Florian Musterstadt") |

Die Alarmzeit wird beim Empfang automatisch gesetzt (Serverzeit des Pi).

## Testen

**Per Browser (GET):**

```
http://<raspberry-ip>:8090/alarm?keyword=B2%20-%20Zimmerbrand&unit=Florian%20Musterstadt
```

**Per curl (POST, JSON):**

```bash
curl -X POST http://<raspberry-ip>:8090/alarm \
  -H "Content-Type: application/json" \
  -d '{"unit":"Florian Musterstadt","keyword":"B2 - Zimmerbrand"}'
```

**Einsatz manuell beenden:**

```bash
curl -X POST http://<raspberry-ip>:8090/clear
```

**Zuhause angekommen (in Phase 3 springen):**

```
http://<raspberry-ip>:8090/home
```

(GET im Browser oder `curl -X POST http://<raspberry-ip>:8090/home`)

## Home Assistant anbinden

### A) MagicMirror steuert Home Assistant (z. B. Licht bei Alarm)

Trage in der `config.js` unter `forwardTargets` deine HA-Webhook-URL(s) ein:

```js
config: {
    forwardTargets: [
        "http://homeassistant.local:8123/api/webhook/feuerwehr_alarm"
    ]
}
```

Bei **jedem Phasenwechsel** sendet das Modul dann ein POST:

```json
{ "state": 1, "keyword": "B2 - Zimmerbrand", "unit": "Florian Musterstadt", "time": 1720000000000 }
```

`state`: `1` = Alarm, `2` = im Einsatz, `3` = war im Einsatz, `0` = Familienmodus (Einsatz vorbei).

Passende Automation in Home Assistant (`automations.yaml`):

```yaml
- alias: Feuerwehr - Alarm eingegangen
  trigger:
    - platform: webhook
      webhook_id: feuerwehr_alarm
      allowed_methods: [POST]
      local_only: true
  condition:
    - "{{ trigger.json.state == 1 }}"
  action:
    - service: light.turn_on
      target:
        entity_id: light.flur
      data:
        color_name: red
        brightness_pct: 100

- alias: Feuerwehr - Einsatz vorbei (Licht zuruecksetzen)
  trigger:
    - platform: webhook
      webhook_id: feuerwehr_alarm
      allowed_methods: [POST]
      local_only: true
  condition:
    - "{{ trigger.json.state == 0 }}"
  action:
    - service: light.turn_off
      target:
        entity_id: light.flur
```

### B) Home Assistant steuert MagicMirror

HA kann umgekehrt die Endpunkte aufrufen, z. B. per `rest_command`:

```yaml
rest_command:
  feuerwehr_zuhause:
    url: "http://<pi-ip>:8090/home"
    method: POST
```

## Zugriff von unterwegs (Cloudflare Tunnel, empfohlen)

```
Handy → Internet → Cloudflare Tunnel → Raspberry Pi (Port 8090) → MagicMirror
```

Vorteile: keine Portfreigabe im Router, verschlüsselte Verbindung, weltweit erreichbar,
deutlich sicherer als eine offene Portweiterleitung.

Der Tunnel zeigt dabei einfach auf `http://localhost:8090` auf dem Pi – am Modul
selbst muss nichts geändert werden.
