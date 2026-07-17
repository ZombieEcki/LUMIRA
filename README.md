<p align="center"><img src="logo/lumira-logo-website.png" alt="LUMIRA – Familie. Sicherheit. Verbunden." width="640"></p>
<p align="center"><b>MagicMirror² – Feuerwehr- &amp; Familien-Informationssystem</b></p>
<p align="center"><i>Der Spiegel gehört der Familie. Bis der Melder geht.</i></p>

---

LUMIRA ist ein komplettes, sofort einsatzbereites MagicMirror²-Setup für
Feuerwehrangehörige und ihre Familien. Ein einziger Befehl installiert alles auf
einem Raspberry Pi: MagicMirror², alle Module, eine per Assistent erzeugte
`config.js` **und** den automatischen Start beim Booten.

> 📋 **[CHECKLIST.md](CHECKLIST.md)** – live Übersicht, was schon erledigt ist und was als Nächstes geplant ist.
> 🛜 **[concept/selfservice.md](concept/selfservice.md)** – Konzept für Ersteinrichtung & Konfiguration per WLAN-Access-Point, ganz ohne SSH.
> 📦 **[concept/produktvarianten.md](concept/produktvarianten.md)** – Konzept für die Editionen Home/Fire/Rescue/Business/Station.

## 📁 Projektstruktur

| Ordner | Inhalt |
|--------|--------|
| [`modules/`](modules) | Die beiden Eigenmodule (MMM-aPagerAlarm, MMM-SmartCompliments) |
| [`version/`](version) | Basis-`config.js`-Vorlage je Edition, für die manuelle Grundinstallation |
| [`docs/`](docs) | Geräte-/Installationsdokumentation |
| [`concept/`](concept) | Ausformulierte Konzepte & Ideen für kommende Features |
| [`logo/`](logo) | Markenmaterial |

**Zwei getrennte Rollen:** Wir richten ein Gerät **manuell** mit der passenden
Edition aus `version/<edition>/` ein (Grundinstallation). Der Kunde
konfiguriert danach **nur noch seine eigenen Daten** per Captive Portal &
Web – siehe [concept/selfservice.md](concept/selfservice.md).

## 🚀 Installation in einem Befehl

```bash
git clone https://github.com/ZombieEcki/LUMIRA.git ~/LUMIRA
cd ~/LUMIRA
chmod +x install.sh
./install.sh
```

Das Skript erledigt automatisch:

1. **Node.js** installieren (falls nötig)
2. **MagicMirror²** klonen &amp; installieren
3. beide **Eigenmodule** installieren
4. deine Daten **abfragen** (Standort, Kalender, News …)
5. **`config.js`** erzeugen
6. **Autostart** per pm2 einrichten (Wayland, startet beim Booten)

Am Ende läuft LUMIRA – und startet nach jedem Neustart des Pi von selbst.

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

## 🧙 Was der Assistent abfragt

| Frage | Wofür | Automatik |
|-------|-------|-----------|
| **Name der Person** | Alarm-/Familienkarten | — |
| **Home-Assistant-Webhook** (optional) | Licht bei Alarm | wird in `forwardTargets` eingetragen |
| **Ort/Stadt** | Wetter &amp; Standort | wird per Open-Meteo automatisch in Koordinaten umgewandelt |
| **Kalender-URL** | Familienkalender | `webcal://` → `https://` automatisch |
| **Nachrichten-Feed** | Newsticker | Auswahl Tagesschau / heise / eigener RSS |
| **Regenradar** | DWD-Radar | standardmäßig installiert (realoliwer/MMM-RainRadarDWD), andere Git-URL oder Ablehnen möglich |
| **Autostart** | Start beim Booten | richtet pm2 + Wayland ein |

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

Ports: **8080** MagicMirror · **8090** aPagerAlarm · **8091** SmartCompliments.
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
| `./install.sh --no-wizard` | ohne Fragen (nutzt `config.js.sample`) |
| `./install.sh --no-pm2` | ohne Autostart |
| `./install.sh --force-config` | vorhandene `config.js` überschreiben (Backup) |

## 📖 Dokumentation

- [docs/INSTALL.md](docs/INSTALL.md) – ausführliche Installation &amp; Fehlerbehebung
- [docs/README.md](docs/README.md) – Dokumentations-Übersicht
- [index.html](index.html) – Projekt-Landingpage
- [modules/MMM-aPagerAlarm](modules/MMM-aPagerAlarm) – Alarmmodul
- [modules/MMM-SmartCompliments](modules/MMM-SmartCompliments) – Familienassistent

## ⚠️ Worauf achten

- **Alarmton**: `alarm.mp3` liegt aus Lizenzgründen nicht im Repo – nach der
  Installation nach `modules/MMM-aPagerAlarm/sounds/` legen.
- **iCloud-Kalender** muss öffentlich freigegeben sein.
- **Regenradar**: standardmäßig [realoliwer/MMM-RainRadarDWD](https://github.com/realoliwer/MMM-RainRadarDWD); im Assistenten mit „Nein" abwählbar oder mit eigener Git-URL ersetzbar.
- **Autostart** setzt eine grafische Wayland-Sitzung voraus (Bookworm-Standard).

## Lizenz

MIT — siehe [LICENSE](LICENSE).
