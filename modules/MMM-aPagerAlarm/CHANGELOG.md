# Changelog

Alle nennenswerten Änderungen an diesem Projekt.
Format nach [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

## [2.0.0] – 2026-07-11

### Hinzugefügt
- Familien-Informationssystem mit vier Zuständen:
  - **0 Familienmodus** (Standard, nichts sichtbar)
  - **1 Alarm** (rotes Overlay, Blaulicht, Ton, Countdown – 15 min)
  - **2 „… ist im Einsatz"** (ruhige Glassmorphism-Karte mit rotierenden
    liebevollen Botschaften – 4 h)
  - **3 „… war im Einsatz"** (grüne, wertschätzende Karte – 30 min)
- Automatische Zustandsübergänge, rein ereignisgesteuert (keine Polling-Schleifen).
- Rotierende Botschaften (`careMessages`, `returnMessages`), Wechsel alle 5 min.
- Konfigurierbarer `personName`, Zeiten (`alarmDuration`, `infoDuration`,
  `returnDuration`) und Botschaften.
- Glassmorphism-Design für die ruhigen Karten (Blur, Weißraum, weiche Schatten).
- Zentrierung aller Karten per `position: fixed` + `transform` (unabhängig von
  der MagicMirror-Region).
- Testmodus mit wählbarem Zustand (`testMode`, `testState`).
- Umfangreiche Konfiguration: Zustände einzeln abschaltbar
  (`enableInfoState`, `enableReturnState`), frei anpassbare Texte/Labels,
  `randomizeMessages` (zufällig oder sequentiell), `heartSymbol`,
  Ton-Optionen (`soundVolume`, `repeatSoundSeconds`), `dimOpacity`,
  `showDate`, `useGlass`, `locale`.
- `hideModulesDuringAlarm`: andere Module während des Alarms aus- und
  danach wieder einblenden.
- `broadcastNotifications`: sendet `APAGER_STATE` an andere Module.
- Vollständige Dokumentation: INSTALL, CONFIG, WEBHOOK, CHANGELOG.

### Geändert
- Standard-Port von 8080 auf **8090** (8080 ist von MagicMirror belegt).

## [1.1.0]

### Hinzugefügt
- `/clear`-Endpunkt zum manuellen Beenden eines laufenden Alarms.

## [1.0.0]

### Hinzugefügt
- Erste Version: zentriertes Alarmfenster für 15 Minuten mit Einheit,
  Stichwort und Alarmzeit; Webhook-Server; Alarmton; Countdown.
