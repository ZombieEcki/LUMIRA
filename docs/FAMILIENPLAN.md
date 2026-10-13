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
`install.sh` (bzw. beim Update über Portal → Info → LUMIRA oder per SSH mit `git pull && ./install.sh --update`) automatisch
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
4. **Optional:** *Einstellungen*: Wechseltag (Standard Montag), Überschrift,
   wie viele Wochen die Vorschau zeigt, und ob die Dienste jede Woche neu
   kombiniert werden oder feste Paare zusammenbleiben (z. B. Kochen +
   Küche).

Dienste können **feste Wochentage** bekommen (Familienplan → Dienste, Schalter
Mo–So, z. B. Mülldienst Di + Do). Der Spiegel zeigt die Tage am Dienst und hebt
ihn am Tag selbst mit „heute“ hervor. Eigene Profilfotos lassen sich beim
Hochladen zuschneiden (Ausschnitt verschieben, zoomen).

### Verteilung je Dienst

Unter der Dienstzeile (*Familienplan → Dienste*) steht, wie der Dienst verteilt wird:

| Verteilung | Rhythmus | Wirkung |
|---|---|---|
| **Wöchentlich rotierend** (Standard) | jede Woche … alle 4 Wochen | Wechselt am Wechseltag. Bei „alle 2 Wochen“ behält die Person den Dienst zwei Wochen. |
| **Täglich rotierend** | jeden Tag … alle 7 Tage | Jeden Tag (bzw. alle N Tage) jemand anderes – an den markierten Wochentagen, ohne Auswahl an allen. |
| **Monatlich rotierend** | jeden Monat … alle 6 Monate | Wechselt am ersten Wechseltag im neuen Monat. |
| **Fest zugewiesen** | – | Keine Rotation: nur an den eingetragenen Tagen bei der eingetragenen Person (z. B. Kochdienst Mo Franzi, Di Marcel, Mi Franzi) – oder „Jeden Tag“ die ganze Woche bei einer Person. Statt einer Person geht auch **„Ganze Familie“** (z. B. Putzen am Freitag für alle). |

**Feste Tage** lassen sich auch bei rotierenden Diensten eintragen
(„+ Feste Zuweisung“): An diesem Wochentag hat dann immer die eingetragene
Person den Dienst, an den anderen Tagen wird rotiert. Feste Zuweisungen haben
immer Vorrang.

Dienste, die nicht die ganze Woche bei einer Person liegen (täglich rotierend
oder fest an einzelnen Tagen), heißen **Tagesdienste**. Der Spiegel und die
Startseite zeigen sie nur am Tag selbst bei der Person, die heute dran ist
(„heute“). Im Portal stehen sie als Tagesraster unter der Woche
(*Übersicht*: änderbar, *Wochenplan*: kompakt).

Geburtstage, Jahrestage (Hochzeitstag, Kennenlerntag, Einzug oder ein eigener
Anlass) und Countdowns für die Familienbotschaften stehen auf der Seite
**Familie → Termine**. Geburtstage werden dort mit den
Familienmitgliedern verknüpft.

## 3. Im Alltag

| Was | Wo | Wirkung |
|-----|----|---------|
| Dienste dieser Woche tauschen | *Übersicht*: im Dropdown einen anderen Dienst wählen | Die beiden tauschen. Sofort auf dem Spiegel. |
| Tagesdienst an einem Tag ändern | *Übersicht → Tagesdienste*: Person im Tagesraster wählen | Nur dieser Tag, sofort auf dem Spiegel (markiert als geändert). |
| Eine kommende Woche vorab ändern | *Wochenplan → Bearbeiten* bei der Woche | Gilt ab Wochenbeginn. Die Wochen danach rechnen sich neu, damit es fair bleibt. |
| Eine Änderung zurücknehmen | *↺ automatisch* bzw. *Automatische Verteilung wiederherstellen* | Die berechnete Verteilung gilt wieder. |
| Alle Vorab-Änderungen verwerfen | *Wochenplan → Rotationsplan neu generieren* | Kommende Wochen wieder automatisch, die laufende bleibt. |
| Laufende Woche komplett neu verteilen | *Übersicht → Aktuelle Woche neu verteilen* | Nur auf ausdrücklichen Wunsch (fragt nach). |
| Jemand ist nicht zu Hause (Urlaub, Training, Klassenfahrt) | *Familienmitglieder → „nicht da …“*: regelmäßig an Wochentagen oder Zeiträume | Sofort ab heute: an diesen Tagen keine Tagesdienste, ein fester Dienst geht an jemand Anwesenden; die ganze Woche weg → auch kein Wochendienst. |
| Jemand macht länger nicht mit | *Familienmitglieder*: Aktiv-Schalter aus | Ab nächster Woche verteilen sich seine Dienste auf die anderen. |
| Nicht zu viel an einem Tag | *Einstellungen → Tagesdienste pro Person* | Höchstens N Tagesdienste je Person und Tag; was nicht hineinpasst, bleibt frei (Hinweis). Wirkt sofort ab heute. |
| Nachsehen, warum jemand einen Dienst hat | *Wochenplan → Warum so?* (oder Maus über den Dienst) | Kurze Begründung je Zuordnung. |
| Prüfen, ob es fair zugeht | *Wochenplan → Wie oft hatte wer was?* | Tabelle der letzten 12 Wochen. |

**Gut zu wissen:** Die laufende Woche ändert sich nie von allein. Neue
Personen, pausierte Dienste, eine andere Verteilung oder ein anderer Wechseltag
gelten immer ab der nächsten Woche – sofort nur über *Aktuelle Woche neu verteilen*.

## 4. So wird verteilt

- Jede Person bekommt gleich viele Dienste (bei 8 Diensten und 4 Personen
  also 2). Geht es nicht glatt auf, bekommt den Zusatzdienst, wer zuletzt am
  wenigsten hatte – reihum.
- In einem **Zyklus** (so viele Wochen, wie Personen mitmachen) hat jede
  Person jeden Dienst genau einmal. Danach beginnt der nächste Zyklus.
- Niemand hat denselben Dienst zwei Wochen hintereinander.
- Die Kombinationen wechseln von Zyklus zu Zyklus (außer bei festen Paaren).
- **Feste Zuweisungen gehen vor** und zählen bei „gleich viele Dienste“ mit:
  Wer feste Dienste hat, bekommt entsprechend weniger dazu. Lässt sich das
  nicht ausgleichen (z. B. drei feste Dienste bei einer Person), zeigt das
  Portal einen Hinweis „ungleich verteilt“.
- Wöchentliche Dienste mit Rhythmus („alle 2 Wochen“) und monatliche Dienste
  bleiben bis zum Wechsel bei derselben Person und zählen in jeder dieser
  Wochen mit.
- **Tagesdienste** werden Tag für Tag gemeinsam verteilt – nach denselben
  Regeln wie die Wochen: jeden Tag gleich viele Dienste je Person (8 tägliche
  Dienste, 4 Personen → je 2), im Zyklus (so viele Tage wie Personen) jeder
  jeden Dienst einmal, niemand denselben Dienst zwei Tage hintereinander.
  Feste Tage einzelner Personen zählen mit – auch die, die erst später in der
  Woche liegen.
- Ist eine fest eingetragene Person pausiert, bleibt der Dienst an dem Tag frei
  (Hinweis im Portal).
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
