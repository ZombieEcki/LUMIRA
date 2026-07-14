# Konfiguration – MMM-aPagerAlarm

Alle Optionen sind **optional** – ohne Angabe gelten die Standardwerte.
Unten steht ein vollständiges Beispiel, danach jede Option im Detail.

## Vollständiges Beispiel

```js
{
    module: "MMM-aPagerAlarm",
    position: "fullscreen_above",     // Position egal – Karten werden per CSS zentriert
    config: {
        // --- Webhook / node_helper ---
        webhookPort: 8090,            // NICHT 8080 (belegt MagicMirror)
        webhookPath: "/alarm",
        clearPath: "/clear",

        // --- Zeitsteuerung (Minuten) ---
        alarmDuration: 15,            // Zustand 1: Alarm
        infoDuration: 240,            // Zustand 2: "ist im Einsatz" (4 h)
        returnDuration: 30,           // Zustand 3: "war im Einsatz"

        // --- Zustände einzeln aktivierbar ---
        enableInfoState: true,        // Zustand 2 anzeigen?
        enableReturnState: true,      // Zustand 3 anzeigen?

        // --- Person / Botschaften ---
        personName: "Papa",
        messageRotationMinutes: 5,
        randomizeMessages: true,      // true = zufällig, false = der Reihe nach
        heartSymbol: "❤️",
        careMessages: [
            "Komm gesund wieder nach Hause.",
            "Die Familie denkt an dich.",
            "Pass gut auf dich auf.",
            "Danke, dass du anderen Menschen hilfst.",
            "Wir wünschen dir einen sicheren Einsatz.",
            "Bis später."
        ],
        returnMessages: [
            "Willkommen zurück.",
            "Danke für deinen Einsatz.",
            "Jetzt gehört der Abend wieder der Familie.",
            "Schön, dass du wieder zuhause bist.",
            "Wir freuen uns, dass du wieder da bist."
        ],

        // --- Texte (frei anpassbar, {name} = personName) ---
        title: "EINSATZ",
        readyText: "👷 Bereit machen!",
        badgeText: "🚒 Feuerwehr",
        infoHeadline: "{name} ist im Einsatz.",
        returnHeadline: "{name} war heute für die Feuerwehr im Einsatz.",
        labelKeyword: "EINSATZSTICHWORT",
        labelUnit: "EINHEIT",
        labelTime: "ALARMZEIT",

        // --- Alarm-Darstellung (Zustand 1) ---
        dimBackground: true,
        dimOpacity: 0.55,             // 0.0 (klar) – 1.0 (schwarz)
        showCountdown: true,
        showDate: true,
        hideModulesDuringAlarm: [],   // z. B. ["clock","newsfeed","calendar"]

        // --- Ton (Zustand 1) ---
        playSound: true,
        soundFile: "alarm.mp3",
        soundLoop: false,             // Datei endlos abspielen
        soundVolume: 1.0,             // 0.0 – 1.0
        repeatSoundSeconds: 0,        // Ton alle X Sek. erneut (0 = aus)

        // --- Allgemeine Optik ---
        animate: true,
        useGlass: true,               // Glassmorphism (Blur) für Zustand 2/3
        locale: "de-DE",

        // --- Integration ---
        broadcastNotifications: true, // "APAGER_STATE" an andere Module senden

        // --- Test ---
        testMode: false,
        testState: 1                  // 1 = Alarm, 2 = im Einsatz, 3 = war im Einsatz
    }
}
```

## Optionen im Detail

### Webhook

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `webhookPort` | Zahl | `8090` | Port des Webhook-Servers. **Nicht 8080** (MagicMirror). |
| `webhookPath` | Text | `"/alarm"` | Endpunkt, den aPager aufruft. |
| `clearPath` | Text | `"/clear"` | Endpunkt zum manuellen Beenden. |

### Zeitsteuerung & Zustände

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `alarmDuration` | Minuten | `15` | Dauer von Zustand 1 (Alarm). |
| `infoDuration` | Minuten | `240` | Dauer von Zustand 2 ("ist im Einsatz"). |
| `returnDuration` | Minuten | `30` | Dauer von Zustand 3 ("war im Einsatz"). |
| `enableInfoState` | bool | `true` | Zustand 2 aktivieren. Bei `false` wird er übersprungen. |
| `enableReturnState` | bool | `true` | Zustand 3 aktivieren. Bei `false` wird er übersprungen. |

> Beispiel: Nur der Alarm, ohne die ruhigen Karten →
> `enableInfoState: false, enableReturnState: false`. Dann verschwindet die
> Anzeige nach `alarmDuration` direkt.

### Person & Botschaften

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `personName` | Text | `"Papa"` | Name der Person im Einsatz. |
| `messageRotationMinutes` | Minuten | `5` | Wechselintervall der Botschaften. |
| `randomizeMessages` | bool | `true` | `true` = zufällig, `false` = der Reihe nach. |
| `heartSymbol` | Text | `"❤️"` | Symbol über den Botschaften. |
| `careMessages` | Liste | siehe Beispiel | Botschaften in Zustand 2. |
| `returnMessages` | Liste | siehe Beispiel | Botschaften in Zustand 3. |

### Texte

| Option | Standard | Beschreibung |
|--------|----------|--------------|
| `title` | `"EINSATZ"` | Überschrift im Alarmfenster. |
| `readyText` | `"👷 Bereit machen!"` | Hinweiszeile im Alarm (leer = ausblenden). |
| `badgeText` | `"🚒 Feuerwehr"` | Kleine Marke oben in Zustand 2 (leer = ausblenden). |
| `infoHeadline` | `"{name} ist im Einsatz."` | Überschrift Zustand 2. `{name}` wird ersetzt. |
| `returnHeadline` | `"{name} war heute …"` | Überschrift Zustand 3. `{name}` wird ersetzt. |
| `labelKeyword` | `"EINSATZSTICHWORT"` | Beschriftung über dem Stichwort. |
| `labelUnit` | `"EINHEIT"` | Beschriftung über der Einheit. |
| `labelTime` | `"ALARMZEIT"` | Beschriftung über der Uhrzeit. |

### Alarm-Darstellung (Zustand 1)

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `dimBackground` | bool | `true` | Bildschirm abdunkeln. |
| `dimOpacity` | 0–1 | `0.55` | Stärke der Abdunklung. |
| `showCountdown` | bool | `true` | Countdown anzeigen. |
| `showDate` | bool | `true` | Datum unter der Alarmzeit. |
| `hideModulesDuringAlarm` | Liste | `[]` | Modulnamen, die im Alarm ausgeblendet und danach wieder eingeblendet werden (z. B. `["newsfeed"]`). |

### Ton (Zustand 1)

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `playSound` | bool | `true` | Alarmton abspielen. |
| `soundFile` | Text | `"alarm.mp3"` | Datei im Ordner `sounds/`. |
| `soundLoop` | bool | `false` | Datei endlos abspielen. |
| `soundVolume` | 0–1 | `1.0` | Lautstärke. |
| `repeatSoundSeconds` | Sek. | `0` | Ton alle X Sekunden erneut abspielen (0 = aus). |

### Optik & Integration

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `animate` | bool | `true` | Ein-/Ausblend-Animationen. |
| `useGlass` | bool | `true` | Glassmorphism (Blur). Bei schwacher GPU auf `false`. |
| `locale` | Text | `"de-DE"` | Sprache für Datum/Uhrzeit. |
| `broadcastNotifications` | bool | `true` | Sendet `APAGER_STATE` an andere Module (siehe unten). |
| `forwardTargets` | Liste | `[]` | URLs (z. B. Home-Assistant-Webhooks), die bei jedem Phasenwechsel ein POST `{ state, keyword, unit, time }` erhalten. |

### Test

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `testMode` | bool | `false` | Beim Start automatisch einen Zustand zeigen. |
| `testState` | 1/2/3 | `1` | Welcher Zustand im Testmodus. |

## Benachrichtigungen an andere Module

Bei jedem Zustandswechsel sendet das Modul (falls `broadcastNotifications: true`)
die MagicMirror-Notification `APAGER_STATE`:

```js
{
    state: 0 | 1 | 2 | 3,             // Familie / Alarm / im Einsatz / war im Einsatz
    alarm: { unit, keyword, time }    // aktueller Alarm (oder null)
}
```

Damit kann ein anderes Modul z. B. reagieren, wenn ein Einsatz beginnt oder endet.

## Beispiele

**Nur Alarm, kein „im/​war Einsatz":**

```js
config: { enableInfoState: false, enableReturnState: false }
```

**Botschaften der Reihe nach, alle 2 Minuten, andere Person:**

```js
config: { personName: "Mama", randomizeMessages: false, messageRotationMinutes: 2 }
```

**News & Wetter während des Alarms ausblenden, Ton alle 30 s wiederholen:**

```js
config: {
    hideModulesDuringAlarm: ["newsfeed", "weather"],
    repeatSoundSeconds: 30,
    soundVolume: 0.8
}
```

**Zustand 2 vorab ansehen (ohne 15 min zu warten):**

```js
config: { testMode: true, testState: 2 }
```
