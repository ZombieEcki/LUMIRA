# MMM-FamilyPlan

Familienplan für LUMIRA: zeigt auf dem Spiegel, wer diese Woche welche Dienste
hat (Garten, Tisch, Bad, Müll …). Die Verteilung rotiert jede Woche
automatisch und fair. Gepflegt wird alles im LUMIRA-Portal unter
**Familienplan** (`http://lumira.local:8092`), ohne SSH und ohne `config.js`
von Hand anzufassen.

Konzept und Hintergründe: [concept/familienplan.md](../../concept/familienplan.md).

## So funktioniert es

```
LUMIRA-Portal ──schreibt──► ~/.lumira/familyplan.json ──liest (fs.watch)──► MMM-FamilyPlan
```

- **Nur das Portal schreibt** die Datei und rechnet die Rotation
  (`lumira-portal/lib/familyplan-rotation.js`). Das Modul liest nur und zeigt
  die laufende Woche an.
- Änderungen im Portal erscheinen nach 1–2 Sekunden auf dem Spiegel, ohne
  MagicMirror-Neustart.
- Kurz nach Mitternacht liest das Modul neu ein, damit ein Wochenwechsel auch
  ohne Dateiänderung sichtbar wird.
- Läuft das Portal einmal nicht, zeigt das Modul die letzte Woche weiter und
  markiert sie als „Vorwoche“, statt Falsches als aktuell auszugeben.

## Einbindung

Auf einem LUMIRA-Gerät nicht von Hand: Im Portal unter
*Familienplan → Übersicht → Auf dem Spiegel* einschalten. Das erzeugt diesen
Eintrag in der `config.js` (direkt nach der Uhr, damit er in `top_left` unter
ihr steht):

```js
{
	module: "MMM-FamilyPlan",
	position: "top_left",
	config: {
		maxWidth: "300px",      // Breite des Bereichs (wie der bisherige)
		layout: "stacked",      // "stacked" = Dienste untereinander, "inline" = nebeneinander
		showHeader: true,
		showWeekRange: true,
		hideOnAlarmPhases: [1]  // nur Fire/Rescue: beim akuten Alarm ausblenden
	}
}
```

| Option | Standard | Bedeutung |
|--------|----------|-----------|
| `maxWidth` | `"300px"` | feste Breite des Bereichs |
| `layout` | `"stacked"` | `"stacked"` oder `"inline"` |
| `showHeader` | `true` | Überschrift („Unser Familienplan“, im Portal änderbar) |
| `showWeekRange` | `true` | Zeile „KW 28 (06.07. – 12.07.2026)“ |
| `avatarSize` | `40` | Avatar-Größe in Pixeln |
| `fadeSpeed` | `1000` | Überblendzeit bei Änderungen (ms) |
| `hideOnAlarmPhases` | `[]` | Alarmphasen von MMM-aPagerAlarm, in denen das Modul ausgeblendet wird |

## Avatare

- **Mitgelieferte Avatare** liegen in `avatars/` (`adult-01` … `adult-09`,
  `child-01` … `child-09`, je 256 × 256 px JPG, zusammen etwa 225 KB). Sie
  sind aus den Originalen in [`media/avatars/`](../../media/avatars)
  verkleinert, damit der Pi 3 nicht unnötig große Bilder lädt. Das Portal
  liest die Auswahl-Galerie aus demselben Ordner.
- **Eigene Fotos** lädt man im Portal hoch. Sie liegen in
  `~/.lumira/familyplan/avatars/` (überleben Updates) und werden vom
  MagicMirror-Server unter `/MMM-FamilyPlan/uploads/` ausgeliefert.
- Ohne Avatar zeigt das Modul den Anfangsbuchstaben in der Farbe der Person.

Neue Originale in `media/avatars/` ablegen und neu verkleinern (256 px,
JPG-Qualität 85), z. B. mit ImageMagick:

```bash
for f in media/avatars/*.png; do
  convert "$f" -resize 256x256 -quality 85 "modules/MMM-FamilyPlan/avatars/$(basename "${f%.png}").jpg"
done
```

## Für andere Module

Nach jedem Update sendet das Modul die Notification `FAMILYPLAN_UPDATE`:

```js
{ weekStart: "2026-07-06", assignments: [{ member: "Maja", duties: ["Tischdienst", "Bodendienst"] }, …] }
```

## Sicherheit

Namen und Dienstnamen landen nur per `textContent` im DOM, Symbolnamen werden
gegen `^[a-z0-9-]+$` geprüft (das Portal lässt ohnehin nur eine feste
Symbol-Liste zu), Farben nur als `#RRGGBB`.

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| Spiegel zeigt „Wird im LUMIRA-Portal eingerichtet.“ | Im Portal unter *Familienmitglieder* die Familie anlegen. Die erste Woche entsteht dann automatisch. |
| KW-Zeile ist grau mit „Vorwoche“ | Das Portal hat die neue Woche nicht angelegt: `sudo systemctl status lumira-portal`, Uhrzeit prüfen (`timedatectl`), Auto-Rotation im Portal an? |
| Symbole fehlen | MagicMirror bringt Font Awesome mit. Bei sehr alten MagicMirror-Versionen fehlen einzelne neuere Symbole – im Portal ein anderes Symbol wählen. |
| Änderungen kommen nicht an | `pm2 logs MagicMirror` auf Meldungen von `MMM-FamilyPlan` prüfen. Ist `~/.lumira/familyplan.json` gültiges JSON? Backups liegen in `~/.lumira/backups/familyplan.*.json`. |
