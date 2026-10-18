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
| `updateInterval` | ms | `30000` | Wie oft die Nachricht wechselt – nur bis `compliments.json` geladen ist; danach gilt „Wechsel“ im Portal (Standard 30 s). |
| `fadeSpeed` | ms | `3000` | Dauer des weichen Ein-/Ausblendens. |
| `emojis` | bool | `true` | Emojis anzeigen. `false` entfernt sie aus dem Text. |
| `rememberLastMessages` | Zahl | `10` | So viele Nachrichten werden nicht wiederholt (im Portal: „Wechsel“). |
| `manualControlEnabled` | bool | `true` | Manuellen Ein-/Aus-Schalter per URL aktivieren. |
| `manualControlPort` | Zahl | `8091` | Port des Schalter-Servers (nicht 8080/8090). |
| `startHidden` | bool | `false` | Beim Start ausgeblendet beginnen. |
| `moodHerzlich` | bool | `true` | Kategorie „Herzlich" – gilt nur, bis sie im Portal geschaltet wurde. |
| `moodMotivierend` | bool | `true` | Kategorie „Motivierend" – dto. |
| `moodHumorvoll` | bool | `true` | Kategorie „Humorvoll" – dto. |

### Sprüche aus dem LUMIRA-Portal (`compliments.json`)

Läuft das Modul im LUMIRA-Setup, kommen aus `~/.lumira/compliments.json`
(vom Portal gepflegt): eigene Listen je Kategorie, Kategorien an/aus,
einzelne Sprüche aus, eigene Kategorien, Kalender-Stichwörter, Anlässe,
Wechsel und Darstellung. Nur nicht-leere Listen überschreiben die eingebauten
Sprüche (`spruch-catalog.js`); das Modul lädt Änderungen live nach (kein
MagicMirror-Neustart nötig). Alles Weitere: [docs/SPRUECHE.md](../../docs/SPRUECHE.md).

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
| `weatherIntegration` | bool | `true` | Wetterlage und amtliche Warnungen nutzen (MMM-LumiraWeather oder Standard-Wettermodul). |
| `calendarIntegration` | bool | `true` | Kalendertermine (heute/morgen, Stichwort-Anlässe) nutzen. |

### Persönliche Ereignisse

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `birthdays` | Liste | `[]` | `{ name, date: "MM-TT" }`. Am Tag: „🎂 Heute hat … Geburtstag." |
| `birthdayReminderDays` | Zahl | `3` | Vorlauf für Geburtstagserinnerung. |
| `weddingDate` | Text | `""` | `"JJJJ-MM-TT"`. Am Tag: „❤️ Alles Liebe zum Hochzeitstag." Nur genutzt, wenn `anniversaries` leer ist. |
| `anniversaries` | Liste | `[]` | Gemeinsame Jahrestage `{ type, label, date: "JJJJ-MM-TT" }`, `type`: `wedding`, `together`, `engaged`, `met`, `moved` oder `other`. Am Tag: Glückwunsch mit Zahl der Jahre (Hochzeitstag mit `weddingText`), vorher Erinnerung. |
| `anniversaryReminderDays` | Zahl | `7` | Vorlauf für Jahrestag-Erinnerungen. |
| `countdowns` | Liste | `[]` | `{ label, date: "MM-TT" }`. „Noch X Tage bis …" |

### Wetter-Schwellen

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `heatTemp` | °C | `30` | Ab dieser Temperatur: Anlass „Hitze“. |
| `frostTemp` | °C | `0` | Bei/unter dieser Temperatur: Anlass „Frost“. |
| `stormWindKmh` | km/h | `50` | Ab dieser Windgeschwindigkeit: Anlass „Wind“. |

Das sind Wetter-Sprüche, keine Warnungen: Warn-Sprüche gibt es nur bei
amtlichen DWD-Warnungen (von MMM-LumiraWeather).

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
`afterDutyMessages` und jede weitere Liste aus `spruch-catalog.js` (z. B.
`familienwahnsinn`, `wetter_regen`), `weekdayMessages` (Objekt 0–6,
0 = Sonntag), `seasonMessages` (`spring`/`summer`/`autumn`/`winter`),
`holidayMessages` (Objekt „MM-TT"). Listen aus dem Portal haben Vorrang.

Zweizeilige Nachrichten: einfach `\n` im Text verwenden.

## Zusammenspiel mit anderen Modulen

Damit `firefighterIntegration` funktioniert, muss in **MMM-aPagerAlarm**
`broadcastNotifications: true` gesetzt sein (Standard). Dieses Modul sendet dann
bei jedem Zustandswechsel `APAGER_STATE`, worauf SmartCompliments reagiert.

## Hinweis zum Wetter

Bevorzugt wird `LUMIRA_WEATHER` von MMM-LumiraWeather (aktuelles Wetter mit
WMO-Code und amtliche Warnungen, jeweils mit Zeitstempel). Sonst unterstützt
das Modul `WEATHER_UPDATED` (Standard-Wettermodul), `CURRENTWEATHER_DATA`
(älteres Modul) sowie einen generischen Fallback mit `temperature`,
`windSpeed`, `weatherType`. Wetter älter als 3 Stunden und Warnungen älter als
90 Minuten werden nicht verwendet.
