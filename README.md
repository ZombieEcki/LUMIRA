<p align="center"><img src="logo/lumira-logo-website.png" alt="LUMIRA – Familie. Sicherheit. Verbunden." width="640"></p>
<p align="center"><b>MagicMirror² – Feuerwehr- &amp; Familien-Informationssystem</b></p>
<p align="center"><i>Der Spiegel gehört der Familie. Bis der Melder geht.</i></p>

---

LUMIRA ist ein komplettes, sofort einsatzbereites MagicMirror²-Setup für
Feuerwehrangehörige und ihre Familien. Ein einziger Befehl installiert alles auf
einem Raspberry Pi: MagicMirror², alle Module, eine lauffähige `config.js`
**und** den automatischen Start beim Booten. Die persönlichen Daten (Name,
Standort, Kalender …) trägt der Kunde danach selbst über das
Self-Service-Portal ein – nicht mehr interaktiv im Terminal.

> 📋 **[CHECKLIST.md](CHECKLIST.md)** – live Übersicht, was schon erledigt ist und was als Nächstes geplant ist.
> 🛜 **[lumira-portal/](lumira-portal)** – Self-Service-Portal (Ersteinrichtung & laufende Konfiguration, Port 8092), siehe [concept/selfservice.md](concept/selfservice.md).
> 📦 **[concept/produktvarianten.md](concept/produktvarianten.md)** – Konzept für die Editionen Home/Fire/Rescue/Business/Station.

## 📁 Projektstruktur

| Ordner | Inhalt |
|--------|--------|
| [`modules/`](modules) | Die eigenen Module (MMM-aPagerAlarm, MMM-SmartCompliments, MMM-LumiraStatus) |
| [`lumira-portal/`](lumira-portal) | Self-Service-Portal – Ersteinrichtung per Access Point & laufende Konfiguration im Heimnetz |
| [`version/`](version) | Basis-`config.js`-Vorlage je Edition, für die manuelle Grundinstallation |
| [`docs/`](docs) | Geräte-/Installationsdokumentation |
| [`concept/`](concept) | Ausformulierte Konzepte & Ideen für kommende Features |
| [`logo/`](logo) | Markenmaterial |

**Zwei getrennte Rollen:** Wir richten ein Gerät **manuell** mit der passenden
Edition aus `version/<edition>/` ein (Grundinstallation, per
`./install.sh --edition=<home|fire|rescue|business|station>`). Der Kunde
konfiguriert danach **nur noch seine eigenen Daten** per Captive Portal &
Web unter `http://lumira.local:8092` – siehe
[concept/selfservice.md](concept/selfservice.md) und
[lumira-portal/README.md](lumira-portal/README.md).

## 🚀 Installation in einem Befehl

```bash
git clone https://github.com/ZombieEcki/LUMIRA.git ~/LUMIRA
cd ~/LUMIRA
chmod +x install.sh
./install.sh
```

Das Skript erledigt automatisch:

1. **Node.js** installieren (falls nötig)
2. **Hostname** setzen (Standard `lumira`, für `http://lumira.local:8092`) &amp; `avahi-daemon`
3. **MagicMirror²** klonen &amp; installieren
4. alle **Eigenmodule** installieren (inkl. `MMM-LumiraStatus`)
5. das **Self-Service-Portal** (`lumira-portal`, Port 8092) samt Watchdog als systemd-Dienste einrichten
6. **`config.js`** mit Platzhalter-Werten für die gewählte Edition erzeugen
7. **Autostart** per pm2 einrichten (Wayland, startet beim Booten)

Am Ende läuft LUMIRA mit Platzhalter-Daten – und startet nach jedem Neustart
des Pi von selbst. Die echten persönlichen Daten (Name, Standort, Kalender,
News, WLAN …) trägt der Kunde danach selbst im Browser unter
`http://lumira.local:8092` ein (siehe [lumira-portal/](lumira-portal)),
keine Terminal-Eingabe mehr nötig.

## 🧩 Enthaltene Module

| Modul | Aufgabe | Typ |
|-------|---------|-----|
| `alert` | Standard-Meldungen | Standard |
| `updatenotification` | zeigt verfügbare Updates | Standard |
| `clock` | digitale Uhr | Standard |
| `calendar` | Familienkalender (iCloud/ICS) | Standard |
| `weather` (current + forecast) | Wetter über Open-Meteo | Standard |
| `newsfeed` | Nachrichtenticker (RSS) | Standard |
| [`MMM-RainRadarDWD`](https://github.com/realoliwer/MMM-RainRadarDWD) | DWD-Regenradar (Standard, abwählbar) | Drittanbieter |
| **`MMM-aPagerAlarm`** | Feuerwehr-Alarmierung + Home-Assistant-Weiterleitung | **Eigen** |
| **`MMM-SmartCompliments`** | intelligente Familien-/Motivationssprüche | **Eigen** |
| **`MMM-LumiraStatus`** | Setup-Anleitung/QR-Code bzw. dezenter Status-Hinweis auf dem Spiegel | **Eigen** |

## 🧙 Was im Self-Service-Portal einzutragen ist

Nicht mehr Teil von `install.sh` – trägt der Kunde selbst unter
`http://lumira.local:8092` ein (siehe [lumira-portal/](lumira-portal)):

| Feld | Wofür | Automatik |
|------|-------|-----------|
| **Name der Person** | Alarm-/Familienkarten | — |
| **Home-Assistant-Webhook** (optional) | Licht bei Alarm | wird in `forwardTargets` eingetragen |
| **Ort/Stadt** | Wetter &amp; Standort | Ortssuche im Portal wandelt automatisch in Koordinaten um (Open-Meteo) |
| **Kalender-URL** | Familienkalender | `webcal://` → `https://` automatisch |
| **Nachrichten-Feed** | Newsticker | Auswahl Tagesschau / heise / eigener RSS |
| **WLAN** | Heimnetz | Scan + Verbinden direkt im Portal |

**Regenradar** und **Autostart** bleiben Installations-Entscheidungen
(`./install.sh --no-rainradar` / `--rainradar-url=` bzw. `--no-pm2`).

## 🚒 Die vier Phasen

| # | Phase | Dauer | SmartCompliments |
|---|-------|-------|------------------|
| 0 | Familienmodus | Standard | sichtbar |
| 1 | Alarm | 15 Min | ausgeblendet |
| 2 | … ist im Einsatz | 4 Std | laufen weiter |
| 3 | … war im Einsatz | 30 Min | laufen weiter |
| ↺ | zurück zur Familie | bis Mitternacht | Danke-Nachwirkung |

## 🎛 Steuerung per URL

| Endpunkt | Wirkung |
|----------|---------|
| `:8090/alarm` | Alarmierung auslösen |
| `:8090/home` | „zuhause": in Phase 3 springen |
| `:8090/clear` | Einsatz beenden |
| `:8091/compliments/off · /on · /toggle` | Familienassistent schalten |

Ports: **8080** MagicMirror · **8090** aPagerAlarm · **8091** SmartCompliments
· **8092** lumira-portal (Self-Service, siehe [lumira-portal/](lumira-portal)).
(Port 8080 nie für die Module verwenden.)

## 🔁 Autostart (Wayland)

Der Autostart nutzt genau diese Umgebung (Raspberry Pi OS Bookworm):

```bash
cd ~/MagicMirror
export WAYLAND_DISPLAY=wayland-0
export XDG_RUNTIME_DIR=/run/user/$(id -u)
npm start
```

Das Skript legt das dafür als `~/MagicMirror/mm.sh` an und registriert es via pm2
als Dienst, der beim Booten startet.

Nützliche Befehle:

```bash
pm2 logs MagicMirror      # Logs
pm2 restart MagicMirror   # neu starten
pm2 stop MagicMirror      # anhalten
```

## ⚙️ Skript-Optionen

| Befehl | Wirkung |
|--------|---------|
| `./install.sh` | volle Installation mit Assistent + Autostart |
| `./install.sh --reconfigure` | nur die `config.js` neu erzeugen |
| `./install.sh --no-wizard` | statische `config.js.sample` statt settings.json-Pipeline |
| `./install.sh --no-pm2` | ohne Autostart |
| `./install.sh --force-config` | vorhandene `config.js` überschreiben (Backup) |
| `./install.sh --edition=fire` | Edition der Grundinstallation (`home\|fire\|rescue\|business\|station`, Standard `fire`) |
| `./install.sh --hostname=lumira` | Hostname für `http://<name>.local:8092` (Standard `lumira`) |
| `./install.sh --no-selfservice` | ohne Self-Service-Portal/Watchdog (lumira-portal) |
| `./install.sh --no-rainradar` | ohne DWD-Regenradar-Modul |
| `./install.sh --rainradar-url=…` | abweichende Git-URL für das Regenradar-Modul |

## 📖 Dokumentation

- [docs/INSTALL.md](docs/INSTALL.md) – ausführliche Installation &amp; Fehlerbehebung
- [docs/README.md](docs/README.md) – Dokumentations-Übersicht
- [index.html](index.html) – Projekt-Landingpage
- [konfigurator.html](konfigurator.html) – Vorschau der Ersteinrichtung (config.js erzeugen)
- [portal.html](portal.html) – Design-Vorschau des Steuerungs- &amp; Konfigurationsportals (statisch, ohne Backend)
- [lumira-portal/README.md](lumira-portal/README.md) – das echte Self-Service-Portal (Port 8092), inkl. API/Testen
- [modules/MMM-aPagerAlarm](modules/MMM-aPagerAlarm) – Alarmmodul
- [modules/MMM-SmartCompliments](modules/MMM-SmartCompliments) – Familienassistent
- [modules/MMM-LumiraStatus](modules/MMM-LumiraStatus) – Setup-/Status-Anzeige auf dem Spiegel

## ⚠️ Worauf achten

- **Alarmton**: `alarm.mp3` liegt aus Lizenzgründen nicht im Repo – nach der
  Installation nach `modules/MMM-aPagerAlarm/sounds/` legen.
- **iCloud-Kalender** muss öffentlich freigegeben sein.
- **Regenradar**: standardmäßig [realoliwer/MMM-RainRadarDWD](https://github.com/realoliwer/MMM-RainRadarDWD); per `./install.sh --no-rainradar` abwählbar oder mit `--rainradar-url=` ersetzbar.
- **Autostart** setzt eine grafische Wayland-Sitzung voraus (Bookworm-Standard).

## Lizenz

MIT — siehe [LICENSE](LICENSE).
