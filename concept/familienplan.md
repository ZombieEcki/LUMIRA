# LUMIRA – Konzept: Familienplan (Wochendienste mit fairer Rotation)

Ein neues Familien-Feature: Ein **Familienplan** auf dem Spiegel zeigt, wer
diese Woche welche Dienste hat (Garten, Tisch, Bad, Müll …). Die Verteilung
rotiert jede Woche automatisch, fair und nachvollziehbar. Gepflegt wird alles
im Self-Service-Portal, ganz ohne SSH und ohne die `config.js` von Hand
anzufassen.

> Status: **Phase 0–3 umgesetzt** (10.10.2026), dazu eine Wochenplan-Vorschau
> (nur lesend). Noch offen: Änderungen an Zukunftswochen, Begründungen,
> Fairness-Matrix im Portal (Phase 4), Export/Import/Backup-Wiederherstellung
> im Portal (Phase 5), Einbau beim Kunden (Phase 6). Code:
> [modules/MMM-FamilyPlan](../modules/MMM-FamilyPlan),
> [lumira-portal/lib/familyplan.js](../lumira-portal/lib/familyplan.js),
> [lumira-portal/lib/familyplan-rotation.js](../lumira-portal/lib/familyplan-rotation.js).
> Siehe [CHECKLIST.md](../CHECKLIST.md).
> Grundlage: Anforderungsdokument „Familienplan-Modul für MagicMirror“ plus
> Design-Mockup (Spiegel-Ansicht, Web-Verwaltung „Übersicht“ und
> „Dienste bearbeiten“).
> Verwandt: [smartcompliments-json.md](smartcompliments-json.md) (dasselbe
> Muster: eigene JSON in `~/.lumira/`, Backup, atomarer Schreibvorgang,
> Live-Reload ohne MagicMirror-Neustart), [selfservice.md](selfservice.md),
> [produktvarianten.md](produktvarianten.md).

---

## 0. Ausgangslage

- Auf dem Familien-Spiegel steht heute oben links ein einfacher Bereich
  **„WOCHENAUFGABEN“**: fünf feste Zeilen („Gartendienst! – Papa“,
  „Tischdienst! – Maja und Marie“ …), ohne Rotation und ohne Verwaltung.
- LUMIRA hat bisher **kein eigenes Aufgaben-Modul**. Es gibt aber schon die
  passenden Anknüpfungspunkte:
  - `MMM-SmartCompliments` hört bereits auf eine Notification
    `CHORES_UPDATE` (`choresIntegration`, siehe
    [CONFIG.md](../modules/MMM-SmartCompliments/CONFIG.md)), die bisher
    nichts sendet.
  - Die Portal-Seite „Personen“ hat schon den Kommentar *„Namen hier sind
    zugleich die künftige Quelle für Familienmitglieder-Namen eines späteren
    To-Do-Moduls“* ([index.html](../lumira-portal/public/index.html)).
  - Das Muster „Portal schreibt JSON in `~/.lumira/`, Modul liest live per
    `fs.watch`“ existiert und ist erprobt (`compliments.json`).
- Randbedingung: Der Ziel-Spiegel läuft auf einem **Raspberry Pi 3** mit der
  neuesten MagicMirror-Version, die dort aktuell einen Bug hat. Die
  Entwicklung läuft davon unabhängig, die Installation auf dem Gerät kommt
  erst nach dem Fix (siehe Abschnitt 11).

## 1. Zielbild

```
          Smartphone / PC (Heimnetz)
                    │
                    ▼
┌──────────────────────────────────────┐
│ lumira-portal (Port 8092)            │
│  Seite „Familienplan“                │
│  lib/familyplan.js  (Store)          │──schreibt──►  ~/.lumira/familyplan.json
│  lib/familyplan-rotation.js (Logik)  │               ~/.lumira/familyplan/avatars/*
│  Wochen-Scheduler (setInterval)      │               ~/.lumira/backups/familyplan.*.json
└──────────────────────────────────────┘                        │
                                                         liest (fs.watch)
                                                                ▼
                                    ┌───────────────────────────────────────┐
                                    │ MMM-FamilyPlan (node_helper + Anzeige)│
                                    │  oben links, gleiche Breite wie bisher│
                                    │  ──FAMILYPLAN_UPDATE──► SmartCompliments
                                    └───────────────────────────────────────┘
```

**Grundsätze:**

1. **Eine Wahrheit:** `~/.lumira/familyplan.json`. Liegt bewusst **nicht** im
   Modulordner, weil `install.sh` den bei jedem Update per `rsync --delete`
   leert (dieselbe Lehre wie bei `settings.default.json` und `compliments.json`).
2. **Nur das Portal schreibt.** Das Modul liest nur. Das gilt auch für den
   Wochenwechsel, die Rotationslogik gibt es also genau einmal (im Portal).
3. **Kein MagicMirror-Neustart** bei Änderungen am Plan, an Personen oder an
   Diensten. Das Modul lädt live nach. Nur das Ein- und Ausschalten des Moduls
   selbst ändert die `config.js` (siehe Abschnitt 3).
4. **Komplett lokal:** keine Cloud, kein Internet nötig, keine laufenden
   Kosten, keine nativen npm-Abhängigkeiten (wichtig für den Pi 3).

## 2. Was auf dem Spiegel ersetzt wird und was nicht

| Bereich | Verhalten |
|---------|-----------|
| „WOCHENAUFGABEN“ oben links | **wird ersetzt** durch `MMM-FamilyPlan`, gleiche Region, Breite höchstens so breit wie bisher (`maxWidth`, siehe 5.3) |
| Familienkalender darunter, Uhr/Datum, Spruch oben Mitte, Wetter, Regenradar, Nachrichten | **unverändert** |
| Einkaufslisten, To-dos, weitere Info-Module (wie im Inspirations-Dashboard) | **nicht Teil** dieses Projekts |

> Hinweis zur Position: Auf einem Standard-LUMIRA-Gerät steht in `top_left`
> die Uhr (siehe `generate-config.js`). Der Familienplan landet dort **unter
> der Uhr** und über dem Familienkalender (`bottom_left`). Auf dem
> bestehenden Familien-Spiegel aus dem Mockup steht die Uhr rechts. Dort
> nimmt der Familienplan exakt den Platz der alten Wochenaufgaben ein. Beides
> deckt `position` in `settings.json` ab (Abschnitt 3).

## 3. Was bleibt wo?

Gleiche Trennung wie im Sprüche-Konzept: In die `config.js` gehört nur, was
die *Einbindung des Moduls* betrifft. Alles, was die Familie regelmäßig
ändert, gehört in die eigene JSON.

| Gehört zu | Inhalt | Warum |
|-----------|--------|-------|
| **`settings.json`** (bestehend) | `familyPlan.enabled`, `familyPlan.position`, `familyPlan.maxWidth` | ändert die `config.js` → Neustart, ändert sich praktisch nie |
| **`config.js`** (generiert) | `MMM-FamilyPlan`-Eintrag mit Position/Breite/Layout | wird aus `settings.json` erzeugt, nie von Hand |
| **`familyplan.json`** (NEU) | Mitglieder, Dienste, Einstellungen der Rotation, alle Wochen (Historie + aktuelle) | Inhalte und Plan, Live-Reload ohne Neustart |
| **`~/.lumira/familyplan/avatars/`** (NEU) | hochgeladene Avatar-Bilder | Binärdateien gehören nicht in die JSON |

Neue Felder in [`settings.default.json`](../lumira-portal/settings.default.json):

```json
"familyPlan": {
  "enabled": false,
  "position": "top_left",
  "maxWidth": "300px"
}
```

`generate-config.js` hängt das Modul nur an, wenn `edition.hasFamily`
(Home/Fire/Rescue) **und** `familyPlan.enabled` gesetzt sind:

```js
if (edition.hasFamily && settings.familyPlan && settings.familyPlan.enabled) {
	modules.push({
		module: "MMM-FamilyPlan",
		position: settings.familyPlan.position || "top_left",
		config: {
			maxWidth: settings.familyPlan.maxWidth || "300px",
			layout: "stacked",
			showHeader: true,
			showWeekRange: true,
			hideOnAlarmPhases: edition.hasAlarm ? [1] : []
		}
	});
}
```

Die Reihenfolge im `modules`-Array legt die Reihenfolge innerhalb der Region
fest. Deshalb steht der Push **direkt nach der Uhr** (beide `top_left`).

## 4. Datenmodell `familyplan.json`

```json
{
  "version": 1,
  "revision": 42,
  "updatedAt": "2026-07-08T15:58:00.000Z",
  "settings": {
    "title": "Unser Familienplan",
    "rotationWeekday": 1,
    "autoRotate": true,
    "previewWeeks": 4,
    "historyWeeks": 26,
    "cycleStart": "2026-07-06",
    "pairMode": "varying",
    "fixedPairs": [["d_kochen", "d_kueche"]]
  },
  "members": [
    { "id": "m_k3f9", "name": "Marcel", "role": "adult", "color": "#4ade80",
      "avatar": { "type": "preset", "value": "adult-04" }, "active": true },
    { "id": "m_a71c", "name": "Franzi", "role": "adult", "color": "#facc15",
      "avatar": { "type": "upload", "file": "m_a71c.webp" }, "active": true },
    { "id": "m_0d2e", "name": "Maja", "role": "child", "color": "#a78bfa",
      "avatar": { "type": "initials" }, "active": true },
    { "id": "m_9b44", "name": "Marie", "role": "child", "color": "#f472b6",
      "avatar": { "type": "preset", "value": "child-07" }, "active": true }
  ],
  "duties": [
    { "id": "d_garten", "name": "Gartendienst", "color": "#4ade80", "icon": "seedling",           "roles": ["adult", "child"], "active": true },
    { "id": "d_tisch",  "name": "Tischdienst",  "color": "#22d3ee", "icon": "utensils",           "roles": ["adult", "child"], "active": true },
    { "id": "d_bad",    "name": "Baddienst",    "color": "#fda4af", "icon": "bath",               "roles": ["adult", "child"], "active": true },
    { "id": "d_muell",  "name": "Mülldienst",   "color": "#60a5fa", "icon": "trash-can",          "roles": ["adult", "child"], "active": true },
    { "id": "d_kochen", "name": "Kochdienst",   "color": "#facc15", "icon": "fire-burner",        "roles": ["adult", "child"], "active": true },
    { "id": "d_kueche", "name": "Küchendienst", "color": "#f472b6", "icon": "sink",               "roles": ["adult", "child"], "active": true },
    { "id": "d_putzen", "name": "Putzdienst",   "color": "#f0abfc", "icon": "spray-can-sparkles", "roles": ["adult", "child"], "active": true },
    { "id": "d_boden",  "name": "Bodendienst",  "color": "#c084fc", "icon": "broom",              "roles": ["adult", "child"], "active": true }
  ],
  "weeks": [
    {
      "start": "2026-07-06",
      "end": "2026-07-12",
      "auto":   { "m_k3f9": ["d_garten", "d_muell"], "m_a71c": ["d_kochen", "d_kueche"],
                  "m_0d2e": ["d_tisch", "d_boden"],  "m_9b44": ["d_bad", "d_putzen"] },
      "manual": null,
      "createdAt": "2026-07-06T00:00:12.000Z",
      "createdBy": "scheduler"
    }
  ]
}
```

**Entscheidungen im Datenmodell:**

- **Stabile IDs** (`m_…`, `d_…`, zufällig erzeugt): Umbenennen zerstört keine
  Historie, und die Rotation rechnet nur mit IDs.
- **Reihenfolge = Array-Reihenfolge** von `members` bzw. `duties`. Ein
  eigenes `order`-Feld bräuchte man nur fürs Sortieren, das Array reicht.
- **Löschen ist ein Soft-Delete** (`"deleted": true`): Vergangene Wochen
  zeigen weiterhin den richtigen Namen, und die Person/der Dienst taucht nur
  nicht mehr in neuen Wochen auf. `active: false` heißt „vorübergehend
  pausiert“ (z. B. Gartendienst im Winter), `deleted: true` heißt „weg“.
- **`auto` und `manual` getrennt pro Woche:** Angezeigt wird `manual ?? auto`.
  Damit ist „Automatische Verteilung wiederherstellen“ exakt (einfach
  `manual = null`), statt die Woche nachträglich neu zu berechnen.
- **`revision`** zählt bei jedem Schreiben hoch. Das schützt vor zwei
  gleichzeitig offenen Handys (siehe 6.3).
- **Wochen-Schlüssel = Startdatum** (`YYYY-MM-DD`, lokale Zeit), nicht die
  ISO-Kalenderwoche. Ist der Rotationstag nicht Montag, verschieben sich
  die Wochen gegen die KW. Die KW wird für die Anzeige („KW 28“) nur
  berechnet, nicht gespeichert.
- **Historie** wird auf `historyWeeks` (Standard 26) gekürzt. Für die
  Fairness reichen 8–12 Wochen, der Rest ist Komfort für den Rückblick.
- **Farben** sind Hex-Werte. Die Textfarbe (dunkel/hell) berechnet die Anzeige
  automatisch aus der Helligkeit (WCAG-Kontrast), damit auch eine
  selbst gewählte Farbe auf dem dunklen Spiegel lesbar bleibt.
- **Symbole** sind Namen aus einer festen **Icon-Whitelist** (Font Awesome
  Free, das MagicMirror ohnehin mitbringt, siehe 5.2). Keine freien
  Klassen-Strings, sonst landet beliebiges Markup im DOM.
- **`role`** (`adult` / `child`) pro Mitglied und **`roles`** pro Dienst
  legen fest, wer einen Dienst überhaupt bekommen darf. Beispiel: Kochdienst
  nur für Erwachsene. Standard ist „alle“, damit die Grundverteilung ohne
  Einschränkung startet.
- **`pairMode`** steuert die Rotation: `"varying"` (Standard) mischt die
  Kombinationen jeden Zyklus neu, `"fixed"` lässt die in `fixedPairs`
  definierten Dienste immer zusammen rotieren (z. B. Kochen + Küche).
  Beides ist in den Einstellungen umschaltbar.
- **Avatare:** `preset` verweist auf ein mitgeliefertes, lizenzfreies Set
  (siehe 5.1), `upload` auf ein eigenes Foto, `initials` ist der Fallback.

**Limits (Validierung):** 2–8 Mitglieder, 1–16 Dienste, Namen bis 30 Zeichen.
Mehr passt ohnehin nicht in die schmale Spalte oben links.

## 5. Anzeige: Modul `MMM-FamilyPlan`

### 5.1 Dateien

```
modules/MMM-FamilyPlan/
├── MMM-FamilyPlan.js      // Anzeige (getDom, sicheres DOM-Bauen)
├── MMM-FamilyPlan.css
├── node_helper.js         // liest familyplan.json, fs.watch, liefert hochgeladene Fotos aus
├── payload.js             // reine Aufbereitung der laufenden Woche (ohne MagicMirror testbar)
├── avatars/               // Preset-Avatare, verkleinert aus media/avatars/ (siehe unten)
├── package.json           // keine Abhängigkeiten
└── README.md
```

`install.sh`: `OWN_MODULES` um `"MMM-FamilyPlan"` erweitern, sonst ändert
sich nichts (der bestehende rsync-Block übernimmt den Rest).

**Preset-Avatare:** Das Set liegt im Repo unter
[`media/avatars/`](../media/avatars): 9 × `adult-NN.png` und
9 × `child-NN.png`, je 418 × 418 px, zusammen etwa 3,6 MB. Die Preset-ID ist
der Dateiname ohne Endung (`"child-03"`).

- **Verkleinert ausgeliefert:** Auf dem Spiegel werden die Avatare mit
  40 px gezeigt, im Portal mit höchstens etwa 96 px. Deshalb liegen im Modul
  verkleinerte Kopien (256 × 256 px JPG, zusammen 225 KB statt 3,6 MB).
  Verkleinert wird **beim Entwickeln** (Ergebnis im Repo), nicht auf dem Pi,
  damit dort keine Bildbibliothek nötig ist.
- **Wohin auf dem Pi:** Die Avatare kommen mit dem Modul nach
  `~/MagicMirror/modules/MMM-FamilyPlan/avatars/`. Das Portal liest seine
  Auswahl-Galerie aus genau diesem Ordner (keine zweite Kopie). Beides wird
  bei jedem Update neu befüllt, das ist hier richtig, weil es keine
  Kundendaten sind. Eigene Fotos liegen getrennt in
  `~/.lumira/familyplan/avatars/` und überleben Updates.
- **Galerie nach Rolle:** Das Portal zeigt beim Anlegen eines Kindes zuerst
  die `child-*`-Avatare, bei Erwachsenen die `adult-*`-Avatare. Alle 18 bleiben
  aber für jede Person wählbar.
- **Lizenz:** Quelle und Lizenz des Sets werden in
  [`media/README.md`](../media/README.md) nachgetragen, bevor die Avatare mit
  dem Modul ausgeliefert werden.

### 5.2 node_helper.js

Gleiches Gerüst wie bei `MMM-SmartCompliments`:

```js
const LUMIRA_HOME   = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const PLAN_PATH     = process.env.LUMIRA_FAMILYPLAN_PATH || path.join(LUMIRA_HOME, "familyplan.json");
const AVATAR_DIR    = path.join(LUMIRA_HOME, "familyplan", "avatars");

start() {
	// Hochgeladene Avatare über den MagicMirror-eigenen Express-Server
	// ausliefern (kein eigener Port nötig):
	this.expressApp.use("/MMM-FamilyPlan/uploads", express.static(AVATAR_DIR, { maxAge: "1h" }));
}
```

- **Lesen und Aufbereiten:** `readPlan()` ermittelt die *aktuelle Woche* = die
  letzte Woche mit `start <= heute`. Daraus baut es eine fertige
  Anzeige-Struktur (Namen, Farben, Icons, Avatar-URLs schon aufgelöst) und
  schickt sie per `sendSocketNotification("FP_DATA", payload)`. Die Anzeige
  muss dann nichts mehr nachschlagen.
- **Live-Reload:** `fs.watch` auf das Verzeichnis (nicht auf die Datei,
  wegen `.tmp` + `rename`), mit 300 ms Debounce. Identisch zu Sprüche.
- **Tageswechsel:** Ein Timer kurz nach Mitternacht liest neu ein, damit die
  Anzeige auch dann umspringt, wenn das Portal die neue Woche schon vorab
  angelegt hat.
- **Portal läuft nicht?** Dann gibt es keine neue Woche. Das Modul zeigt die
  letzte vorhandene Woche weiter und setzt `stale: true` (siehe 5.3). Es
  rechnet **nicht** selbst, sonst gäbe es die Rotationslogik doppelt (und
  zwei Stellen, die schreiben wollen).
- **Kaputte JSON:** Die letzte gültige Anzeige bleibt stehen, dazu ein
  `console.error`. Niemals eine leere Box.

### 5.3 Darstellung (getDom)

Entspricht der „Detailansicht“ aus dem Mockup, als kompakte Spalte:

```
Unser Familienplan
KW 28 (06.07. – 12.07.2026)
┃ (◉) Marcel
┃     [🌱 Gartendienst ]
┃     [🗑 Mülldienst   ]
┃ (◉) Franzi
┃     [🔥 Kochdienst   ]
┃     [🚰 Küchendienst ]
┃ …
```

- **Linker Farbbalken** in der Farbe des Mitglieds, **runder Avatar** (40 px),
  Name, darunter bzw. daneben die Dienst-„Pillen“ in Dienstfarbe mit Symbol.
- **`layout`:** `"stacked"` (Pillen untereinander, für schmale Spalten wie
  oben links, Standard) oder `"inline"` (Pillen nebeneinander, wie in der
  großen Detailansicht des Mockups).
- **`maxWidth`** (Standard `300px`, beim Einbau vom alten Bereich
  abmessen) verhindert, dass der Bereich breiter wird als bisher. Lange
  Dienstnamen werden mit `text-overflow: ellipsis` gekürzt, nicht umgebrochen.
- **Avatar-Fallback:** Upload → Preset → Initialen-Kreis in Mitgliedsfarbe.
- **`stale`:** Ist die angezeigte Woche abgelaufen (Portal aus, Auto-Rotation
  pausiert), wird die KW-Zeile gedimmt mit „(Vorwoche)“ markiert, statt
  stillschweigend Falsches als aktuell auszugeben.
- **Sicheres Rendern:** ausschließlich `document.createElement` +
  `textContent`, **kein `innerHTML`** mit Namen aus dem Portal (gleiche
  Grundhaltung wie Abschnitt 7 im Sprüche-Konzept).
- **Animation:** nur ein kurzes `updateDom(fadeSpeed)` beim Wochenwechsel,
  keine Dauer-Animationen (Pi 3).
- **Alarm:** `hideOnAlarmPhases` analog zu SmartCompliments (in Phase 1
  liegt der Alarm ohnehin `fullscreen_above` darüber, die Option ist nur der
  Vollständigkeit halber da).

### 5.4 Brücke zu MMM-SmartCompliments

Nach jedem `FP_DATA` sendet das Modul per `sendNotification`:

```js
this.sendNotification("FAMILYPLAN_UPDATE", {
	weekStart: "2026-07-06",
	assignments: [{ member: "Maja", duties: ["Tischdienst", "Bodendienst"] }, …]
});
```

Damit kann SmartCompliments später personalisierte Sprüche in den Tier-B-Pool
mischen („Maja, diese Woche bist du die Tisch-Chefin 🍴“). Das ist bewusst
eine **eigene** Notification und nicht `CHORES_UPDATE`, weil der Familienplan
in Version 1 kein „erledigt“ kennt und `CHORES_UPDATE` `{ open, done }`
erwartet. Siehe Idee 12.1.

## 6. Web-Verwaltung: lumira-portal

### 6.1 Store `lib/familyplan.js`

Gleiches Muster wie `lib/settings.js` und `lib/compliments.js`: `load()` /
`save()` / Validierung, Backup vor jedem Schreiben (`familyplan.<stamp>.json`,
die letzten 15), atomar per `.tmp` + `rename`.

> **Empfehlung (Phase 0):** Das ist der dritte Store mit identischem
> Backup-/Atomic-Write-Code. `compliments.js` hat die Extraktion nach
> `lib/store.js` bewusst vertagt („separater, risikoärmerer Refactor“). Jetzt
> lohnt er sich: `createJsonStore({ path, backupPrefix, maxBackups })` für
> alle drei.

Zusätzlich hier:

- **Keine verschachtelten Schreibvorgänge:** Scheduler und API-Requests
  können gleichzeitig schreiben wollen. Umgesetzt ist das ohne extra Mutex:
  Jede Operation liest, ändert und schreibt komplett synchron. Node führt sie
  damit nie verschachtelt aus.
- **Revisionsprüfung:** Jeder schreibende Request schickt die `revision` mit,
  die er gelesen hat. Ist sie veraltet, kommt `409 Conflict` mit dem aktuellen
  Stand zurück („Der Plan wurde inzwischen auf einem anderen Gerät
  geändert – bitte neu laden“).

### 6.2 Rotationslogik `lib/familyplan-rotation.js`

Eine **reine Funktion** ohne Dateizugriff, ohne `Date.now()` und ohne
`Math.random()`. Gleiche Eingabe ergibt immer die gleiche Ausgabe. Das macht
sie testbar, und sie liefert auch nach einem Neustart dasselbe Ergebnis:

```js
// computeWeek({ members, duties, history, weekStart }) → { memberId: [dutyId, …] }
```

**Ziel:** fair über mehrere Wochen, keine direkten Wiederholungen,
nachvollziehbar, nicht zufällig. Und robust, wenn Personen oder Dienste
dazukommen oder pausieren.

**Schritt 1 – Kontingent pro Person.** Bei `m` aktiven Diensten und `n`
aktiven Personen bekommt jede Person `⌊m/n⌋` Dienste. Gibt es einen Rest,
bekommen die Personen mit der *geringsten Gesamtzahl an Diensten in der
Historie* je einen zusätzlich (Gleichstand → Reihenfolge der Mitgliederliste).
Im Standardfall 8 / 4 = genau 2, also kein Rest.

**Schritt 2 – Kosten pro (Person, Dienst)** aus der Historie:

| Regel | Kosten |
|-------|--------|
| Person hatte den Dienst **im aktuellen Zyklus** schon | **+1000** |
| Person hatte den Dienst **letzte Woche** (greift an der Zyklus-Grenze) | **+500** |
| Häufigkeit des Dienstes bei der Person in den letzten 12 Wochen | **+10 × Anzahl** |
| Tie-Break: `fnv1a(weekStart + memberId + dutyId) mod 1000 / 10⁶` | winzig, deterministisch |

**Zyklus = feste Blöcke von `L` Wochen** (`L` = Anzahl aktiver Personen, hier
4), gezählt ab `settings.cycleStart`. Bewusst feste Blöcke und kein
rollendes Fenster: Bei einem rollenden Fenster der letzten 3 Wochen bliebe in
Woche 5 jeder Person nur genau das Paar aus Woche 1 übrig. Der Plan würde
dann starr alle 4 Wochen identisch wiederholt. Ändern sich die aktiven
Personen oder Dienste, setzt der Store `cycleStart` auf die nächste Woche,
und ein neuer Zyklus beginnt.

**Schritt 3 – Paar-Abwechslung (nur in der ersten Zykluswoche).** Bekäme eine
Person dieselbe Dienst-Kombination wie schon einmal im vorigen Zyklus, gibt
es **+50**. So hat Marcel nicht jeden Zyklus „Garten + Müll“ im Doppelpack.
Innerhalb eines Zyklus sind Wiederholungen durch die +1000 ohnehin
ausgeschlossen.

**Schritt 4 – Exakte Suche.** Die Dienste werden der Reihe nach auf
Personen mit freiem Kontingent verteilt (Tiefensuche mit Branch & Bound:
Zweige, die schon teurer als die beste bekannte Lösung sind, werden
abgeschnitten). Im Standardfall gibt es 8! / 2⁴ = 2520 mögliche
Verteilungen, das dauert im Test unter 5 ms für 12 Wochen. Weil die
Paar-Kosten nicht pro einzelnem Dienst anfallen, ist die exakte Suche hier
einfacher und genauer als ein Zuordnungs-Algorithmus (Hungarian) mit
nachträglichem Tauschen. Für große Konstellationen (nahe am Limit 8 × 16)
bekommt die Suche ein Knoten-Budget und fällt danach auf die beste bis dahin
gefundene Lösung zurück.

**Warum das im Standardfall perfekt fair ist:** Mit 4 Personen × 2 Diensten
ergeben die „noch nicht gehabt“-Kanten nach jeder Woche wieder einen
regulären bipartiten Graphen (jede Person hat noch `2·(4−w)` offene Dienste,
jeder Dienst noch `4−w` offene Personen). Nach dem Satz von König/Hall gibt
es darin immer eine passende Zuordnung mit Kosten 0. Der Optimierer findet
sie also garantiert: **Innerhalb von 4 Wochen hat jede Person jeden Dienst
genau einmal**, danach beginnt der nächste Zyklus. Bei unregelmäßigen
Konstellationen (3 Personen, 7 Dienste, jemand pausiert) wird es nicht
perfekt, aber so fair wie möglich, und das ohne Sonderfall-Code.

Ein Prototyp dieser Logik ist im Test über 12 Wochen durchgelaufen: In jedem
4-Wochen-Block hatte jede Person alle 8 Dienste, es gab keine direkte
Wiederholung, und die Paare haben gewechselt. Bei 3 Personen wanderte der
Zusatzdienst (3-3-2) reihum.

**Rollen (Erwachsene/Kinder):** Darf eine Person einen Dienst laut `roles`
nicht übernehmen, ist die Zuordnung gesperrt (unendliche Kosten, wird in der
Suche gar nicht erst betreten). Die Fairness gilt dann innerhalb der
erlaubten Zuordnungen. Lässt sich ein Dienst gar nicht vergeben (z. B. nur
Erwachsene erlaubt, aber alle Erwachsenen pausiert), bleibt er in dieser
Woche frei, und das Portal zeigt eine Warnung statt eines Fehlers.

**Feste Paare (`pairMode: "fixed"`):** Vor der Suche werden die Dienste
eines Paars zu einer Einheit zusammengelegt, die zwei Kontingent-Plätze
belegt. Danach läuft dieselbe Suche über Einheiten statt über Einzeldienste.
Nicht gepaarte Dienste bleiben einzeln. Die Paar-Abwechslung aus Schritt 3
entfällt in diesem Modus. Ein Wechsel des Modus setzt `cycleStart` neu, wie
jede Änderung an Personen oder Diensten.

**Nachvollziehbarkeit:** Optional liefert `computeWeek` eine Begründung pro
Zuordnung mit („Maja → Tischdienst: in diesem Zyklus noch nicht gehabt,
zuletzt vor 4 Wochen“). Das Portal zeigt sie per Klick auf eine Zuordnung an.

**Erste Woche / Startverteilung:** Ohne Historie greift nur der Tie-Break.
Alternativ wird die heutige Verteilung (wie im Mockup) einmalig als
`manual`-Woche eingetragen, und die Rotation rechnet ab da weiter.

### 6.3 Wochenwechsel (Scheduler) und „aktuelle Woche ist geschützt“

Im Portal-Prozess läuft `ensureCurrentWeek(now)`: einmal beim Start, dann
jede Minute (`setInterval`) und zusätzlich bei jedem `GET /api/familyplan`.

```
weekStart = letzter Rotationstag (00:00 Ortszeit) <= now
Gibt es schon eine Woche mit start == weekStart?   → nichts tun
autoRotate == false?                               → nichts tun (Plan bleibt stehen)
sonst: auto = computeWeek(...historie...), anhängen, speichern (mit Backup)
```

**Regeln:**

- **Eine einmal angelegte Woche wird nie automatisch verändert.** Weder
  Scheduler, noch Konfigurationsänderungen, noch „Rotation neu erstellen“
  (nur zukünftige Wochen, siehe 6.5) fassen sie an. Ändern lässt sie sich
  ausschließlich über eine manuelle Zuordnung oder über die ausdrücklich
  bestätigte Aktion „Aktuelle Woche neu verteilen“ (mit Bestätigungsdialog,
  Backup vorher).
- **Zukünftige Wochen werden nicht gespeichert**, sondern für die Vorschau
  jedes Mal simuliert (Kette von `computeWeek` auf der bisherigen Historie).
  Eine Konfigurationsänderung wirkt dadurch automatisch auf die Vorschau,
  ohne dass etwas Gespeichertes „veraltet“. Ausnahme: manuelle Änderungen an
  einer Zukunftswoche werden als `plannedOverrides[weekStart]` gespeichert
  und von der Simulation respektiert.
- **Personen oder Dienste ändern** wirkt ab der *nächsten* Woche. Die
  laufende Woche bleibt, wie sie ist. Ein pausierter Dienst bleibt also bis
  Sonntag sichtbar, außer man verteilt bewusst neu.
- **Rotationstag ändern** gilt ab der nächsten Grenze. Die laufende Woche
  wird dadurch einmalig kürzer oder länger (z. B. 10 Tage), es werden keine
  Wochen übersprungen oder doppelt angelegt.
- **Sommerzeit:** Gerechnet wird mit lokalen Kalenderdaten (`YYYY-MM-DD`),
  nicht mit „+7 × 24 h“. Die Umstellung verschiebt also nichts.

**Pi 3 ohne Echtzeituhr (wichtig für „läuft auch ohne Internet“):** Nach
einem Neustart ohne Netz stellt `fake-hwclock` nur die zuletzt gespeicherte
Zeit wieder her, die Uhr kann also falsch gehen. Deshalb:

- Es wird **nie eine Woche angelegt, die vor der neuesten vorhandenen Woche
  liegt** (Uhr zurückgesprungen → nichts tun).
- Ist die Systemzeit älter als `updatedAt` der Datei, ist die Zeit
  offensichtlich falsch → nichts tun und im Portal einen Hinweis zeigen.
- Nach längerer Pause (Gerät 3 Wochen aus) werden die verpassten Wochen
  **nicht nachträglich erzeugt**. Es entsteht nur die aktuelle Woche. Die
  Fairness rechnet mit der tatsächlich angezeigten Historie, das ist korrekt.

### 6.4 API

Alle Routen mit `requireAuth` (PIN-Schutz wie überall). **Keine** löst
`regenerateAndRestart()` aus, außer dem Modul-Schalter.

| Endpunkt | Wirkung |
|----------|---------|
| `GET /api/familyplan` | komplette Daten + berechnet: `currentWeek`, `preview` (nächste N Wochen), `icons` (Whitelist), `revision` |
| `PUT /api/familyplan/members` | Mitgliederliste ersetzen (Reihenfolge = Array), Soft-Delete für Entfernte |
| `PUT /api/familyplan/duties` | Dienstliste ersetzen (Name, Farbe, Icon, aktiv) |
| `PUT /api/familyplan/settings` | Rotationstag, Auto-Rotation, Titel, Vorschau-Wochen |
| `POST /api/familyplan/weeks/:start/assign` | manuelle Zuordnung `{ memberId, dutyIds }` oder Tausch `{ swap: [dutyA, dutyB] }`, für die aktuelle oder eine zukünftige Woche |
| `POST /api/familyplan/weeks/:start/reset` | „Automatische Verteilung wiederherstellen“ (`manual = null` bzw. Override löschen) |
| `POST /api/familyplan/regenerate` | `{ scope: "future" }` = alle Zukunfts-Overrides verwerfen; `{ scope: "current", confirm: true }` = aktuelle Woche neu berechnen |
| `POST /api/familyplan/avatar/:memberId` | Bild-Upload (multer ist schon da), max. 1 MB, nur png/jpeg/webp |
| `DELETE /api/familyplan/avatar/:memberId` | Avatar entfernen |
| `GET /api/familyplan/export` | Download einer JSON inkl. Avatare als Data-URL, eine einzige Datei |
| `POST /api/familyplan/import` | Import (Validierung, Backup vorher) |
| `GET /api/familyplan/backups` · `POST /api/familyplan/backups/:name/restore` | automatische Backups auflisten und wiederherstellen |
| `POST /api/settings` (bestehend) mit `familyPlan.enabled/position/maxWidth` | einziger Weg, der die `config.js` neu erzeugt und MagicMirror neu startet |

**Validierung:** Hex-Farbe (`/^#[0-9a-f]{6}$/i`), Icon muss in der Whitelist
stehen, IDs müssen existieren, eine manuelle Zuordnung darf einen Dienst nicht
doppelt vergeben (Konflikt → Tausch anbieten statt Fehler).

**Icon-Whitelist:** etwa 30 passende Font-Awesome-Free-Symbole (seedling,
utensils, bath, trash-can, fire-burner, sink, spray-can-sparkles, broom,
shirt, dog, cat, car, cart-shopping, recycle, leaf, bed, …). Das Portal
liefert die Font-Awesome-Dateien **lokal aus der MagicMirror-Installation**
aus (`~/MagicMirror/node_modules/@fortawesome/fontawesome-free` als
statisches Verzeichnis `/vendor/fa`), damit die Icon-Auswahl auch ohne
Internet funktioniert. Die Icon-Namen müssen beim Umsetzen gegen die
tatsächlich mitgelieferte FA-Version geprüft werden.

### 6.5 Portal-Seite „Familienplan“

Neuer Nav-Eintrag in der Gruppe „Konfiguration“, direkt vor „Wichtige Termine“, mit
`data-need="hasFamily"` (also nur Home/Fire/Rescue). Innerhalb der Seite gibt
es Unter-Reiter wie im Mockup (auf dem Handy über das vorhandene
`page-select`-Muster als Dropdown):

**① Übersicht** (Mockup „Web-Verwaltung – Übersicht“)
- Karte „Aktuelle Woche (KW 28)“: Tabelle *Mitglied | Dienst 1 | Dienst 2*.
  Jede Zelle ist eine farbige Pille mit Dropdown (⇅). Wählt man einen Dienst,
  der schon jemand anderem gehört, wird automatisch getauscht.
- Manuell geänderte Zellen bekommen ein kleines ✎-Abzeichen und den Link
  „↺ automatisch“.
- Button **„Rotationsplan neu generieren“**: öffnet einen Dialog mit
  „Nur zukünftige Wochen“ (Standard) oder „Auch aktuelle Woche“ (mit
  Warnhinweis).
- Schalter oben: **„Familienplan auf dem Spiegel anzeigen“**
  (`settings.familyPlan.enabled`) mit dem Hinweis, dass dabei der Spiegel
  einmal neu startet.

**② Familienmitglieder** (eigene Mitgliederverwaltung, siehe Entscheidung 13.2)
- Liste mit Avatar, Name, Rolle (Erwachsener/Kind), Farbe, Aktiv-Schalter,
  ▲▼ zum Sortieren. Pro Person „Bearbeiten“ und „Entfernen“.
- **„+ Mitglied hinzufügen“** öffnet ein Formular: Name, Rolle, Farbe,
  Avatar. Das ist die **einzige Stelle**, an der die Familie gepflegt wird.
- Avatar-Auswahl: Galerie mit dem mitgelieferten Set, eigenes Foto oder
  Initialen. Ein Foto-Upload wird **im Browser** per `<canvas>` auf
  256 × 256 zugeschnitten und als JPG hochgeladen. So braucht der Pi
  keine Bildbibliothek (`sharp` & Co. sind native Module und auf dem Pi 3
  ein Installationsrisiko).
- Die frühere Seite „Personen“ heißt jetzt **„Wichtige Termine“** (siehe
  6.6). Geburtstage dort verknüpfen sich mit diesen Mitgliedern.

**③ Dienste** (Mockup „Dienste bearbeiten“)
- Tabelle *Name | Farbe | Symbol | Für wen (alle / nur Erwachsene / nur
  Kinder) | Aktiv | ✎ | 🗑* + „Dienst hinzufügen“.
- Farbe über `<input type="color">` plus eine Live-Vorschau der Pille auf
  dunklem Grund. Ist der Kontrast zu schwach, erscheint eine Warnung.
- Symbol über einen Icon-Picker (Raster der Whitelist).

**④ Wochenplan**
- Aktuelle Woche + Vorschau der nächsten 4 Wochen als Karten, darunter die
  Historie (letzte 8 Wochen, eingeklappt).
- Zukunftswochen sind direkt editierbar (→ `plannedOverrides`).
- Pro Zuordnung ein ⓘ mit der Begründung aus 6.2.
- Kleine Fairness-Statistik: Matrix *Person × Dienst* mit der Anzahl der
  letzten 12 Wochen. Daran sieht die Familie selbst, dass es fair zugeht.

**⑤ Einstellungen**
- Rotationstag (Mo–So), Auto-Rotation an/aus, Titel, Anzahl Vorschau-Wochen.
- **Kombinationen:** „wechselnd“ (Standard) oder „feste Paare“. Bei festen
  Paaren erscheint darunter eine kleine Liste, in der man jeweils zwei
  Dienste zu einem Paar verbindet.
- Datensicherung: „Exportieren“, „Importieren“, Liste der automatischen
  Backups mit „Wiederherstellen“.

Gespeichert wird pro Karte (wie bei „Sprüche“). Ein Speichervorgang wirkt in
1–2 Sekunden auf dem Spiegel, ohne Neustart.

### 6.6 Seite „Wichtige Termine“ (früher „Personen“)

Personen gibt es nur noch an einer Stelle: in den Familienmitgliedern (6.5 ②).
Die frühere Seite „Personen“ (Name + Geburtstag) heißt jetzt „Wichtige
Termine“ und pflegt alles, was MMM-SmartCompliments an Terminen kennt:

| Bereich | Eingabe | settings.json | MMM-SmartCompliments |
|---------|---------|---------------|----------------------|
| Geburtstage | Familienmitglied wählen oder „Andere Person …“ (z. B. Oma) + TT.MM. | `family.birthdays: [{ name, date: "MM-TT", memberId? }]` | `birthdays` |
| Hochzeitstag | TT.MM.JJJJ | `family.weddingDate: "JJJJ-MM-TT"` | `weddingDate` |
| Countdowns | Bezeichnung + TT.MM. | `family.countdowns: [{ label, date: "MM-TT" }]` | `countdowns` („Noch 12 Tage bis Sommerurlaub.“) |

- **Verknüpfung:** Ein Geburtstag eines Familienmitglieds speichert dessen
  `memberId`. Wird das Mitglied umbenannt, zieht der Name mit (Portal
  schreibt settings.json und config.js neu, MagicMirror startet einmal neu).
  Wird es entfernt, bleibt der Geburtstag mit dem letzten Namen stehen.
- **Datumsformat:** Eingabe deutsch, gespeichert im Modul-Format
  (`lib/family-dates.js`). Das behebt einen alten Fehler: Die frühere
  Personen-Seite speicherte „TT.MM.“, das Modul erwartet „MM-TT“, Geburtstage
  aus dem Portal wurden deshalb nie erkannt. `generate-config.js` rechnet
  auch solche alten Einträge um.
- Speichern startet MagicMirror einmal neu (die Termine stehen in config.js).

## 7. Datensicherung & Wiederherstellung

| Ebene | Wie | Wann |
|-------|-----|------|
| Automatisch | `~/.lumira/backups/familyplan.<zeitstempel>.json`, die letzten 15 | vor **jedem** Schreiben (auch beim Wochenwechsel) |
| Portal-Export | eine JSON-Datei inkl. Avatare (Data-URLs) zum Herunterladen | auf Knopfdruck, z. B. vor Updates |
| Portal-Wiederherstellen | Backup-Liste oder Datei-Import, legt vorher selbst ein Backup an | auf Knopfdruck |
| Komplett (Techniker) | `scp -r pi@lumira.local:~/.lumira ./lumira-backup` | vor Gerätetausch oder Neuinstallation |

Notfall per SSH, falls das Portal nicht startet:

```bash
cp ~/.lumira/backups/familyplan.<zeitstempel>.json ~/.lumira/familyplan.json
```

## 8. Sicherheit & Robustheit

- **Nur das Portal schreibt**, Schreibvorgänge laufen synchron (nie
  verschachtelt), sind atomar und haben vorher ein Backup.
- **Whitelist-Merge** wie in `settings.js`: Unbekannte Felder aus der API
  werden verworfen.
- **Kein `innerHTML`** auf dem Spiegel und im Portal für Namen und
  Dienstnamen.
- **Icons nur aus der Whitelist**, Farben nur als validiertes Hex. Es gibt
  keinen Weg, CSS oder Klassen einzuschleusen.
- **Upload-Härtung:** MIME-Whitelist, 1 MB Limit, Dateiname = Mitglieds-ID
  (vom Server vergeben, nie vom Client), Auslieferung nur aus dem
  Avatar-Ordner.
- **Uhrzeit-Plausibilität** gegen falsche Wochenwechsel (6.3).
- **Defekte Datei:** Das Portal zeigt „Datei beschädigt – Backup
  wiederherstellen?“, der Spiegel zeigt den letzten guten Stand weiter.

## 9. Tests

- **Rotation (Unit-Tests)** mit dem in Node eingebauten Test-Runner
  (`node --test`, keine zusätzliche Abhängigkeit). Neues Script
  `"test": "node --test test/"` in `lumira-portal/package.json`. Fälle:
  - 4 × 8: In jedem 4-Wochen-Fenster hat jede Person jeden Dienst genau einmal.
  - Nie derselbe Dienst zwei Wochen hintereinander (auch über die
    Zyklusgrenze).
  - Determinismus: dieselbe Eingabe ergibt 100 × dasselbe Ergebnis.
  - Unregelmäßig: 3 Personen / 8 Dienste (3-3-2, der Zusatzdienst wandert),
    5 / 8, ein Dienst pausiert, eine Person kommt mitten im Zyklus dazu.
  - Manuelle Woche in der Historie wird korrekt berücksichtigt.
  - Kalender: Sommerzeit-Wochenende, Wechsel des Rotationstags, Jahreswechsel
    (KW 53/1), Uhr springt zurück, 3 Wochen Pause.
- **Store/API:** Revisionskonflikt (409), Validierungsfehler, Backup-Rotation,
  Import einer manipulierten Datei.
- **Anzeige ohne Pi:** MagicMirror auf dem PC im Server-Modus
  (`npm run server`, Browser auf `localhost:8080`) mit `LUMIRA_HOME` auf einen
  Test-Ordner. Zusätzlich eine statische Vorschau-Seite
  `familienplan-preview.html` im Repo-Root (wie `portal.html`), um Farben und
  Breite schnell zu prüfen.

## 10. Fit für den Raspberry Pi 3

- Keine nativen Abhängigkeiten (kein SQLite, kein `sharp`). Das Modul braucht
  nur `fs`/`path` plus das Express, das MagicMirror schon mitbringt.
- **JSON statt SQLite:** Die Datenmenge ist winzig (unter 50 KB), die Datei
  ist lesbar und von Hand rettbar, und Backup heißt Datei kopieren. Außerdem
  ist es dasselbe Muster wie `settings.json` und `compliments.json`. SQLite
  (`better-sqlite3`) müsste auf dem Pi 3 kompiliert werden und brächte hier
  keinen Vorteil.
- Gerendert wird nur bei Datenänderung oder Wochenwechsel, nicht im Intervall.
- Avatare sind maximal 256 px groß und werden vom Browser skaliert.
- Normales ES2017-JavaScript ohne Build-Schritt.

## 11. Einbau auf dem bestehenden Familien-Spiegel (nach dem Pi-3-Fix)

Der Familien-Spiegel läuft **noch nicht** mit LUMIRA (Entscheidung 13.1).
Vorgesehener Weg: Er wird im Zuge des Einbaus auf LUMIRA umgestellt. Dann
erzeugt das Portal die `config.js`, und der Familienplan ist einfach ein
Schalter.

1. **Bestand aufnehmen:** MagicMirror- und Node-Version, alle Module und
   Einstellungen der heutigen `config.js` (Kalender-URLs, Standort,
   Nachrichten-Feed, Regenradar, Spruch-Modul, welches Modul die
   „WOCHENAUFGABEN“ zeichnet). Die Breite des alten Bereichs messen
   (Browser-Devtools im Server-Modus) → `maxWidth`.
2. **Sichern:** komplettes SD-Image plus `config.js` und eigene Dateien
   (z. B. Sounds, eigene CSS) separat.
3. **Fehlende Module prüfen:** Alles, was der Spiegel heute zeigt und LUMIRA
   (noch) nicht erzeugt, muss vorher in `generate-config.js` bzw. als
   Portal-Option abgedeckt sein. Sonst verschwindet es beim ersten
   Speichern im Portal. Das Ergebnis von Schritt 1 ist die Checkliste dafür.
4. **LUMIRA installieren:** `./install.sh --edition=home` (oder `fire`, je
   nach Familie), dann im Portal Standort, Kalender, Nachrichten usw. aus
   der Bestandsliste eintragen.
5. **Familienplan einrichten:** Mitglieder anlegen (Erwachsene und Kinder),
   Dienste prüfen, Startverteilung = heutige Wochenaufgaben, dann
   „Auf dem Spiegel anzeigen“ einschalten.
6. **Abnahme** anhand von Abschnitt 14, danach einen Rotationswechsel abwarten
   (oder den Rotationstag testweise auf morgen stellen).

**Rückfalloption, falls die Umstellung auf LUMIRA doch nicht gewünscht ist:**
Ein eingeschränkter Portal-Modus (`LUMIRA_PORTAL_PROFILE=familyplan`) mit
nur der Familienplan-Seite, ohne `/api/settings`-Schreiben und ohne
`regenerateAndRestart()`. Der Modul-Eintrag kommt dann einmalig von Hand
an die Stelle des alten Moduls in der handgepflegten `config.js`. Dieser
Modus wird nur gebaut, wenn er wirklich gebraucht wird.

## 12. Eigene Ideen (spätere Phasen)

Ein paar Anregungen, teils aus dem Inspirations-Dashboard (Aufgaben/Chores mit
„Daily“, „Due today“, Haken):

### 12.1 „Erledigt“ abhaken
Pro Woche und Dienst ein `done`-Status, abhakbar im Portal (auch am Handy der
Kinder) oder per QR-Code auf dem Spiegel. Auf dem Spiegel wird die Pille dann
gedimmt und bekommt ein ✓. Dann könnte das Modul zusätzlich `CHORES_UPDATE`
mit `{ open, done }` senden, und die vorhandene Aufgaben-Logik in
SmartCompliments („Heute warten noch 3 Aufgaben“) funktioniert ohne Änderung.

### 12.2 Abwesenheit / Urlaub
„Marie ist KW 31–32 im Ferienlager“: Die Person ist für diese Wochen inaktiv,
ihre Dienste verteilen sich auf die anderen. Die Fairness-Historie gleicht
das in den Folgewochen automatisch aus. Das fällt aus der Kostenfunktion
quasi gratis ab.

### 12.3 Aufwand-Gewichtung
Pro Dienst ein `effort` (1–3). Das Kontingent wird dann über Aufwandspunkte
statt über die Anzahl verteilt, damit „Bad + Putzen“ nicht gegen
„Tisch + Müll“ steht. Ein zusätzlicher Kostenterm, kein neuer Algorithmus.

### 12.4 Tageshinweise aus dem Kalender
Steht im Familienkalender „Restmüll“ für morgen, wird die Mülldienst-Pille
heute hervorgehoben (das calendar-Modul sendet `CALENDAR_EVENTS` ohnehin).
Ein Dienst bekommt dafür optional ein Schlüsselwort.

### 12.5 Personalisierte Sprüche
Über `FAMILYPLAN_UPDATE` (5.4) plus die geplante `personMessages`-Idee aus dem
Sprüche-Konzept (6.5): „Guten Morgen Franzi, heute wird gekocht 🍳“.

### 12.6 Feste Dienste und Einzel-Regeln
Die Grob-Regel „nur Erwachsene / nur Kinder“ ist schon im Kern (Rollen, 6.2).
Feiner wären Regeln pro Person: „Gartendienst immer Marcel“, „Kochdienst erst
ab 12 Jahren“ (mit dem Geburtstag von der Seite „Wichtige Termine“). Umsetzbar als
gesperrte bzw. bevorzugte Zuordnung in 6.2, wieder ohne Sonderlogik.

### 12.8 Eigene Logins für die Kinder
Wenn „Erledigt“ (12.1) kommt: Kinder bekommen einen eigenen, einfachen
Zugang (z. B. eigener PIN), der nur die eigenen Dienste zeigt und nur
abhaken darf. Eltern behalten den vollen Portal-Zugang. Das setzt auf der
Mitgliederverwaltung aus 6.5 ② auf.

### 12.7 Home-Assistant / Erinnerungen
Beim Wochenwechsel ein optionaler Webhook (gleiches Muster wie
`forwardTargets` beim Alarm), z. B. für eine Handy-Benachrichtigung „Deine
Dienste diese Woche: …“.

## 13. Entscheidungen (Stand 10.10.2026)

| # | Frage | Entscheidung | Folge im Konzept |
|---|-------|--------------|------------------|
| 1 | Läuft der Familien-Spiegel schon mit LUMIRA? | **Noch nicht.** | Umstellung auf LUMIRA ist Teil des Einbaus (11). Der eingeschränkte Portal-Modus ist nur noch Rückfalloption. |
| 2 | Wer verwaltet die Namen? | **Der Familienplan selbst**, mit eigener Mitgliederverwaltung zum Anlegen und Verwalten, z. B. für die Kinder. | Rolle Erwachsener/Kind (4), „Für wen“ pro Dienst (6.5 ③), Formular „+ Mitglied hinzufügen“ (6.5 ②). Die frühere Seite „Personen“ heißt jetzt „Wichtige Termine“, Geburtstage verknüpfen sich mit den Mitgliedern (6.6). |
| 3 | Feste Paare oder wechselnde Kombinationen? | **Anpassbar.** | `pairMode` + `fixedPairs` (4), Rotation über Einheiten (6.2), Umschalter in den Einstellungen (6.5 ⑤). |
| 4 | Avatare | **Lizenzfreies Set** (liegt in `media/avatars/`: 9 Erwachsene, 9 Kinder), dazu eigene Fotos per Upload in der Verwaltung. | Preset-IDs `adult-NN`/`child-NN`, Verkleinern und Verteilen per `install.sh`, Galerie nach Rolle (5.1). Initialen bleiben der Fallback. |
| 5 | Pillen untereinander oder nebeneinander? | **Beides als Option**, Breite wird vor dem Einbau gemessen. | `layout` + `maxWidth` (5.3), Messung in 11.1. |
| 6 | „Erledigt“ schon in Version 1? | **Später.** | Bleibt Idee 12.1 (plus 12.8 Kinder-Logins). |

**Noch offen:**

- **Quelle und Lizenz der Avatare** in `media/README.md` eintragen (wo
  kommen die Bilder her, unter welcher Lizenz dürfen sie mit LUMIRA
  ausgeliefert werden).
- **Bestandsaufnahme des Familien-Spiegels** (11.1). Erst danach steht
  fest, ob LUMIRA dort etwas fehlt, das vor der Umstellung noch gebaut
  werden muss.

## 14. Abnahmekriterien → wo im Konzept

| Kriterium aus der Anforderung | Abgedeckt durch |
|-------------------------------|-----------------|
| Alter Wochenaufgabenbereich ersetzt | 2, 3, 11 |
| Position und Breite unverändert | 3 (`position`), 5.3 (`maxWidth`), 11.1 |
| Alle anderen Bereiche wie bisher | 2, 3 (nur ein zusätzlicher Modul-Eintrag) |
| Vier Personen je zwei Dienste, alle acht vergeben | 6.2 Schritt 1/3, Tests 9 |
| Farben und Symbole gut erkennbar | 4 (Kontrast-Automatik), 5.3, 6.5 ③ |
| Rotation automatisch und fair | 6.2, 6.3, Tests 9 |
| Web-Verwaltung kann den Plan bearbeiten | 6.4, 6.5 |
| Änderungen erscheinen auf dem Mirror | 5.2 (Live-Reload, 1–2 s) |
| Daten bleiben nach Neustart erhalten | 4 (Datei in `~/.lumira/`), 6.3 (gespeicherte Wochen) |
| Installations- und Bedienungsanleitung | Phase 6 (`modules/MMM-FamilyPlan/README.md`, Portal-README) |

## 15. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|-------|--------|----------|
| **0** | `lib/store.js` extrahieren (settings/compliments/familyplan) | ein Backup-/Atomic-Write-Code statt drei Kopien |
| **1** | `lib/familyplan-rotation.js` + Unit-Tests, `lib/familyplan.js` (Store, Revision), Scheduler | Rotationslogik fertig und bewiesen, Wochen werden angelegt |
| **2** | `MMM-FamilyPlan` (Anzeige, node_helper, Live-Reload, Avatare), `generate-config.js`, `settings.default.json`, `install.sh` | Plan erscheint auf dem Spiegel |
| **3** | Portal-API + Seite: Übersicht, Mitgliederverwaltung (inkl. Rollen), Dienste, Einstellungen (inkl. Paar-Modus) | Familie pflegt alles selbst |
| **4** | Wochenplan: Vorschau, Zukunfts-Overrides, „neu generieren“, „automatisch wiederherstellen“, Begründungen, Fairness-Matrix | volle Kontrolle über die Rotation |
| **5** | Export/Import/Backup-Restore im Portal, Doku (Installation, Bedienung, Rotationslogik, Backup, Fehlerbehebung) | Übergabe-Paket laut Anforderung vollständig |
| **6** | Nach dem Pi-3-Fix: Familien-Spiegel auf LUMIRA umstellen und Familienplan einbauen (Abschnitt 11) | Abnahme |
| **7+** | Ideen aus Abschnitt 12 | Komfort |

**Empfohlener Start: Phase 1–3.** Damit steht die Kernanforderung (vier
Personen, acht Dienste, faire Wochenrotation, im Browser pflegbar), und das
komplett unabhängig vom Pi-3-Bug, getestet auf dem PC.
