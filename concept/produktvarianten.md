# LUMIRA – Konzept: Produktvarianten (Editionen)

Wie die fünf LUMIRA-Editionen zustande kommen, und warum ein Gerät immer nur
**eine** davon ist.

> Status: Konzept fertig, Umsetzung offen. Siehe [CHECKLIST.md](../CHECKLIST.md).
> Verwandt: [konfigurator.html](../konfigurator.html) (zeigt die Editions-Auswahl
> bereits im Prototyp), [selfservice.md](selfservice.md) (Kunden-Konfiguration
> **innerhalb** einer bereits feststehenden Edition), [`version/`](../version/)
> (Basis-Vorlagen je Edition für die manuelle Grundinstallation).

---

## 1. Grundprinzip

**Die Edition ist eine Installations-Entscheidung, kein Laufzeit-Schalter,
und wird manuell festgelegt – nicht vom Kunden.**

Wir (LUMIRA) nehmen die **Grundinstallation** eines Geräts manuell vor und
legen dabei **eine** Edition fest (siehe [`version/`](../version/)). Diese
legt fest, welche Module aktiv sind und mit welchen Standardwerten/Texten sie
starten. Danach verhält sich das Gerät wie ein fertiges Produkt dieser
Edition — vergleichbar mit einem gekauften Gerätemodell, nicht mit einer
Einstellung, die man mal eben im Menü umschaltet.

Der Kunde bekommt die Edition-Entscheidung gar nicht zu sehen: Er
konfiguriert anschließend nur noch **seine** Daten (Name, Standort, Kalender,
WLAN …) per Captive Portal/Web – siehe [selfservice.md](selfservice.md).

Einzelne Werte (Name, Farben, Texte) bleiben natürlich weiterhin frei
änderbar — nur der **Grundzuschnitt** (welche Module überhaupt laufen) ist
mit der Edition festgelegt.

> Ein Wechsel der Edition auf einem bestehenden Gerät ist technisch über
> `./install.sh --reconfigure` möglich (einfach eine andere Edition wählen),
> ist aber kein vorgesehener Alltags-Workflow, sondern eher der Ausnahmefall
> „das Gerät bekommt eine neue Aufgabe".

---

## 2. Die fünf Editionen

| Edition | Zielgruppe | Alarmierung | Kern-Module |
|---------|-----------|:---:|-------------|
| 🏡 **LUMIRA Home** | Familien | aus | Uhr, Wetter, Kalender, News, SmartCompliments |
| 🚒 **LUMIRA Fire** | Freiwillige Feuerwehr | an | + MMM-aPagerAlarm (Profil „Feuerwehr") |
| 🚑 **LUMIRA Rescue** | Rettungsdienst | an | + MMM-aPagerAlarm (Profil „Rettungsdienst") |
| 💼 **LUMIRA Business** | Unternehmen, Büros | aus | Uhr, Wetter, News – ohne Familien-Inhalte |
| 🚨 **LUMIRA Station** | Gerätehäuser/Wachen | an | Dauer-Anzeige, kein Familienmodus |

Home/Fire/Rescue/Business existieren als Auswahl bereits im
`konfigurator.html`-Prototyp. Station ist die am wenigsten spezifizierte
Edition (siehe Abschnitt 4).

---

## 3. Wie eine Edition technisch entsteht

Eine Edition ist eine **Vorlage** (Bundle aus Modul-Auswahl + Textprofil),
keine eigene Codebasis. Im geplanten `settings.json → config.js`-Generator
(siehe [selfservice.md](selfservice.md)) bekommt jede Edition eine feste Zuordnung:

```
edition: "home" | "fire" | "rescue" | "business" | "station"
    │
    ├── welche Module werden überhaupt in die config.js geschrieben
    │   (z. B. MMM-aPagerAlarm nur bei fire/rescue/station)
    │
    └── welche Text-/Farbwerte die Module als Standard bekommen
        (z. B. title, personLabel – siehe Zielgruppen-Profile)
```

Für Home/Business gilt heute schon: Das Alarmmodul wird im Konfigurator
einfach **nicht** in die Config aufgenommen. Ein sauberer Zusatz wäre eine
`enabled`-Option direkt im Modul (siehe [CHECKLIST.md](CHECKLIST.md) Punkt 4,
„Alarm abschaltbar") – dann ließe sich Alarm auch nachträglich per Schalter
aus-/einschalten, ohne die Edition selbst zu wechseln.

---

## 4. Ideen je Edition

Bewusst knapp gehalten – das sind Denkanstöße, keine Zusagen oder Spezifikationen.

**🏡 Home**
- Foto-Slideshow der Familie als Hintergrund (siehe Hintergrund-Idee)
- Einfache Einkaufsliste/Speiseplan als weiteres Familienmodul

**🚒 Fire**
- Kurze Monatsstatistik „X Einsätze diesen Monat" auf der Rückkehr-Karte
- Später: Verfügbarkeits-/Status-Anzeige, falls eine Melde-App das per Webhook liefert

**🚑 Rescue**
- Gleiche Basis wie Fire, eigene Farbe/Begriffe (siehe Zielgruppen-Profile)
- Schichtübergabe-Hinweis als optionale Zusatzzeile

**💼 Business**
- Eigenes Firmenlogo statt Familienfoto im Hintergrund
- Kalender zeigt Meetingräume/Termine statt Familientermine

**🚨 Station**
- Reine Einsatz-/Infowand, kein SmartCompliments-Familienmodus
- Optionale Verfügbarkeitstafel (Mannschaftsstärke), manuell pflegbar

---

## 5. Wo die Edition gewählt wird

**Ausschließlich bei der manuellen Grundinstallation durch uns** – nicht vom
Kunden, nicht per Wizard-Frage, nicht im Self-Service-Portal.

Ablauf: Zur bestellten Edition gehört eine fertige Vorlage unter
[`version/<edition>/config.js.sample`](../version/) (z. B. `version/fire/`).
Bei der Grundinstallation eines Geräts wird `install.sh` wie gewohnt
ausgeführt, anschließend die passende Vorlage aus `version/<edition>/` als
`config.js` eingesetzt (statt der generischen Wurzel-Vorlage). Damit ist die
Edition festgelegt, **bevor** das Gerät an den Kunden geht.

Der Kunde selbst sieht später nur noch den Self-Service-Teil
([selfservice.md](selfservice.md)) – dort taucht „Edition" als Begriff gar
nicht auf, das Portal zeigt nur die Felder, die zur bereits eingebauten
Edition passen.

> Optionaler Komfort für uns intern: `install.sh` könnte künftig ein Flag
> `--edition=fire` bekommen, das automatisch die passende Vorlage aus
> `version/` einsetzt, statt sie manuell zu kopieren. Das bleibt aber ein
> internes Werkzeug für die Grundinstallation, kein kundenseitiger Schalter.

Alle Editions-Vorlagen unter `version/` bleiben die **eine** Stelle, an der
„was gehört zu welcher Edition" gepflegt wird.
