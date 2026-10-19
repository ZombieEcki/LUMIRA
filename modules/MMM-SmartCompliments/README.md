# MMM-SmartCompliments

Ein intelligenter Ersatz für das MagicMirror²-Standardmodul `compliments`.

Statt zufälliger Sprüche zeigt das Modul **immer genau eine Botschaft** und
entscheidet per **Priorität**, welche gerade am sinnvollsten ist – abhängig von
Uhrzeit, Wochentag, Jahreszeit, Wetter, amtlichen Wetterwarnungen, Kalender,
Geburtstagen, Hochzeitstag und dem Feuerwehrstatus.

> Der MagicMirror soll sich nicht wie ein Computer anfühlen, sondern wie ein
> freundlicher Familienassistent.

Bedienung und alle Einstellungen: [docs/SPRUECHE.md](../../docs/SPRUECHE.md)
(LUMIRA-Portal → Bildschirm → Sprüche).

## Aufbau

- `spruch-catalog.js` – alle Kategorien mit den eingebauten Sprüchen (Tageszeit,
  Herzlich/Motivierend/Humorvoll, 20 weitere, Flachwitze und Versaut leer,
  Anlässe für Wetter, Warnung und Kalender, „Nach dem Einsatz“).
- `spruch-logic.js` – Einstellungen bereinigen, Wetter/Warnungen/Kalender auswerten,
  Spruch auswählen, Spruch darstellen (Symbol, Rätsel-Lösung, Verkleinern).
- `spruch-view.css` – Aussehen eines Spruchs.
- Diese drei Dateien nutzt auch das Portal für Prüfung und Vorschau
  (`lumira-portal/public/spruch/`, Test prüft Gleichheit).
- `node_helper.js` – liest `~/.lumira/compliments.json` live (fs.watch),
  schreibt die Rückmeldung `~/.lumira/compliments-mirror.json`, optional den
  manuellen Schalter-Server (Port 8091).
- Frei platziert hängt der Spruch als eigenes Element am `<body>`; „wie bisher“
  bleibt er in seiner Region der config.js (`top_center`).

## Zusammenspiel mit MMM-aPagerAlarm

Dieses Modul lauscht auf die Notification `APAGER_STATE` von
[MMM-aPagerAlarm](../MMM-aPagerAlarm). Sobald ein Einsatz läuft (Zustand 1–3),
**blendet sich SmartCompliments vollständig aus** – der Alarm hat immer Vorrang.
Erst wenn der Alarmstatus beendet ist (zurück im Familienmodus), übernimmt
SmartCompliments wieder.

Dafür muss in `MMM-aPagerAlarm` `broadcastNotifications: true` gesetzt sein (Standard).

## Auswahl-Logik

1. Nach einem Einsatz: Danke-Botschaften (gemischt oder exklusiv).
2. Exklusiv, wenn zutreffend: Geburtstag heute, Jahrestag heute, Feiertag heute.
3. Anlässe in einstellbarer Reihenfolge – amtliche Wetterwarnung (DWD),
   Kalender-Stichwort, Wetterlage – im einstellbaren Anteil der Wechsel.
4. Sonst der Mix: erst eine Kategorie (alle gleich oft), dann ein Spruch.
- Zuletzt gezeigte Sprüche werden **nicht wiederholt**; ausgeschaltete
  Kategorien und Sprüche erscheinen nie.

## Installation

Mit LUMIRA: `./install.sh` kopiert das Modul und erzeugt die config.js.
Von Hand:

```bash
cd ~/MagicMirror/modules
# Ordner MMM-SmartCompliments hierher kopieren
cd MMM-SmartCompliments && npm install   # express für den Schalter-Server
```

## Konfiguration (Kurzform)

```js
{
    module: "MMM-SmartCompliments",
    position: "top_center",
    config: {
        firefighterIntegration: true,
        weatherIntegration: true,
        calendarIntegration: true,
        emojis: true,
        fadeSpeed: 3000,
        birthdays: [
            { name: "Max", date: "03-15" }
        ],
        weddingDate: "2010-06-20"
    }
},
```

Alle Optionen und persönliche Ereignisse: siehe [CONFIG.md](CONFIG.md).

## Integrationen im Überblick

| Quelle | Notification | Zweck |
|--------|--------------|-------|
| MMM-aPagerAlarm | `APAGER_STATE` | Anzeige während Einsatz unterdrücken, danach Danke |
| MMM-LumiraWeather | `LUMIRA_WEATHER` | Wetterlage und amtliche DWD-Warnungen |
| Wetter (Standard) | `WEATHER_UPDATED` / `CURRENTWEATHER_DATA` | Wetterlage (wenn von MMM-LumiraWeather nichts Frisches kommt) |
| Kalender (Standard) | `CALENDAR_EVENTS` | Termine heute/morgen, Stichwort-Anlässe |

## Lizenz

MIT
