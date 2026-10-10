# lumira-portal

Self-Service-Portal aus [concept/selfservice.md](../concept/selfservice.md) –
Ersteinrichtung per Access Point **und** laufende Konfiguration im Heimnetz,
dieselbe Oberfläche in beiden Fällen. Wird von [`install.sh`](../install.sh)
automatisch mit installiert (siehe README.md im Projekt-Root), Port **8092**.

## Architektur

```
[Web-Portal (public/)]  +  [install.sh-Wizard]
              │                    │
              └──────────┬─────────┘
                          ▼
                  ~/.lumira/settings.json   (einzige Wahrheit)
                          │
              lib/generate-config.js
                          │
                          ▼
              ~/MagicMirror/config/config.js
```

| Datei | Aufgabe |
|-------|---------|
| `server.js` | Express-Server (Port 8092), Setup- und Heimnetz-Modus |
| `lib/store.js` | gemeinsamer JSON-Speicher: Backup vor jedem Schreiben, atomar per `.tmp` + `rename` |
| `lib/settings.js` | `settings.json` laden/speichern/validieren |
| `lib/compliments.js` | `compliments.json` (Sprüche für MMM-SmartCompliments) |
| `lib/familyplan.js` | `familyplan.json` (Familienplan): Mitglieder, Dienste, Wochen, Wochenwechsel, Schutzregeln |
| `lib/familyplan-rotation.js` | faire Rotation als reine Funktion + Kalender-Helfer (siehe [concept/familienplan.md](../concept/familienplan.md) 6.2) |
| `lib/generate-config.js` | `settings.json` → `config.js` (auch von `install.sh` genutzt) |
| `lib/editions.js` | Editions-Flags (Home/Fire/Rescue/Business/Station), einzige Quelle |
| `lib/net.js` | `nmcli`-Wrapper (Access Point, WLAN-Scan/-Verbindung) |
| `lib/mode.js` | Betriebsmodus-Zustand (`FAMILY`/`SETUP`) |
| `lib/auth.js` | PIN-Hashing (scrypt) für den Portal-Zugriffsschutz |
| `provision.js` | Watchdog (Boot + alle 2 Min via systemd-Timer) |
| `public/` | Frontend (Vanilla JS, kein Build-Schritt), Familienplan-Seite in `public/familyplan.js` |
| `test/` | Unit-Tests (`npm test`, Node-eigener Test-Runner, keine Abhängigkeiten) |
| `systemd/` | Unit-Dateien, Polkit-Regel, dnsmasq-Captive-Portal-Config |
| `bin/generate-config-cli.js` | CLI: `settings.json` → `config.js`, genutzt von `install.sh` |
| `bin/save-settings-cli.js` | CLI: JSON-Patch (stdin) → `settings.json`, genutzt von `install.sh` |

## Entwicklung / lokal testen

```bash
cd lumira-portal
npm install
LUMIRA_HOME=/tmp/lumira-dev LUMIRA_MM_CONFIG=/tmp/lumira-dev/config.js node server.js
```

Läuft dann unter `http://127.0.0.1:8092` – ohne echten Pi/`nmcli` schlagen
nur die WLAN-Endpunkte (`/api/wifi/*`, `/api/setup-mode`) fehl, alles andere
(Settings, PIN-Login, Proxy) funktioniert auch auf einem normalen Rechner.

### Testen (curl)

```bash
curl http://127.0.0.1:8092/api/status
curl http://127.0.0.1:8092/api/settings
curl -X POST http://127.0.0.1:8092/api/settings -H "Content-Type: application/json" \
  -d '{"person":{"name":"Papa"}}'
curl -X POST http://127.0.0.1:8092/api/auth/set-pin -H "Content-Type: application/json" -d '{"pin":"1234"}'
curl -c cookies.txt -X POST http://127.0.0.1:8092/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}'
curl -b cookies.txt http://127.0.0.1:8092/api/settings
```

### Tests

```bash
npm test
```

Prüft u. a. die Rotation (in jedem 4-Wochen-Zyklus jeder Dienst genau einmal
pro Person, keine direkte Wiederholung, Rollen, feste Paare, Sommerzeit) und
die Schutzregeln des Familienplans (laufende Woche bleibt fest, Uhr springt
zurück, Revisionskonflikt, beschädigte Datei). Die Tests laufen gegen ein
temporäres `LUMIRA_HOME`, nie gegen `~/.lumira`.

## Familienplan-API

Alle Routen PIN-geschützt, keine löst einen MagicMirror-Neustart aus
(`MMM-FamilyPlan` lädt `~/.lumira/familyplan.json` live nach). Schreibende
Routen schicken die gelesene `revision` mit, bei veralteter Revision kommt
`409` plus aktueller Stand (`plan`). Jede Antwort ist die komplette Ansicht
wie bei `GET /api/familyplan`.

| Endpunkt | Wirkung |
|----------|---------|
| `GET /api/familyplan` | Ansicht: Einstellungen, Mitglieder, Dienste, laufende Woche, Vorschau, Hinweise |
| `PUT /api/familyplan/members` | `{ revision, members }` – Liste ersetzen (Reihenfolge = Array), Fehlende werden soft-gelöscht. Verknüpfte Geburtstage („Wichtige Termine“) ziehen bei Umbenennung mit (dann `restarted: true`, MagicMirror startet neu) |
| `PUT /api/familyplan/duties` | `{ revision, duties }` – Liste ersetzen |
| `PUT /api/familyplan/settings` | `{ revision, settings }` – Titel, Rotationstag, Auto-Rotation, Vorschau, Paar-Modus, feste Paare |
| `POST /api/familyplan/weeks/:start/assign` | `{ revision, memberId, slot, dutyId }` – laufende Woche manuell ändern (tauscht automatisch) |
| `POST /api/familyplan/weeks/:start/reset` | `{ revision }` – automatische Verteilung wiederherstellen |
| `POST /api/familyplan/regenerate` | `{ revision, scope: "current", confirm: true }` – laufende Woche neu verteilen |
| `GET /api/familyplan/presets` | Liste der mitgelieferten Avatare (`adult-01` …, `child-01` …) |
| `POST /api/familyplan/avatar/:memberId` | Foto-Upload (Feld `avatar`, PNG/JPG/WebP bis 2 MB, Browser schneidet vorher auf 256 px zu) |
| `DELETE /api/familyplan/avatar/:memberId` | Foto entfernen (zurück zu Initialen) |

Ein-/Ausschalten, Breite und Darstellung auf dem Spiegel laufen über
`POST /api/settings` mit `familyPlan: { enabled, position, maxWidth, layout }`
– das erzeugt `config.js` neu und startet MagicMirror einmal neu.

Der Wochenwechsel läuft im Portal-Prozess (beim Start und jede Minute,
`familyplan.ensureCurrentWeek()`): Neue Woche nur, wenn es Mitglieder gibt,
die Auto-Rotation an ist und die Uhr plausibel ist.

## Produktiv (auf dem Pi)

`install.sh` kopiert dieses Verzeichnis nach `~/lumira-portal`, führt
`npm install` aus und richtet zwei systemd-Dienste ein:

| Dienst | Typ | Aufgabe |
|--------|-----|---------|
| `lumira-portal.service` | `simple`, dauerhaft | Express-Server auf Port 8092 |
| `lumira-provision.timer` → `.service` | `oneshot`, alle 2 Min + beim Booten | Watchdog (Phase 4) |

```bash
sudo journalctl -u lumira-portal -f
sudo journalctl -u lumira-provision -f
sudo systemctl restart lumira-portal
```

Zusätzlich installiert `install.sh`:

- eine Polkit-Regel (`/etc/polkit-1/rules.d/49-lumira-nmcli.rules`), damit der
  Portal-Benutzer `nmcli` ohne Passwortabfrage nutzen darf (Access Point,
  WLAN-Verbindung),
- eine dnsmasq-Zusatzkonfiguration
  (`/etc/NetworkManager/dnsmasq-shared.d/lumira-captive.conf`) für die
  Captive-Portal-DNS-Wildcard im Setup-Access-Point.

## Ehrlicher Hinweis zum Umsetzungsstand

**Phase 1, 5, 6, 7** (Web-Portal im Heimnetz, `MMM-LumiraStatus`,
PIN-Schutz, `install.sh`-Integration) sind gebaut und – soweit ohne echten
Raspberry Pi möglich – getestet (Node-Unit-Checks, Express-Server lokal
gegen `curl`/Browser, Config-Generierung gegen alle fünf Editionen
geprüft).

**Phase 2-4** (`nmcli`-Access-Point, Captive Portal, Boot-/Watchdog-Logik in
`lib/net.js` und `provision.js`) sind vollständig implementiert, konnten in
dieser Entwicklungsumgebung aber **nicht auf echter Hardware** getestet
werden (kein Raspberry Pi, kein NetworkManager/`nmcli` verfügbar). Vor dem
produktiven Einsatz unbedingt auf einem Raspberry Pi OS Bookworm gegenprüfen,
insbesondere:

- funktioniert `nmcli con up lumira-ap` zuverlässig auf dem jeweiligen
  WLAN-Chip (Pi 4/5 vs. Pi Zero 2 W können sich unterscheiden)?
- greift die Polkit-Regel wie erwartet (Portal-Dienst braucht `nmcli` ohne
  `sudo`)?
- landet die Captive-Portal-Weiterleitung tatsächlich auf allen
  gängigen Handy-Betriebssystemen (iOS/Android) auf der Portal-Seite?
