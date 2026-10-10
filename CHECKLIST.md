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
- [x] **Portal-Feedback-Runde**: Alarm-Testbutton, „Steuerung der Module"
      (Platzhalter-Liste + rein visuelle Anordnungs-Vorschau), Seite
      „Personen" (nur Name + Geburtstag), bis zu 3 kombinierte Kalender,
      Kalender/Nachrichten getrennt, Einsatzkraft-Name auf der
      Alarmierung-Seite, eigener Alarmton-Upload, Home-Assistant-Hilfe,
      PIN entfernen, Copyright-Hinweis, „Pi neu starten"
- [x] **Zwei Bugfixes aus dem ersten echten Praxistest**: WLAN-QR-Code auf
      dem Spiegel enthielt nie das Access-Point-Passwort (`/api/status` gab
      `psk` nicht weiter) - jetzt behoben, Passwort zusätzlich als Klartext
      auf dem Spiegel sichtbar; `install.sh` startete `lumira-portal.service`
      bei einem Update nur, falls es noch nicht lief, wodurch neuer Code nach
      `git pull` nie geladen wurde - jetzt immer echter `restart`

### Familienplan (MMM-FamilyPlan)
- [x] **`MMM-FamilyPlan`** – Familienplan oben links (Farbbalken, Avatar,
      farbige Dienste mit Symbol), Live-Reload aus `~/.lumira/familyplan.json`
- [x] **Faire Rotation** (`lumira-portal/lib/familyplan-rotation.js`):
      deterministisch, in jedem Zyklus jeder Dienst genau einmal pro Person,
      keine direkte Wiederholung, Rollen (Erwachsene/Kinder), feste Paare
- [x] **Portal-Seite „Familienplan“**: Übersicht mit Tausch per Dropdown,
      Mitgliederverwaltung mit Avataren/Foto-Upload, Dienste, Wochenplan-
      Vorschau, Einstellungen; Wochenwechsel im Portal-Prozess
- [x] Gemeinsamer Speicher `lib/store.js` (Backup + atomares Schreiben) für
      settings.json, compliments.json und familyplan.json
- [x] Seite „Personen“ → **„Wichtige Termine“**: Geburtstage (verknüpft mit
      den Familienmitgliedern, Umbenennung zieht mit), Hochzeitstag und
      Countdowns; Personen werden nur noch im Familienplan gepflegt
- [x] Bugfix: Geburtstage aus dem Portal wurden nie erkannt (Portal speicherte
      „TT.MM.“, MMM-SmartCompliments erwartet „MM-TT“) – jetzt umgerechnet,
      auch für alte Einträge
- [x] Unit-Tests (`npm test` in `lumira-portal/`, 34 Tests)

---

## 🐛 Bekannte Bugs (offen)

Gefunden beim echten Praxistest der WLAN-Ersteinrichtung auf dem Pi.

### 1. Nach erfolgreicher WLAN-Verbindung im Setup kein automatischer Rücksprung
**Was passiert:** Handy ist mit dem Setup-Access-Point „LUMIRA-Setup" verbunden,
Heimnetz-Zugangsdaten werden im Portal eingegeben und die Verbindung klappt.
Die Seite zeigt danach nur einen Text („Bitte verbinde dein Handy jetzt
ebenfalls mit dem Heimnetz und rufe die Portal-Adresse erneut auf") -
kein automatischer Reload.

**Ursache:** `lumira-portal/public/app.js` (`connectWifi()`, Setup-Screen)
zeigt nach Erfolg nur eine statische Meldung, es gibt keine Polling-/
Redirect-Logik.

**Gewünschtes Verhalten:** Sobald die Pi-seitige Verbindung steht, soll die
Seite selbstständig versuchen, die Portal-Adresse im Heimnetz zu erreichen
(z.B. per wiederholtem `fetch()` auf die neue Adresse alle paar Sekunden) und
bei Erfolg per `location.href` dorthin weiterleiten. Das Handy muss sich dafür
selbst wieder mit dem bekannten Heimnetz verbinden (Auto-Join) - das kann das
Portal nicht erzwingen, nur per Polling erkennen. Nach einem Timeout (z.B.
60s) auf die bisherige manuelle Anleitung zurückfallen.

**Status:** offen, noch nicht umgesetzt.

### 2. Falsches WLAN-Passwort reißt den Setup-Access-Point ab
**Was passiert:** Wird im Setup ein falsches Passwort fürs Heimnetz
eingegeben, verliert das Handy die Verbindung zum Portal komplett - keine
Fehlermeldung, keine Möglichkeit, die Zugangsdaten erneut einzugeben.

**Ursache (Hypothese):** `POST /api/wifi/connect` → `netLib.connectWifi()`
ruft `nmcli connection up <neues Profil>` auf demselben WLAN-Funkadapter auf,
auf dem gerade der Access Point läuft. Das bringt die aktive AP-Verbindung
zwangsläufig herunter - unabhängig davon, ob die neue Verbindung danach
erfolgreich ist oder (bei falschem Passwort) fehlschlägt. Schlägt sie fehl,
bleibt der Access Point unten, weil `stopHotspot()`/`startHotspot()` an
dieser Stelle nicht erneut aufgerufen wird.

**Gewünschtes Verhalten:** Bei fehlgeschlagener Verbindung (falsches
Passwort) soll der Access Point automatisch wieder aktiviert werden, damit
das Handy erneut Zugriff aufs Portal bekommt, und die Fehlermeldung soll
klar sagen "WLAN-Passwort falsch" statt eines generischen nmcli-Fehlers -
mit Aufforderung, es erneut einzugeben.

**Status:** offen, noch nicht umgesetzt.

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
| 10 | **Sprüche von MMM-SmartCompliments in `compliments.json`** – vom Portal bearbeitbar statt in `config.js` fest codiert | 🟡 Phase 1-3 umgesetzt (Portal-Seite „Sprüche" + Stimmungs-Auswahl + Live-Reload, [concept/smartcompliments-json.md](concept/smartcompliments-json.md)); Live-Reload noch auf echter Pi-Hardware zu verifizieren; Phasen 4-7 (Migration, enabled/pinned, Import/Export, personMessages, Mehrsprachigkeit) offen |
| 11 | **Familienplan** – Wochendienste (4 Personen × 2 Dienste) mit fairer automatischer Rotation, neues Modul `MMM-FamilyPlan` oben links, Verwaltung im Portal | 🟡 Phase 0-3 umgesetzt ([concept/familienplan.md](concept/familienplan.md)): Modul, Rotation mit Rollen & festen Paaren, Portal-Seite „Familienplan“, Tests; noch auf echter Pi-Hardware zu verifizieren. Offen: Zukunftswochen bearbeiten, Fairness-Matrix (Phase 4), Export/Import im Portal (Phase 5), Lizenzangabe der Avatare, Einbau auf dem Familien-Spiegel nach dem Pi-3-Fix |

**Legende:** ✅ erledigt · 🟡 in Arbeit / teilweise · 📋 geplant, noch nicht begonnen

---

## Nächster empfohlener Schritt

**#1 Selbstkonfiguration** ist implementiert (siehe [lumira-portal/](lumira-portal));
als Nächstes steht ein echter Praxistest auf einem Raspberry Pi an
(Access-Point-Umschaltung, Captive Portal auf iOS/Android, Watchdog-Rückfall –
siehe die Testpunkte in [lumira-portal/README.md](lumira-portal/README.md)).
Danach sind **#4 Alarm abschaltbar** und weitere kleine Punkte schnell umsetzbar.
