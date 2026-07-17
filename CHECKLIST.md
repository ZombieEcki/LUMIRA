# LUMIRA – Checkliste

Live-Übersicht, was bereits fertig ist und was als Nächstes geplant ist.
Wird bei jedem Fortschritt aktualisiert — einfach diese Datei auf GitHub öffnen,
um den aktuellen Stand zu sehen.

> Zum Projekt: [README.md](README.md) · Zur Installation: [INSTALL.md](INSTALL.md)

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

### Marke & Präsentation
- [x] LUMIRA-Logo eingebunden (Landingpage, Konfigurator, README)
- [x] Landingpage (`index.html`) mit Architektur, 4-Phasen-Timeline, Home-Assistant-Beispiel
- [x] **Konfigurator-Prototyp** (`konfigurator.html`) – erzeugt live eine `config.js`,
      inkl. Editions-Auswahl (Home/Fire/Rescue/Business/Station)
- [x] Vollständige Doku je Modul (README/CONFIG/WEBHOOK/CHANGELOG)

---

## 🔜 Ideen / Roadmap

| # | Idee | Status |
|---|------|--------|
| 1 | **Selbstkonfiguration per WLAN-Access-Point** – Pi spannt eigenes WLAN auf, Kunde konfiguriert per Web-UI ohne SSH | 🟡 Konzept fertig ([SELFSERVICE-KONZEPT.md](SELFSERVICE-KONZEPT.md)), Umsetzung offen |
| 2 | **Weitere Melde-Apps** mit Webhook prüfen (Divera, Alamos, FF-Agent …) | 📋 geplant (Recherche) |
| 3 | ~~Layout: Uhr links, Regenradar unter Wetter~~ | ✅ erledigt |
| 4 | **Alarm komplett abschaltbar** per Config (`enabled: false`) | 📋 geplant |
| 5 | **Zielgruppen-Profile** (Feuerwehr/Rettungsdienst/Polizei/THW/Familie/Verein) | 📋 geplant |
| 6 | **Produktvarianten**: LUMIRA Home/Fire/Rescue/Business/Station | 🟡 Konfigurator-Prototyp existiert, echte Profile in den Modulen fehlen noch |
| 7 | **Mehrsprachigkeit** (Sprachdateien für Oberfläche & Botschaften) | 📋 geplant |
| 8 | **Hintergrund-Option** (Farbe/Bild/Slideshow) | 📋 geplant |

**Legende:** ✅ erledigt · 🟡 in Arbeit / teilweise · 📋 geplant, noch nicht begonnen

---

## Nächster empfohlener Schritt

**#4 Alarm abschaltbar** und weitere kleine Punkte sind schnell umsetzbar.
**#1 Selbstkonfiguration** (Phase 1: Config-Web-UI ohne AP) ist der Baustein,
der Editionen, Profile, Sprachen und Hintergrund später alle in eine echte
Web-Oberfläche auf dem Pi einhängt statt nur im Konfigurator-Prototyp.
