# LUMIRA – Medien

Logos und Bilder, die von Doku, Landingpage und Modulen genutzt werden.

## logos/

| Datei | Format | Verwendung |
|-------|--------|------------|
| `lumira-logo-website.png` | breit (1536 × 1024) | README-Kopf, Landingpage-Hero |
| `lumira-logo-16x9.png` | breit (1536 × 1024) | Banner, Präsentationen |
| `lumira-logo-1x1.png` | quadratisch (1024 × 1024) | App-Icon, Avatar, Konfigurator |
| `lumira-logo-dark.png` | quadratisch (1254 × 1254), transparent, dunkle Schrift | auf **hellem** Hintergrund |
| `lumira-logo-light.png` | quadratisch (1254 × 1254), transparent, helle Schrift | auf **dunklem** Hintergrund (Portal, Spiegel) |

## avatars/

Preset-Avatare für den Familienplan (siehe
[concept/familienplan.md](../concept/familienplan.md), Abschnitt 5.1):
18 illustrierte Porträts, 418 × 418 px, PNG.

| Dateien | Rolle im Familienplan |
|---------|-----------------------|
| `adult-01.png` … `adult-09.png` | Erwachsene |
| `child-01.png` … `child-09.png` | Kinder |

Die Preset-ID im Familienplan ist der Dateiname ohne Endung (z. B.
`"avatar": { "type": "preset", "value": "child-03" }`).

**Quelle/Lizenz:** Eigene Erstellung des LUMIRA-Teams. Alle Rechte liegen bei
uns, die Avatare dürfen mit LUMIRA ausgeliefert werden. Verkleinerte Kopien
für den Spiegel liegen in
[`modules/MMM-FamilyPlan/avatars/`](../modules/MMM-FamilyPlan/avatars).
