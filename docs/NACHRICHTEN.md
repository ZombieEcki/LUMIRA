# Nachrichten auf dem Bildschirm

Eigenes Nachrichtenmodul `MMM-LumiraNews`. Es ersetzt das MagicMirror-Modul
`newsfeed`:
- mehrere RSS-/Atom-Feeds gleichzeitig, vordefinierte und eigene;
- **immer ganz unten** am Bildschirm, durchsichtig;
- zwei Varianten zur Wahl.

Alles im Portal unter **Bildschirm → Nachrichten**. Änderungen sind nach
wenigen Sekunden auf dem Bildschirm, ohne Neustart.

**Nach dem Update** wird der bisherige Feed einmalig übernommen: Tagesschau
bzw. dein eigener Link, ohne bisherigen Feed die Tagesschau. Aktiv ist
Variante 1, die kompakte Leiste.

## 1. Variante umschalten

*Darstellung* → **Kompakte Leiste** oder **Vorschauboxen**:

- **Kompakte Leiste:** feine Linie, RSS-Symbol mit „Nachrichten“, eine
  Schlagzeile mit Quelle und Alter. Alle paar Sekunden blendet sie sanft zur
  nächsten über.
- **Vorschauboxen:** 2–6 niedrige Karten nebeneinander (Kategorie · Quelle,
  Titel in höchstens zwei Zeilen, „vor 2 Stunden“, Vorschaubild, wenn der Feed
  eines liefert) auf einer dezenten Glasfläche. Die Karten blättern
  seitenweise weiter.

Einstellbar sind außerdem:
- „Nächste Meldung nach“ (6 s bis 1 min);
- Schriftgröße;
- Deckkraft der Karten;
- Quelle, Alter, Vorschaubilder und die Überschrift „Nachrichten“ ein/aus.

## 2. Feeds auswählen

**Vordefinierte Feeds:** Alle Adressen wurden am 2.11.2026 abgerufen, alle
liefern Zeitangaben.

| Kategorie | Feed | Bilder |
|---|---|---|
| Regional | Merkur – Landkreis Freising (Lokalmeldungen aus dem ganzen Landkreis, auch Allershausen) | ja |
| Bayern | Merkur – Bayern · Süddeutsche – Bayern | ja |
| Deutschland | Tagesschau – alle Meldungen · Tagesschau – Inland · Spiegel · Zeit Online · Deutschlandfunk · Süddeutsche – Topthemen | ja |
| Welt | Tagesschau – Ausland · Deutsche Welle | ja |
| Sport | Sportschau (ja) · kicker (ohne Bilder) | |
| Technik | heise online · Golem · t3n | ja |

Nicht dabei, weil ohne funktionierenden Feed: **BR24** und ein eigener Feed nur
für Allershausen.

**Nutzungsbedingungen:** Geprüft wurde nur, dass die Feeds funktionieren, nicht
die Bedingungen der einzelnen Anbieter. RSS-Feeds sind zum Abonnieren gedacht,
und LUMIRA zeigt nur Titel, Zeit und Vorschaubild an. Für die private Anzeige zu
Hause ist das üblich. **Vor gewerblichem Einsatz** (z. B. Business-Edition im
Laden oder Wartezimmer) die Bedingungen der Anbieter prüfen.

**Eigener Feed:** **+ Eigenen Feed hinzufügen** → Adresse, Name, Kategorie →
**Hinzufügen**.
- Beim Speichern wird der Feed immer erst getestet. Nur ein Feed, der
  wirklich Meldungen liefert, landet in der Liste.
- Verständliche Fehler, z. B. „Das ist kein RSS- oder Atom-Feed“, wenn eine
  Webseite statt des Feeds eingefügt wurde.
- Eigene Feeds lassen sich bearbeiten und löschen.

**Aktive Feeds:** Jeder lässt sich einzeln an/aus schalten und mit ↑/↓
**sortieren**. Die Reihenfolge entscheidet bei Doppelten: Dieselbe Meldung in
zwei Feeds erscheint nur einmal, mit der oberen Quelle.

## 3. Zeitraum und Aktualisierung

- **Höchstens so alt:** 6, 12, 24, 48, 72 Stunden oder eine eigene Zahl
  (1–720 Stunden, also bis 30 Tage).
- **Regel für die Zeit:** Gezeigt werden nur Meldungen mit Zeitangabe im
  gewählten Zeitraum, die neuesten zuerst.
  - Meldungen **ohne Zeitangabe** werden **ausgeblendet**.
  - Meldungen mit einer Zeit **mehr als eine Stunde in der Zukunft** werden
    ebenfalls **ausgeblendet** (Uhr des Anbieters falsch).
  - So rutscht nichts Altes als „neu“ durch. Der Test eines eigenen Feeds
    sagt, wie viele Meldungen deshalb wegfallen.
- **Abruf:** alle 5–60 Minuten (Standard 15).
  - Die Feeds werden nacheinander geholt, mit 15 s Zeitlimit je Feed.
  - Fällt ein Feed aus, bleibt sein letzter Stand und die anderen laufen
    weiter. Der Bildschirm bleibt bedienbar.
  - Im Portal stehen je Feed die Anzahl der Meldungen und der Stand, bzw. der
    Fehler.
- **Gibt es gerade nichts**, steht dezent „Gerade keine Nachrichten aus den
  letzten 24 Stunden“ in der Leiste.

## 4. Sicherheit

- **Inhalte als Text:** Titel werden zu reinem Text (HTML und Skripte darin
  werden entfernt) und nur per `textContent` angezeigt. Nichts aus einem Feed
  wird ausgeführt.
- **Nur http(s):** Links und Bilder anderer Art fallen weg.
- **Bilder** werden nur in den Vorschauboxen geladen, ohne Referrer. Lädt eines
  nicht, bleibt die Karte ohne Bild.

## 5. Technik

- **Modul:** `modules/MMM-LumiraNews`, in der config.js
  `{ module: "MMM-LumiraNews", position: "bottom_bar" }` (nur, wenn der
  Schalter „Nachrichten“ an ist).
- **Dateien:**
  - `~/.lumira/news.json`: Darstellung und Feeds in ihrer Reihenfolge;
  - `~/.lumira/news-data.json`: Meldungen und Stand je Feed, für den schnellen
    Start und die Vorschau.
- **Feed-Leser:** `rss.js` liest RSS 2.0, RSS 1.0/RDF und Atom, ohne
  Bibliothek. Im Portal liegt eine Kopie als `lib/news-rss.js`.
- **Darstellung:** `news-view.js`/`.css`; dieselben Dateien zeichnen die
  Vorschau im Portal.
- **API:**
  - `GET/PUT /api/news`, `PUT /api/news/presets/:id`;
  - `POST /api/news/sources`, `PUT/DELETE /api/news/sources/:id`;
  - `PUT /api/news/order`, `POST /api/news/test`, `GET /api/news/items`.

## 6. Zurück zum alten Modul

`newsfeed` ist Teil von MagicMirror und bleibt installiert. Zurück geht es mit
dem Stand vor diesem Modul (`git checkout <commit>` in `~/LUMIRA`, dann
`./install.sh`). Der bisherige Feed steht weiter in `settings.json`.

## 7. Fehlerbehebung

| Problem | Abhilfe |
|---|---|
| Leiste leer, „Gerade keine Nachrichten“ | Zeitraum größer stellen; ist mindestens ein Feed aktiv und ohne ⚠? |
| „Das ist kein RSS- oder Atom-Feed“ | Auf der Webseite nach „RSS“ bzw. dem orangefarbenen Symbol suchen und diese Adresse nehmen. |
| Feed zeigt „⚠ nicht erreichbar“ | Internet des Pi prüfen; Werbeblocker (Pi-hole) blockiert die Adresse? Der letzte Stand bleibt sichtbar. |
| Keine Bilder | Nur in den Vorschauboxen und nur, wenn der Feed Bilder liefert (kicker liefert keine). |
| Meldungen fehlen trotz Feed | Ohne Zeitangabe werden sie bewusst ausgeblendet (siehe Test im Portal). |
| Nichts zu sehen | Bildschirm → Übersicht: „Nachrichten“ an? Nach dem Update einmal `./install.sh`. Logs: `pm2 logs MagicMirror` (`MMM-LumiraNews`). |
