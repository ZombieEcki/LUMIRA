# To-do-Liste auf dem Bildschirm

Eigenes Modul `MMM-LumiraTodo`, eine persönliche Aufgabenliste.
- Gedacht für Einzelpersonen, Paare, Familien und WGs.
- Unabhängig vom Familienplan: Er wird nicht verändert und nicht gebraucht.
- In allen Editionen verfügbar.
- Gepflegt und abgehakt wird im Portal am PC oder Handy. Der Bildschirm zeigt
  nur an, ein Touchscreen ist nicht nötig.

## 1. Einschalten

Portal → **Bildschirm → Übersicht** → „To-do-Liste“ an (oder auf der Seite
selbst). Nach dem Update ist sie **aus**. MagicMirror startet beim Ein- und
Ausschalten einmal neu, alles andere wirkt nach wenigen Sekunden.

**Wo im Portal:** Die To-do-Liste gehört zu den Spezialmodulen.
- Ist nur sie an, heißt der Menüpunkt „To-do“.
- Sind Familienplan *und* To-do an, heißt er **„Extras“**, mit beiden als
  Reitern.
- Vor dem Einschalten des zweiten Spezialmoduls fragt das Portal einmal
  nach, weil sich dabei die Navigation ändert.

## 2. Aufgaben

*Aufgaben* → Liste wählen → Titel eintippen → Enter. **Bearbeiten** öffnet
alle Felder:

| Feld | |
|---|---|
| Titel | Pflicht, bis 200 Zeichen |
| Liste, Kategorie | Kategorie freiwillig |
| Priorität | niedrig (–), normal, hoch (!!), dringend (!!!) – auch ohne Farbe erkennbar |
| Fällig am, Uhrzeit | beides freiwillig |
| Symbol | sonst das der Kategorie |
| Wiederholung | täglich / alle n Tage, bestimmte Wochentage, wöchentlich / alle n Wochen, monatlich / alle n Monate, jährlich |
| Notiz, Unteraufgaben | bis zu 30 Unteraufgaben, einzeln abhakbar |

- **Abhaken:** Kästchen vor der Aufgabe, hier oder auf der **Startseite**. Die
  Startkarte zeigt die offenen Aufgaben (fällige zuerst) und hat ein Feld
  „+ Aufgabe“.
- **Wiederholung:** Beim Abhaken bleibt die erledigte Aufgabe gespeichert, und
  eine neue mit dem nächsten Fälligkeitstag entsteht.
  - Der Rhythmus bleibt gleich, der neue Termin liegt aber nie in der
    Vergangenheit. Wer den wöchentlichen Müll einen Tag zu spät erledigt, hat
    ihn trotzdem nächste Woche wieder am selben Tag.
  - Wieder aufhaken nimmt die neue Aufgabe zurück, solange sie unberührt ist.
- **Sortieren** mit ↑/↓.
- **Löschen** nur mit Rückfrage. Erledigte verschwinden nie von allein; sie
  lassen sich unter *Erledigt* gezielt löschen.

## 3. Listen und Kategorien

- **Listen** (z. B. Privat, Haushalt, Einkaufen, Arbeit): anlegen,
  umbenennen, sortieren, je Liste **„auf dem Bildschirm“** an/aus, löschen.
  Beim Löschen gibt es eine Rückfrage mit der Zahl der Aufgaben, die
  mitgelöscht werden. Die letzte Liste bleibt immer.
- **Kategorien** (Start: Haushalt, Einkaufen, Garten, Arbeit, Termine,
  Gesundheit / Erledigungen, Freizeit, Sonstiges): Name, Farbe und Symbol
  ändern, ausblenden, löschen. Ihre Aufgaben bleiben dabei erhalten, nur ohne
  Kategorie.

## 4. Darstellung

12 Designs, die Auswahl zeigt eure echten Aufgaben:

| Nr. | Design | Nr. | Design |
|---|---|---|---|
| 1 | **Klassisch** (schlicht) | 7 | **Minimal / Clean** (schlicht) |
| 2 | Modern mit Icons | 8 | Elegant mit Rahmen (Leuchtrand, Farbe und Stärke einstellbar) |
| 3 | **Kompakt** (schlicht) | 9 | Kacheln je Kategorie (erledigt / gesamt) |
| 4 | Mit Kategorien (Anzahl offener je Kategorie) | 10 | Prioritäten (!!! / !! / –, nach Dringlichkeit sortiert) |
| 5 | Mit Fortschritt (Balken, „3 / 6 erledigt“) | 11 | Mit Notiz / Unteraufgaben |
| 6 | Heute (nach Uhrzeit) | 12 | Wochenübersicht (Mo–So nach Fälligkeit) |

Die drei schlichten Designs (1, 3, 7) kommen ohne bunte Farben aus.

*Anzeige*:
- **Höchstens angezeigt**: 3 bis 30 Aufgaben. Was fehlt, zählt „+ X weitere“
  (abschaltbar). Die Höchstzahl gilt getrennt vom Zeitraum.
- **Fällige zeigen**: alle, oder nur bis morgen / 7 / 14 / 31 Tage. Aufgaben
  ohne Datum stehen immer da.
- **Erledigte**: durchgestrichen an ihrem Platz, durchgestrichen unter den
  offenen, oder ausblenden; jeweils für 1 h bis 1 Woche oder immer.
- **Zähler**, **Fortschrittsbalken**, **Symbole** und **Fällige hervorheben**
  (heute gelb, überfällig rot): je ein Schalter.
- **Überschrift**: leer = Name der Liste. Mehrere Listen erscheinen
  untereinander mit ihrem Namen.

*Position & Größe*:
- 9 Grundpositionen plus Abstände in px oder % des Bildschirms (Standard:
  mittig rechts).
- Breite, Höhe höchstens, Schriftgröße, Abstand zwischen Aufgaben,
  Innenabstand.
- Passt nicht alles hinein, wird die Schrift etwas kleiner (bis 70 %), dann
  fallen Aufgaben von hinten weg. Es wird nie etwas abgeschnitten oder ein
  anderes Modul verschoben.
- Das Live-Bild warnt bei Überschneidungen.

*Aussehen*: Glasfläche, Deckkraft, Linien/Rahmen, Rahmenfarbe.

## 5. Daten und Sicherheit

- **Speicherort:** alles in `~/.lumira/todo.json`, nur lokal.
  - Das Portal schreibt atomar, vorher höchstens stündlich ein Backup nach
    `~/.lumira/backups/todo.*.json` (die letzten 15).
  - Eine beschädigte Datei wird nie überschrieben. Das Portal meldet sie, der
    Bildschirm zeigt den letzten guten Stand.
- **Eingaben** werden geprüft: Datum, Uhrzeit, Priorität, Längen, höchstens 30
  Listen, 40 Kategorien, 2000 Aufgaben. Titel werden auf dem Bildschirm nur
  als Text gezeigt.
- **Technik:**
  - Modul `modules/MMM-LumiraTodo`, in der config.js
    `{ module: "MMM-LumiraTodo" }` (nur, wenn eingeschaltet); es platziert
    sich selbst.
  - Darstellung `todo-view.js`/`.css`, dieselben Dateien wie die Vorschau im
    Portal.
  - API unter `/api/todo` (Aufgaben, Abhaken, Unteraufgaben, Reihenfolge,
    Listen, Kategorien, Anzeige).
- **Später möglich:** Export/Import und Abgleich mit Apple Erinnerungen,
  Google Tasks oder Microsoft To Do. Das ist bewusst nicht in Version 1:
  Quelle, Richtung und Konflikte müssten erst festgelegt werden.

## 6. Fehlerbehebung

| Problem | Abhilfe |
|---|---|
| Nichts auf dem Bildschirm | To-do-Liste an? Mindestens eine Liste „auf dem Bildschirm“? Nach dem Update einmal `./install.sh`. Logs: `pm2 logs MagicMirror` (`MMM-LumiraTodo`). |
| Aufgaben fehlen | Höchstzahl, „Fällige zeigen“ und den Hinweis „passen nicht hinein“ in der Vorschau prüfen; erledigte nach Einstellung ausgeblendet? |
| Liste überdeckt andere Module | Position/Abstände ändern – das Live-Bild zeigt es sofort. |
| „todo.json ist beschädigt“ | Datei aus `~/.lumira/backups/` (neuestes `todo.*.json`) zurückkopieren: `cp ~/.lumira/backups/todo.<zeit>.json ~/.lumira/todo.json`. |
