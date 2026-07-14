# MMM-SmartCompliments

Ein intelligenter Ersatz für das MagicMirror²-Standardmodul `compliments`.

Statt zufälliger Sprüche zeigt das Modul **immer genau eine Botschaft** und
entscheidet per **Priorität**, welche gerade am sinnvollsten ist – abhängig von
Uhrzeit, Wochentag, Jahreszeit, Wetter, Kalender, Geburtstagen, Hochzeitstag,
Familienaufgaben und dem Feuerwehrstatus.

> Der MagicMirror soll sich nicht wie ein Computer anfühlen, sondern wie ein
> freundlicher Familienassistent.

## Zusammenspiel mit MMM-aPagerAlarm

Dieses Modul lauscht auf die Notification `APAGER_STATE` von
[MMM-aPagerAlarm](../MMM-aPagerAlarm). Sobald ein Einsatz läuft (Zustand 1–3),
**blendet sich SmartCompliments vollständig aus** – der Alarm hat immer Vorrang.
Erst wenn der Alarmstatus beendet ist (zurück im Familienmodus), übernimmt
SmartCompliments wieder.

Dafür muss in `MMM-aPagerAlarm` `broadcastNotifications: true` gesetzt sein (Standard).

## Auswahl-Logik

- **Tier A (exklusiv, wenn zutreffend):** Geburtstag heute, Hochzeitstag heute,
  aktive Wetterwarnung (Hitze/Frost/Sturm), Feiertag heute.
- **Tier B (Familienmix):** Tageszeit-Gruß, Wochentag, Jahreszeit, Wetterhinweis,
  Kalender, Aufgaben, Erinnerungen (Geburtstag/Hochzeitstag bald), Countdowns,
  Familie, Motivation, Humor.
- Die letzten `rememberLastMessages` Nachrichten werden **nicht wiederholt**.

## Installation

```bash
cd ~/MagicMirror/modules
# Ordner MMM-SmartCompliments hierher kopieren
```

Es sind **keine** npm-Abhängigkeiten nötig – reines Frontend-Modul.

## Konfiguration (Kurzform)

```js
{
    module: "MMM-SmartCompliments",
    position: "top_center",
    config: {
        updateInterval: 30000,
        firefighterIntegration: true,
        weatherIntegration: true,
        calendarIntegration: true,
        choresIntegration: true,
        rememberLastMessages: 10,
        emojis: true,
        fadeSpeed: 3000,
        birthdays: [
            { name: "Marie", date: "03-15" }
        ],
        weddingDate: "2010-06-20"
    }
},
```

Alle Optionen und persönliche Ereignisse: siehe [CONFIG.md](CONFIG.md).

## Integrationen im Überblick

| Quelle | Notification | Zweck |
|--------|--------------|-------|
| MMM-aPagerAlarm | `APAGER_STATE` | Anzeige während Einsatz unterdrücken |
| Kalender (Standard) | `CALENDAR_EVENTS` | Termine heute/morgen |
| Wetter (Standard/neu) | `WEATHER_UPDATED` / `CURRENTWEATHER_DATA` | Warnungen & Hinweise |
| MMM-FamilyChores o. ä. | `CHORES_UPDATE` (konfigurierbar) | offene/erledigte Aufgaben |

## Lizenz

MIT
