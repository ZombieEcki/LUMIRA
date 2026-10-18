# Portal-Neuordnung

**Stand:** 18.10.2026 (Version 3, mit Entscheidungen) · Ausführliche Fassung mit
Entwürfen: Artifact „LUMIRA Portal-Neuordnung“.

Ziel: Man sieht, wo eine Einstellung liegt – ohne Anleitung.

## Leitregeln

1. **Ein Ding, ein Ort.** Jede Einstellung gibt es genau einmal, sonst Verweise.
2. **Bildschirm, Spezialmodule, Einstellungen.** Bildschirm = alles, was dort
   erscheint, samt Inhalten (Sprüche, Kalender). Spezialmodule = eigene
   Anwendungen mit eigener Verwaltung (Familienplan). Einstellungen = das
   Gerät. Familie (Menü oben rechts) = wer dazugehört.
3. **Aus heißt weg.** Ausgeschaltete Module verschwinden aus Navigation und Start.
4. **Sofort gespeichert.** Keine Speichern-Knöpfe, Rückgängig; Neustarts werden
   gesammelt und einmal angeboten.
5. **Einfach zuerst.** Pixel-Abstände, Intervalle, Stichwörter unter „Mehr Optionen“.
6. **Wörter aus dem Alltag.** Bildschirm statt Spiegel, Dauerschleife, Türklingel …

## Struktur

| Bereich | Seiten |
|---|---|
| Start | Status (4 Kacheln) · Bildschirm · Wetter · Als Nächstes · Familienplan (wenn an) |
| Bildschirm | Übersicht · Wetter (Aktuell & Vorhersage, Regenradar, Warnungen) · Sprüche · Kalender · Nachrichten · Dauerschleife · Türklingel |
| Familienplan | Platz für Spezialmodule; ab zwei heißt der Bereich „Extras“ (Hinweis vor dem Einschalten) |
| Alarm | oben Aktionskacheln (Alarm testen, Einsatz beenden, Zuhause), darunter die Einstellungen |
| Einstellungen | Ort · WLAN · Sicherheit & Geräte · Updates & System · Als App (später: Sichern) |
| Familie (Menü oben rechts) | Mitglieder · Besondere Tage (später: Konten, siehe [benutzerkonten.md](benutzerkonten.md)) |

## Entscheidungen

- „Extras“ ab zwei Spezialmodulen, mit Hinweis beim Ein- und Ausschalten.
- Besondere Tage bleiben bei Familie (Menü oben rechts).
- Ziehen in der Übersicht gilt für alle Module, auch Uhr, Kalender, Nachrichten
  (gemeinsame `~/.lumira/layout.json`, umgesetzt von `MMM-LumiraStatus`, ohne Neustart).
- Module, die durch eigene ersetzt sind, werden entfernt: altes Wetter
  (MagicMirror-Standard) und altes Regenradar (MMM-RainRadarDWD).

## Schritte

1. **Ordnen und benennen:** Bereiche und Namen, Wetter auf einer Seite,
   Sprüche/Kalender zu Bildschirm, Ort zu Einstellungen, ausgeschaltete Module
   ausblenden, Start neu, Alarm-Aktionskacheln, ersetzte Module entfernen.
2. **Bildschirm-Übersicht:** Bild in echter Größe, Zahnrad je Modul, Ziehen mit
   Einrasten, Überschneidungen.
3. **Eine Speicherart:** Speichern-Knöpfe weg, Rückgängig, Neustart-Leiste.

Später: Seiten der einzelnen Module (gemeinsame Vorlage), Familien-Menü neu,
Konten je Mitglied, Suche, Szenen.
