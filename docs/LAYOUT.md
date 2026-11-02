# Bildschirm-Layout: Classic oder Free

Unter **Bildschirm → Übersicht** gibt es zwei Arten, den Bildschirm
anzuordnen.

- **Classic** (Standard): Jedes Modul steht nach seinen eigenen Einstellungen,
  so wie bisher. Das sind die MagicMirror-Bereiche („wie bisher“) und die
  Positionen, die man bei Uhr, Kalender, Wetter, Sprüchen und To-do selbst
  eingestellt hat. Wer nichts ändern möchte, muss nichts tun.
- **Free**: Ein Layout-Profil legt fest, wo jedes Modul steht und wie groß es
  ist.
  - Gestaltet wird mit der Maus oder dem Finger in einer Vorschau des
    Bildschirms.
  - Es gibt mehrere Profile, z. B. Standard, Familie, Abend, Minimal.
  - Die eigenen Einstellungen der Module bleiben dabei unangetastet. Zurück auf
    Classic stellt den alten Zustand ohne Verlust wieder her.

Änderungen wirken nach wenigen Sekunden, MagicMirror startet nicht neu. Der
Bildschirm selbst wird nie bedient; der Editor läuft im Portal auf PC, Tablet
oder Handy.

## 1. Erstes Free-Layout

1. Bildschirm → Übersicht → Karte **Layout**.
2. Das Profil „Standard“ ist anfangs leer. **Vom Bildschirm übernehmen** setzt
   jedes eingeschaltete Modul dorthin, wo es gerade wirklich steht. Der
   Bildschirm meldet dafür seine Positionen ans Portal.
3. Gestalten:
   - **Verschieben:** ziehen.
   - **Größe:** an einer Ecke ziehen. Der Inhalt wächst mit, also auch die
     Schrift.
   - **Pfeiltasten** verschieben um eine Rasterspalte, mit Umschalt um vier.
4. **Speichern.** Bis dahin ist alles nur Entwurf; „↶ Schritt zurück“ und
   „Verwerfen“ helfen beim Ausprobieren.
5. Oben auf **Free** schalten, mit Rückfrage. Der Bildschirm übernimmt das
   Layout.

Zurück: oben **Classic**, ebenfalls mit Rückfrage. Die Free-Profile bleiben
gespeichert.

## 2. Editor

- **Modulliste** (links):
  - Suche nach Name;
  - Stufe der Unterstützung (siehe unten);
  - **●/◌** blendet ein Modul in diesem Layout ein oder aus. Es wird dabei nicht
    abgeschaltet oder gelöscht.
  - „aus“ heißt: Das Modul ist unter *Module auf dem Bildschirm* ausgeschaltet.
- **Fläche:**
  - im Seitenverhältnis des echten Bildschirms;
  - **Raster** 12–48 Spalten, **Einrasten**, **Hilfslinien** (rasten an Kanten
    und Mitten anderer Module und des Bildschirms ein);
  - **Live-Bild dahinter** zum Vergleich mit dem echten Stand;
  - **Zoom** 100–200 %.
  - Das Raster ist nur im Editor zu sehen, nie auf dem Bildschirm.
- **Eigenschaften** (rechts bzw. unten):
  - X/Y in % des Bildschirms, Breite/Höhe in px, Schrift in %;
  - **Ebene** 0–20 (höher liegt bei Überschneidungen oben), **Sichtbar**;
  - „Aus diesem Layout nehmen“: Das Modul steht dann nach seinen eigenen
    Einstellungen.
  - Ragt ein Modul über den Rand, erscheinen eine Warnung und **In den
    sichtbaren Bereich holen**.
- **Profile:** Neu (ausgehend vom aktuellen Bildschirm), Duplizieren,
  Umbenennen, Löschen mit Rückfrage; das letzte Profil bleibt immer.
  **Dieses Layout aktivieren** macht das gewählte Profil zum aktiven.

Auf den Seiten von Uhr, Kalender, To-do, Wetter, Sprüchen und Familienplan
steht im Free-Modus ein Hinweis, dass Position und Größe aus der Übersicht
kommen.

## 3. Was sich wie anpassen lässt

| Stufe | Module | |
|---|---|---|
| **Position + Größe** | Uhr, Kalender, To-do-Liste, Wetteranzeige, Regenradar, Wetterwarnungen, Sprüche | Ecken ziehen ändert Breite, Höhe und Schrift; passt der Inhalt nicht, wird er kleiner statt abgeschnitten |
| **nur Position** | Familienplan, Portal-Hinweis | Größe über die eigenen Einstellungen (Familienplan: „Größe auf dem Bildschirm“) |
| **fest** | Nachrichten (immer unten), Alarmierung (Vollbild), Dauerschleife (Vollbild/Hintergrund), Türklingel (Mitte beim Klingeln) | im Editor nur angezeigt |

Es gibt bewusst keine pauschale Vergrößerung per CSS. Die Module rechnen ihre
Größe selbst und schneiden nichts ab.

## 4. Sicherheit und Notfall

- **Getrennte Daten:**
  - `~/.lumira/layout.json` enthält nur Modus, Profile und
    Editor-Einstellungen.
  - Die Einstellungen der Module (`clock.json`, `calendar.json`,
    `weather.json` …) schreibt der Editor nie.
  - Classic ist immer der unveränderte bisherige Stand.
- **Sicherung:** Vor jedem Speichern wird der alte Stand nach
  `~/.lumira/backups/layout.*.json` gesichert (die letzten 30). **Letzte
  Speicherung zurück** holt ihn wieder.
- **Prüfung:** Nur erlaubte Werte in sinnvollen Grenzen werden gespeichert.
  Feste Module nimmt das Layout nicht an, und Code oder CSS lässt sich nicht
  eintragen.
- **Kaputte Datei:** Ist `layout.json` beschädigt, laufen alle Module wie in
  Classic. Ein fehlerhaftes Layout kann den Bildschirm nie unbrauchbar machen.
- **Notfall ohne Portal** (per SSH auf dem Pi):

  ```bash
  node ~/LUMIRA/lumira-portal/bin/layout-cli.js classic
  ```

  Das schaltet sofort auf Classic zurück, auch bei kaputter Datei, und ohne
  Neustart. Mit `free` geht es wieder auf Free, mit `status` sieht man den
  Modus. Notfalls genügt auch `rm ~/.lumira/layout.json`.

## 5. Technik

- **Lesen:** Jedes Modul, das das Layout beachtet, hat den Baustein
  `lumira-layout.js` (identisch in allen, Test prüft das).
  - Im Free-Modus legt der node_helper die Werte des aktiven Profils beim
    Anzeigen über die eigenen Einstellungen.
  - Familienplan und Portal-Hinweis stehen in MagicMirror-Bereichen.
    `MMM-LumiraStatus` verschiebt ihre Hülle, auch nach dem Wieder-Einblenden
    nach einem Alarm.
- **Positionen melden:** `MMM-LumiraStatus` meldet alle 20 s, und nur bei
  Änderung, wo die Module wirklich stehen (`~/.lumira/layout-mirror.json`).
  Das ist die Grundlage für „Vom Bildschirm übernehmen“.
- **API:**
  - `GET /api/layout`;
  - `POST/PUT/DELETE /api/layout/profiles(/:id)`;
  - `PUT /api/layout/mode`, `PUT /api/layout/editor`, `POST /api/layout/undo`.
- **Später geplant:** Profile automatisch nach Tageszeit oder per Home
  Assistant wechseln, Mehrfachauswahl/Ausrichten, Export/Import.
