# LUMIRA – Konzept: Design-System 2.0 und mobile Version

Wie das Portal (und in zweiter Linie Landingpage, Konfigurator und Spiegel)
optisch und in der Bedienung auf einen neuen Standard kommt – mit einer
eigenen, echten Handy-Version statt einer zusammengeschobenen Desktop-Seite.

> Status: **Stilrichtung „Bento“ (2a) im Portal umgesetzt** (Rahmen mit Icon-
> Leiste/Tab-Leiste, fünf Bereiche, neue Startseite, Hell/Dunkel/Auto, Symbole
> statt Emojis, alle Seiten im neuen Look) sowie Logos, Favicon, App-Icons und
> Web-Manifest. Offen aus Phase B: eigene Dialoge statt `confirm()`, Fehler am
> Feld, Snackbar mit „Rückgängig“; Schrift Manrope lokal (Download nötig);
> Phase E (Spiegel, statische Seiten). Siehe
> [CHECKLIST.md](../CHECKLIST.md).
> Verwandt: [selfservice.md](selfservice.md) (Portal),
> [familienplan.md](familienplan.md), [produktvarianten.md](produktvarianten.md)
> (Editionen bestimmen, was sichtbar ist).

---

## 0. Ausgangslage

Das Portal ist funktional vollständig, wirkt aber wie ein gewachsenes
Werkzeug:

| Bereich | Heute | Problem |
|---------|-------|---------|
| Handy | Seitenleiste wird oben gestapelt: Logo, Gerätekarte, Seiten-Dropdown | Der erste Bildschirm zeigt kaum Inhalt, Navigation per Dropdown ist umständlich |
| Navigation | 11 gleichrangige Menüpunkte | Keine Gruppierung nach dem, was die Familie tun will |
| Farben | Rot (#E5322C) für Haupt-Buttons | Rot steht bei LUMIRA für **Alarm**. Ein roter „Speichern“-Knopf verwässert das Signal |
| Symbole | Emojis (🎛 👪 📍 …) | Sehen auf Android, iOS, Windows und dem Pi jeweils anders aus |
| Rückfragen | Browser-`confirm()` | Wirkt fremd, auf dem Handy oft abgeschnitten, nicht gestaltbar |
| Speichern | Mal pro Karte, mal pro Seite, mal sofort | Uneinheitlich: Wann ist etwas gespeichert, wann startet der Spiegel neu? |
| Fehler | Text neben dem Speichern-Knopf | Die API liefert das betroffene Feld (`field`), angezeigt wird es nicht am Feld |
| Eingabefelder | 15 px Schrift | iOS zoomt bei Feldern unter 16 px automatisch hinein |
| Gestaltung | Tokens je Datei kopiert (Portal, index.html, konfigurator.html, portal.html) | Jede Änderung muss viermal gemacht werden |

Neu dazugekommen ist das Logo mit einer klaren Farbwelt (Abschnitt 2). Das
ist der Ausgangspunkt für alles Weitere.

## 1. Leitidee und Prinzipien

**„Ruhig wie ein Spiegel, eindeutig wie ein Melder.“**

1. **Familie zuerst.** Freundlich, warm, ohne Technik-Sprache. Die meisten
   Besuche kommen vom Handy – oft aus der Küche, mit einer Hand.
2. **Rot gehört dem Alarm.** Rot (Flamme) wird nur für Alarm, Fehler und
   Unumkehrbares benutzt. Haupt-Aktionen bekommen Amber, die warme
   Logo-Farbe.
3. **Mobile first, Desktop großzügig.** Entworfen wird zuerst für 375 px
   Breite. Der Desktop bekommt mehr Raum, keine andere Logik.
4. **Ein System für alles.** Portal, Landingpage, Konfigurator und Spiegel
   teilen Farben, Schrift, Symbole und Tonfall.
5. **Pi-tauglich und offline.** Kein Framework, kein Build-Schritt, keine
   externen Fonts oder CDNs. Das Portal läuft im Heimnetz und im
   Setup-WLAN ohne Internet.
6. **Sicherheit sichtbar machen.** Was den Spiegel neu startet, was sofort
   wirkt und was erst nächste Woche gilt, steht immer direkt dabei.

## 2. Marke

### 2.1 Logo-Dateien (bereits umgesetzt)

Aus den Originalen in [`media/logos/`](../media/logos) sind schlanke
Web-Versionen erzeugt (Portal: `lumira-portal/public/img/`, statische Seiten:
`media/logos/web/`):

| Datei | Inhalt | Einsatz |
|-------|--------|---------|
| `logo-light.png` / `logo-dark.png` | Haus + Schriftzug + Claim | Login, Einrichtung, Info, Landingpage |
| `mark-light.png` / `mark-dark.png` | nur Haus-Zeichen | Seitenleiste, App-Bar, Konfigurator |
| `wordmark-light.png` / `wordmark-dark.png` | nur „LUMIRA“ | neben dem Zeichen |
| `favicon-64.png`, `apple-touch-icon.png`, `icon-192/512.png` | Zeichen auf Dunkelblau | Browser-Tab, Startbildschirm |

`light` = helle Schrift für dunklen Grund, `dark` = dunkle Schrift für hellen
Grund. Das Portal wählt per `<picture>` und `prefers-color-scheme`, die
statischen Seiten per CSS passend zu ihrem Hell/Dunkel-Schalter.

### 2.2 Regeln

- **Schutzzone:** rundum mindestens die Höhe des Herz-Symbols frei.
- **Mindestgröße:** komplettes Logo ab 120 px Breite, darunter nur das Zeichen
  (ab 24 px) oder das Zeichen + Schriftzug ohne Claim.
- **Nicht:** einfärben, verzerren, auf unruhige Fotos legen, den Claim
  ohne Schriftzug zeigen.
- **Claim im Text** darf die Logo-Farben tragen: **Familie.** (Amber)
  **Sicherheit.** (Flamme) **Verbunden.** (Signalblau) – wie bereits in der
  Seitenleiste.

### 2.3 Wunsch an die Gestaltung

Eine **SVG-Fassung** des Logos (Zeichen, Schriftzug, komplett). Die PNGs sind
mit 170 KB für das komplette Logo vertretbar, ein SVG wäre gestochen scharf
in jeder Größe und kleiner als 15 KB. Außerdem ließe sich das Zeichen dann
einfarbig darstellen (z. B. für den Spiegel im Alarmzustand).

## 2a. Stilrichtung „Bento“ (Entwurf nach Referenz)

Ein Entwurf nach einer Dashboard-Referenz (hell, monochrom, weiche weiße
Karten auf hellgrauem Grund, dunkle Icon-Leiste, Bento-Raster) liegt als
Design-Canvas vor: Desktop-Start sowie Start, Familienplan und Mehr am Handy,
klickbar (privat:
[LUMIRA Portal – Bento-Design](https://claude.ai/artifact/PnZmP499hFFF7cJnDsmTuz)).

| Thema | Bento-Variante | Abweichung zu Abschnitt 3 |
|-------|----------------|---------------------------|
| Grundton | fast reines Grau/Weiß bzw. Anthrazit, Karten-Radius 22–28 px, weiche Schatten | neutrales statt bläuliches Grau |
| Aktion | **Schwarz** (hell) bzw. **Weiß** (dunkel) für aktive Pillen, Schalter, Haupt-Buttons | statt Amber |
| Markenfarben | Amber nur für Hinweis-Punkte, Rot nur für Alarm (aktive Alarmphase), Dienstfarben als kleine Punkte | Logo-Farben sparsamer |
| Navigation | Desktop: dunkle Icon-Leiste (84 px) mit Logo-Zeichen; Handy: schwebende dunkle Tab-Leiste unten | wie 5.2, aber als „Pill“ |
| Startseite | Bento-Kacheln: Spiegel live, Alarmbereitschaft, Wetter, Familienbotschaften, „Gerade auf dem Spiegel“, Dein Spiegel (mit Alarmphasen-Auswahl), Netzwerk, Updates | konkretisiert 6. |

Beide Richtungen teilen Komponenten, Navigation und Technik, nur die
Farbrollen unterscheiden sich. Entscheidung siehe 13.6.

## 3. Design-Tokens

Eine Datei **`tokens.css`** als einzige Quelle (Abschnitt 11). Dunkel ist
Standard, Hell über `prefers-color-scheme` und optional einen Schalter.

### 3.1 Farben

**Markenfarben** (aus dem Logo gemessen):

| Token | Wert | Rolle |
|-------|------|-------|
| `--brand-navy` | `#0A203B` | Logo-Schrift, App-Icon-Grund, dunkle Flächen im Hellmodus |
| `--brand-amber` | `#FFA500` | **Primärfarbe**: Haupt-Aktionen, aktive Navigation, Familie |
| `--brand-flame` | `#FC372D` | **nur** Alarm, Fehler, Löschen |
| `--brand-signal` | `#3BA7F0` | Links, Info, Verbindung, „Verbunden.“ |
| `--brand-circuit` | `#80D0FF` | Akzent für Technik-Hinweise (sparsam) |

**Neutrale Töne** – leicht ins Dunkelblau gezogen statt neutral grau, damit
Logo und Oberfläche zusammengehören:

| Token | Dunkel | Hell |
|-------|--------|------|
| `--bg` | `#0B1018` | `#F6F4F0` |
| `--surface` | `#121925` | `#FFFFFF` |
| `--surface-2` | `#18212F` | `#F1EEE8` |
| `--field` | `#0F1520` | `#FFFFFF` |
| `--border` | `#243042` | `#E2DDD4` |
| `--ink` | `#F2F4F7` | `#121A26` |
| `--muted` | `#9AA6B8` | `#5A6576` |
| `--faint` | `#6A7689` | `#8A93A1` |

**Bedeutungsfarben:**

| Token | Dunkel | Hell | Einsatz |
|-------|--------|------|---------|
| `--ok` | `#46B676` | `#1F8A55` | gespeichert, verbunden, aktuell |
| `--warn` | `#F5B301` | `#A86F00` | Hinweis (immer mit Symbol, da nah an Amber) |
| `--danger` | `= --brand-flame` | `#D21E1A` | Fehler, Alarm, Löschen |
| `--info` | `= --brand-signal` | `#1A78BD` | Info-Banner, Links |

**Kontrast (WCAG 2.2 AA):** Navy-Text auf Amber 8,9 : 1, Amber auf `--bg`
dunkel 9,6 : 1, `--muted` auf `--surface` ≥ 4,6 : 1. Primär-Buttons: Amber mit
Navy-Schrift (nicht Weiß – Weiß auf Amber hat nur 2,0 : 1).

### 3.2 Schrift

- **UI-Schrift: Manrope** (Open Font License), geometrisch und freundlich,
  passt zur breiten Logo-Schrift, gute Umlaute. **Lokal ausgeliefert** als
  variable WOFF2 (Latin-Teilmenge, etwa 45 KB) aus `public/fonts/`, mit
  `font-display: swap` und System-Schrift als Rückfall.
- **Zahlen/Technik:** System-Monospace wie heute (IP, Versionen, Zeiten),
  immer mit `font-variant-numeric: tabular-nums`.
- **Grundgröße 16 px** (heute 15 px) – verhindert das automatische Zoomen
  von iOS bei Eingabefeldern und liest sich am Handy besser.

| Stufe | Größe / Zeilenhöhe | Einsatz |
|-------|--------------------|---------|
| `--fs-xs` | 12 / 16 | Zusatzinfos, Badges |
| `--fs-sm` | 14 / 20 | Hilfetexte, Tabellen |
| `--fs-md` | 16 / 24 | Fließtext, Eingaben |
| `--fs-lg` | 20 / 28 | Kartentitel |
| `--fs-xl` | 26 / 32 | Seitentitel (mobil) |
| `--fs-2xl` | 32 / 38 | Seitentitel (Desktop), Begrüßung |

### 3.3 Raster, Radien, Tiefe, Bewegung

- **Abstände** im 4-px-Raster: 4, 8, 12, 16, 24, 32, 48. Seitenrand mobil
  16 px, Desktop 32 px.
- **Radien:** 8 px (Felder, Buttons), 14 px (Karten), 22 px (Bottom-Sheets),
  rund (Pills, Avatare).
- **Tiefe:** Im Dunkelmodus über hellere Flächen statt Schatten, im Hellmodus
  ein weicher Schatten für Karten (`0 1px 2px` + `0 8px 24px` bei 6 %).
- **Bewegung:** 120 ms (Hover, Schalter), 200 ms (Sheets, Banner), 320 ms
  (Seitenwechsel mobil), Easing `cubic-bezier(.2,.8,.2,1)`. Bei
  `prefers-reduced-motion` nur Überblenden.

### 3.4 Symbole

Emojis werden durch **ein** Symbolset ersetzt: **Lucide** (ISC-Lizenz), etwa
35 Symbole als lokale SVG-Sprite-Datei (`public/icons.svg`, unter 25 KB),
eingebunden per `<svg><use href="icons.svg#home"/></svg>`. Gleiche Linie
überall, färbbar per `currentColor`, scharf auf jedem Gerät.
Die Dienst-Symbole des Familienplans bleiben bei Font Awesome, weil der
Spiegel sie genauso zeigt (Spiegel und Portal sollen gleich aussehen).

## 4. Komponenten

Jede Komponente gibt es einmal, in allen Seiten gleich. Mindestens
**44 × 44 px** Tippfläche.

| Komponente | Gestaltung | Verhalten |
|------------|-----------|-----------|
| **Button** | Primär (Amber/Navy), Sekundär (Fläche + Rand), Ghost (nur Text), Gefahr (Flamme) | Lade-Zustand mit Spinner im Button, kein Doppelklick |
| **Eingabefeld** | Beschriftung oben, Hilfetext unten, 16 px | Fehler direkt am Feld (die API liefert `field`), roter Rand + Text |
| **Schalter** | wie heute, Ein = `--ok` | wirkt sofort, mit Snackbar „Rückgängig“ |
| **Segment-Auswahl** | 2–4 Optionen nebeneinander | z. B. Darstellung, Paar-Modus |
| **Listenzeile** | Symbol · Titel · Wert/Status · Pfeil | Grundbaustein für Einstellungen (wie iOS/Android) |
| **Karte** | Titel, Inhalt, optional Fuß | eine Aufgabe pro Karte |
| **Status-Chip** | Punkt + Text (`ok`, `warn`, `danger`, `info`) | Netzwerk, Alarm, Updates |
| **Banner** | volle Breite, Symbol, Text, Aktion | Update verfügbar, Uhr falsch, Datei beschädigt |
| **Snackbar** | unten, über der Tab-Leiste | ersetzt den Toast, mit „Rückgängig“ wo möglich |
| **Dialog / Bottom-Sheet** | mobil von unten, Desktop zentriert | ersetzt `confirm()`, mit Fokus-Falle und Esc |
| **Leerer Zustand** | Illustration (Logo-Zeichen oder Avatare), ein Satz, eine Aktion | z. B. „Noch keine Familie angelegt“ |
| **Platzhalter beim Laden** | graue Balken in Inhaltsform | statt „Lädt …“ |
| **Reiter** | horizontal scrollbar, aktive Linie in Amber | Familienplan-Unterseiten |
| **Schritt-Anzeige** | Punkte + „Schritt 2 von 5“ | Einrichtung |
| **Neustart-Hinweis** | kleines Chip-Symbol „↻ Spiegel startet neu“ an Feldern | klärt vorher, was einen Neustart auslöst |

## 5. Navigation und Layout

### 5.1 Neue Struktur: fünf Bereiche statt elf Menüpunkte

| Bereich | Inhalt | Editionen |
|---------|--------|-----------|
| **Start** | Status von Spiegel und Netz, Schnellaktionen, „Diese Woche“ aus dem Familienplan, nächster Termin, Update-Banner | alle |
| **Familie** | Familienplan, Wichtige Termine, Sprüche, Mitglieder | Home, Fire, Rescue |
| **Spiegel** | Standort & Wetter, Kalender, Nachrichten, Module & Anordnung, Darstellung | alle |
| **Alarm** | Alarmierung, Testalarm, Home Assistant, Alarmton | Fire, Rescue, Station |
| **Mehr** | WLAN, Sicherheit (PIN), Updates, Datensicherung, Info | alle |

Die Editions-Flags aus `lib/editions.js` blenden ganze Bereiche aus. LUMIRA
Home hat damit vier Bereiche, Business ebenfalls (ohne Familie, mit
Spiegel/Mehr/Start).

### 5.2 Handy (< 640 px)

```
┌───────────────────────────────┐
│ (⌂) Familienplan        ● ⋯  │  App-Bar 56 px: Zeichen, Seitentitel, Status, Menü
├───────────────────────────────┤
│                               │
│   Inhalt                      │
│   (Karten, Listen)            │
│                               │
│ ┌───────────────────────────┐ │
│ │ Ungespeicherte Änderungen │ │  Aktionsleiste nur bei offenen Änderungen
│ │        [Verwerfen][Speich.]│ │
│ └───────────────────────────┘ │
├───────────────────────────────┤
│  ⌂     ♥     ▢     🔔    ⋯   │  Tab-Leiste 64 px + Safe-Area, Badge an „Mehr“
│ Start Familie Spiegel Alarm Mehr│
└───────────────────────────────┘
```

- **Tab-Leiste unten** (Daumenbereich), aktive Seite in Amber, Zähler-Badge
  (z. B. Updates an „Mehr“).
- **App-Bar oben** mit Zeichen und Seitentitel; beim Scrollen schrumpft der
  große Titel in die Leiste (wie bei iOS).
- **Unterseiten** (z. B. Familie → Wichtige Termine) öffnen sich als eigene
  Ansicht mit Zurück-Pfeil, nicht als langes Scrollen.
- **Safe-Areas** über `env(safe-area-inset-*)`, damit nichts unter Notch oder
  Home-Balken liegt.
- **Aktionsleiste** erscheint nur, wenn es ungespeicherte Änderungen gibt, und
  sitzt immer über der Tab-Leiste.

### 5.3 Tablet (640–1023 px)

Schmale Leiste links (72 px, nur Symbole mit Beschriftung darunter), Inhalt
einspaltig, max. 720 px breit.

### 5.4 Desktop (≥ 1024 px)

Seitenleiste 248 px mit Logo oben, den fünf Bereichen (aufklappbar mit
Unterseiten), Gerätestatus unten. Inhalt max. 960 px, wo sinnvoll zweispaltig
(z. B. Start: Status links, „Diese Woche“ rechts).

### 5.5 „Zum Startbildschirm“

Das Web-Manifest und die App-Icons sind schon da. Damit lässt sich das Portal
auf dem Handy als Symbol auf den Startbildschirm legen und öffnet ohne
Browser-Leiste.

Ehrliche Einschränkung: Das Portal läuft über `http://lumira.local`. Browser
erlauben Offline-Speicherung (Service Worker) und den automatischen
Installieren-Dialog von Android nur über HTTPS. iOS („Zum Home-Bildschirm“)
und das manuelle Hinzufügen bei Android funktionieren trotzdem. Eine Karte
unter „Mehr“ erklärt die zwei Handgriffe je System.

## 6. Seiten im neuen Design

| Seite | Neu |
|-------|-----|
| **Einrichtung** (Access Point) | Assistent in 5 Schritten: WLAN → PIN → Standort → Familie → Fertig. Großes Logo nur auf Schritt 1, danach Schritt-Anzeige. Nach dem WLAN-Wechsel automatischer Sprung ins Heimnetz (siehe offener Bug #1 in der Checkliste). |
| **Anmelden** | Logo (umgesetzt), PIN als vier große Kästchen mit Zifferntastatur (`inputmode="numeric"`), Fehler mit kurzem Schütteln. |
| **Start** | Begrüßung nach Tageszeit („Guten Abend!“, auf Wunsch mit Familienname), Status-Chips, bei Fire/Rescue die drei Alarm-Aktionen als große Kacheln, darunter „Diese Woche“ (Familienplan-Mini mit Avataren) und „Als Nächstes“ (nächster Geburtstag/Countdown). |
| **Familienplan** | Mobil: Wochen als wischbare Karten, Tippen auf einen Dienst öffnet ein Bottom-Sheet „Tauschen mit …“ mit Avataren. Mitglieder als Liste mit großen Avataren, Bearbeiten im Sheet. |
| **Wichtige Termine** | Sortiert nach „als Nächstes“ mit „in 3 Tagen“, Hinzufügen über ein Sheet mit Datumsauswahl statt Freitext. |
| **Sprüche** | Kategorien als Liste, Bearbeiten im eigenen Bildschirm, Vorschau „So sieht es auf dem Spiegel aus“. |
| **Spiegel** | Eine Vorschau des Spiegels mit den echten Regionen (heute nur schematisch), Module darin antippbar. |
| **Mehr → Updates** | Wie heute, aber als Listenzeilen mit Status-Chip; Protokoll im Sheet. |

## 7. Bedienung und Rückmeldung

- **Ein Speichern-Modell:**
  - Schalter wirken **sofort** (mit Snackbar „Rückgängig“).
  - Formulare speichern **gesammelt** über die Aktionsleiste, die nur bei
    offenen Änderungen erscheint. Beim Verlassen der Seite mit offenen
    Änderungen kommt eine Rückfrage.
- **Neustart vorher ankündigen:** Felder, deren Änderung MagicMirror neu
  startet, tragen das Chip „↻ Spiegel startet neu“. Nach dem Speichern zeigt
  ein Banner den Fortschritt („Spiegel startet neu … fertig“), dafür fragt das
  Portal den Status ab.
- **Fehler am Feld:** Die API liefert bei Validierungsfehlern `field` (z. B.
  `family.birthdays.2`). Das Portal markiert genau dieses Feld und scrollt
  dorthin.
- **Rückfragen** nur bei Unumkehrbarem, als eigener Dialog mit klarer Aktion
  („Woche neu verteilen“ statt „OK“). Löschen bekommt die Gefahrenfarbe.
- **Verbindung weg:** Ist das Portal nicht erreichbar (Pi startet neu, WLAN
  weg), erscheint oben ein Banner, Eingaben bleiben erhalten.
- **Leere Zustände** erklären den nächsten Schritt mit genau einer Aktion.

## 8. Barrierefreiheit

- Kontrast nach WCAG 2.2 AA für Text und Bedienelemente (Abschnitt 3.1).
- Tippflächen mindestens 44 × 44 px, Abstand zwischen Zielen mindestens 8 px.
- Sichtbarer Fokus (2 px Amber-Rand) für Tastatur-Bedienung.
- Symbol-Buttons immer mit `aria-label`; Status nie nur über Farbe (immer
  Symbol oder Text dazu).
- Schriftgrößen in `rem`, die Seite bleibt bis 200 % Zoom bedienbar.
- `prefers-reduced-motion` und `prefers-color-scheme` werden beachtet.

## 9. Der Spiegel in derselben Linie

Der Spiegel bleibt schwarz und ruhig, übernimmt aber Schrift und Farbwelt:

- **Schrift:** Manrope auch für die eigenen Module (MagicMirror lädt sie
  lokal aus dem Modulordner), Standardmodule behalten ihre Schrift.
- **Familienplan und Sprüche:** gleiche Pillen, Avatare und Claim-Farben wie
  im Portal.
- **Einrichtungs-Bildschirm** (`MMM-LumiraStatus`): komplettes Logo über der
  Anleitung und dem WLAN-QR-Code; der dezente Status-Hinweis zeigt das
  Logo-Zeichen.
- **Alarm** bleibt das einzige, was den Spiegel flächig rot färbt.
- **Lesbarkeit am Spiegel:** reines Schwarz, keine Schrift unter 18 px, keine
  dünnen Schnitte, keine Dauer-Animationen (Pi 3).

## 10. Landingpage, Konfigurator, Portal-Vorschau

`index.html`, `konfigurator.html` und `portal.html` binden schon die neuen
Logo-Dateien ein (umgesetzt, `index.html` ist dadurch von 351 KB auf 29 KB
geschrumpft). Im zweiten Schritt nutzen sie dieselbe `tokens.css` wie das
Portal, statt die Farben zu kopieren. `portal.html` wird zur lebenden
Komponenten-Übersicht („so sehen Buttons, Karten, Banner aus“).

## 11. Technische Umsetzung

**Weiter ohne Framework und Build-Schritt** – das Portal muss auf dem Pi
leicht bleiben und ohne Internet funktionieren.

```
lumira-portal/public/
├── tokens.css        // Farben, Schrift, Abstände – einzige Quelle (auch für die statischen Seiten)
├── base.css          // Reset, Typografie, Fokus, Safe-Areas
├── components.css    // Button, Feld, Karte, Banner, Snackbar, Sheet …
├── layout.css        // App-Bar, Tab-Leiste, Seitenleiste, Breakpoints
├── fonts/manrope.woff2
├── icons.svg         // Lucide-Sprite
├── ui.js             // Dialog/Sheet, Snackbar, Aktionsleiste, Feld-Fehler (kleine Helfer, kein Framework)
└── …                 // Seiten-Skripte wie heute (app.js, familyplan.js, updates.js)
```

- **Namensschema:** Komponenten mit Präfix (`c-btn`, `c-card`, `c-sheet`),
  Layout mit `l-` (`l-tabbar`), Zustände mit `is-` (`is-active`,
  `is-loading`). Kein Utility-Framework.
- **Statische Seiten** verlinken `lumira-portal/public/tokens.css` relativ –
  so gibt es die Werte genau einmal im Repo.
- **Hell/Dunkel:** Tokens unter `:root` (dunkel),
  `@media (prefers-color-scheme: light)` und `[data-theme]` für einen
  optionalen Schalter unter „Mehr“.
- **Routing mobil:** einfacher Hash-Router (`#/familie/termine`), damit
  Zurück-Taste und Lesezeichen funktionieren, ohne Seiten-Neuladen.
- **Leistungsbudget** (Pi 3 als Server, ältere Handys als Client):
  CSS < 40 KB, eigenes JS < 120 KB, Schrift < 50 KB, erster Seitenaufbau im
  Heimnetz unter 1 s.
- **Prüfen:** jede Seite in 375 px, 768 px und 1280 px, hell und dunkel, mit
  Tastatur; automatischer Kontrast-Check der Tokens als kleiner Test.

## 12. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|-------|--------|----------|
| **0** ✅ | Neue Logos, Favicon, App-Icons, Web-Manifest, statische Seiten mit neuem Logo | Marke sichtbar (erledigt) |
| **A** | `tokens.css`, Amber als Primärfarbe (Rot nur für Alarm/Fehler), Manrope lokal, 16 px Grundgröße, Lucide statt Emojis | sofort hochwertiger, ohne Strukturumbau |
| **B** | Komponenten: Buttons, Felder mit Fehlern am Feld, Dialog/Sheet statt `confirm()`, Snackbar, Banner, Leer- und Ladezustände | einheitliche Bedienung |
| **C** | Mobile Navigation: App-Bar, Tab-Leiste, fünf Bereiche, Hash-Router; Seitenleiste neu für Desktop | echte Handy-Version |
| **D** | Seiten: Start-Dashboard, Familienplan mobil (Wisch-Karten, Tausch-Sheet), Termine mit Datumsauswahl, Einrichtungs-Assistent | spürbar neuer Standard |
| **E** | Spiegel-Linie (Schrift, Einrichtungs-Bildschirm mit Logo), statische Seiten auf `tokens.css`, `portal.html` als Komponenten-Übersicht | alles aus einem Guss |

**Empfohlener Start: Phase A + B.** Das hebt den Eindruck sofort, ohne die
Seitenstruktur anzufassen. Danach Phase C als größter Schritt für das Handy.

## 13. Offene Entscheidungen

1. **Amber statt Rot als Primärfarbe?** Empfehlung: ja, Rot nur noch für
   Alarm und Fehler. Wirkt wärmer und hält das Alarmsignal eindeutig.
2. **Schrift:** Manrope lokal (empfohlen) oder bei der System-Schrift bleiben
   (null KB, aber auf jedem Gerät anders)?
3. **Fünf Bereiche** wie in 5.1 – passt die Einteilung, oder soll z. B.
   „Alarm“ bei Fire/Rescue unter „Start“ wandern?
4. **SVG-Logo:** Gibt es die Vektor-Quelle des Logos?
5. **Hell/Dunkel-Schalter** im Portal zusätzlich zur System-Einstellung?
6. **Stilrichtung:** „Bento“ (monochrom, Schwarz/Weiß als Aktionsfarbe,
   Abschnitt 2a) oder Marken-Variante (Amber als Aktionsfarbe, Abschnitt 3)?
