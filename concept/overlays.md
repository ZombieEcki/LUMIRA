# Overlays im Portal: eine Logik, vier Arten

**Stand:** umgesetzt (Schritte 1–3, Rest siehe Abschnitt 5), 2.11.2026 · **Ziel:** Jedes Fenster, jede Rückfrage und
jeder Hinweis im Portal verhält sich gleich und erklärt sich selbst. Niemand
soll raten müssen, was „OK“ bedeutet oder wie man etwas wieder schließt.

## 1. Bestand (heute)

| Art | Wo | Problem |
|---|---|---|
| 34 × `confirm()` | Löschen, Neustart, Wiederherstellen, Layout, Abmelden … | Browser-Fenster im fremden Stil, nur „OK/Abbrechen“, Folgen stehen in einem langen Satz, auf dem Handy oft abgeschnitten |
| 4 × `prompt()` | Layout neu / Kopie / umbenennen | keine Prüfung beim Tippen, sieht aus wie eine Fehlermeldung |
| Toast | unten, 2,6 s | nur Text, kein „Rückgängig“, Fehler sehen aus wie Erfolg, verschwinden zu schnell |
| Aufklapper | Familien-Menü, Kalender (Datum), Auswahlfelder | drei eigene Bauweisen, schließen unterschiedlich (Esc, Klick daneben …) |
| Vollbild | Live-Bild, Bild zuschneiden | eigene Schließ-Logik, Zurück-Taste am Handy verlässt die Seite |
| Familien-Overlay | Avatare oben rechts | nur zwei Links (Mitglieder, Besondere Tage); zeigt nicht, wer dazugehört und was ansteht |

## 2. Vier Arten – mehr nicht

### A. Rückfrage (Dialog)
Nur, wenn etwas **nicht rückgängig** zu machen ist oder **den Bildschirm
unterbricht**. Ersetzt `confirm()` und `prompt()`.

- **Titel = Frage mit Verb:** „Liste „Einkaufen“ löschen?“
- **Folge in einem Satz**, plus höchstens eine **Folge-Marke**:
  - 🗑 *endgültig* (kein Zurück),
  - ⟳ *Bildschirm startet neu (ca. 1 Minute)*,
  - ↶ *lässt sich rückgängig machen*,
  - 📶 *Verbindung bricht kurz ab*.
- **Knöpfe = Verben:** „Löschen“ / „Abbrechen“ – nie „OK“. Gefährliche Aktion
  rot und rechts; der Fokus liegt auf „Abbrechen“.
- **Mit Eingabe** (statt `prompt`): Feld mit Beispiel, Prüfung beim Tippen,
  „Anlegen“ bleibt grau, solange der Name ungültig ist.
- **Zählt mit:** „Dabei werden auch 12 Aufgaben gelöscht.“

### B. Hinweis mit Rückgängig (Toast)
Für alles, was **sich zurücknehmen lässt**: Statt vorher zu fragen, sofort
tun und unten anbieten: „Aufgabe gelöscht · **Rückgängig**“.

- **Drei Arten:**
  - *Erfolg*: 3 s, grün;
  - *Fehler*: rot, bleibt bis zum Wegtippen;
  - *Mit Aktion*: 6 s, mit Rückgängig, Anzeigen oder Erneut.
- **Reihenfolge:** Mehrere Hinweise erscheinen nacheinander statt einander zu
  überschreiben. Für Bildschirmleser werden sie vorgelesen (`aria-live`).
- **Weniger Rückfragen:** Fällt bei Aufgaben, Unteraufgaben, Kategorien,
  Feeds und Layout-Schritten weg.

### C. Aufklapper (Popover)
Kleine Auswahl **neben dem Auslöser**: Familien-Menü, Datum, Auswahlfelder,
„⋯ Mehr“ an Listeneinträgen.

- **Schließen:** Tippen daneben, Esc oder eine Auswahl.
- **Bedienung:** Pfeiltasten wandern durch die Einträge.
- **Am Handy:** Der Aufklapper wird automatisch zum **Blatt von unten**, mit
  großen Zielen für den Daumen.

### D. Blatt (Sheet)
Größere Aufgaben **über der Seite**: Live-Bild, Bild zuschneiden, Aufgabe oder
Kalender bearbeiten (am Handy statt des eingeschobenen Editors).

- **Kopfzeile:** Titel und ✕ – überall gleich.
- **Am PC** in der Mitte, **am Handy** von unten, bildschirmfüllend.
- **Ungespeicherte Eingaben:** Beim Schließen kommt die Rückfrage „Änderungen
  verwerfen?“.

## 3. Gemeinsame Regeln (für alle vier)

1. **Höchstens eine Rückfrage oder ein Blatt gleichzeitig.** Aufklapper und
   Hinweise dürfen darüber liegen.
2. **Schließen geht immer gleich:** ✕ oben rechts, Esc, Tippen auf den
   abgedunkelten Rand und die **Zurück-Taste am Handy**. Die Seite merkt sich
   das Overlay im Verlauf, damit „Zurück“ es schließt statt die Seite zu
   verlassen.
3. **Fokus:**
   - Er wandert hinein und bleibt im Overlay.
   - Beim Schließen springt er zurück zum Auslöser.
   - Der Hintergrund scrollt nicht mit.
4. **Sprache:**
   - Verben auf Knöpfen.
   - Folgen benennen.
   - Keine Fachwörter (statt „Electron-Fix“ steht „Anzeige-Reparatur“).
5. **Fragen nur, wenn nötig:**
   - *Rückgängig möglich* → Hinweis mit „Rückgängig“.
   - *Endgültig oder unterbrechend* → Rückfrage.
   - *Harmlos* → einfach tun.
6. **Ein Baustein:** `public/overlay.js` mit vier Aufrufen:
   - `ask({...})` → Promise<true|false|Text>;
   - `notify(text, {type, action})`;
   - `popover(anchor, fn)` (am Handy automatisch als Blatt);
   - `modal(el, onClose)` für vorhandene Vollbilder (Live-Bild, Zuschneiden):
     Esc, Zurück-Taste und Fokus wie überall.

   Alle Seiten nutzen nur diese, kein `confirm`/`prompt`/`alert` mehr. Ein
   Test sucht im Code danach.

## 4. Erste Anwendung: das Familien-Overlay neu

Tippen auf die Avatare oben rechts öffnet einen Aufklapper (am Handy ein
Blatt):

```
 Familie Eckhof                        4 Personen
 ┌───────────────────────────────────────────────┐
 │ (M) Marcel   Erwachsener   ›                  │  ← tippt man an: Mitglied bearbeiten
 │ (F) Franzi   Erwachsene    ›                  │
 │ (M) Maja     Kind · 12. Geburtstag in 5 Tagen ›│
 │ (M) Marie    Kind          ›                  │
 └───────────────────────────────────────────────┘
 Als Nächstes
   🎂 Maja wird 12 · in 5 Tagen
   ❤️ Hochzeitstag · in 245 Tagen
 ─────────────────────────────────────────────────
 [+ Mitglied]   [Besondere Tage]   [Familienplan]
```

- **Wer gehört dazu:** Avatar, Name und Rolle. Ein Hinweis steht nur, wenn
  bald etwas ansteht (Geburtstag in den nächsten 14 Tagen).
- **Was steht an:** die nächsten zwei besonderen Tage.
- **Was kann ich tun:** drei klare Aktionen.
  - „Familienplan“ erscheint nur, wenn er an ist.
  - „+ Mitglied“ öffnet direkt das Formular.
- **Später (Benutzerkonten):** Oben steht, *wer gerade angemeldet ist*, mit
  „Abmelden / Person wechseln“. Kinder sehen dann nur ihre eigenen Dienste.
  Der Platz dafür ist im Aufbau schon vorgesehen.

## 5. Umsetzung in drei Schritten

1. **Baustein** `overlay.js` + Stil.
   - Alle 34 `confirm` und 4 `prompt` auf `ask()` umstellen.
   - Der Toast wird zu `notify()` mit Aktionen.
   - Test: kein `confirm(`/`prompt(`/`alert(` mehr in `public/`.
2. **Rückgängig statt Rückfrage** dort, wo es geht: Aufgaben, Unteraufgaben,
   Kategorien, Feeds, eigene Kalender, Layout-Schritte.
3. **Familien-Overlay** neu (Abschnitt 4).
   - Live-Bild und Zuschneiden auf `modal()`.
   - Zurück-Taste am Handy.

**Noch offen:**
- Datum und Auswahlfelder nutzen noch ihre eigenen Aufklapper.
- Rückfrage statt Rückgängig bleibt bei: eigenen Kalendern (die Adresse ist
  geheim und im Browser nicht bekannt) und Kategorien mit Aufgaben (die
  Zuordnung käme nicht zurück).
- Editoren als Blatt am Handy.

## 6. Bewusst nicht

- **Keine Animationen über 150 ms:** Das Portal läuft auch auf schwachen
  Handys.
- **Keine Overlays auf dem Bildschirm selbst:** Dort gibt es keinen Touch.
  Das ist nur das Portal.
- **Keine verschachtelten Dialoge:** Rückfrage in der Rückfrage gibt es nicht.
  Muss vorher etwas gespeichert werden, steht das als Satz im selben Dialog
  („Ungespeicherte Änderungen werden vorher gespeichert“).
