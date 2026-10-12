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
- [x] **Wochenplan** (Phase 4): kommende Wochen vorab tauschen (gelten ab
      Wochenbeginn), „Rotationsplan neu generieren“, Begründung je Zuordnung
      („Warum so?“), Tabelle „Wie oft hatte wer was?“ (letzte 12 Wochen)
- [x] **Datensicherung** (Phase 5): Export/Import als eine Datei inkl. Fotos,
      automatische Backups im Portal wiederherstellen (auch bei beschädigter
      Datei), Bedienungsanleitung [docs/FAMILIENPLAN.md](docs/FAMILIENPLAN.md)
- [x] Avatare: eigene Erstellung des LUMIRA-Teams (Quelle in media/README.md)
- [x] Unit-Tests (`npm test` in `lumira-portal/`, 108 Tests)

### Portal: Updates & Info
- [x] **Updates für MagicMirror² und externe Module** (z. B. MMM-RainRadarDWD):
      automatische Prüfung alle 12 h, Hinweis-Punkt am Menüpunkt „Info“ und
      Banner auf „Steuerung“, manuell aktualisieren unter Info (mit
      „Was ist neu?“ und Protokoll), „Zurück zur vorherigen Version“
- [x] IPv4-Adresse und Portal-Adresse per IP unter Info (für Handys, die
      `lumira.local` nicht auflösen)

### Portal als App (Startbildschirm, „Weg 1“)
- [x] Web-App-Manifest, App-Symbole (inkl. randlosem „maskable“-Symbol für
      Android), iPhone-Metadaten, sichere Ränder (Notch/Home-Leiste)
- [x] Seite „Mehr → Als App“ mit Anleitung für iPhone/iPad, Android und PC/Mac
      (Gerät wird erkannt), Hinweis auf der Startseite (nur Handy im Browser,
      wegklickbar), Installieren-Knopf, sobald der Browser es anbietet (HTTPS)
- [x] „Auf diesem Gerät angemeldet bleiben“ (90 Tage statt 12 h); Sitzungen
      überleben einen Portal-Neustart (`~/.lumira/sessions.json`, nur Hashes)
- [x] „Sicherheit“: angemeldete Geräte zählen, alle anderen abmelden; neuer
      PIN meldet alle anderen Geräte ab; erster PIN lässt das aktuelle Gerät
      angemeldet (vorher 401 bis zum Neuladen)
- [ ] Auf echtem iPhone und Android-Handy testen

### Portal: Spiegel live & Kopfzeile
- [x] **Live-Bild des Spiegels** auf der Startseite (Karte „Spiegel“,
      Umschalter Live/Aufbau): alle 5 s, nur solange Start offen und der Tab
      sichtbar ist; Aufnahme in `MMM-LumiraStatus` (Electron, Ersatz `grim`),
      nur von localhost abrufbar, im Portal hinter dem PIN; bei nicht
      erreichbarem Spiegel automatisch „Aufbau“; Bild wird auch bei Alarm gezeigt
- [x] Kopfzeile zeigt die **Familienmitglieder** (Avatare + Anzahl, Klick →
      Familienplan → Mitglieder) statt der Edition; Edition nur noch unter Info
- [ ] Live-Bild auf echter Pi-Hardware prüfen (Electron-Aufnahme, Last auf dem Pi 3)

### Spiegel: Module ein-/ausschalten
- [x] Spiegel → Module: echte Schalter für Uhr, Wetter, Regenradar, Kalender, Nachrichten,
      Familienplan, Familienbotschaften, Alarmierung und Portal-Hinweis (`settings.modules`).
      Ausgeschaltete Module kommen nicht in die config.js – auf dem Spiegel erscheint nichts
- [x] Alarmierung zusätzlich oben auf der Alarm-Seite schaltbar; aus = kein aPager-Modul,
      Alarm-Kachel/-Karte auf der Startseite ausgeblendet, Familienplan/Sprüche/Dauerschleife
      reagieren nicht mehr auf Alarm-Zustände

### Familienplan: Dienste an Wochentagen & Bilder zuschneiden
- [x] Dienste können feste Wochentage haben (z. B. Müll Di, Do); Rotation bleibt
      wöchentlich und fair (Tage ändern den Zyklus nicht). Spiegel und Startseite zeigen
      die Tage („Mo–Fr“, „Di, Do“) und heben den Dienst am Tag selbst hervor („heute“)
- [x] Eigenes Zuschneide-Fenster (`public/cropper.js`): Ziehen, Zoom per Regler/Mausrad/
      zwei Finger, Tastatur. Profilbilder rund 256 × 256, Hintergrundbilder hochkant/quer/
      Original (Vorauswahl nach dem Format des Spiegels aus dem Live-Bild), max. 1920 px

### Raspberry Pi 3: Electron-Fix (MagicMirror #4287)
- [x] MagicMirror 2.38.0 liefert Electron 44.4.5 → schwarzer Bildschirm auf dem Pi 3.
      LUMIRA tauscht bekannte fehlerhafte Versionen aus (`lib/electron-fix.js`, vorerst
      44.4.5 → 44.5.1): nach Neuinstallation und `install.sh --update`, nach jedem
      MagicMirror-Update/„Zurück“ im Portal, und per Knopf „Electron reparieren“ unter Info.
      Mit `--no-save --package-lock=false`, damit git sauber bleibt. Greift nicht mehr,
      sobald MagicMirror eine andere Version ausliefert
- [ ] Auf dem Pi 3 prüfen (Familien-Spiegel)

### Portal: LUMIRA-Updates
- [x] LUMIRA selbst unter Info → Updates: prüfen (automatisch alle 12 h und auf
      Knopfdruck), „Was ist neu?“, **Aktualisieren** per Knopf, „Zurück“
- [x] `./install.sh --update`: ohne sudo/apt – eigene Module, Portal-Dateien,
      config.js aus settings.json, `pm2 restart MagicMirror`; danach startet
      sich das Portal neu; geänderte Systemdienste werden als Hinweis gemeldet
- [x] Fix: ein normales `./install.sh` erzeugt eine vorhandene config.js jetzt
      aus settings.json neu (vorher kamen neue Module wie MMM-Ambient erst nach
      dem nächsten Speichern im Portal an)
- [x] `install.sh` merkt sich den Repo-Pfad in `~/.lumira/install.json`
- [x] Info → Updates: aufklappbare Anleitung „Update per SSH“ (eingeklappt) mit den echten
      Werten des Spiegels (Benutzer, Adresse/IP, Repo-Ordner) und Kopier-Knopf je Befehl:
      `ssh magic@lumira.local`, dann `cd ~/LUMIRA && git pull && ./install.sh`
- [ ] Auf echter Pi-Hardware prüfen (Update über das Portal, Portal-Neustart per systemd)

### Spiegel: Dauerschleife (MMM-Ambient)
- [x] Neues Modul `MMM-Ambient`: gezeichnetes Lagerfeuer oder eigenes Video/Bild
      als Dauerschleife, Vollbild oder Hintergrund, Timer, Ton wählbar, Alarm
      unterbricht sofort; live über `~/.lumira/ambient.json` (kein Neustart)
- [x] Portal: Spiegel → **Bildschirm** (Schalter, Darstellung, Timer, Mediathek
      mit Hochladen/Löschen und Vorschau), Schnellschalter in der Karte „Spiegel“
- [x] Uploads geprüft (Dateityp an den ersten Bytes, max. 300 MB, max. 20 Medien)
- [x] **Diashow**: Bilder per Haken auswählen (nur JPG/PNG/WebP, keine GIFs/Videos), Wechsel
      10 s–10 min, der Reihe nach oder zufällig, weiche Überblendung; Mehrfach- und
      **Ordner-Upload** (Bilder werden im Browser auf max. 1920 px verkleinert, nach Namen
      sortiert, direkt in die Diashow); Mediathek jetzt bis 300 Medien
- [x] **YouTube-Videos** als Medium (Link einfügen, Titel automatisch, Startzeit aus dem
      Link), auf dem Spiegel per youtube-nocookie.com eingebettet, stumm, Endlosschleife
- [x] Ruckeln behoben: YouTube-Player klein (Qualität wählbar 360p–1080p, Standard 480p)
      und hochskaliert statt in Spiegelgröße (vorher 1440p); Abdunkeln per Fläche statt Filter
- [x] GIFs werden beim Hochladen per ffmpeg in MP4 (H.264, max. 1280 px) umgewandelt –
      GIFs ruckeln auf dem Pi 3; ohne ffmpeg bleibt es beim GIF mit Hinweis.
      `install.sh` installiert ffmpeg mit (bestehende Geräte: einmal `sudo apt install ffmpeg`)
- [ ] Auf echter Pi-Hardware prüfen (Video-Wiedergabe Pi 3, Ton, Alarm-Unterbrechung)

### Spiegel: Türklingel (Ring, MMM-Doorbell)
- [x] Neues Modul `MMM-Doorbell`: beim Klingeln kompakte Meldung in der Mitte (Text,
      Leuchtrahmen, Dauer), Klingelton (eingebautes Ding-Dong oder eigener Ton, Lautstärke),
      danach Live-Video (klein/mittel/groß, 30 s–5 min oder eigene Zeit, automatisch
      schließen, Countdown); während eines Alarms verborgen. Live über `~/.lumira/doorbell.json`
- [x] Ring-Anbindung im Portal (`lib/ring.js`, `ring-client-api`): Anmeldung mit
      E-Mail/Passwort + Bestätigungscode, nur Refresh-Token gespeichert (0600, wird bei
      jedem Tausch sofort gesichert), Klingeln per Push ohne Portfreigabe, Klingeln einzeln
      abwählbar, Kabel/Akku automatisch erkannt (einstellbar)
- [x] Live-Video ohne Umrechnen (ffmpeg `-c:v copy` → HLS im Arbeitsspeicher, hls.js);
      ohne Video: Meldung bleibt, letztes Bild der Klingel (Kabel: alle 5 s neu)
- [x] Portal: Spiegel → **Klingel** (Schalter, Klingeln testen, Jetzt schließen mit
      Vorschau, Ring-Verbindung, Meldung, Ton mit Probehören, Video); Schalter auch unter
      Spiegel → Module (Standard: aus). Anleitung: [docs/KLINGEL.md](docs/KLINGEL.md)
- [x] `install.sh`: Portal-Abhängigkeiten mit `--ignore-scripts` (sonst lädt
      ring-client-api ein eigenes ffmpeg mit über 100 MB)
- [ ] Auf echter Pi-Hardware mit Ring-Klingel prüfen (Push, Video-Flüssigkeit Pi 3,
      Ton, Akku-Klingel)

### Portal: eigene Bedienelemente & Jahrestage
- [x] Eigene Auswahlfelder statt Browser-Dropdowns (`public/select.js`, für
      alle Auswahlfelder automatisch), mit Avataren (Personen) und
      Dienst-Symbolen; Tastatur (Pfeile, Pos1/Ende, Anfangsbuchstabe, Esc)
- [x] Eigene Symbolauswahl für Dienste (Raster mit allen 36 Symbolen)
- [x] Font Awesome Free „Solid“ im Portal mitgeliefert (`public/vendor/fa`, 250 KB) statt aus der
      MagicMirror-Installation – Symbole funktionieren unabhängig von MagicMirror-Version und Pfad
- [x] Eigener Kalender für Datumsfelder (Geburtstage/Countdowns ohne Jahr,
      Jahrestage mit Jahresauswahl), Feld bleibt tippbar
- [x] Dienst-Symbole in der Wochen-Zuteilung
- [x] Startseite: zwei unabhängige Spalten statt Zeilenraster (keine Lücken mehr)
- [x] „Hochzeitstag“ → **Jahrestage**: Liste mit Anlass (Hochzeitstag,
      Jahrestag, Verlobungstag, Kennenlerntag, Einzugstag, eigener Anlass),
      Glückwunsch mit Zahl der Jahre, Erinnerung eine Woche vorher; alter
      Hochzeitstag wird übernommen

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
| 11 | **Familienplan** – Wochendienste (4 Personen × 2 Dienste) mit fairer automatischer Rotation, neues Modul `MMM-FamilyPlan` oben links, Verwaltung im Portal | 🟡 Phase 0-5 umgesetzt ([concept/familienplan.md](concept/familienplan.md), Anleitung [docs/FAMILIENPLAN.md](docs/FAMILIENPLAN.md)); noch auf echter Pi-Hardware zu verifizieren. Offen: Einbau auf dem Familien-Spiegel nach dem Pi-3-Fix (Phase 6) |
| 12 | **Design-System 2.0 & mobile Version** – Bento-Stil (monochrom, Schwarz/Weiß als Aktionsfarbe), fünf Bereiche, Icon-Leiste am Desktop, Tab-Leiste am Handy | 🟡 Im Portal umgesetzt: neue Startseite (Status, Spiegel, Alarm, Familienplan, Wetter, Als Nächstes), Bereiche Start/Familie/Spiegel/Alarm/Mehr mit Reitern, Hell/Dunkel/Auto, eigene Symbole statt Emojis, volle Bildschirmbreite mit Spalten ab 1400 px ([concept/design-system.md](concept/design-system.md)). Offen: Dialoge statt Browser-Rückfragen, Fehler direkt am Feld, eigene Schrift lokal, Spiegel-Module und statische Seiten im neuen Stil |
| 13 | **LUMIRA als App für Handy und PC** | 🟡 Weg 1 (Web-App auf dem Startbildschirm) umgesetzt, Ideen in [concept/app.md](concept/app.md). Offen: Weg 2 (Android/iOS-App mit Kopplung per QR-Code, Tauri für PC), Weg 3 (HTTPS im Heimnetz, damit Android/PC „echt“ installieren) |

**Legende:** ✅ erledigt · 🟡 in Arbeit / teilweise · 📋 geplant, noch nicht begonnen

---

## Nächster empfohlener Schritt

**#1 Selbstkonfiguration** ist implementiert (siehe [lumira-portal/](lumira-portal));
als Nächstes steht ein echter Praxistest auf einem Raspberry Pi an
(Access-Point-Umschaltung, Captive Portal auf iOS/Android, Watchdog-Rückfall –
siehe die Testpunkte in [lumira-portal/README.md](lumira-portal/README.md)).
Danach sind **#4 Alarm abschaltbar** und weitere kleine Punkte schnell umsetzbar.
