# LUMIRA – Checkliste

Live-Übersicht, was bereits fertig ist und was als Nächstes geplant ist.
Wird bei jedem Fortschritt aktualisiert — einfach diese Datei auf GitHub öffnen,
um den aktuellen Stand zu sehen.

> Zum Projekt: [README.md](README.md) · Zur Installation: [docs/INSTALL.md](docs/INSTALL.md)

---

## ✅ Bereits umgesetzt

### Kernsystem
- [x] **MMM-aPagerAlarm** – Alarmmodul mit 4 Phasen (Alarm → im Einsatz → war im Einsatz → Familie)
- [x] Webhook-Server mit `/alarm`, `/clear`, `/home` (sofort in Phase 3 springen)
- [x] Home-Assistant-Weiterleitung (`forwardTargets` – POST bei jedem Phasenwechsel)
- [x] **MMM-SmartCompliments** – Familienassistent mit Prioritäts-Logik statt Zufallssprüchen
- [x] Feuerwehr-Kopplung: Kompliments phasenweise abschaltbar (`hideOnAlarmPhases`)
- [x] Danke-Nachwirkung nach dem Einsatz (`afterDutyEnabled`)
- [x] Manueller Ein-/Aus-Schalter für Kompliments (`/compliments/on · /off · /toggle`)

### Installation
- [x] **install.sh** – Ein-Befehl-Setup (`git clone` + `./install.sh`)
- [x] Node.js- und MagicMirror²-Installation (überspringt, falls vorhanden)
- [x] Interaktiver Assistent: Standort (automatische Geokoordinaten), Kalender, Nachrichten-Feed
- [x] Regenradar **realoliwer/MMM-RainRadarDWD als Standard**, im Assistenten abwählbar/ersetzbar
- [x] Autostart per pm2 mit Wayland (`WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`)
- [x] `./install.sh --reconfigure` – Config jederzeit neu erzeugen, ohne Neuinstallation
- [x] Emoji-Schrift (`fonts-noto-color-emoji`) automatisch installiert
- [x] `install.sh` im Repo als ausführbar markiert (kein `chmod`-Konflikt mehr bei `git pull`)

### Layout & Darstellung
- [x] Uhr oben links, Regenradar unter der Wettervorhersage
- [x] Personenbezogene Beispieldaten aus dem öffentlichen Repo entfernt

### Projektstruktur
- [x] Repo aufgeräumt: [`concept/`](concept) (Ideen/Konzepte), [`docs/`](docs)
      (Geräte-Doku), [`version/`](version) (Basis-Vorlage je Edition)
- [x] Repo auf **privat** gestellt, Pi-Zugriff per Deploy Key (SSH)

### Marke & Präsentation
- [x] LUMIRA-Logo eingebunden (Landingpage, Konfigurator, README)
- [x] Landingpage (`index.html`) mit Architektur, 4-Phasen-Timeline, Home-Assistant-Beispiel
- [x] **Konfigurator-Prototyp** (`konfigurator.html`) – erzeugt live eine `config.js`,
      inkl. Editions-Auswahl (Home/Fire/Rescue/Business/Station)
- [x] **Portal-Vorschau** (`portal.html`) – statische Design-Vorschau des
      Steuerungs- &amp; Konfigurationsportals (Ausgangspunkt für lumira-portal)
- [x] Vollständige Doku je Modul (README/CONFIG/WEBHOOK/CHANGELOG)

### Self-Service-Portal (lumira-portal)
- [x] **`settings.json`** als einzige Wahrheit + `lib/generate-config.js`
      (gemeinsam von Portal und `install.sh` genutzt, siehe
      [concept/selfservice.md](concept/selfservice.md) Abschnitt 7)
- [x] **Web-Portal im Heimnetz** (Port 8092): Steuerung (Alarm-Proxy,
      Kompliments-Schalter), Konfigurationsseiten je Edition, PIN-Schutz
- [x] **`MMM-LumiraStatus`** – Setup-Anleitung + WLAN-QR-Code auf dem
      Spiegel, dezenter Status-Hinweis im Normalbetrieb
- [x] **`install.sh`**-Integration: `--edition=`, `--hostname=`,
      `--no-selfservice`, Hostname-Vergabe (`hostnamectl` + `avahi-daemon`),
      systemd-Dienste (`lumira-portal`, `lumira-provision`)
- [x] Access-Point-Modus, Captive Portal &amp; Boot-/Watchdog-Logik
      (`lib/net.js`, `provision.js`) implementiert – **noch nicht auf
      echter Pi-Hardware getestet** (Details:
      [lumira-portal/README.md](lumira-portal/README.md) Abschnitt
      „Ehrlicher Hinweis zum Umsetzungsstand")

---

## 🔜 Ideen / Roadmap

| # | Idee | Status |
|---|------|--------|
| 1 | **Selbstkonfiguration per WLAN-Access-Point** – Pi spannt eigenes WLAN auf, Kunde konfiguriert per Web-UI ohne SSH | 🟡 umgesetzt ([lumira-portal/](lumira-portal), [concept/selfservice.md](concept/selfservice.md)), Access-Point/Watchdog noch auf echter Hardware zu verifizieren |
| 2 | **Weitere Melde-Apps** mit Webhook prüfen (Divera, Alamos, FF-Agent …) | 📋 geplant (Recherche) |
| 3 | ~~Layout: Uhr links, Regenradar unter Wetter~~ | ✅ erledigt |
| 4 | **Alarm komplett abschaltbar** per Config (`enabled: false`) | 📋 geplant |
| 5 | **Zielgruppen-Profile** (Feuerwehr/Rettungsdienst/Polizei/THW/Familie/Verein) | 📋 geplant |
| 6 | **Produktvarianten**: LUMIRA Home/Fire/Rescue/Business/Station | 🟡 Konzept fertig ([concept/produktvarianten.md](concept/produktvarianten.md)) + Basis-Vorlagen unter [`version/`](version) + Konfigurator-Prototyp |
| 7 | **Mehrsprachigkeit** (Sprachdateien für Oberfläche & Botschaften) | 📋 geplant |
| 8 | **Hintergrund-Option** (Farbe/Bild/Slideshow) | 📋 geplant |
| 9 | **Alexa-Integration** (Ansagen bei Alarm, Sprachsteuerung für Kompliments-Schalter) | 📋 geplant |

**Legende:** ✅ erledigt · 🟡 in Arbeit / teilweise · 📋 geplant, noch nicht begonnen

---

## Nächster empfohlener Schritt

**#1 Selbstkonfiguration** ist implementiert (siehe [lumira-portal/](lumira-portal));
als Nächstes steht ein echter Praxistest auf einem Raspberry Pi an
(Access-Point-Umschaltung, Captive Portal auf iOS/Android, Watchdog-Rückfall –
siehe die Testpunkte in [lumira-portal/README.md](lumira-portal/README.md)).
Danach sind **#4 Alarm abschaltbar** und weitere kleine Punkte schnell umsetzbar.
