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

## Der Setup-Assistent

Nach der Basis-Installation fragt das Skript interaktiv ab:

1. **Name der Person im Einsatz** (z. B. „Papa")
2. **Home-Assistant-Webhook-URL** – optional, für Licht bei Alarm
3. **Ort/Stadt** – wird automatisch in Koordinaten umgewandelt (Open-Meteo)
4. **Kalender-URL** – iCloud/ICS (`webcal://` wird automatisch umgewandelt)
5. **Nachrichten-Feed** – Tagesschau / heise / eigener RSS
6. **Regenradar** – optional, Git-URL von MMM-RainRadarDWD
7. **Autostart per pm2** – ja/nein

Jede Frage hat einen Vorschlag in `[ ]`; Enter übernimmt ihn.

## Nach der Installation

```bash
# ohne pm2:
cd ~/MagicMirror && npm start

# mit pm2 (nach Frage „Autostart" = ja): läuft bereits
pm2 logs MagicMirror        # Logs ansehen
pm2 startup                 # einmalig für Start beim Booten (zeigt sudo-Befehl)
pm2 save
```

Alarmton (optional): eine `alarm.mp3` nach
`~/MagicMirror/modules/MMM-aPagerAlarm/sounds/` legen.

## Config später ändern

```bash
cd ~/feuerwehr-setup
./install.sh --reconfigure     # Assistent erneut, nur config.js
```

Oder die Datei direkt bearbeiten: `~/MagicMirror/config/config.js`.

## iCloud-Kalender-URL finden

1. In der iCloud-Kalender-Weboberfläche den Kalender **freigeben** (öffentlich).
2. Den `webcal://…`-Link kopieren.
3. Im Assistenten einfügen – die Umwandlung nach `https://` passiert automatisch.

## Testen

```
http://<pi-ip>:8090/alarm?keyword=Test&unit=Test    # Testalarm
http://<pi-ip>:8090/apager/health                   # Status Alarmmodul
http://<pi-ip>:8091/compliments/toggle              # Kompliments schalten
```

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| `Bitte NICHT als root ausführen` | Ohne `sudo` starten. |
| `\r`-/Zeilenende-Fehler | `sed -i 's/\r$//' install.sh`. |
| Ort wird nicht gefunden | Internet prüfen oder Koordinaten manuell eingeben (Assistent bietet das an). |
| Wetter bleibt leer | `lat`/`lon` in der config prüfen. |
| Kalender leer | Ist der iCloud-Kalender wirklich öffentlich freigegeben? |
| `MMM-RainRadarDWD` fehlt | Git-URL korrekt? Sonst Modul weglassen. |
| Port `EADDRINUSE` | 8090/8091 belegt – anderen Port in der config wählen. |

## Was das Skript nicht anfasst

- Eine **vorhandene** MagicMirror-Installation bleibt erhalten (nur die zwei
  eigenen Module werden aktualisiert).
- Eine **vorhandene** `config.js` wird nicht überschrieben (außer mit
  `--force-config`; es wird immer ein Backup angelegt).
