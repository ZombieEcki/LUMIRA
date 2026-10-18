# Benutzerkonten für Familienmitglieder

**Stand:** 18.10.2026 · **Status:** Idee, noch nicht umgesetzt

Jedes Familienmitglied bekommt ein eigenes Konto für das Portal. Erwachsene
verwalten das Gerät, Kinder sehen den Familienplan und können ihre Dienste
später selbst abhaken.

## Heute

- Das Portal kennt **eine** gemeinsame PIN (`settings.portal.pinHash`,
  4–8 Ziffern, gesalzen gehasht). Wer sie kennt, darf alles.
- Sitzungen liegen gehasht in `~/.lumira/sessions.json` (12 h oder
  „angemeldet bleiben“ 90 Tage), ohne Bezug zu einer Person.
- Familienmitglieder gibt es nur im Familienplan (`familyplan.json`), mit
  Rolle `adult` oder `child`, Name und Avatar. Sie haben keine Anmeldung.

## Ziel

| | Erwachsene | Kinder |
|---|---|---|
| Anmelden | eigenes Konto (Avatar antippen + PIN) | eigenes Konto (Avatar antippen + kurze PIN oder Bild-PIN) |
| Startseite | volle Startseite | „Meine Dienste heute / diese Woche“ |
| Familienplan | ansehen, bearbeiten, tauschen | ansehen; **eigene Dienste abhaken** (Phase 2) |
| Bildschirm, Alarm, Einstellungen | ja | nein (nicht in der Navigation) |
| Konten verwalten | ja | nein |

Grundsatz: **Was jemand nicht darf, sieht er nicht.** Kinder sehen keine
gesperrten Knöpfe, sondern eine eigene, schlanke Oberfläche.

## Modell

- Konto = Familienmitglied. Die Mitgliederliste bleibt die eine Quelle
  (heute in `familyplan.json`, später eigene `members.json`, gepflegt im
  überarbeiteten Familien-Overlay oben rechts).
- Pro Mitglied: `role` (`adult` | `child`, gibt es schon), `pinHash`/`pinSalt`
  (optional), `canLogin` (an/aus).
- Rechte leiten sich aus der Rolle ab, keine frei konfigurierbaren
  Rechte-Listen. Eine Rolle „Gast“ (nur ansehen) ist denkbar, aber nicht nötig.
- Sitzungen bekommen eine `memberId`. Jede schreibende Route prüft die Rolle
  (`requireAdult`), Kinder-Routen nur `requireMember` und die eigene `memberId`.

## Anmeldung

- Anmeldeseite zeigt die Avatare der Mitglieder mit Konto; Antippen → PIN.
- Erwachsene: PIN 4–8 Ziffern wie heute.
- Kinder: 4-stellige PIN oder Bild-PIN (drei Symbole in Reihenfolge) – einfach
  genug für Grundschulkinder, gut genug fürs Heimnetz.
- „Angemeldet bleiben“ pro Gerät wie heute (z. B. Kinder-Tablet).
- Übergang: Die bisherige gemeinsame PIN wird beim ersten Start zur PIN des
  ersten Erwachsenen; bis jemand Konten anlegt, bleibt alles wie heute.

## Abhaken (Phase 2)

- Kind hakt einen Dienst für **heute** ab; Erwachsene können das zurücknehmen.
- Gespeichert je Woche und Tag in `familyplan.json` (`done[dayKey][dutyId]`
  mit `memberId` und Zeit).
- Der Spiegel zeigt erledigte Dienste abgehakt (`MMM-FamilyPlan`).
- Damit ist auch der früher abgelehnte Aufgaben-Anlass für die Sprüche
  möglich („Alle Dienste erledigt!“), falls gewünscht.
- Fairness der Verteilung bleibt unverändert; „erledigt“ beeinflusst sie nicht.

## Sicherheit

- PINs nur gesalzen gehasht, Versuche begrenzen (wie heute pro Gerät).
- Kinder-Konten können keine Einstellungen ändern – auch nicht über die API
  (Prüfung auf dem Server, nicht nur in der Oberfläche).
- Erwachsene sehen unter Einstellungen → Sicherheit & Geräte, wer wo
  angemeldet ist, und können Sitzungen beenden.

## Offene Fragen

- Bild-PIN oder Ziffern-PIN für Kinder?
- Dürfen Kinder Dienste tauschen anfragen (Erwachsene bestätigen)?
- Soll der Spiegel selbst (Touch-Bildschirm) eine Kinder-Ansicht bekommen?

## Abhängigkeiten

- Neues Familien-Overlay (Mitglieder, Besondere Tage, Konten) – wird mit der
  Portal-Neuordnung überarbeitet.
- Portal-Neuordnung: Navigation blendet aus, was ein Konto nicht darf.
