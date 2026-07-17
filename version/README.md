# version/ – Basis-Vorlagen je Edition

Hier liegt für jede LUMIRA-Edition eine fertige `config.js.sample`. Sie ist
die **Grundlage der manuellen Grundinstallation** – nicht Teil der
Kunden-Konfiguration.

> Hintergrund & Grundprinzip: [concept/produktvarianten.md](../concept/produktvarianten.md)

## Ablauf der Grundinstallation (durch uns, manuell)

1. Gerät wie gewohnt einrichten:
   ```bash
   git clone https://github.com/ZombieEcki/LUMIRA.git ~/LUMIRA
   cd ~/LUMIRA
   ./install.sh --no-wizard
   ```
2. Die zur bestellten Edition passende Vorlage einsetzen, z. B. für Fire:
   ```bash
   cp version/fire/config.js.sample ~/MagicMirror/config/config.js
   pm2 restart MagicMirror
   ```
3. Die mit `<-- ANPASSEN` markierten Stellen ausfüllen (Koordinaten,
   Kalender-URL, `personName` …) – oder das Feintuning dem später
   umgesetzten Self-Service-Portal überlassen (siehe
   [concept/selfservice.md](../concept/selfservice.md)).

Der Kunde selbst sieht diesen Schritt nicht – für ihn beginnt die Reise erst
mit dem fertig eingerichteten Gerät und dem WLAN-Setup zur Personalisierung.

## Ordner

| Ordner | Edition | Alarmierung |
|--------|---------|:---:|
| [`home/`](home) | Familien | aus |
| [`fire/`](fire) | Freiwillige Feuerwehr | an |
| [`rescue/`](rescue) | Rettungsdienst | an |
| [`business/`](business) | Unternehmen/Büros | aus |
| [`station/`](station) | Gerätehäuser/Wachen | an |

Jede `config.js.sample` ist eigenständig lauffähig (keine Vererbung/Merges) –
einfach die zur Edition passende Datei kopieren.
