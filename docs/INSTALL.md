# Installation

Zwei Wege: **A)** direkt per `git clone` auf dem Pi (empfohlen), oder
**B)** die Dateien manuell übertragen.

## Voraussetzungen

- Raspberry Pi (3/4/5) mit Raspberry Pi OS (oder Debian/Ubuntu)
- Internetverbindung
- Benutzer mit `sudo` (das Skript **nicht** als root starten)

## A) Per git clone (empfohlen)

```bash
git clone https://github.com/ZombieEcki/LUMIRA.git ~/LUMIRA
cd ~/LUMIRA
chmod +x install.sh
./install.sh
```

Da über Git geklont, gibt es keine Windows-Zeilenenden – das Skript läuft direkt.

## B) Dateien manuell übertragen

Den kompletten Ordner per WinSCP oder `scp` auf den Pi kopieren, dann:

```bash
cd ~/feuerwehr-setup
sed -i 's/\r$//' install.sh   # nur nötig, falls unter Windows bearbeitet
chmod +x install.sh
./install.sh
```

## Was `install.sh` NICHT mehr abfragt

`install.sh` fragt **keine persönlichen Daten** mehr ab (Name, Standort,
Kalender, News, Home-Assistant-Webhook). Das ist Absicht: Der Assistent lief
früher interaktiv im Terminal – das widerspricht dem Self-Service-Gedanken,
bei dem der Kunde selbst über das Portal konfiguriert (siehe
[concept/selfservice.md](../concept/selfservice.md)). `install.sh` erledigt
nur noch die technische Grundinstallation:

- **Edition** (`--edition=`) und **Hostname** (`--hostname=`)
- **Regenradar**-Modul installieren (Standard: ja, [realoliwer/MMM-RainRadarDWD](https://github.com/realoliwer/MMM-RainRadarDWD); `--no-rainradar` bzw. `--rainradar-url=` zum Abwählen/Ersetzen)
- **Autostart per pm2** (Standard: ja; `--no-pm2` zum Abwählen)

`config.js` entsteht danach mit Platzhalter-Werten (Name „Papa", Standort
Berlin, Tagesschau-Feed usw.) – die echten Daten trägt der Kunde über das
Self-Service-Portal ein (siehe unten).

## Edition & Hostname (Grundinstallation)

```bash
./install.sh --edition=fire --hostname=lumira
```

- `--edition=` legt fest, welche Module in die `config.js` kommen (siehe
  [concept/produktvarianten.md](../concept/produktvarianten.md)) – Standard
  `fire`. Nur bei der manuellen Grundinstallation relevant, nie eine
  Kundeneinstellung.
- `--hostname=` macht das Gerät unter `http://<name>.local` erreichbar
  (Standard `lumira`) – installiert dafür `avahi-daemon` und setzt den
  Hostname per `hostnamectl`.
- `--no-selfservice` überspringt Installation/Start des
  [Self-Service-Portals](../lumira-portal) (Port 8092) samt Watchdog, falls
  nicht gewünscht.

## Self-Service-Portal

Nach der Installation läuft dauerhaft ein Web-Portal unter
`http://lumira.local:8092`, über das der Kunde später selbst Name, Standort,
Kalender, Alarmeinstellungen usw. ändern kann – ganz ohne SSH (siehe
[concept/selfservice.md](../concept/selfservice.md) und
[lumira-portal/README.md](../lumira-portal/README.md)).

```bash
sudo journalctl -u lumira-portal -f      # Logs Portal
sudo journalctl -u lumira-provision -f   # Logs Watchdog
```

## Nach der Installation

```bash
# ohne pm2:
cd ~/MagicMirror && npm start

# mit pm2 (Standard): läuft bereits
pm2 logs MagicMirror        # Logs ansehen
pm2 startup                 # einmalig für Start beim Booten (zeigt sudo-Befehl)
pm2 save
```

Alarmton (optional): eine `alarm.mp3` nach
`~/MagicMirror/modules/MMM-aPagerAlarm/sounds/` legen.

## Persönliche Daten eintragen

Über das [Self-Service-Portal](../lumira-portal) unter
`http://<hostname>.local:8092`: Name, Standort (mit Ortssuche –
`/api/geocode`, ersetzt die frühere Kommandozeilen-Geocodierung), Kalender,
Nachrichten-Feed, Alarmeinstellungen, WLAN. Änderungen werden sofort
gespeichert und starten MagicMirror automatisch neu.

## config.js manuell/erneut erzeugen

```bash
cd ~/LUMIRA
./install.sh --reconfigure                 # nur Edition/Hostname neu, Kundendaten bleiben
./install.sh --reconfigure --edition=rescue # z.B. Edition wechseln
```

Direktes Bearbeiten von `~/MagicMirror/config/config.js` funktioniert auch,
wird aber beim nächsten Speichern im Portal wieder überschrieben.

## iCloud-Kalender-URL finden

1. In der iCloud-Kalender-Weboberfläche den Kalender **freigeben** (öffentlich).
2. Den `webcal://…`-Link kopieren.
3. Im Self-Service-Portal (Seite „Kalender & News") einfügen – die Umwandlung
   nach `https://` passiert automatisch.

## Testen

```
http://<pi-ip>:8090/alarm?keyword=Test&unit=Test    # Testalarm
http://<pi-ip>:8090/apager/health                   # Status Alarmmodul
http://<pi-ip>:8091/compliments/toggle              # Kompliments schalten
http://<pi-ip>:8092/api/status                      # Self-Service-Portal Status
```

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| `Bitte NICHT als root ausführen` | Ohne `sudo` starten. |
| `\r`-/Zeilenende-Fehler | `sed -i 's/\r$//' install.sh`. |
| Ort wird nicht gefunden | Internet prüfen oder Koordinaten im Portal manuell eingeben (Standort-Seite). |
| Wetter bleibt leer | `lat`/`lon` in der config prüfen. |
| Kalender leer | Ist der iCloud-Kalender wirklich öffentlich freigegeben? |
| `MMM-RainRadarDWD` fehlt | Git-URL korrekt? Sonst Modul weglassen. |
| Port `EADDRINUSE` | 8090/8091 belegt – anderen Port in der config wählen. |
| Emojis als leere Kästchen | Farb-Emoji-Schrift fehlt: `sudo apt-get install -y fonts-noto-color-emoji && sudo fc-cache -f`, dann `pm2 restart MagicMirror`. (Das Skript macht das automatisch.) |

## Was das Skript nicht anfasst

- Eine **vorhandene** MagicMirror-Installation bleibt erhalten (nur die zwei
  eigenen Module werden aktualisiert).
- Eine **vorhandene** `config.js` wird nicht überschrieben (außer mit
  `--force-config`; es wird immer ein Backup angelegt).
