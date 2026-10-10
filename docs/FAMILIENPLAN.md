# Familienplan – Anleitung

Der Familienplan zeigt auf dem Spiegel, wer diese Woche welche Dienste hat
(Garten, Tisch, Bad, Müll …). Die Verteilung wechselt jede Woche automatisch
und fair. Eingerichtet und gepflegt wird alles im LUMIRA-Portal unter
`http://lumira.local:8092` → **Familienplan**.

Verfügbar in den Editionen Home, Fire und Rescue.

> Technischer Hintergrund: [concept/familienplan.md](../concept/familienplan.md),
> Modul: [modules/MMM-FamilyPlan](../modules/MMM-FamilyPlan/README.md),
> API: [lumira-portal/README.md](../lumira-portal/README.md#familienplan-api).

## 1. Installation

Auf einem LUMIRA-Gerät ist nichts zu installieren. Der Familienplan kommt mit
`install.sh` (bzw. beim Update mit `git pull && ./install.sh`) automatisch
mit, ist aber zunächst ausgeschaltet.

## 2. Einrichten (einmalig, etwa 5 Minuten)

1. **Familie anlegen:** *Familienplan → Familienmitglieder → „+ Mitglied
   hinzufügen“*. Für jede Person Name, Rolle (Erwachsener/Kind), Farbe und
   Avatar wählen (eines der mitgelieferten Bilder, ein eigenes Foto oder
   Initialen). *Speichern*. Die erste Woche entsteht danach sofort.
2. **Dienste prüfen:** *Dienste*. Acht Dienste sind vorbereitet. Name, Farbe
   und Symbol lassen sich ändern, Dienste hinzufügen, entfernen oder
   pausieren (z. B. Garten im Winter). Unter *Für wen* lässt sich ein Dienst
   auf Erwachsene oder Kinder beschränken (z. B. Kochdienst nur für
   Erwachsene).
3. **Auf dem Spiegel einschalten:** *Übersicht → Auf dem Spiegel →
   „Familienplan anzeigen“* einschalten, Darstellung und Breite wählen,
   *Speichern*. Der Spiegel startet einmal neu und zeigt den Plan oben links.
4. **Optional:** *Einstellungen*: Rotationstag (Standard Montag), Überschrift,
   wie viele Wochen die Vorschau zeigt, und ob die Dienste jede Woche neu
   kombiniert werden oder feste Paare zusammenbleiben (z. B. Kochen +
   Küche).

Geburtstage, Hochzeitstag und Countdowns für die Familienbotschaften stehen
auf der Seite **Wichtige Termine**. Geburtstage werden dort mit den
Familienmitgliedern verknüpft.

## 3. Im Alltag

| Was | Wo | Wirkung |
|-----|----|---------|
| Dienste dieser Woche tauschen | *Übersicht*: im Dropdown einen anderen Dienst wählen | Die beiden tauschen. Sofort auf dem Spiegel. |
| Eine kommende Woche vorab ändern | *Wochenplan → Bearbeiten* bei der Woche | Gilt ab Wochenbeginn. Die Wochen danach rechnen sich neu, damit es fair bleibt. |
| Eine Änderung zurücknehmen | *↺ automatisch* bzw. *Automatische Verteilung wiederherstellen* | Die berechnete Verteilung gilt wieder. |
| Alle Vorab-Änderungen verwerfen | *Wochenplan → Rotationsplan neu generieren* | Kommende Wochen wieder automatisch, die laufende bleibt. |
| Laufende Woche komplett neu verteilen | *Übersicht → Aktuelle Woche neu verteilen* | Nur auf ausdrücklichen Wunsch (fragt nach). |
| Jemand ist im Urlaub | *Familienmitglieder*: Aktiv-Schalter aus | Ab nächster Woche verteilen sich seine Dienste auf die anderen. |
| Nachsehen, warum jemand einen Dienst hat | *Wochenplan → Warum so?* (oder Maus über den Dienst) | Kurze Begründung je Zuordnung. |
| Prüfen, ob es fair zugeht | *Wochenplan → Wie oft hatte wer was?* | Tabelle der letzten 12 Wochen. |

**Gut zu wissen:** Die laufende Woche ändert sich nie von allein. Neue
Personen, pausierte Dienste oder ein anderer Rotationstag gelten immer ab der
nächsten Woche.

## 4. So wird verteilt

- Jede Person bekommt gleich viele Dienste (bei 8 Diensten und 4 Personen
  also 2). Geht es nicht glatt auf, bekommt den Zusatzdienst, wer zuletzt am
  wenigsten hatte – reihum.
- In einem **Zyklus** (so viele Wochen, wie Personen mitmachen) hat jede
  Person jeden Dienst genau einmal. Danach beginnt der nächste Zyklus.
- Niemand hat denselben Dienst zwei Wochen hintereinander.
- Die Kombinationen wechseln von Zyklus zu Zyklus (außer bei festen Paaren).
- Es wird nicht gewürfelt: Gleiche Ausgangslage ergibt immer denselben Plan,
  auch nach einem Neustart. Die Vorschau zeigt deshalb verlässlich, was kommt
  – solange niemand etwas ändert.

## 5. Datensicherung und Wiederherstellung

| Ebene | Wie |
|-------|-----|
| **Automatisch** | Vor jedem Speichern sichert LUMIRA den vorherigen Stand (die letzten 15) in `~/.lumira/backups/familyplan.*.json`. |
| **Wiederherstellen** | *Einstellungen → Datensicherung → Automatische Backups*: beim gewünschten Stand *Wiederherstellen*. Der aktuelle Stand wird vorher selbst gesichert, ein Versehen lässt sich also auch wieder rückgängig machen. |
| **Exportieren** | *Einstellungen → Datensicherung → Exportieren* lädt eine Datei `familienplan-JJJJ-MM-TT.json` herunter: kompletter Plan inklusive hochgeladener Fotos. |
| **Importieren** | *Einstellungen → Datensicherung → Importieren …* und die exportierte Datei wählen, z. B. nach einer Neuinstallation oder auf einem zweiten Gerät. |
| **Komplett (Techniker)** | `scp -r pi@lumira.local:~/.lumira ./lumira-backup` sichert alle Kundendaten (Einstellungen, Sprüche, Familienplan, Fotos). |

Notfall per SSH, falls das Portal gar nicht mehr startet:

```bash
ls ~/.lumira/backups/familyplan.*
cp ~/.lumira/backups/familyplan.<zeitstempel>.json ~/.lumira/familyplan.json
sudo systemctl restart lumira-portal
```

## 6. Fehlerbehebung

| Problem | Ursache / Lösung |
|---------|------------------|
| Spiegel zeigt „Wird im LUMIRA-Portal eingerichtet.“ | Noch keine Mitglieder angelegt, oder die automatische Rotation ist aus und es gibt noch keine Woche. |
| Familienplan erscheint gar nicht | *Übersicht → Familienplan anzeigen* eingeschaltet und gespeichert? Danach startet MagicMirror einmal neu. |
| KW-Zeile grau mit „Vorwoche“ | Das Portal hat die neue Woche nicht angelegt. `sudo systemctl status lumira-portal` prüfen, Uhrzeit des Pi prüfen (`timedatectl`), *Einstellungen → Automatische Rotation* an? |
| Hinweis „Die Uhrzeit des Pi wirkt falsch“ | Der Pi hat keine eingebaute Uhr. Ohne Internet stimmt die Zeit nach einem Neustart evtl. nicht. Sobald die Uhr wieder stimmt (Internet), geht es von selbst weiter. |
| Hinweis „familyplan.json ist beschädigt“ | *Einstellungen → Datensicherung* einen Stand wiederherstellen. Der Spiegel zeigt bis dahin den letzten guten Stand. |
| „Woanders geändert – Seite neu geladen“ | Zwei Geräte haben gleichzeitig gespeichert. Die Seite zeigt jetzt den neuesten Stand, die eigene Änderung einfach nochmal machen. |
| Ein Dienst wird nicht vergeben | Der Dienst ist z. B. „nur für Erwachsene“, es macht aber kein Erwachsener mit. Unter *Dienste → Für wen* anpassen. |
| Symbole fehlen im Portal oder auf dem Spiegel | Font Awesome kommt aus der MagicMirror-Installation. Ist MagicMirror sehr alt, fehlen einzelne neuere Symbole – ein anderes wählen. |
| Geburtstag erscheint nicht auf dem Spiegel | *Wichtige Termine*: Datum als TT.MM. eingetragen und gespeichert? Erinnerungen kommen ein paar Tage vorher und am Tag selbst. |
