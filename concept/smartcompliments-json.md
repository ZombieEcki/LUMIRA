# LUMIRA – Konzept: Sprüche von MMM-SmartCompliments in eine JSON auslagern

Wie die großen Text-Listen von **MMM-SmartCompliments** (Morgen-/Tageszeit-,
Wochentags-, Familien-, Motivations-, Humor-Sprüche …) aus der `config.js`
in eine eigene, vom Kunden bearbeitbare JSON wandern – inklusive Anbindung
ans Self-Service-Portal und ein paar zusätzlichen Ideen.

> Status: Konzept, Umsetzung offen. Siehe [CHECKLIST.md](../CHECKLIST.md).
> Verwandt: [modules/MMM-SmartCompliments](../modules/MMM-SmartCompliments),
> [lumira-portal/](../lumira-portal), [selfservice.md](selfservice.md)
> (dasselbe „eine Wahrheit + Backup + atomarer Schreibvorgang"-Muster wird
> hier wiederverwendet).

---

## 0. Ausgangslage

`MMM-SmartCompliments` wählt seine Botschaft schon heute nicht zufällig,
sondern nach einer klaren Priorität (siehe Kommentar am Kopf der Datei):

```
Tier A (exklusiv, falls zutreffend):
  Geburtstag heute → Hochzeitstag heute → aktive Wetterwarnung → Feiertag heute

Tier B (Familienmix, alles gleichrangig, zufällig aus großem Pool):
  Tageszeit + Wochentag + Jahreszeit + Wetterhinweis + Kalender + Aufgaben
  + Erinnerungen + Countdowns + familyMessages + motivationMessages
  + humorMessages
```

Alle Textbausteine dafür – `morningMessages`, `forenoonMessages`,
`afternoonMessages`, `eveningMessages`, `nightMessages`, `weekdayMessages`
(0–6), `seasonMessages` (spring/summer/autumn/winter), `holidayMessages`
(„MM-TT"), `familyMessages`, `motivationMessages`, `humorMessages`,
`afterDutyMessages`, `weatherHints`, `weatherWarnings`, `birthdayText`,
`weddingText` – liegen aktuell **hart codiert** in den `defaults` des
Moduls bzw. werden komplett überschrieben, indem man sie in `config.js`
erneut ausschreibt (siehe das Beispiel, das den Anstoß für dieses Konzept
gegeben hat).

**Zwei Probleme damit:**

1. Wer auch nur einen einzigen Morgenspruch ändern will, muss die
   *komplette* Liste in `config.js` neu ausschreiben (sonst wird die ganze
   Kategorie durch die neue, kürzere Liste ersetzt).
2. `config.js` wird inzwischen automatisch von
   [`lumira-portal/lib/generate-config.js`](../lumira-portal/lib/generate-config.js)
   erzeugt (siehe [selfservice.md](selfservice.md)) – von Hand
   reinredigierte Sprüche würden beim nächsten Speichern im Portal einfach
   wieder überschrieben.

## 1. Zielbild

Eine neue Datei **`compliments.json`** wird die einzige Wahrheit für die
**Textinhalte** (nicht für das *Verhalten* – Intervalle, Schwellenwerte,
welche Integration an/aus ist, bleiben in `config.js`/`settings.json`,
siehe Abschnitt 3). Der Kunde bearbeitet sie bequem im Self-Service-Portal,
das Modul liest sie zur Laufzeit.

```
[Self-Service-Portal]  --schreibt-->  ~/.lumira/compliments.json  --liest-->  [MMM-SmartCompliments/node_helper.js]
        ▲                                      │                                        │
        │                              Backup vor jedem                         live an die Anzeige
   Kunde bearbeitet                      Schreiben (wie                        (Datei-Watcher, kein
   „Sprüche"-Seite                       settings.json)                        MagicMirror-Neustart nötig)
```

**Wichtig – wo die Datei NICHT liegen darf:** `~/.lumira/`, **nicht**
`modules/MMM-SmartCompliments/`. `install.sh` rsynct das Modulverzeichnis
bei jeder Installation/jedem Update mit `--delete` (siehe
[`install.sh`](../install.sh) „Eigene Module") – jede Datei dort geht beim
nächsten `git pull` + `./install.sh` verloren. Das ist exakt dieselbe Lehre
wie beim `settings.default.json`-Vorfall (siehe CHECKLIST.md-Historie): Nur
`~/.lumira/` überlebt Updates zuverlässig.

## 2. Was bleibt wo?

| Gehört zu | Beispiel | Warum |
|-----------|----------|-------|
| **`settings.json`** (bestehend) | `birthdays`, `weddingDate`, `person.name` | strukturierte, editionsabhängige Kundendaten – hat schon ein Zuhause (siehe [selfservice.md](selfservice.md)) |
| **`config.js`** (generiert) | `updateInterval`, `firefighterIntegration`, `hideOnAlarmPhases`, `afterDutyDurationMinutes`, `heatTemp`/`frostTemp`/`stormWindKmh`, `rememberLastMessages`, `compliments.moods` (siehe 5.1) | *Verhalten*, keine Textinhalte – ändert sich selten, gehört konzeptionell zur Edition/Konfiguration |
| **`compliments.json`** (NEU) | alle Textlisten: `morningMessages` … `humorMessages`, `weekdayMessages`, `seasonMessages`, `holidayMessages`, `afterDutyMessages`, `weatherHints`, `weatherWarnings`, `birthdayText`, `weddingText` | *Inhalte* – das, was sich der Kunde individuell „anhört" und oft anpassen will |

Diese Trennung ist bewusst schmal gehalten: Nur Text-Listen wandern, keine
Verhaltens-Schalter. Das hält `compliments.json` einfach und macht das
Portal-Formular übersichtlich (reine Textpflege, keine Technik-Optionen).

## 3. Datenmodell

```json
{
  "version": 1,
  "updatedAt": "2026-07-18T12:00:00.000Z",
  "categories": {
    "morningMessages": ["Guten Morgen, Sonnenschein! ☀️", "..."],
    "forenoonMessages": ["..."],
    "afternoonMessages": ["..."],
    "eveningMessages": ["..."],
    "nightMessages": ["..."],
    "familyMessages": ["..."],
    "motivationMessages": ["..."],
    "humorMessages": ["..."],
    "afterDutyMessages": ["..."],
    "weekdayMessages": { "0": ["..."], "1": ["..."], "...": ["6"] },
    "seasonMessages": { "spring": ["..."], "summer": ["..."], "autumn": ["..."], "winter": ["..."] },
    "holidayMessages": { "12-24": ["🎄 Frohe Weihnachten!"], "01-01": ["🎉 Frohes neues Jahr!"] },
    "weatherHints": { "rain": ["..."], "snow": ["..."] },
    "weatherWarnings": { "heat": ["..."], "frost": ["..."], "storm": ["..."] }
  },
  "templates": {
    "birthdayText": "🥳 Happy Birthday, {name}!",
    "weddingText": "❤️ Alles Gute zum Hochzeitstag!"
  }
}
```

- `version` – Schema-Version, damit spätere Formatänderungen (z. B. Umstieg
  auf Objekt-Einträge, siehe Abschnitt 6.3) sich sauber migrieren lassen.
- Jede Kategorie ist **optional**. Fehlt sie oder ist sie leer, greift der
  eingebaute Standardtext des Moduls (siehe Abschnitt 4) – niemand muss 15
  Morgensprüche erfinden, nur um einen einzigen Humor-Spruch zu ändern.
- Struktur 1:1 an die heutigen `defaults`-Objekte angelehnt (`categories.*`
  = heutige Top-Level-Keys), damit die Migration mechanisch bleibt.

## 4. Technischer Unterbau

### 4a. Lesen: node_helper.js

`node_helper.js` bekommt `fs`-Zugriff (heute komplett ungenutzt) und liest
`~/.lumira/compliments.json` einmal beim Start sowie bei jeder Änderung
(`fs.watch`, debounced). Pro Kategorie wird **gemerged**, nicht komplett
ersetzt:

```js
function mergeCategory(builtin, custom) {
  return (Array.isArray(custom) && custom.length) ? custom : builtin;
}
```

Ergebnis wird per neuer Socket-Notification an die Anzeige geschickt:

```js
self.sendSocketNotification("SC_COMPLIMENTS", mergedCategories);
```

Das Modul selbst (`MMM-SmartCompliments.js`) ersetzt beim Empfang einfach
die entsprechenden `this.config.*`-Listen und ruft `updateMessage()` neu
auf – **kein MagicMirror-Neustart nötig**. Das ist ein echter Komfort-
gewinn gegenüber dem heutigen Verhalten von `lumira-portal`, das bei jeder
Einstellungsänderung `pm2 restart MagicMirror` auslöst (sinnvoll für
strukturelle Änderungen, aber unnötig hart für „ein Spruch mehr").

### 4b. Schreiben: lumira-portal

Neues `lumira-portal/lib/compliments.js`, nach exakt demselben Muster wie
[`lib/settings.js`](../lumira-portal/lib/settings.js): `load()` / `save()`
/ `patch()`, Backup vor jedem Schreiben, atomarer Schreibvorgang
(`.tmp` + `rename`). Das Backup-/Atomic-Write-Stück ist in `settings.js`
heute fest verdrahtet – lohnt sich, es in ein kleines gemeinsames
`lib/store.js` zu ziehen (`createJsonStore(path, backupDir, maxBackups)`),
das beide Module nutzen, statt Code zu verdoppeln.

Neue Portal-API:

| Endpunkt | Wirkung |
|----------|---------|
| `GET /api/compliments` | aktuelle `compliments.json` (bzw. Defaults, falls leer) |
| `POST /api/compliments` | Patch pro Kategorie speichern, kein MagicMirror-Neustart nötig |
| `GET /api/compliments/defaults` | die eingebauten Standardtexte des Moduls (zum Vergleichen/Zurücksetzen einer einzelnen Kategorie) |

## 5. Self-Service-Portal: neue Seite „Sprüche"

Eigene Nav-Seite (Gruppe „Konfiguration", zwischen „Familie" und
„Kalender & News"), pro Kategorie eine Karte mit Textzeilen-Liste – exakt
dasselbe UI-Muster wie die schon vorhandene Geburtstagsliste
(`+ Geburtstag hinzufügen` → hier `+ Spruch hinzufügen`), nur ohne das
Datumsfeld:

```
┌ Morgens ──────────────────────────────────────┐
│ [Guten Morgen, Sonnenschein! ☀️        ] [✕]   │
│ [Der Kaffee wartet schon ☕            ] [✕]   │
│ + Spruch hinzufügen      ↺ Standard zurücksetzen│
└─────────────────────────────────────────────────┘
```

- „↺ Standard zurücksetzen" pro Karte leert die Kategorie in
  `compliments.json` wieder (→ Modul fällt automatisch auf die eingebauten
  Standardtexte zurück, siehe Abschnitt 3).
- Wochentags-/Jahreszeit-/Feiertags-Kategorien bekommen eine kleine
  Unter-Auswahl (Tabs oder Dropdown: „Montag" … „Sonntag" bzw.
  „Frühling" … „Winter") statt 7/4 einzelner Karten.
- Nicht Teil dieser Seite: die schon vorhandene, editionsabhängig
  ausgeblendete `familie`-Seite bleibt für `birthdays`/`weddingDate`
  zuständig (Personendaten, siehe Abschnitt 2) – „Sprüche" ist rein für die
  Textbausteine.

### 5.1 Stimmungs-Auswahl (welche Kategorien überhaupt vorkommen)

Zusätzlich zum reinen Text-Bearbeiten: eine kleine Auswahl am Kopf der
„Sprüche"-Seite, mit der die Familie festlegt, welche **Stimmung** die
Kompliments insgesamt haben sollen – unabhängig davon, was in den einzelnen
Textkategorien steht.

```
Stimmung der Kompliments
☑ Herzlich       (familyMessages)
☑ Motivierend    (motivationMessages)
☑ Humorvoll      (humorMessages)
```

**Wichtig – das ist ein *Verhaltens*-Schalter, keine Textänderung**, gehört
nach der Tabelle in Abschnitt 2 also **nicht** in `compliments.json`, sondern
in `settings.json`/`config.js` (genau wie `firefighterIntegration` oder
`updateInterval`):

- **`settings.json`** neues Feld `compliments.moods`:
  ```json
  "compliments": { "moods": { "herzlich": true, "motivierend": true, "humorvoll": true } }
  ```
- **`generate-config.js`** reicht das 1:1 als neue `MMM-SmartCompliments`-
  Config-Flags durch, z. B. `moodHerzlich`/`moodMotivierend`/`moodHumorvoll`.
- **`MMM-SmartCompliments.js`**, `buildAmbient()` (aktuell hängt jede der drei
  Kategorien bedingungslos an den Auswahl-Pool an):
  ```js
  if (this.config.moodHerzlich)    pool = pool.concat(this.config.familyMessages);
  if (this.config.moodMotivierend) pool = pool.concat(this.config.motivationMessages);
  if (this.config.moodHumorvoll)   pool = pool.concat(this.config.humorMessages);
  ```
  Alle anderen Pool-Bestandteile (Tageszeit, Wochentag, Jahreszeit, Wetter,
  Kalender, Aufgaben, Erinnerungen, Countdowns) bleiben unabhängig davon
  immer aktiv – die Stimmungs-Auswahl betrifft nur die drei „reinen
  Charakter"-Kategorien.
- **Validierung**: mindestens eine Stimmung muss aktiv bleiben (sonst bricht
  `buildAmbient()` bei abgeschalteter Feuerwehr-Integration u.U. komplett
  leer zusammen, wenn gerade auch kein Tier-A-Ereignis vorliegt).
- Vorteil gegenüber „Kategorie einfach leeren": die Texte in
  `compliments.json` bleiben dabei vollständig erhalten – man blendet die
  Stimmung nur vorübergehend aus, verliert aber keine selbst geschriebenen
  Sprüche, falls man sie später wieder anschaltet.

## 6. Eigene Ideen

Ein paar Ergänzungen über die reine „JSON statt config.js"-Anfrage hinaus,
die sich mit demselben Datenmodell fast von selbst anbieten:

### 6.1 Zwei-Ebenen statt Alles-oder-Nichts
Bereits in Abschnitt 3/4a eingebaut: eingebaute Standardtexte bleiben *im
Modul*, `compliments.json` überschreibt nur, was der Kunde tatsächlich
angefasst hat. Niemand startet vor einer leeren Liste.

### 6.2 Live-Reload statt Neustart
Siehe 4a – ändert die gefühlte Reaktionszeit des Portals radikal: Ein
Spruch hinzufügen fühlt sich wie „speichern und fertig" an statt wie ein
15-Sekunden-MagicMirror-Neustart.

### 6.3 Einzelne Sprüche ein-/ausschalten oder anheften (spätere Phase)
Statt reiner String-Arrays optional Objekt-Einträge zulassen:
`{ "text": "...", "enabled": true, "pinned": false }`. `enabled: false`
blendet einen Spruch aus, ohne ihn zu löschen (z. B. „diesen Feuerwehr-Witz
mag ich gerade nicht mehr" – Text bleibt aber für später erhalten).
`pinned: true` erhöht die Auswahlwahrscheinlichkeit an einem bestimmten Tag
(z. B. ein einmaliger Spruch für einen Jahrestag). Modul akzeptiert beide
Formen (`string` **oder** `{text,...}`) für Abwärtskompatibilität – kein
Breaking Change nötig.

### 6.4 Import/Export
„Sprüche exportieren" lädt die aktuelle `compliments.json` als Datei herunter
(Backup, Umzug auf ein zweites Gerät, oder einfach mit einem Texteditor in
Bulk bearbeiten und wieder hochladen). Passt zum bestehenden
Backup-Verzeichnis, ist aber zusätzlich für den Kunden selbst nutzbar, nicht
nur intern.

### 6.5 Personenbezogene Sprüche
Neue optionale Kategorie `personMessages: { "Papa": ["..."], "Marie": ["..."] }`,
geknüpft an die bereits vorhandenen `family.birthdays`-Namen aus
`settings.json`. Nicht nur „🎂 Heute hat {name} Geburtstag", sondern echte,
frei formulierte Sprüche für einzelne Familienmitglieder, die gelegentlich
mit in den Tier-B-Pool gemischt werden.

### 6.6 Mehrsprachigkeit vorbereiten (Scaffolding)
Passend zur bereits notierten Idee „LUMIRA Mehrsprachigkeit" (siehe
CHECKLIST.md #7): `categories` könnte künftig unter einem Sprachschlüssel
verschachtelt werden (`{"de": {...}, "en": {...}}`). Für dieses Konzept
reicht es, das Schema so zu entwerfen, dass diese Schachtelung später
*hinzugefügt*, nicht *umgebaut* werden muss – z. B. indem `generateCompliments()`
von Anfang an eine Sprache als Parameter entgegennimmt (Standard `"de"`,
heute die einzige).

### 6.7 Sicheres Rendern (siehe auch Abschnitt 7)
`getDom()` baut die Anzeige heute per `wrapper.innerHTML = text.replace(/\n/g, "<br>")`.
Sobald Texte über ein Formular (statt nur von Hand in `config.js`) ins
System kommen, sollte das auf sicheres DOM-Bauen umgestellt werden (Text
als `textContent`, Zeilenumbrüche als eigene `<br>`-Elemente) – kein
`innerHTML` mehr mit Nutzereingaben. Siehe Abschnitt 7.

## 7. Sicherheit & Robustheit

- **Backup vor jedem Schreiben**, identisches Muster zu `settings.json`
  (siehe [`lib/settings.js`](../lumira-portal/lib/settings.js)).
- **Kategorie-Whitelist**: `POST /api/compliments` akzeptiert nur bekannte
  Kategorie-Schlüssel (siehe Abschnitt 3) – keine beliebigen neuen Felder,
  die node_helper dann ungeprüft in `this.config` mergen würde.
- **Größenlimits**: pro Kategorie z. B. max. 200 Einträge, pro Eintrag max.
  300 Zeichen – verhindert, dass ein verunglücktes Bulk-Paste den Speicher/
  die Anzeige sprengt.
- **Kein `innerHTML` mit Nutzertext** (siehe 6.7) – auch wenn das Portal nur
  im Heimnetz und PIN-geschützt erreichbar ist (siehe
  [selfservice.md](selfservice.md) Abschnitt 6), ist „Text rendern ohne
  HTML-Interpretation" die richtige Grundhaltung, sobald Nutzereingaben in
  den DOM wandern – kostet hier nichts, since `\n`-Ersetzung genauso einfach
  mit DOM-Knoten geht.
- **`compliments.json` niemals im Modulordner** (siehe Abschnitt 1) – das
  ist der wichtigste Punkt, der bei Umsetzung nicht vergessen werden darf.

## 8. Migration bestehender Installationen

Geräte, die schon eine `config.js` mit eigenen Sprüchen haben (wie das
Beispiel, das diesem Konzept zugrunde liegt), verlieren dabei nichts:

1. Beim ersten Start mit dieser Funktion prüft `node_helper.js`, ob
   `compliments.json` fehlt, aber `config.js` eigene (von den Default-Werten
   abweichende) Listen enthält.
2. Falls ja: einmalige Übernahme dieser Listen als Startinhalt von
   `compliments.json` (über die neue Portal-API, nicht durch das Modul
   selbst schreiben lassen – Konsistenz mit „nur lumira-portal schreibt").
3. Ab dann ist `config.js` (aus `settings.json` generiert) wieder die
   alleinige Quelle für *Verhalten*, `compliments.json` für *Inhalte* – wie
   in Abschnitt 2 beschrieben.

## 9. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|-------|--------|----------|
| **1** | `compliments.json` + `lib/compliments.js` (Backup/Atomic-Write) + `node_helper.js` liest beim Start | Grundfunktion: Sprüche kommen aus der JSON statt aus `config.js` |
| **2** | Live-Reload per `fs.watch` + `SC_COMPLIMENTS`-Notification | Änderungen wirken ohne MagicMirror-Neustart |
| **3** | Portal-Seite „Sprüche" (Abschnitt 5) + API-Endpunkte + Stimmungs-Auswahl (5.1) | Kunde kann selbst bearbeiten, ganz ohne SSH, plus Herzlich/Motivierend/Humorvoll ein-/ausblenden |
| **4** | Migration bestehender `config.js`-Listen (Abschnitt 8) | keine verlorenen Sprüche bei Umstieg |
| **5** | Objekt-Einträge (`enabled`/`pinned`, Abschnitt 6.3) + Import/Export (6.4) | Feinschliff, kein Breaking Change |
| **6** | `personMessages` (6.5) | tiefere Familien-Personalisierung |
| **7** | Sprach-Scaffolding (6.6) | Grundlage für spätere Mehrsprachigkeit |

**Empfohlener Start: Phase 1-3** – deckt genau die ursprüngliche Anfrage
(Sprüche in JSON, vom Modul gelesen, im Portal bearbeitbar) vollständig ab
und ist unabhängig von den späteren Komfort-Phasen sinnvoll nutzbar.

## 10. Offene Entscheidungen

- **Reihenfolge der Portal-Kategorien**: alle 13 Kategorien auf einer langen
  Seite, oder Unterreiter (Tageszeit / Wochentag & Jahreszeit / Familie &
  Humor / Wetter & Feiertage)? Bei 13 Kategorien vermutlich Unterreiter
  sinnvoller für die Übersicht.
- **`weatherHints`/`weatherWarnings`/`seasonMessages`**: eher Nischen-
  Kategorien, die selten personalisiert werden dürften – lohnt sich, sie in
  Phase 3 wegzulassen und erst bei Bedarf nachzuziehen, um die erste
  Portal-Seite schlank zu halten?
- **Zusammenspiel mit `afterDutyMessages`**: gehört inhaltlich eng zur
  Feuerwehr-Kopplung (Abschnitt 2 der `config.js`) – bleibt es trotzdem eine
  reine Text-Kategorie in `compliments.json` (so wie hier vorgeschlagen),
  oder sollte sie wegen der thematischen Nähe stattdessen auf der
  „Alarmierung"-Seite des Portals landen statt bei „Sprüche"?
