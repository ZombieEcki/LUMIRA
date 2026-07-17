# LUMIRA – Konzept: Selbstkonfiguration ohne SSH

Wie ein Kunde LUMIRA **einrichtet und später ändert**, ohne je ein Terminal
zu öffnen. Der Pi spannt bei Bedarf ein eigenes WLAN auf; alle Einstellungen
laufen über eine Web-Oberfläche.

> Status: Konzept fertig, Umsetzung offen. Siehe [CHECKLIST.md](../CHECKLIST.md).
> Verwandt: [MMM-SmartCompliments](../modules/MMM-SmartCompliments),
> [konfigurator.html](../konfigurator.html) (Ersteinrichtungs-Vorstufe) und
> [portal.html](../portal.html) (Vorschau des dauerhaften Steuerungs- &amp;
> Konfigurationsportals aus Abschnitt 4a) – beide laufen heute browserseitig
> ohne echtes Backend. [produktvarianten.md](produktvarianten.md).

---

## 0. Abgrenzung zur Grundinstallation

Dieses Konzept deckt **nur die Kunden-Konfiguration** ab (Standort, Kalender,
Name, WLAN …) – **nicht** die Wahl der Edition (Home/Fire/Rescue/Business/
Station). Die Edition wird vorher im Rahmen der **manuellen Grundinstallation**
festgelegt (siehe [`version/`](../version/) und
[produktvarianten.md](produktvarianten.md)). Das hier beschriebene Portal
startet also immer auf einem Gerät, dessen Edition bereits feststeht.

## 1. Zielbild

Zwei Abläufe, ein System:

| Ablauf | Wann | Ohne SSH möglich? |
|--------|------|--------------------|
| **Ersteinrichtung** | Erstes Einschalten, noch kein WLAN hinterlegt | ✅ über eigenes Setup-WLAN |
| **Weitere Konfiguration** | Jederzeit danach (Texte ändern, Geburtstag ergänzen, WLAN wechseln …) | ✅ über die im Heimnetz laufende Web-Oberfläche, WLAN-Wechsel automatisch über Rückfall in den Setup-Modus |

Kernidee: Es gibt **einen** Web-Konfigurator, der in zwei Kontexten läuft —
einmal als eigenes WLAN (`LUMIRA-Setup`), einmal ganz normal im Heimnetz
erreichbar (`http://lumira.local:8092`). Beide Male dieselbe Oberfläche,
derselbe Code.

---

## 2. Betriebsmodi (Zustandsmaschine des Pi)

```
                    ┌────────────────────────────┐
                    │   FAMILY  (Normalbetrieb)   │
                    │  im Heimnetz verbunden      │
                    │  Portal läuft im Hintergrund│
                    │  (nur im LAN erreichbar)    │
                    └───────────────┬─────────────┘
                                    │
                 WLAN >10 Min nicht erreichbar
                 ODER Kunde klickt "WLAN ändern"
                                    │
                                    ▼
                    ┌────────────────────────────┐
              ┌────▶│    SETUP  (Access Point)    │
              │     │  Pi sendet eigenes WLAN     │
              │     │  "LUMIRA-Setup" aus         │
              │     │  Mirror zeigt Anleitung     │
              │     │  Portal unter 192.168.4.1   │
              │     └───────────────┬─────────────┘
              │                     │
              │        Kunde trägt Heimnetz-WLAN
              │        + Zugangsdaten im Portal ein
              │                     │
              │                     ▼
              │     ┌────────────────────────────┐
              │     │  Testverbindung zum WLAN     │
              │     └───────────────┬─────────────┘
              │                     │
      Verbindung fehlgeschlagen     │  Verbindung erfolgreich
              │                     ▼
              └─────────  settings.json schreiben,
                           config.js erzeugen,
                           AP beenden, WLAN aktiv,
                           MagicMirror neu starten
                                    │
                                    ▼
                            zurück zu FAMILY
```

**Wichtig:** Der Rückfall von `FAMILY` nach `SETUP` passiert **automatisch**,
sobald die WLAN-Verbindung länger ausfällt (z. B. neuer Router, geändertes
Passwort, Umzug) — der Kunde muss dafür nichts tun außer sich mit dem dann
wieder erscheinenden `LUMIRA-Setup`-WLAN zu verbinden.

---

## 3. Ersteinrichtung – Schritt für Schritt (Kundensicht)

1. **Erstes Einschalten.** Der Pi hat noch keine WLAN-Zugangsdaten → er
   erkennt das beim Boot (kein bekanntes Netz in Reichweite) und startet
   direkt im **SETUP**-Modus.
2. **Der Spiegel zeigt eine Anleitung** (großformatig, da ja noch nichts
   anderes konfiguriert ist – siehe Abschnitt 5):
   > „Verbinde dich mit dem WLAN **LUMIRA-Setup** (Passwort: siehe Karton)
   > und öffne anschließend **lumira.local** in deinem Browser."
   Optional zusätzlich ein QR-Code, der das Handy direkt mit dem WLAN
   verbindet (WIFI-QR-Format, kein Tippen nötig).
3. **Kunde verbindet sein Handy** mit `LUMIRA-Setup`.
4. **Captive Portal öffnet sich automatisch** (iOS/Android erkennen das
   WLAN als „ohne Internet" und bieten von selbst die Anmeldeseite an) –
   alternativ ruft der Kunde `lumira.local` manuell auf.
5. **Portal Schritt 1 – Heimnetz:** Liste der in Reichweite gefundenen
   WLANs (Scan), Auswahl + Passwort eingeben.
6. **Portal Schritt 2 – Persönliches:** die Felder, die zur bereits fest-
   stehenden Edition passen (siehe Abschnitt 0) – Name, Standort, Kalender-URL,
   Nachrichten-Feed, Geburtstage, bei Fire/Rescue/Station zusätzlich
   Home-Assistant-Webhook (optional). Dieselben Felder wie im heutigen
   `konfigurator.html`-Prototyp, nur ohne die dortige Editions-Auswahl.
7. **„Einrichten" klicken.** Das Portal testet die WLAN-Verbindung im
   Hintergrund (ohne den Pi sofort umzuschalten, damit man bei Fehlern
   nicht ausgesperrt ist).
8. **Erfolgreich:** `settings.json` wird geschrieben, daraus die `config.js`
   erzeugt, der Access Point wird beendet, der Pi verbindet sich mit dem
   Heimnetz, MagicMirror startet neu → normaler Betrieb.
9. **Fehlgeschlagen** (falsches Passwort, Netz nicht erreichbar): Fehlermeldung
   direkt im Portal, Pi bleibt im `SETUP`-Modus, Kunde kann es sofort erneut
   versuchen – kein Neustart nötig.

---

## 4. Weitere Konfiguration – die zwei Wege

### a) Normale Einstellungen (Name, Kalender, Sprüche, Geburtstage …)

Läuft **ohne** erneuten Setup-Modus. Das Portal bleibt nach der Ersteinrichtung
dauerhaft im Hintergrund aktiv und ist **im Heimnetz** jederzeit erreichbar.
Eine mehrseitige Vorschau dieses Portals (Steuerung + Konfigurationsseiten,
passt sich automatisch an die installierte Edition an) liegt als Prototyp in
[portal.html](../portal.html):

```
http://lumira.local:8092
```

Kunde ruft die Adresse vom Handy/PC im selben WLAN auf, ändert Werte,
klickt „Speichern" → `config.js` wird neu erzeugt, MagicMirror startet neu.
Kein SSH, kein erneutes WLAN nötig.

### b) WLAN ändern (Umzug, neuer Router, neues Passwort)

Zwei Auslöser, beide ohne SSH:

- **Automatisch:** Der Pi bemerkt, dass er das Heimnetz nicht mehr erreicht
  (z. B. 10 Minuten ohne Verbindung) und fällt von selbst zurück in den
  `SETUP`-Modus → gleicher Ablauf wie die Ersteinrichtung (Schritt 5–9).
- **Manuell/vorausschauend:** Solange das Portal noch im alten Heimnetz
  erreichbar ist, gibt es dort einen Button **„WLAN ändern"**, der den
  `SETUP`-Modus sofort auslöst (z. B. wenn der Kunde weiß, dass gerade ein
  neuer Router kommt, bevor die Verbindung tatsächlich abbricht).

---

## 5. Anzeige auf dem Spiegel selbst

Ein schlankes, neues Mini-Modul (Arbeitsname **`MMM-LumiraStatus`**) mit
zwei völlig unterschiedlichen Erscheinungsbildern je nach Betriebsmodus:

### Im SETUP-Modus (Ersteinrichtung oder WLAN-Rückfall)

Darf hier bewusst **groß und freundlich** sein – es läuft ja ohnehin (noch)
nichts anderes auf dem Spiegel:

```
┌──────────────────────────────────────┐
│                                        │
│         📶  LUMIRA einrichten          │
│                                        │
│   1. Verbinde dich mit dem WLAN:       │
│      LUMIRA-Setup                      │
│                                        │
│   2. Öffne im Browser:                 │
│      lumira.local                      │
│                                        │
│         [ QR-Code fürs WLAN ]          │
│                                        │
└──────────────────────────────────────┘
```

### Im Normalbetrieb (FAMILY)

Nur eine **sehr kleine, dezente Zeile** in einer Ecke (z. B. `bottom_right`),
kleine Schrift, gedämpfte Farbe – damit sie die Familienansicht nicht stört,
aber jederzeit auffindbar bleibt, falls jemand die Adresse braucht:

```
                                          ⚙ lumira.local
```

Per Config abschaltbar (`showStatusHint: false`), für alle, die auch das
nicht sehen wollen.

---

## 6. Sicherheit

- **Setup-WLAN-Passwort** individuell pro Gerät (nicht bei allen LUMIRA-
  Geräten gleich) – z. B. zufällig beim Ersteinrichten erzeugt und auf dem
  Spiegel angezeigt, oder ab Werk auf einem Aufkleber am Gehäuse.
- **PIN-Schutz fürs Portal**, sobald es dauerhaft im Heimnetz erreichbar ist
  (Abschnitt 4a) – verhindert, dass jedes Gerät im WLAN mitkonfigurieren kann.
- Portal ist **ausschließlich im LAN/AP** erreichbar, keine Portweiterleitung
  nötig oder empfohlen.
- Eingaben werden validiert (Koordinaten, URLs); vor jedem Speichern wird
  die vorherige `settings.json` gesichert.

---

## 7. Technischer Unterbau (Kurzfassung)

Eine strukturierte `settings.json` ist die einzige Wahrheit; daraus wird die
`config.js` per gemeinsamem Node-Modul generiert – sowohl vom Portal als auch
vom heutigen `install.sh`-Wizard nutzbar:

```
[Web-Portal]  +  [install.sh-Wizard]  →  settings.json  →  generate-config.js  →  config.js
```

| Baustein | Werkzeug | Warum |
|----------|----------|-------|
| Access Point | `nmcli … hotspot` (NetworkManager) | Bookworm-Standard, kein manuelles hostapd/dnsmasq |
| WLAN-Scan/-Verbindung | `nmcli dev wifi …` | robust, scriptbar |
| Captive-Portal-Redirect | dnsmasq-Wildcard + Express-Catch-all | öffnet sich von selbst auf dem Handy |
| Web-Portal | Node.js + Express, Port **8092** | schon im Projekt-Stack vorhanden |
| Boot-Entscheidung & Watchdog | systemd-Dienst `lumira-provision` | prüft Konnektivität, schaltet AP/FAMILY um |
| Autostart | pm2 (wie MagicMirror selbst) | bereits etabliertes Muster im Projekt |

Geplante Repo-Struktur:

```
LUMIRA/
├── lumira-portal/
│   ├── server.js              Express-Portal (Setup- und Heimnetz-Modus)
│   ├── lib/
│   │   ├── generate-config.js settings.json → config.js  (geteilt mit install.sh)
│   │   ├── settings.js        laden/speichern/validieren
│   │   └── net.js             nmcli-Wrapper (AP, Scan, Connect, Watchdog)
│   ├── public/                Formular-Oberfläche (Basis: konfigurator.html)
│   └── systemd/
│       ├── lumira-portal.service
│       └── lumira-provision.service
├── modules/
│   └── MMM-LumiraStatus/      neues Mini-Modul (Abschnitt 5)
├── version/<edition>/         Basis-Vorlage je Edition (siehe produktvarianten.md) –
│                               Ausgangspunkt für generate-config.js, NICHT Teil
│                               des Kunden-Portals
└── settings.default.json
```

---

## 8. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|-------|--------|----------|
| **1** | Web-Portal ohne AP (nur im Heimnetz, Port 8092) | Deckt Abschnitt 4a bereits vollständig ab |
| **2** | AP-Modus (`nmcli hotspot`, feste IP 192.168.4.1) | Pi kann eigenes WLAN aufspannen |
| **3** | Captive Portal + WLAN-Onboarding (Scan, Connect, Test) | Deckt Abschnitt 3 (Ersteinrichtung) ab |
| **4** | Boot-/Watchdog-Logik (`lumira-provision`) | Automatischer Rückfall aus Abschnitt 4b |
| **5** | `MMM-LumiraStatus`-Mini-Modul | Deckt Abschnitt 5 (Anzeige auf dem Spiegel) ab |
| **6** | Sicherheit & Feinschliff (PIN, individuelles AP-Passwort, Validierung) | Abschnitt 6 |
| **7** | Integration in `install.sh` (Portal + Provisioning mitinstallieren) | Ein-Befehl-Setup bleibt erhalten |

**Empfohlener Start: Phase 1** – bringt sofort echten Nutzen (Selbstkonfiguration
im Heimnetz ohne SSH) und ist die Grundlage für alle weiteren Phasen.

---

## 9. Offene Entscheidungen

- **QR-Code-Erzeugung**: rein lokal (kein Internet nötig), z. B. mit einem
  kleinen Node-Paket (`qrcode`), serverseitig als Bild ausgeliefert.
- **AP-Passwort-Vergabe**: zufällig pro Gerät beim ersten Boot generiert und
  angezeigt, oder ab Werk fester Aufkleber? (Zufällig ist sicherer, Aufkleber
  ist für den Kunden greifbarer.)
- **`MMM-LumiraStatus` eigenständig oder Teil von `MMM-SmartCompliments`?**
  Empfehlung: eigenes, sehr leichtgewichtiges Modul – sauberer getrennt,
  bleibt auch nutzbar, falls SmartCompliments deaktiviert ist.
