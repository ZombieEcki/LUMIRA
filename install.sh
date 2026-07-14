#!/usr/bin/env bash
#
# Setup-Assistent: MagicMirror² + Feuerwehr-/Familien-Module
#
# Installiert auf einem Raspberry Pi (Raspberry Pi OS / Debian/Ubuntu):
#   - Node.js (falls fehlend/zu alt)
#   - MagicMirror²
#   - die eigenen Module (modules/MMM-aPagerAlarm, modules/MMM-SmartCompliments)
#   - optional MMM-RainRadarDWD (Git-URL wird abgefragt)
#   - eine fertige config.js – interaktiv abgefragt (Standort, Kalender, News …)
#   - optional Autostart per pm2
#
# Aufruf:
#   chmod +x install.sh
#   ./install.sh                 # volle Installation mit Assistent (inkl. Autostart)
#   ./install.sh --reconfigure   # nur die config.js neu erzeugen (Assistent)
#   ./install.sh --no-wizard      # Installation ohne Fragen (nutzt config.js.sample)
#   ./install.sh --no-pm2         # ohne Autostart installieren
#
# Autostart nutzt Wayland (Raspberry Pi OS Bookworm):
#   WAYLAND_DISPLAY=wayland-0 · XDG_RUNTIME_DIR=/run/user/$(id -u) · npm start
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Einstellungen
# ---------------------------------------------------------------------------
MM_DIR="${MM_DIR:-$HOME/MagicMirror}"
NODE_MAJOR="${NODE_MAJOR:-22}"
MM_REPO="https://github.com/MagicMirrorOrg/MagicMirror"
OWN_MODULES=("MMM-aPagerAlarm" "MMM-SmartCompliments")

WITH_PM2=1; FORCE_CONFIG=0; RECONFIGURE=0; NO_WIZARD=0
for arg in "$@"; do
  case "$arg" in
    --with-pm2) WITH_PM2=1 ;;
    --no-pm2) WITH_PM2=0 ;;
    --force-config) FORCE_CONFIG=1 ;;
    --reconfigure) RECONFIGURE=1 ;;
    --no-wizard) NO_WIZARD=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -n 22; exit 0 ;;
    *) echo "Unbekannte Option: $arg"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Ausgabe-Helfer
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; RED="$(printf '\033[31m')"; GRN="$(printf '\033[32m')"
  YLW="$(printf '\033[33m')"; BLU="$(printf '\033[34m')"; RST="$(printf '\033[0m')"
else BOLD=""; RED=""; GRN=""; YLW=""; BLU=""; RST=""; fi
step() { echo "${BLU}${BOLD}==>${RST} ${BOLD}$*${RST}"; }
ok()   { echo "  ${GRN}✓${RST} $*"; }
warn() { echo "  ${YLW}!${RST} $*"; }
die()  { echo "${RED}${BOLD}Fehler:${RST} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Eingabe-Helfer
# ---------------------------------------------------------------------------
ask() {  # $1 Frage, $2 Default -> gibt Wert auf stdout
  local p="$1" d="${2:-}" ans
  if [ -n "$d" ]; then read -r -p "  $p [$d]: " ans || true; printf '%s' "${ans:-$d}"
  else read -r -p "  $p: " ans || true; printf '%s' "$ans"; fi
}
ask_yesno() {  # $1 Frage, $2 Default(J/N)
  local p="$1" d="${2:-N}" ans hint
  [ "$d" = "J" ] && hint="J/n" || hint="j/N"
  read -r -p "  $p [$hint]: " ans || true; ans="${ans:-$d}"
  case "$ans" in [jJyY]*) return 0 ;; *) return 1 ;; esac
}
urlencode() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]||""))' "$1"; }

# Standort -> Koordinaten (Open-Meteo Geocoding, kostenlos, kein Schlüssel)
GEO_LAT=""; GEO_LON=""; GEO_NAME=""
geocode() {
  local enc json parsed
  enc="$(urlencode "$1")"
  json="$(curl -fsSL "https://geocoding-api.open-meteo.com/v1/search?name=${enc}&count=1&language=de&format=json" 2>/dev/null || true)"
  [ -z "$json" ] && return 1
  parsed="$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const j=JSON.parse(s);if(j.results&&j.results.length){const r=j.results[0];const n=[r.name,r.admin1,r.country].filter(Boolean).join(", ");process.stdout.write(r.latitude+"|"+r.longitude+"|"+n);}}catch(e){}});' 2>/dev/null || true)"
  [ -z "$parsed" ] && return 1
  GEO_LAT="${parsed%%|*}"; local rest="${parsed#*|}"; GEO_LON="${rest%%|*}"; GEO_NAME="${rest#*|}"
  return 0
}

# ---------------------------------------------------------------------------
# Der Assistent
# ---------------------------------------------------------------------------
# Ergebnis-Variablen
PERSON_NAME="Papa"; LAT="52.520"; LON="13.405"; LOCATION_NAME="Berlin"
CAL_URL=""; RSS_TITLE="Tagesschau"; RSS_URL="https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml"
HA_URL=""; RAINRADAR_URL=""

run_wizard() {
  echo
  echo "${BOLD}Setup-Assistent${RST} – ich frage jetzt die persönlichen Daten ab."
  echo "  (Enter übernimmt jeweils den Vorschlag in eckigen Klammern.)"
  echo

  step "Feuerwehr"
  PERSON_NAME="$(ask "Name der Person im Einsatz" "Papa")"
  HA_URL="$(ask "Home-Assistant-Webhook-URL bei Alarm (optional)" "")"
  echo

  step "Standort (für Wetter & Regenradar)"
  while :; do
    local city; city="$(ask "Ort/Stadt (z. B. Berlin) – leer = manuell" "")"
    if [ -z "$city" ]; then
      LAT="$(ask "Breitengrad (lat)" "$LAT")"
      LON="$(ask "Längengrad (lon)" "$LON")"
      LOCATION_NAME="$(ask "Ortsname (Anzeige)" "Zuhause")"
      break
    fi
    if geocode "$city"; then
      echo "  → gefunden: ${BOLD}${GEO_NAME}${RST}  (lat ${GEO_LAT}, lon ${GEO_LON})"
      if ask_yesno "Übernehmen?" "J"; then
        LAT="$GEO_LAT"; LON="$GEO_LON"; LOCATION_NAME="$GEO_NAME"; break
      fi
    else
      warn "Ort nicht gefunden (Internet/Schreibweise prüfen)."
      if ask_yesno "Koordinaten manuell eingeben?" "N"; then
        LAT="$(ask "Breitengrad (lat)" "$LAT")"
        LON="$(ask "Längengrad (lon)" "$LON")"
        LOCATION_NAME="$(ask "Ortsname (Anzeige)" "Zuhause")"; break
      fi
    fi
  done
  echo

  step "Familienkalender"
  CAL_URL="$(ask "Kalender-URL (iCloud/ICS, webcal:// oder https://) – leer = überspringen" "")"
  CAL_URL="${CAL_URL/webcal:\/\//https://}"
  echo

  step "Nachrichten-Feed"
  echo "    1) Tagesschau   2) heise online   3) eigener RSS-Feed"
  local choice; choice="$(ask "Auswahl" "1")"
  case "$choice" in
    2) RSS_TITLE="heise"; RSS_URL="https://www.heise.de/rss/heise-atom.xml" ;;
    3) RSS_TITLE="$(ask "Titel des Feeds" "Nachrichten")"; RSS_URL="$(ask "RSS-URL" "")" ;;
    *) RSS_TITLE="Tagesschau"; RSS_URL="https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml" ;;
  esac
  echo

  step "Regenradar (optional)"
  if ask_yesno "DWD-Regenradar (MMM-RainRadarDWD) installieren?" "N"; then
    RAINRADAR_URL="$(ask "Git-URL des Moduls" "")"
  fi
  echo

  step "Autostart"
  if ask_yesno "MagicMirror automatisch beim Booten starten (pm2, Wayland)?" "J"; then WITH_PM2=1; else WITH_PM2=0; fi
  echo
}

# ---------------------------------------------------------------------------
# config.js schreiben
# ---------------------------------------------------------------------------
write_config() {
  local CONFIG="$MM_DIR/config/config.js"
  mkdir -p "$MM_DIR/config"

  if [ -f "$CONFIG" ] && [ "$FORCE_CONFIG" -eq 0 ] && [ "$RECONFIGURE" -eq 0 ]; then
    warn "config.js existiert bereits – bleibt unverändert (--force-config zum Überschreiben)"
    return 0
  fi
  if [ -f "$CONFIG" ]; then
    local BAK="$CONFIG.backup.$(date +%Y%m%d-%H%M%S)"
    cp "$CONFIG" "$BAK"; warn "vorhandene config.js gesichert: $BAK"
  fi

  # Optionale Blöcke zusammensetzen
  local CAL_BLOCK="" NEWS_BLOCK="" RAIN_BLOCK="" HA_TARGETS=""
  [ -n "$HA_URL" ] && HA_TARGETS="\"$HA_URL\""

  if [ -n "$CAL_URL" ]; then
    CAL_BLOCK=$(cat <<EOF
		{
			module: "calendar",
			header: "Familienkalender",
			position: "bottom_left",
			config: {
				maximumEntries: 5,
				calendars: [ { symbol: "calendar-check", url: "$CAL_URL" } ]
			}
		},
EOF
)
  fi

  if [ -n "$RSS_URL" ]; then
    NEWS_BLOCK=$(cat <<EOF
		{
			module: "newsfeed",
			position: "bottom_bar",
			config: {
				feeds: [ { title: "$RSS_TITLE", url: "$RSS_URL" } ],
				showSourceTitle: false,
				showPublishDate: true,
				reloadInterval: 300000,
				updateInterval: 20000,
				maxNewsItems: 10,
				wrapTitle: true,
				wrapDescription: false,
				ignoreOldItems: true,
				ignoreOlderThan: 86400000
			}
		},
EOF
)
  fi

  if [ -d "$MM_DIR/modules/MMM-RainRadarDWD" ]; then
    RAIN_BLOCK=$(cat <<EOF
		{
			module: "MMM-RainRadarDWD",
			position: "top_right",
			config: {
				lat: ${LAT},
				lon: ${LON},
				alwaysVisible: true,
				showIfRainWithin: 120,
				timePast: 60,
				timeFuture: 120,
				frameStep: 10,
				width: "350px",
				height: "350px",
				border: "none",
				zoomLevel: 9,
				cloudBlur: 12,
				markerSymbol: "fa-home",
				markerColor: "#ff0000",
				showLegend: true,
				legendPosition: "bottom",
				animationSpeed: 2000,
				updateInterval: 600000,
				logLevel: "INFO"
			}
		},
EOF
)
  fi

  cat > "$CONFIG" <<EOF
/* MagicMirror² – automatisch erzeugt vom Setup-Assistenten
 * $(date)
 * Erneut ausführen: ./install.sh --reconfigure
 */
let config = {
	address: "0.0.0.0",
	port: 8080,
	basePath: "/",
	ipWhitelist: [],

	language: "de",
	locale: "de-DE",
	timeFormat: 24,
	units: "metric",

	modules: [
		{ module: "alert" },
		{ module: "updatenotification", position: "top_bar" },
		{
			module: "clock",
			position: "top_right",
			config: { displayType: "digital", displaySeconds: false }
		},
${RAIN_BLOCK}
${CAL_BLOCK}
		{
			module: "weather",
			position: "top_right",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: ${LAT},
				lon: ${LON}
			}
		},
		{
			module: "weather",
			position: "top_right",
			header: "Wettervorhersage",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: ${LAT},
				lon: ${LON}
			}
		},
${NEWS_BLOCK}
		{
			module: "MMM-aPagerAlarm",
			position: "fullscreen_above",
			config: {
				webhookPort: 8090,
				personName: "${PERSON_NAME}",
				playSound: true,
				soundFile: "alarm.mp3",
				forwardTargets: [ ${HA_TARGETS} ]
			}
		},
		{
			module: "MMM-SmartCompliments",
			position: "top_center",
			config: {
				updateInterval: 30000,
				fadeSpeed: 4000,
				firefighterIntegration: true,
				hideOnAlarmPhases: [1],
				afterDutyEnabled: true,
				manualControlEnabled: true,
				manualControlPort: 8091,
				birthdays: [
					// { name: "Max", date: "01-01" }
				],
				weddingDate: ""
			}
		}
	]
};

if (typeof module !== "undefined") { module.exports = config; }
EOF

  ok "config.js geschrieben (Standort: ${LOCATION_NAME})"
}

# ===========================================================================
# Ablauf
# ===========================================================================
echo
echo "${BOLD}MagicMirror² – Feuerwehr & Familie · Setup${RST}"
echo "Ziel: ${MM_DIR}"

[ "$(id -u)" -eq 0 ] && die "Bitte NICHT als root/sudo starten. Das Skript nutzt sudo nur dort, wo nötig."
command -v sudo >/dev/null 2>&1 || die "sudo wird benötigt."

# --- Nur neu konfigurieren? -------------------------------------------------
if [ "$RECONFIGURE" -eq 1 ]; then
  command -v node >/dev/null 2>&1 || die "Node.js wird für den Assistenten benötigt (erst normale Installation ausführen)."
  run_wizard
  write_config
  echo; echo "${GRN}${BOLD}config.js neu erzeugt.${RST} Neustart: pm2 restart MagicMirror  (oder npm start)"
  exit 0
fi

# --- 0/1: System & Node -----------------------------------------------------
step "System-Pakete (git, curl, build-essential, Emoji-Font)"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates build-essential \
  fonts-noto-color-emoji fontconfig
sudo fc-cache -f >/dev/null 2>&1 || true
ok "Basis-Pakete & Farb-Emoji-Schrift vorhanden"

step "Node.js prüfen (v20+)"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CUR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [ "$CUR" -ge 20 ] && { ok "Node.js $(node -v)"; NEED_NODE=0; } || warn "Node.js $(node -v) zu alt"
fi
if [ "$NEED_NODE" -eq 1 ]; then
  step "Node.js ${NODE_MAJOR}.x installieren"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
  ok "Node.js $(node -v)"
fi

# --- 2: MagicMirror ---------------------------------------------------------
if [ -f "$MM_DIR/package.json" ]; then
  step "MagicMirror² bereits vorhanden – übersprungen"
else
  step "MagicMirror² klonen & installieren (dauert etwas)"
  git clone "$MM_REPO" "$MM_DIR"
  ( cd "$MM_DIR" && npm run install-mm 2>/dev/null || npm install )
  ok "installiert"
fi
mkdir -p "$MM_DIR/modules"

# --- 3: Eigene Module -------------------------------------------------------
find_module() {
  local name="$1"
  for c in "$SCRIPT_DIR/modules/$name" "$SCRIPT_DIR/$name" "$SCRIPT_DIR/../$name"; do
    [ -f "$c/package.json" ] && { echo "$c"; return 0; }
  done
  return 1
}
for mod in "${OWN_MODULES[@]}"; do
  step "Modul $mod"
  SRC="$(find_module "$mod")" || die "Modulordner '$mod' nicht gefunden."
  DEST="$MM_DIR/modules/$mod"; mkdir -p "$DEST"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude node_modules "$SRC"/ "$DEST"/
  else
    rm -rf "$DEST"; mkdir -p "$DEST"
    ( cd "$SRC" && tar --exclude=node_modules -cf - . ) | ( cd "$DEST" && tar -xf - )
  fi
  if grep -q '"dependencies"' "$DEST/package.json"; then
    ( cd "$DEST" && npm install --no-audit --no-fund ); ok "installiert (mit Abhängigkeiten)"
  else ok "installiert"; fi
done

# --- Assistent (Standort/Kalender/News) -------------------------------------
if [ "$NO_WIZARD" -eq 0 ] && [ -t 0 ]; then
  run_wizard
else
  warn "Assistent übersprungen – nutze Vorlage/Standardwerte"
fi

# --- 4: Optional MMM-RainRadarDWD ------------------------------------------
if [ -n "$RAINRADAR_URL" ]; then
  step "MMM-RainRadarDWD installieren"
  if [ -d "$MM_DIR/modules/MMM-RainRadarDWD" ]; then
    ok "bereits vorhanden"
  elif git clone "$RAINRADAR_URL" "$MM_DIR/modules/MMM-RainRadarDWD" 2>/dev/null; then
    if [ -f "$MM_DIR/modules/MMM-RainRadarDWD/package.json" ] && grep -q '"dependencies"' "$MM_DIR/modules/MMM-RainRadarDWD/package.json"; then
      ( cd "$MM_DIR/modules/MMM-RainRadarDWD" && npm install --no-audit --no-fund ) || warn "npm install fehlgeschlagen"
    fi
    ok "installiert"
  else
    warn "Konnte MMM-RainRadarDWD nicht klonen – wird in der config ausgelassen"
  fi
fi

# --- 5: config.js -----------------------------------------------------------
step "config.js einrichten"
if [ "$NO_WIZARD" -eq 1 ] || [ ! -t 0 ]; then
  # Ohne Assistent: statische Vorlage nutzen, falls vorhanden
  CFG="$MM_DIR/config/config.js"
  if [ -f "$SCRIPT_DIR/config.js.sample" ] && { [ ! -f "$CFG" ] || [ "$FORCE_CONFIG" -eq 1 ]; }; then
    [ -f "$CFG" ] && cp "$CFG" "$CFG.backup.$(date +%Y%m%d-%H%M%S)"
    cp "$SCRIPT_DIR/config.js.sample" "$CFG"; ok "config.js aus Vorlage erstellt"
  else warn "config.js unverändert"; fi
else
  write_config
fi

# --- 6: Autostart -----------------------------------------------------------
if [ "$WITH_PM2" -eq 1 ]; then
  step "Autostart per pm2 (Wayland)"
  command -v pm2 >/dev/null 2>&1 || sudo npm install -g pm2
  # Startskript mit Wayland-Umgebung (Raspberry Pi OS Bookworm)
  cat > "$MM_DIR/mm.sh" <<'EOS'
#!/usr/bin/env bash
cd "$(dirname "$0")"
export WAYLAND_DISPLAY=wayland-0
export XDG_RUNTIME_DIR=/run/user/$(id -u)
npm start
EOS
  chmod +x "$MM_DIR/mm.sh"
  pm2 delete MagicMirror >/dev/null 2>&1 || true
  pm2 start "$MM_DIR/mm.sh" --name MagicMirror
  pm2 save
  # Start beim Booten automatisch registrieren (systemd)
  if sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME" >/dev/null 2>&1; then
    pm2 save >/dev/null 2>&1 || true
    ok "Autostart eingerichtet (Dienst 'MagicMirror' startet beim Booten)"
  else
    ok "pm2-Prozess 'MagicMirror' eingerichtet"
    warn "Autostart konnte nicht automatisch registriert werden – einmalig: pm2 startup"
  fi
fi

echo
echo "${GRN}${BOLD}Fertig!${RST}"
echo "  • config.js:   $MM_DIR/config/config.js"
echo "  • Neu konfigurieren jederzeit:  ./install.sh --reconfigure"
if [ "$WITH_PM2" -eq 1 ]; then echo "  • Läuft via pm2.  Logs:  pm2 logs MagicMirror"
else echo "  • Starten:  cd $MM_DIR && npm start"; fi
echo "  • Testalarm:  http://<pi-ip>:8090/alarm?keyword=Test&unit=Test"
echo "  • Ports: 8080 MagicMirror · 8090 aPagerAlarm · 8091 SmartCompliments"
echo
