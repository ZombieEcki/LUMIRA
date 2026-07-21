# Konfiguration – MMM-SmartCompliments

Alle Optionen sind optional. Unten ein umfangreiches Beispiel, danach die Details.

## Beispiel

```js
{
    module: "MMM-SmartCompliments",
    position: "top_center",
    config: {
        // Anzeige
        updateInterval: 30000,       // Wechselintervall (ms)
        fadeSpeed: 3000,             // Ein-/Ausblendzeit (ms)
        emojis: true,                // Emojis anzeigen

        // Integrationen
        firefighterIntegration: true,
        weatherIntegration: true,
        calendarIntegration: true,
        choresIntegration: true,
        choresNotification: "CHORES_UPDATE",

        // Abwechslung
        rememberLastMessages: 10,

        // Persönliche Ereignisse
        birthdays: [
            { name: "Max", date: "03-15" },
            { name: "Opa",   date: "11-02" }
        ],
        birthdayReminderDays: 3,
        weddingDate: "2010-06-20",
        anniversaryReminderDays: 7,
        countdowns: [
            { label: "Weihnachten", date: "12-24" },
            { label: "Urlaub",      date: "07-28" }
        ],

        // Wetter-Schwellen
        heatTemp: 30,
        frostTemp: 0,
        stormWindKmh: 50
    }
}
```

## Optionen

### Anzeige

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `updateInterval` | ms | `30000` | Wie oft die Nachricht wechselt. |
| `fadeSpeed` | ms | `3000` | Dauer des weichen Ein-/Ausblendens. |
| `emojis` | bool | `true` | Emojis anzeigen. `false` entfernt sie aus dem Text. |
| `rememberLastMessages` | Zahl | `10` | So viele Nachrichten werden nicht wiederholt. |
| `manualControlEnabled` | bool | `true` | Manuellen Ein-/Aus-Schalter per URL aktivieren. |
| `manualControlPort` | Zahl | `8091` | Port des Schalter-Servers (nicht 8080/8090). |
| `startHidden` | bool | `false` | Beim Start ausgeblendet beginnen. |
| `moodHerzlich` | bool | `true` | Stimmung „Herzlich" (`familyMessages`) im Zufallsmix zeigen. |
| `moodMotivierend` | bool | `true` | Stimmung „Motivierend" (`motivationMessages`) im Zufallsmix zeigen. |
| `moodHumorvoll` | bool | `true` | Stimmung „Humorvoll" (`humorMessages`) im Zufallsmix zeigen. |

### Sprüche aus dem LUMIRA-Portal (`compliments.json`)

Läuft das Modul im LUMIRA-Setup, werden die Textlisten zusätzlich aus
`~/.lumira/compliments.json` gelesen (vom Portal gepflegt, siehe
[concept/smartcompliments-json.md](../../concept/smartcompliments-json.md)).
Nur nicht-leere Kategorien überschreiben die eingebauten Standardtexte; das
Modul lädt Änderungen live nach (kein MagicMirror-Neustart nötig). Die
`moodHerzlich`/`moodMotivierend`/`moodHumorvoll`-Schalter erzeugt das Portal
aus der „Stimmung"-Auswahl auf der Sprüche-Seite.

### Manueller Ein-/Aus-Schalter

Bei `manualControlEnabled: true` startet ein kleiner Server. Damit kannst du die
Kompliments jederzeit per URL (Browser/Handy) schalten – unabhängig von allen
anderen Regeln:

```
http://<pi-ip>:8091/compliments/off      # ausblenden
http://<pi-ip>:8091/compliments/on       # einblenden
http://<pi-ip>:8091/compliments/toggle   # umschalten
```

Nach dem Kopieren auf den Pi einmal `npm install` im Modulordner ausführen
(braucht `express`).

### Integrationen

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `firefighterIntegration` | bool | `true` | Master-Schalter der Feuerwehr-Kopplung. `true` = Phasen-Ausblenden **und** Nachwirkung möglich. `false` = Feuerwehr wird komplett ignoriert (läuft immer durch). |
| `hideOnAlarmPhases` | Liste | `[1]` | In welchen Phasen ausgeblendet wird: `1` = akuter Alarm, `2` = im Einsatz, `3` = war im Einsatz. `[1]` = nur akuter Alarm, `[1,2,3]` = ganzer Einsatz. |
| `afterDutyEnabled` | bool | `true` | Nach Einsatzende Danke-Botschaften zeigen. |
| `afterDutyExclusive` | bool | `false` | `true` = nur Danke-Botschaften; `false` = gemischt mit normalen Sprüchen (ca. 50/50). |
| `afterDutyDurationMinutes` | Minuten | `0` | Wie lange die Nachwirkung dauert. `0` = bis Mitternacht. |
| `afterDutyMessages` | Liste | siehe Modul | Texte der Nachwirkung. |
| `weatherIntegration` | bool | `true` | Wetterwarnungen/-hinweise nutzen. |
| `calendarIntegration` | bool | `true` | Kalendertermine (heute/morgen) nutzen. |
| `choresIntegration` | bool | `true` | Familienaufgaben nutzen. |
| `choresNotification` | Text | `"CHORES_UPDATE"` | Notification-Name des Aufgaben-Moduls. Erwartet `{ open, done }` oder ein Array von Aufgaben. |

### Persönliche Ereignisse

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `birthdays` | Liste | `[]` | `{ name, date: "MM-TT" }`. Am Tag: „🎂 Heute hat … Geburtstag." |
| `birthdayReminderDays` | Zahl | `3` | Vorlauf für Geburtstagserinnerung. |
| `weddingDate` | Text | `""` | `"JJJJ-MM-TT"`. Am Tag: „❤️ Alles Liebe zum Hochzeitstag." |
| `anniversaryReminderDays` | Zahl | `7` | Vorlauf für Hochzeitstag-Erinnerung. |
| `countdowns` | Liste | `[]` | `{ label, date: "MM-TT" }`. „Noch X Tage bis …" |

### Wetter-Schwellen

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `heatTemp` | °C | `30` | Ab dieser Temperatur: Hitzewarnung. |
| `frostTemp` | °C | `0` | Bei/unter dieser Temperatur: Frostwarnung. |
| `stormWindKmh` | km/h | `50` | Ab dieser Windgeschwindigkeit: Sturmwarnung. |

## Nachrichtenlisten anpassen

Sämtliche Textgruppen lassen sich überschreiben, z. B.:

```js
config: {
    morningMessages: [
        "Guten Morgen, ihr Lieben ☀️",
        "Ein neuer Tag für die Familie."
    ],
    familyMessages: [
        "❤️ Schön, dass es euch gibt."
    ],
    humorMessages: [
        "Kaffee zählt als Motivation."
    ]
}
```

Überschreibbare Gruppen:
`morningMessages`, `forenoonMessages`, `afternoonMessages`, `eveningMessages`,
`nightMessages`, `familyMessages`, `motivationMessages`, `humorMessages`,
`weekdayMessages` (Objekt 0–6, 0 = Sonntag), `seasonMessages`
(`spring`/`summer`/`autumn`/`winter`), `holidayMessages` (Objekt „MM-TT"),
`weatherHints` (`rain`/`snow`), `weatherWarnings` (`heat`/`frost`/`storm`).

Zweizeilige Nachrichten: einfach `\n` im Text verwenden.

## Zusammenspiel mit anderen Modulen

Damit `firefighterIntegration` funktioniert, muss in **MMM-aPagerAlarm**
`broadcastNotifications: true` gesetzt sein (Standard). Dieses Modul sendet dann
bei jedem Zustandswechsel `APAGER_STATE`, worauf SmartCompliments reagiert.

## Hinweis zu Wetter & Aufgaben

Die Wetter-Notifications unterscheiden sich je nach verwendetem Wettermodul.
Unterstützt werden `WEATHER_UPDATED` (neues Modul) und `CURRENTWEATHER_DATA`
(älteres Modul) sowie ein generischer Fallback mit `temperature`, `windSpeed`,
`weatherType`. Falls dein Wettermodul ein anderes Format sendet, kann eine
Anpassung nötig sein.

Für Aufgaben erwartet das Modul die Notification aus `choresNotification` mit
`{ open, done }` oder einem Array von Aufgaben (mit `done`/`completed`-Feld).
