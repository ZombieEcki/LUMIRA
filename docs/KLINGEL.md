# Türklingel (Ring) auf dem Spiegel

Klingelt es an der Ring-Türklingel, erscheint auf dem Spiegel in der
Bildschirmmitte

1. sofort das **Live-Video** der Klingel in der gewählten Größe, mit Countdown,
2. gleichzeitig darüber eine kompakte Meldung („Es hat geklingelt!“, auf Wunsch
   mit Leuchtrahmen) für ihre eingestellte Dauer, dazu der Klingelton,
3. nach der eingestellten Zeit ist der Spiegel wieder wie vorher.

Die anderen Module bleiben, wo sie sind; die Anzeige liegt nur darüber. Während
eines Alarms (aPager) bleibt die Klingel-Anzeige verborgen, der Alarm geht vor.

Bausteine: Portal [`lib/ring.js`](../lumira-portal/lib/ring.js) (Ring-Verbindung),
[`lib/doorbell.js`](../lumira-portal/lib/doorbell.js) (Ablauf, Einstellungen),
Spiegel-Modul [`MMM-Doorbell`](../modules/MMM-Doorbell/README.md).

---

## 1. Einschalten und mit Ring verbinden

1. Portal öffnen → **Spiegel → Klingel**.
2. Oben **Türklingel auf dem Spiegel** einschalten. MagicMirror startet dabei
   einmal neu (das Modul wird in die config.js aufgenommen). Derselbe Schalter
   steht auch unter Spiegel → Module.
3. In der Karte **Ring-Verbindung** E-Mail und Passwort des Ring-Kontos eingeben
   → **Bei Ring anmelden**.
4. Ring schickt einen **Bestätigungscode** (SMS, E-Mail oder Authenticator-App –
   Ring verlangt das immer). Code eingeben → **Bestätigen**.
5. Der Status zeigt „Mit Ring verbunden“ und die gefundenen Türklingeln, mit
   Modell und erkannter Stromversorgung (Kabel/Akku).

Mit **Klingeln testen** läuft auf dem Spiegel alles wie bei echtem Klingeln –
mit Ton und, sobald Ring verbunden ist, mit dem echten Live-Video. Ohne
Ring-Verbindung zeigt der Spiegel ein Testbild.

**Mehrere Klingeln:** Pro Klingel gibt es einen Schalter „löst aus“.

**Stromversorgung:** wird automatisch erkannt und lässt sich in der Auswahl
festlegen.
- *Kabel*: Fällt das Video aus, holt LUMIRA alle 5 Sekunden ein neues Standbild.
- *Akku*: nur ein Standbild pro Klingeln, um den Akku zu schonen. Das Live-Video
  gibt es trotzdem, es kostet aber Akku – bei Akku-Klingeln eher eine kurze
  Anzeigedauer wählen.

## 2. Meldung, Ton und Video einstellen

Alle Einstellungen wirken sofort, ohne Neustart.

| Bereich | Einstellung |
|---|---|
| Meldung | an/aus, eigener Text (max. 60 Zeichen), Anzeigedauer 5–30 s, Leuchtrahmen an/aus |
| Ton | an/aus, eingebautes „Ding-Dong“ oder eigener Ton (MP3/WAV/OGG bis 5 MB), Lautstärke, **Probehören** im Browser |
| Live-Video | an/aus, Größe klein/mittel/groß, Anzeigedauer 30 s / 1 / 2 / 5 min oder eigene Zeit (10–600 s), automatisch schließen, Countdown |

- **Ton auf dem Spiegel** braucht Lautsprecher am Raspberry Pi (wie beim Alarmton).
  Der eigene Ton wird auf dem Spiegel gespeichert (`~/.lumira/doorbell/`) und
  spielt ohne Internet.
- **Ohne automatisches Schließen** bleibt das Video, bis im Portal **Jetzt
  schließen** gedrückt wird – höchstens 10 Minuten (länger liefert Ring kein
  Live-Video).
- **Manuell schließen** geht im Portal (Karte „Türklingel“, auch vom Handy). Der
  Spiegel selbst hat keine Bedienung.
- Klingelt es während der Anzeige erneut an derselben Klingel, verlängert sich
  die Zeit und der Ton kommt noch einmal; das Video läuft weiter.

## 3. Installation

Kommt mit LUMIRA mit – nichts extra zu installieren:

- Bestehender Spiegel: Portal → **Info → LUMIRA → Aktualisieren** (oder
  `./install.sh --update`). Das kopiert `MMM-Doorbell`, installiert die
  Ring-Bibliothek `ring-client-api` im Portal und erzeugt die config.js neu.
- Neuinstallation: `./install.sh` wie gewohnt.
- Voraussetzung: **ffmpeg** (installiert `install.sh` seit der Dauerschleife mit;
  ältere Geräte einmal `sudo apt install ffmpeg`).
- Die Türklingel ist nach der Installation **aus** (Standard), bis sie im Portal
  eingeschaltet wird.

## 4. Wie es technisch funktioniert

- **Klingeln erkennen:** `ring-client-api` meldet sich wie die Ring-App für
  Push-Nachrichten an (Firebase). Dafür braucht der Pi **keine Portfreigabe** und
  kein Ring-Abo.
- **Live-Video:** Ring liefert das Video per WebRTC. ffmpeg packt es **ohne
  Umrechnen** in HLS-Stücke um (`-c:v copy`, Ton aus), das schafft auch ein Pi 3.
  Die Stücke liegen im Arbeitsspeicher (`/dev/shm/lumira-doorbell`, schont die
  SD-Karte). Der Spiegel spielt sie mit hls.js ab. Verzögerung etwa 2–4 Sekunden.
- **Zustand:** Einstellungen und das laufende Klingeln stehen in
  `~/.lumira/doorbell.json`. Nur das Portal schreibt, `MMM-Doorbell` liest per
  Dateiüberwachung – kein MagicMirror-Neustart.
- **Fehler bremsen nichts aus:** Startet das Video nicht, bleibt die Meldung,
  der Spiegel zeigt das letzte Bild der Klingel (oder einen Hinweis), und nach
  der Anzeigedauer ist alles wieder normal. Nach einem Neustart räumt das Portal
  ein liegengebliebenes Klingeln weg.

## 5. Sicherheit und Datenschutz

- **Passwort:** wird nur einmal an Ring geschickt und **nie gespeichert**.
- **Gespeichert** wird allein der Zugangsschlüssel (Refresh-Token) von Ring in
  `~/.lumira/ring-auth.json`, nur für den Benutzer des Spiegels lesbar (0600).
  Keine Portal-Seite und keine Schnittstelle gibt ihn heraus, er liegt nicht im
  Browser.
- Ring tauscht den Schlüssel etwa stündlich aus; LUMIRA speichert jeden neuen
  sofort (sonst kämen nach einem Neustart keine Klingel-Nachrichten mehr an).
- In der Ring-App (Kontrollzentrum → Autorisierte Client-Geräte) erscheint der
  Spiegel als **„LUMIRA Spiegel“**. Dort lässt sich der Zugang jederzeit
  widerrufen. **Abmelden** im Portal löscht den Schlüssel auf dem Spiegel.
- Es wird **nichts aufgezeichnet**: Video-Stücke und Standbilder liegen nur
  während des Klingelns im Arbeitsspeicher und werden danach gelöscht.
- Das Portal ist wie immer durch den PIN geschützt (Mehr → Sicherheit), das gilt
  auch für Anmeldung, Video-Vorschau und Einstellungen der Klingel.
- `ring-client-api` ist eine **inoffizielle** Bibliothek (dieselbe wie bei
  Homebridge und Home Assistant). Ring kann sie jederzeit brechen; dann hilft
  meist ein LUMIRA-Update.

## 6. Fehlerbehebung

| Meldung / Verhalten | Ursache und Abhilfe |
|---|---|
| „E-Mail oder Passwort stimmt nicht“ | Zugangsdaten der Ring-App verwenden. |
| „Zu viele Codes angefordert“ | Ring erlaubt 10 Codes in 10 Minuten – kurz warten. |
| „Die Ring-Anmeldung ist abgelaufen“ | Zugang wurde in der Ring-App entfernt oder der Schlüssel ist ungültig → neu anmelden. |
| „Ring ist nicht erreichbar“ | Internet des Spiegels prüfen; LUMIRA versucht es automatisch erneut (nach 30 s, 2, 5, 15 min). |
| „Ring-Unterstützung fehlt“ | Portal ohne `ring-client-api` → LUMIRA aktualisieren (Info → Updates). |
| Klingeln kommt nicht an (Test geht) | Portal → Spiegel → Klingel → Ring-Verbindung → **Diagnose**. *Push-Kanal* rot: mtalk.google.com (Port 5228) wird blockiert – im Werbeblocker (Pi-hole, AdGuard) oder in der Router-Firewall freigeben. *Keine Nachrichten von Ring*: in der Ring-App unter Kontrollzentrum → Autorisierte Client-Geräte alte Einträge („LUMIRA Spiegel“, „ring-client-api“, „Device name not found“) entfernen, im Portal abmelden und neu anmelden, ein paar Minuten warten. *Bewegung kommt an, Klingeln nicht*: in der Ring-App die Klingel-Benachrichtigungen der Klingel einschalten. Meldungen der Ring-Bibliothek stehen in der Diagnose und im Journal. |
| „Ende-zu-Ende-Verschlüsselung ist an“ | Mit Ring-E2EE gibt Ring kein Live-Video heraus. In der Ring-App abschalten oder ohne Video nutzen. |
| „Die Klingel liefert kein Video (Zeitüberschreitung)“ | Klingel offline/schwaches WLAN an der Tür, oder ffmpeg fehlt (`ffmpeg -version`). Die Meldung erscheint trotzdem. |
| Video ruckelt auf dem Pi 3 | Größe „klein“ oder „mittel“ wählen; die Klingel liefert Full-HD, der Pi 3 muss es ohne Grafik-Beschleunigung abspielen. |
| Kein Ton | Lautsprecher/Ausgang am Pi prüfen (wie beim Alarmton), Lautstärke im Portal > 0. |

Logs: `journalctl -u lumira-portal -f` (Ring-Verbindung, Video) und
`pm2 logs MagicMirror` (Anzeige).

## 7. Grenzen

- Kein Gegensprechen, kein Ton aus der Klingel, keine Aufzeichnung.
- Live-Video höchstens etwa 10 Minuten am Stück (Vorgabe von Ring).
- Ring begrenzt gleichzeitige Live-Ansichten. Schaut gerade jemand in der
  Ring-App zu, kann das Video auf dem Spiegel ausfallen – die Meldung kommt trotzdem.
