# LUMIRA als App für Handy und PC – Ideen

> **Status:** Weg 1 umgesetzt (Oktober 2026), Weg 2 und 3 sind Ideen.
> Stand der Umsetzung in [CHECKLIST.md](../CHECKLIST.md), Roadmap-Punkt 13.

Die eigentliche LUMIRA bleibt der Raspberry Pi am Spiegel. Eine App ist die
Fernbedienung dafür und zeigt im Kern das Self-Service-Portal
(`lumira-portal`, Port 8092). Grundsatz bleibt: **alles lokal im Heimnetz**,
keine Cloud.

Es gibt drei Wege, die aufeinander aufbauen:

| Weg | Was | Aufwand / Kosten | Stand |
|-----|-----|------------------|-------|
| 1 | Web-App auf dem Startbildschirm | gering, kostenlos | ✅ umgesetzt |
| 2 | Echte Apps (Android, iOS, Windows/Mac) | mittel, Store-Gebühren | 💡 Idee |
| 3 | HTTPS im Heimnetz | mittel, eigene Domain | 💡 Idee |

---

## Weg 1 – Web-App auf dem Startbildschirm (umgesetzt)

- Web-App-Manifest, App-Symbole (inkl. randlosem „maskable“-Symbol),
  iPhone-Metadaten, sichere Ränder für Notch und Home-Leiste
- Seite „Mehr → Als App“ mit Anleitung je Gerät, Hinweis auf der Startseite
- „Auf diesem Gerät angemeldet bleiben“ (90 Tage), Sitzungen überleben
  einen Portal-Neustart, Geräte unter „Sicherheit“ abmelden

**Grenzen:**
- **iPhone:** funktioniert vollständig, öffnet ohne Browserleiste.
- **Android und PC:** Chrome/Edge bieten „Als App installieren“ nur über
  HTTPS an. Über `http://lumira.local` gibt es nur eine Verknüpfung, die im
  Browser aufgeht. Abhilfe: Weg 3.
- **Kein Service Worker** ohne HTTPS, also kein Offline-Modus und keine
  Benachrichtigungen.

---

## Weg 2 – Echte Apps (Idee)

Die Portal-Oberfläche in eine App-Hülle packen. Eine Oberfläche für alle
Plattformen, kein zweites Frontend.

| Plattform | Werkzeug | Bemerkung |
|-----------|----------|-----------|
| Android | [Capacitor](https://capacitorjs.com/) | auch ohne Play Store als APK installierbar |
| iOS / iPadOS | Capacitor | nur über App Store bzw. TestFlight |
| Windows / Mac / Linux | [Tauri](https://tauri.app/) | sehr klein (≈ 10 MB), Alternative Electron (≈ 100 MB) |

### Was die App zusätzlich zum Portal kann

- **LUMIRA im Heimnetz finden:** automatische Suche per mDNS
  (`_lumira._tcp`, vom Pi per Avahi angekündigt). Löst nebenbei das
  Android-Problem, dass `.local`-Adressen im Browser oft nicht gehen.
- **Kopplung per QR-Code:** Der Spiegel bzw. das Portal zeigt einen QR-Code
  mit Adresse und einem einmaligen Kopplungs-Code. Die App scannt ihn und
  bekommt eine eigene Langzeit-Sitzung, ganz ohne PIN-Eingabe.
  (`MMM-LumiraStatus` zeigt heute nur den WLAN-QR-Code im Setup-Modus. Ein
  Kopplungs-QR wäre neu, z. B. unter Info im Portal und kurz auf dem Spiegel.)
- **Mehrere Spiegel verwalten:** z. B. Familie mit zwei Geräten oder
  Feuerwehrhaus plus Zuhause. Umschalten in der App.
- **Adresse merken und nachführen:** Ändert sich die IP (DHCP), findet die
  App den Spiegel per mDNS wieder. Keine feste IP im Router nötig.
- **PIN bzw. Sitzung sicher speichern** im Schlüsselbund des Geräts
  (Android Keystore, iOS Keychain).
- **Hinweise bei geöffneter App:** z. B. „Update verfügbar“ oder „Dein Dienst
  diese Woche“.

### Was nicht geht (ohne Cloud)

- **Push-Nachrichten bei geschlossener App** laufen immer über Apple (APNs)
  bzw. Google (FCM), also über deren Server. Das widerspricht „alles lokal“.
  Möglich wäre es nur mit einem eigenen Relay-Dienst. Für den Alarm braucht
  es das ohnehin nicht, das macht die aPager-App.
- **Zugriff von unterwegs** geht auch mit App nur über einen Tunnel, siehe
  unten.

### Kosten und Pflege

- Apple-Entwicklerkonto 99 $/Jahr, Google Play einmalig 25 $
- Prüfung bei jedem Store-Update (Apple: oft 1–2 Tage)
- Apple verlangt bei reinen „Website-Hüllen“ einen echten Mehrwert. Die
  Punkte oben (Suche, Kopplung, mehrere Geräte, Schlüsselbund) sind genau das.
- Datenschutzerklärung und Store-Einträge nötig

### Mögliche Reihenfolge

1. **Android-App** (günstig, ohne Store als APK testbar) mit mDNS-Suche und
   QR-Kopplung
2. Kopplungs-API im Portal (`POST /api/pair` mit einmaligem Code, kurze
   Gültigkeit, danach eigene Geräte-Sitzung, unter „Sicherheit“ sichtbar
   und widerrufbar)
3. iOS über TestFlight, danach App Store
4. PC-App mit Tauri, falls gewünscht (am PC reicht meist Weg 1)

---

## Weg 3 – HTTPS im Heimnetz (Idee)

Mit HTTPS wird das Portal auf Android und PC zur vollwertig installierbaren
App, ganz ohne Stores, und Service Worker funktionieren (Offline-Ansicht,
lokale Benachrichtigungen).

- Ein vertrauenswürdiges Zertifikat gibt es nur für eine echte Domain.
  Vorbild: Plex oder Home Assistant, z. B. `192-168-2-148.lumira.direct`, das
  per DNS auf die lokale IP zeigt.
- Dafür nötig: eigene Domain (≈ 10–20 €/Jahr) und ein kleiner Dienst, der
  pro Gerät Let's-Encrypt-Zertifikate per DNS-Challenge ausstellt und auf den
  Pi verteilt.
- Ein selbst ausgestelltes Zertifikat ist keine Option: Warnungen in jedem
  Browser, für Kunden unbrauchbar.
- Lohnt sich erst, wenn LUMIRA an viele Kunden geht.

---

## Zugriff von unterwegs (Idee, bewusst optional)

Alle drei Wege funktionieren nur im Heimnetz. Von außen ginge es über ein
VPN auf dem Pi, z. B. WireGuard oder Tailscale. Das sollte nur eine bewusste,
abschaltbare Option sein, weil man damit das Portal aus dem Internet
erreichbar macht. Niemals Portweiterleitung im Router auf Port 8092.

---

## Offene Fragen

- Lohnt sich Weg 2 für die Familien-Edition, oder reicht Weg 1?
- Sollen Feuerwehr-/Rettungs-Editionen eine eigene App bekommen (z. B. mit
  Einsatz-Status), oder bleibt das bei aPager?
- Wer betreut Store-Konten und Updates?
- Ist eine eigene Domain für Weg 3 gewünscht (auch für die Landingpage)?
