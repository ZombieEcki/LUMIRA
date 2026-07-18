# Home Assistant anbinden

Kurzanleitung für die Portal-Seite **Alarmierung → Home-Assistant-Webhook**.
Für die technischen Details (genaue Payload-Felder, ein fertiges
`automations.yaml`-Beispiel) siehe
[modules/MMM-aPagerAlarm/WEBHOOK.md](../modules/MMM-aPagerAlarm/WEBHOOK.md).

## Was passiert hier?

LUMIRA meldet jeden Alarmphasenwechsel (Alarm → im Einsatz → war im Einsatz →
Familie) an Home Assistant, sobald dort eine Webhook-URL eingetragen ist.
Damit lassen sich z. B. Lampen schalten, Ansagen auslösen oder andere
Automatisierungen starten.

## Voraussetzung

Home Assistant muss im selben Netzwerk wie LUMIRA erreichbar sein. Die
Webhook-Integration ist Teil des HA-Kerns – es wird kein Add-on benötigt.

## Schritt 1 – Automatisierung mit Webhook-Auslöser anlegen

1. In Home Assistant: **Einstellungen → Automatisierungen & Szenen →
   Automatisierung erstellen → Neue Automatisierung**.
2. Auslöser hinzufügen: **Webhook**.
3. Home Assistant erzeugt automatisch eine Webhook-ID/-URL – diese kopieren.

## Schritt 2 – URL im LUMIRA-Portal eintragen

Im Portal unter **Alarmierung → Home-Assistant-Webhook** die kopierte URL
eintragen und speichern.

## Schritt 3 – Aktion der Automatisierung festlegen

LUMIRA sendet bei jedem Phasenwechsel einen POST-Request mit diesem Inhalt:

| Feld | Bedeutung |
|------|-----------|
| `state` | Phase: `0` Familie, `1` Alarm, `2` im Einsatz, `3` war im Einsatz |
| `keyword` | Stichwort/Einsatzart (falls von der Melde-App mitgeschickt) |
| `unit` | Einheit/Fahrzeug (falls mitgeschickt) |
| `time` | Zeitpunkt des Wechsels |

In der Automatisierung kann darauf z. B. mit einer Bedingung
„`trigger.json.state == 1`" (nur bei akutem Alarm reagieren) und einer
beliebigen Aktion (Licht an, Ansage, Benachrichtigung …) reagiert werden.

## Testen

Statt auf einen echten Alarm zu warten: auf der Portal-Seite **Steuerung**
gibt es einen **„🔔 Alarm testen"**-Button, der einen echten Testalarm auslöst
und damit auch die Home-Assistant-Automatisierung durchläuft.

## Fehlersuche

- Firewall/Port: Home Assistant muss von LUMIRA aus per HTTP erreichbar sein
  (Standardport 8123).
- `local_only`: manche HA-Webhook-Integrationen bieten eine Option, nur
  lokale Aufrufe zuzulassen – sollte im Heimnetz kein Problem sein, aber bei
  Verbindungsfehlern zuerst prüfen.
- LUMIRA sendet **nur bei Phasenwechsel**, nicht laufend – wenn nichts
  ankommt, mit dem Testalarm-Button (siehe oben) prüfen, ob überhaupt ein
  Request eingeht (z. B. über die HA-Automatisierungs-Historie).
