# Sprüche auf dem Spiegel

Das Sprüchemodul `MMM-SmartCompliments` ist LUMIRAs eigenes Modul. Es zeigt
immer **genau einen** Spruch und wählt ihn passend zur Situation aus. Bedient
wird alles im Portal unter **Bildschirm → Sprüche**. Jede Änderung wird sofort
gespeichert und ist nach wenigen Sekunden auf dem Spiegel – ohne Neustart.

## 1. So wird ein Spruch ausgewählt

Bei jedem Wechsel (Standard: alle 30 Sekunden) in dieser Reihenfolge:

1. **Nach einem Feuerwehreinsatz** (Feuerwehr-Ausgabe): Danke-Botschaften,
   gemischt mit den normalen Sprüchen.
2. **Besondere Tage** – immer, wenn zutreffend: Geburtstag, Jahrestag
   (Hochzeitstag …) und Feiertag aus *Familien-Menü oben rechts → Besondere Tage*.
3. **Anlässe** in der eingestellten Reihenfolge (Standard: Wetterwarnung,
   Kalender, Wetter). Der erste, der gerade zutrifft, liefert im eingestellten
   Anteil (Standard: jeder zweite Spruch) einen passenden Spruch:
   - **Amtliche Wetterwarnung** (DWD) für euren Ort, z. B. „Wetterwarnung:
     Sturmböen. Passt gut auf euch auf.“ Das ersetzt nicht die Warnkachel.
   - **Kalender-Termin von heute**, dessen Titel ein Stichwort enthält:
     Geburtstag, Feuerwehr (nur Feuerwehr-Ausgabe), Sport & Training,
     Familienausflug.
   - **Wetterlage**: Sonne, Regen, Schnee, Gewitter, Nebel, Hitze, Frost, Wind.
4. **Allgemeiner Mix**: erst eine Kategorie (alle gleich oft), dann ein Spruch
   daraus. Dazu gehören Tageszeit-Gruß, Wochentag, Jahreszeit,
   Kalender-Zusammenfassung, Erinnerungen, Countdowns und alle
   eingeschalteten Kategorien.

Weitere Regeln:
- Zuletzt gezeigte Sprüche kommen nicht wieder, Standard: die letzten 10.
- **Ausgeschaltete Kategorien und Sprüche erscheinen nie**, auch nicht als Ersatz.
- **Mindestens eine allgemeine Kategorie bleibt an** – die letzte lässt sich
  nicht ausschalten (wie früher bei den drei Stimmungen).
- **Fehlende oder veraltete Daten** gelten nicht als Tatsache. Es gibt dann
  einfach allgemeine Sprüche. Veraltet heißt: Wetter älter als 3 Stunden,
  Warnung älter als 90 Minuten oder abgelaufen.
- Während eines Alarms ist der Spruch ausgeblendet.

## 2. Kategorien

| Gruppe | Kategorien |
|---|---|
| Allgemein (bisher, erweitert) | Herzlich (23), Motivierend (26), Humorvoll (19) |
| Allgemein (neu, je 12 Sprüche) | Familienwahnsinn, Freche Sprüche, Liebe & Partnerschaft, Kinderweisheiten, Mutmacher, Sarkasmus, Sofa-Philosophie, Feuerwehr & Kameradschaft¹, Glücksmomente, Lumiras Tagesorakel, Wissen mit Witz, Denk mal nach², Wortspiele, Montagsmotivation³, Wochenendmodus³, Kleine Challenges, Komplimente, Nerd-Ecke, Chaos-Prognose, Zitate mit Twist |
| Allgemein | Flachwitze (50), Versaut/Zweideutig (40, zweideutig, nicht explizit – ab Werk **aus**) |
| Eigene | beliebig viele (bis 20), eigener Name und Symbol |
| Anlass | Amtliche Wetterwarnung · Sonnig, Regen, Schnee, Gewitter, Nebel, Hitze, Frost, Wind · Geburtstag im Kalender, Feuerwehrtermin¹, Sport & Training, Familienausflug |
| Tageszeit (immer dabei) | Morgens (22), Vormittags (13), Nachmittags (19), Abends (16), Nachts (12) |
| Nach dem Einsatz¹ (17) | Danke- und Kameradschafts-Sprüche nach einem Feuerwehreinsatz; mit dem Schalter auch im normalen Mix |

¹ nur in der Feuerwehr-Ausgabe · ² Rätsel mit getrennter Lösung, die nach einer
einstellbaren Zeit unter dem Rätsel erscheint · ³ nur montags bzw. nur
samstags und sonntags

Jede Kategorie außer Tageszeit hat einen eigenen Schalter. Bei „Nach dem
Einsatz“ heißt er „auch im normalen Mix“ (ab Werk aus) – nach einem echten
Einsatz erscheinen die Sprüche immer. Die Schlüssel in `compliments.json` sind
dauerhaft und eindeutig, z. B. `familienwahnsinn`, `raetsel`, `versaut`,
`flachwitze`, `kal_sport`, `wetter_regen`.

**Beim Einbau bereinigt:** Diese Sprüche aus der Vorlage doppelten sich mit
anderen und wurden ersetzt:
- *Komplimente* 6 und 8 (doppelt mit „Mutmacher“ bzw. dem eingebauten „Schön,
  dass es dich gibt“),
- *Tagesorakel* 11 (doppelt mit „Kleine Challenges“ 2),
- *Montagsmotivation* 5 (Abwandlung des eingebauten Montagsspruchs).

*Sofa-Philosophie* 2 ist sprachlich geglättet.

**Übergabe 13.10.2026:** Die Sprüche für Tageszeit, Herzlich, Motivierend,
Humorvoll, Nach dem Einsatz, Versaut/Zweideutig und Flachwitze sind 1:1
übernommen und an die eingebauten Sprüche angehängt (bisherige bleiben). Wer
für eine Kategorie eine eigene Liste hat, sieht die neuen eingebauten Sprüche
dort nicht – „Auf Standard zurücksetzen“ holt sie.

## 3. Sprüche verwalten

Bei einer Kategorie auf **Bearbeiten** klicken:

- **Schalter je Spruch**: aus = erscheint nie (auch eingebaute Sprüche).
- **Text ändern, ✕ löschen, + Spruch**: Die erste Änderung an eingebauten
  Sprüchen legt automatisch eine **eigene Liste** an.
  **Auf Standard zurücksetzen** holt die eingebauten Sprüche zurück.
- **👁** zeigt den Spruch oben in der Vorschau.
- **Mehrere auf einmal einfügen**: je Zeile ein Spruch, bei Rätseln
  `Rätsel | Lösung`.
- `\n` im Text erzeugt eine neue Zeile.
- Platzhalter: `{event}` (Art der Warnung, z. B. „Sturmböen“) und `{title}`
  (Titel des Termins).
- **Kalender-Anlässe**: Die Stichwörter sind einstellbar (mit Komma getrennt,
  Groß-/Kleinschreibung egal, Teilwörter zählen: „Schwimm“ trifft
  „Schwimmkurs“).
- **Eigene Kategorie**: „+ Eigene Kategorie“, Name und Symbol eingeben,
  Sprüche eintragen. **Kategorie löschen** entfernt sie samt Sprüchen.

Leere Liste = eingebaute Sprüche, wie bisher.

### Viele Sprüche auf einmal: CSV aus Excel

*Sprüche → Sprüche aus Excel (CSV)*:
- **Beispieldatei** lädt eine fertige Vorlage
  (`lumira-portal/public/spruch/sprueche-beispiel.csv`).
- **Alle Sprüche als CSV** lädt den aktuellen Bestand im selben Format –
  bearbeiten und wieder einspielen geht also auch.

| Spalte | Inhalt |
|---|---|
| **Kategorie** | Name wie im Portal („Flachwitze“, „Denk mal nach“, „Sport & Training“, „Regen“ …) oder Schlüssel („flachwitze“, „raetsel“). Der Anfang des Namens reicht ab 5 Zeichen („Versaut“). Unbekannte Namen werden auf Wunsch als **eigene Kategorie** angelegt. |
| **Spruch** | der Text; `\n` = neue Zeile; Platzhalter `{event}`/`{title}` wie oben |
| **Lösung** | nur für „Denk mal nach“ – dort Pflicht |
| **Aktiv** | leer oder „ja“ = an, „nein“/„aus“/„0“ = Spruch ausgeschaltet |

- Die Kopfzeile ist optional. Mit Kopfzeile ist die Reihenfolge der Spalten egal.
- Trennzeichen **Semikolon** (Excel in Deutschland), Komma oder Tab werden
  erkannt. Felder in `"…"` dürfen Trennzeichen, Zeilenumbrüche und `""`
  (= ein Anführungszeichen) enthalten. Zeilen mit `#` am Anfang werden
  übersprungen.
- Excel: *Speichern unter → CSV UTF-8 (durch Trennzeichen getrennt)*. Ältere
  „CSV (Trennzeichen-getrennt)“-Dateien gehen auch, Umlaute werden erkannt.
- Höchstens 200 KB (rund 2000 Sprüche) je Datei und 200 Sprüche je Kategorie.

**Ablauf:**
1. Datei wählen. Das Portal zeigt eine **Vorschau**: je Kategorie neu,
   schon vorhanden und Anzahl danach. Übersprungene Zeilen stehen mit
   Zeilennummer und Grund darunter, z. B. „braucht eine Lösung“, „unbekannte
   Kategorie“ oder „gibt es nur in der Feuerwehr-Ausgabe“.
2. **Übernehmen als**:
   - *hinzufügen* (Standard): Vorhandenes bleibt, doppelte Sprüche werden
     übersprungen.
   - *ersetzen*: Die Kategorien aus der Datei bekommen genau deren Sprüche,
     alle anderen bleiben unberührt.
3. **Importieren**. Wie jede Änderung wirkt das sofort, und der alte Stand
   liegt als automatische Sicherung bereit (Abschnitt 8).

Bei eingebauten Kategorien wird beim Hinzufügen aus „eingebaut + neu“ eine
eigene Liste. „Auf Standard zurücksetzen“ macht das rückgängig.

## 4. Darstellung

| Einstellung | Wirkung |
|---|---|
| **Wie bisher** | Der Spruch steht wie bisher oben mittig im MagicMirror-Layout (Standard) |
| Position (9 Felder) | Frei platzieren: oben/mittig/unten × links/mittig/rechts |
| Abstände | Vom gewählten Rand, in px oder % des Bildschirms; bei „mittig“ Versatz von der Mitte |
| Breite | 0 = automatisch (höchstens 80 % der Bildschirmbreite), sonst in px; lange Sprüche brechen um |
| Höhe höchstens | 0 = frei; sonst wird die Schrift verkleinert (bis 50 %), statt etwas abzuschneiden |
| Schriftgröße | 60–200 % der bisherigen Größe |
| Innenabstand | 0–40 px |
| Symbol | **groß unter dem Spruch** (wie im Beispielbild; Sprüche ohne eigenes Emoji bekommen das Symbol ihrer Kategorie) · am Zeilenende (wie bisher) · ohne |

Schrift, Farbe und Schatten bleiben wie bisher. Es gibt keine Karte und keinen
Hintergrund. Eine Änderung der Darstellung zeichnet den **gleichen** Spruch neu
und wählt keinen neuen.

**Vorschau im Portal:**
- Der Spruch auf einem verkleinerten Spiegel mit dessen gemeldeter
  Bildschirmgröße.
- Darunter das Live-Bild vom Spiegel und „Gerade auf dem Spiegel: …“.
- Bei freier Position meldet der Spiegel, ob der Spruch Uhr, Familienplan,
  Kalender, Wetter- oder Radarkacheln überdeckt oder über den Rand ragt.

## 5. Wechsel

- Neuer Spruch alle 10 Sekunden bis 10 Minuten.
- Nicht wiederholen innerhalb der letzten 5–80 Sprüche.
- „Denk mal nach“: Lösung nach 5–60 Sekunden, spätestens zur Hälfte des Wechsels.

## 6. Schnittstellen zu anderen Modulen

Das Modul liest nur und verändert nichts in anderen Modulen. Fehlt eine Quelle,
läuft es mit allgemeinen Sprüchen weiter.

| Quelle | Meldung (Notification) | Inhalt / Verwendung |
|---|---|---|
| `MMM-LumiraWeather` (Wetteranzeige) | `LUMIRA_WEATHER` | `{ current: { temp, code (WMO), isDay, wind (km/h) } \| null, updatedAt, warnings: { list: [{ event, level, group, onset, expires }], updatedAt } \| null }` – nur gelieferte Werte. Warnungen holt das Wettermodul, sobald die Wetteranzeige oder die Warnkachel an ist |
| Standard-Wettermodul (`weather`, wird von LUMIRA nicht mehr geladen) | `WEATHER_UPDATED` / `CURRENTWEATHER_DATA` | Wetterlage, Temperatur, Wind – nur genutzt, wenn von der Wetteranzeige nichts Frisches da ist (z. B. eigene config.js) |
| Kalender (`calendar`) | `CALENDAR_EVENTS` | Titel und Zeiten der Termine (Zusammenfassung „Heute stehen 3 Termine …“ und Stichwort-Anlässe) |
| `MMM-aPagerAlarm` | `APAGER_STATE` | Ausblenden während des Alarms, Danke-Botschaften danach |
| LUMIRA-Portal | `~/.lumira/compliments.json` | Sprüche und Einstellungen (live per `fs.watch`) |
| → Portal | `~/.lumira/compliments-mirror.json` | Rückmeldung: aktueller Spruch, Bildschirmgröße, Überschneidungen |

**Familienaufgaben** sind bewusst nicht angebunden: Der Familienplan kennt kein
„erledigt“.

## 7. Installation

1. LUMIRA aktualisieren:
   ```bash
   cd ~/LUMIRA && git pull && ./install.sh
   ```
2. Portal → **Bildschirm → Sprüche**. Alle bisherigen Sprüche und Stimmungen
   bleiben erhalten. Die neuen Kategorien sind sofort aktiv, außer
   Versaut/Zweideutig. Die Darstellung bleibt „wie bisher“, nur das Symbol
   steht jetzt groß unter dem Spruch (unter *Darstellung → Symbol* umstellbar).

Für Wetter-Anlässe und amtliche Warnungen muss die Wetteranzeige oder die
Warnkachel an sein (*Bildschirm → Wetter*).

## 8. Datensicherung und Rollback

- **Sichern:** *Sprüche → Sichern (Datei laden)* lädt eine JSON-Datei mit
  allen Sprüchen und Einstellungen herunter. *Sicherung einspielen* ersetzt
  alles durch eine solche Datei, z. B. für einen zweiten Spiegel.
- **Automatische Sicherungen:** Vor jedem Speichern legt das Portal den alten
  Stand in `~/.lumira/backups/compliments.<Zeitstempel>.json` ab (die letzten 15).
  Zurückholen:
  ```bash
  cp ~/.lumira/backups/compliments.<Zeitstempel>.json ~/.lumira/compliments.json
  ```
  Der Spiegel übernimmt die Datei sofort.
- **Ganze Version zurück:** Die alte `compliments.json` (Version 1) liest die
  neue Version unverändert. Umgekehrt ignoriert eine ältere LUMIRA-Version die
  neuen Felder. Zurück auf einen älteren Stand:
  ```bash
  cd ~/LUMIRA && git checkout <alter-commit> && ./install.sh
  ```

## 9. Fehlerbehebung

| Problem | Abhilfe |
|---|---|
| Kein Spruch zu sehen | Bildschirm → Übersicht: „Sprüche“ an? Startseite: Schalter „Sprüche anzeigen“ an? Während eines Alarms ist er absichtlich weg. |
| Spruch an falscher Stelle | Darstellung → „Wie bisher“ setzt ihn zurück ins Layout. Bei freier Position Abstände und Einheit (px/%) prüfen; die Vorschau zeigt Überschneidungen. |
| Nie Wetter-Sprüche | Anlässe → Wetterlage an? Ist die Wetteranzeige an (Bildschirm → Wetter)? Die Daten dürfen nicht älter als 3 Stunden sein. |
| Nie Warn-Sprüche | Gibt es gerade eine amtliche Warnung? Die Wetteranzeige oder die Warnkachel muss an sein (sie holen die Warnungen). |
| Kalender-Anlass greift nicht | Termin muss heute sein und ein Stichwort im Titel haben (Bearbeiten → Stichwörter). Läuft das Kalendermodul? |
| Eine Kategorie fehlt | Feuerwehr-Kategorien nur in der Feuerwehr-Ausgabe; Montags-/Wochenendsprüche nur an diesen Tagen. |
| Schrift auf dem Spiegel zu klein | „Höhe höchstens“ größer oder 0 setzen – sonst wird verkleinert, damit nichts abgeschnitten wird. |

Logs: `pm2 logs MagicMirror` (Meldungen beginnen mit `MMM-SmartCompliments`).
