#!/usr/bin/env bash
#
# Setup-Assistent: MagicMirror² + Feuerwehr-/Familien-Module
#
# Installiert auf einem Raspberry Pi (Raspberry Pi OS / Debian/Ubuntu):
#   - Node.js (falls fehlend/zu alt)
#   - MagicMirror²
#   - die eigenen Module (modules/MMM-aPagerAlarm, modules/MMM-SmartCompliments,
#     modules/MMM-LumiraStatus)
#   - Regenradar MMM-RainRadarDWD (Standard: realoliwer/MMM-RainRadarDWD)
#   - eine lauffähige config.js mit Platzhalter-Werten für die gewählte Edition
#   - optional Autostart per pm2
#
# WICHTIG: Dieses Skript fragt KEINE persönlichen Daten mehr ab (Name,
# Standort, Kalender, News, Home-Assistant-Webhook). Das ist Absicht: diese
# Angaben macht der Kunde selbst über das Self-Service-Portal – entweder beim
# Ersteinrichten über den Captive-Portal-Access-Point oder jederzeit später
# unter http://<hostname>.local:8092 (siehe concept/selfservice.md). Dieses
# Skript kümmert sich nur noch um die technische Grundinstallation (Edition,
# Hostname, Module, Dienste).
#
# Aufruf:
#   chmod +x install.sh
#   ./install.sh                    # volle Installation (inkl. Autostart)
#   ./install.sh --reconfigure      # config.js aus dem aktuellen settings.json neu erzeugen
#   ./install.sh --no-wizard        # config.js.sample statt settings.json-Pipeline nutzen
#   ./install.sh --no-pm2           # ohne Autostart installieren
#   ./install.sh --edition=fire     # Edition der Grundinstallation (home|fire|rescue|business|station, Standard: fire)
#   ./install.sh --hostname=lumira  # Hostname für http://<name>.local:8092 (Standard: lumira)
#   ./install.sh --no-selfservice   # ohne Self-Service-Portal/Watchdog (siehe concept/selfservice.md)
#   ./install.sh --no-rainradar     # ohne DWD-Regenradar-Modul
#   ./install.sh --rainradar-url=…  # abweichende Git-URL für das Regenradar-Modul
#
# Self-Service-Portal (lumira-portal, Port 8092) & Watchdog werden standard-
# mäßig mit eingerichtet: config.js entsteht aus settings.json über
# lumira-portal/lib/generate-config.js – dieselbe Logik, die auch das
# Web-Portal für spätere Änderungen nutzt (siehe concept/selfservice.md
# Abschnitt 7). --reconfigure überschreibt dabei NUR Edition/Hostname, alle
# bereits über das Portal eingetragenen Kundendaten bleiben unangetastet.
# Setzt systemd + NetworkManager voraus (Raspberry Pi OS Bookworm); fehlt
# eines davon, wird der jeweilige Teil übersprungen.
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
OWN_MODULES=("MMM-aPagerAlarm" "MMM-SmartCompliments" "MMM-LumiraStatus")

WITH_PM2=1; FORCE_CONFIG=0; RECONFIGURE=0; NO_WIZARD=0
EDITION="fire"; HOSTNAME_NEW="lumira"; WITH_SELFSERVICE=1
RAINRADAR_URL_DEFAULT="https://github.com/realoliwer/MMM-RainRadarDWD"
RAINRADAR_URL="$RAINRADAR_URL_DEFAULT"
for arg in "$@"; do
  case "$arg" in
    --with-pm2) WITH_PM2=1 ;;
    --no-pm2) WITH_PM2=0 ;;
    --force-config) FORCE_CONFIG=1 ;;
    --reconfigure) RECONFIGURE=1 ;;
    --no-wizard) NO_WIZARD=1 ;;
    --edition=*) EDITION="${arg#*=}" ;;
    --hostname=*) HOSTNAME_NEW="${arg#*=}" ;;
    --no-selfservice) WITH_SELFSERVICE=0 ;;
    --no-rainradar) RAINRADAR_URL="" ;;
    --rainradar-url=*) RAINRADAR_URL="${arg#*=}" ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -n 44; exit 0 ;;
    *) echo "Unbekannte Option: $arg"; exit 1 ;;
  esac
done

case "$EDITION" in
  home|fire|rescue|business|station) ;;
  *) echo "Unbekannte Edition: $EDITION (home|fire|rescue|business|station)"; exit 1 ;;
esac

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
# config.js schreiben
#
# settings.json ist die einzige Wahrheit (siehe concept/selfservice.md
# Abschnitt 7). Dieses Skript trägt hier NUR Edition und Hostname ein - alle
# persönlichen Felder (Name, Standort, Kalender, News, HA-Webhook) bleiben
# unangetastet, falls sie schon existieren (z.B. weil der Kunde sie bereits
# über das Self-Service-Portal eingetragen hat). Ein wiederholter Aufruf
# (auch --reconfigure) überschreibt also nie Kundendaten.
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

  local RAIN_ENABLED="true"
  [ -n "$RAINRADAR_URL" ] || RAIN_ENABLED="false"

  local SETTINGS_JSON
  SETTINGS_JSON="$(node -e '
    const [edition, hostname, rainEnabled] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({ edition, hostname, rainRadar: { enabled: rainEnabled === "true" } }));
  ' "$EDITION" "$HOSTNAME_NEW" "$RAIN_ENABLED")"

  echo "$SETTINGS_JSON" | node "$SCRIPT_DIR/lumira-portal/bin/save-settings-cli.js" >/dev/null
  node "$SCRIPT_DIR/lumira-portal/bin/generate-config-cli.js" --out="$CONFIG"

  ok "config.js geschrieben (Edition: ${EDITION}, Hostname: ${HOSTNAME_NEW})"
}

# Regenradar-Modul installieren (Standard: realoliwer/MMM-RainRadarDWD,
# mit --no-rainradar abwählbar oder --rainradar-url=… ersetzbar). Idempotent,
# auch von --reconfigure nutzbar.
install_rainradar() {
  [ -n "$RAINRADAR_URL" ] || return 0
  step "MMM-RainRadarDWD installieren"
  if [ -d "$MM_DIR/modules/MMM-RainRadarDWD" ]; then
    ok "bereits vorhanden"
    return 0
  fi
  if git clone "$RAINRADAR_URL" "$MM_DIR/modules/MMM-RainRadarDWD" 2>/dev/null; then
    if [ -f "$MM_DIR/modules/MMM-RainRadarDWD/package.json" ] && grep -q '"dependencies"' "$MM_DIR/modules/MMM-RainRadarDWD/package.json"; then
      ( cd "$MM_DIR/modules/MMM-RainRadarDWD" && npm install --no-audit --no-fund ) || warn "npm install fehlgeschlagen"
    fi
    ok "installiert ($RAINRADAR_URL)"
  else
    warn "Konnte MMM-RainRadarDWD nicht klonen ($RAINRADAR_URL) – wird in der config ausgelassen"
  fi
}

# Hostname setzen, damit das Self-Service-Portal unter http://<name>.local:8092
# erreichbar ist (siehe concept/selfservice.md). Erfordert systemd
# (hostnamectl) – auf anderen Systemen wird der Schritt übersprungen.
set_hostname() {
  step "Hostname (für http://${HOSTNAME_NEW}.local:8092)"
  if ! command -v hostnamectl >/dev/null 2>&1; then
    warn "hostnamectl nicht verfügbar – Hostname-Änderung übersprungen"
    return 0
  fi
  local CURRENT; CURRENT="$(hostnamectl --static 2>/dev/null || hostname)"
  if [ "$CURRENT" = "$HOSTNAME_NEW" ]; then
    ok "Hostname bereits '$HOSTNAME_NEW'"
  else
    sudo hostnamectl set-hostname "$HOSTNAME_NEW"
    if grep -q '^127\.0\.1\.1' /etc/hosts 2>/dev/null; then
      sudo sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$HOSTNAME_NEW/" /etc/hosts
    else
      printf '127.0.1.1\t%s\n' "$HOSTNAME_NEW" | sudo tee -a /etc/hosts >/dev/null
    fi
    ok "Hostname gesetzt: $CURRENT → $HOSTNAME_NEW (vollständig wirksam nach Neustart)"
  fi

  if dpkg -s avahi-daemon >/dev/null 2>&1; then
    ok "avahi-daemon bereits vorhanden (für ${HOSTNAME_NEW}.local)"
  elif sudo apt-get install -y avahi-daemon >/dev/null 2>&1; then
    ok "avahi-daemon installiert (für ${HOSTNAME_NEW}.local)"
  else
    warn "avahi-daemon konnte nicht installiert werden – ${HOSTNAME_NEW}.local löst evtl. nicht auf"
  fi
}

# LUMIRA Self-Service-Portal (lumira-portal, Port 8092) + Watchdog
# (lumira-provision) einrichten, siehe concept/selfservice.md Abschnitt 7/8.
# Läuft als eigene systemd-Dienste unter dem aktuellen Benutzer (kein root).
install_lumira_portal() {
  if [ "$WITH_SELFSERVICE" -eq 0 ]; then
    warn "Self-Service-Portal übersprungen (--no-selfservice)"
    return 0
  fi
  step "LUMIRA Self-Service-Portal (lumira-portal, Port 8092)"

  local DEST="$HOME/lumira-portal"
  mkdir -p "$DEST"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude node_modules --exclude public/node_modules "$SCRIPT_DIR/lumira-portal"/ "$DEST"/
  else
    rm -rf "$DEST"; mkdir -p "$DEST"
    ( cd "$SCRIPT_DIR/lumira-portal" && tar --exclude=node_modules -cf - . ) | ( cd "$DEST" && tar -xf - )
  fi
  ( cd "$DEST" && npm install --no-audit --no-fund --omit=dev ) && ok "lumira-portal installiert" \
    || { warn "npm install für lumira-portal fehlgeschlagen"; return 0; }

  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemd nicht verfügbar – Dienste übersprungen (manueller Start: node $DEST/server.js)"
    return 0
  fi
  if ! command -v nmcli >/dev/null 2>&1; then
    warn "nmcli/NetworkManager nicht gefunden – WLAN-Access-Point (Phase 2/3) funktioniert erst nach dessen Installation"
  fi

  local UNIT_SRC="$DEST/systemd"
  for f in lumira-portal.service lumira-provision.service lumira-provision.timer; do
    sed -e "s#@USER@#$USER#g" -e "s#@HOME@#$HOME#g" "$UNIT_SRC/$f" | sudo tee "/etc/systemd/system/$f" >/dev/null
  done
  sudo mkdir -p /etc/polkit-1/rules.d
  sed "s#@USER@#$USER#g" "$UNIT_SRC/polkit-lumira-nmcli.rules" | sudo tee /etc/polkit-1/rules.d/49-lumira-nmcli.rules >/dev/null
  sudo mkdir -p /etc/NetworkManager/dnsmasq-shared.d
  sudo cp "$UNIT_SRC/dnsmasq-shared-captive.conf" /etc/NetworkManager/dnsmasq-shared.d/lumira-captive.conf

  sudo systemctl daemon-reload
  sudo systemctl enable --now lumira-portal.service
  sudo systemctl enable --now lumira-provision.timer
  ok "Dienste eingerichtet: lumira-portal (Port 8092), lumira-provision (Watchdog, alle 2 Min)"
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
# Setzt nur Edition/Hostname in settings.json neu und erzeugt config.js
# daraus - alle über das Portal eingetragenen Kundendaten bleiben erhalten.
if [ "$RECONFIGURE" -eq 1 ]; then
  command -v node >/dev/null 2>&1 || die "Node.js wird benötigt (erst normale Installation ausführen)."
  install_rainradar
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

set_hostname

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

install_lumira_portal

# --- 4: Regenradar (Standard: realoliwer/MMM-RainRadarDWD) -----------------
install_rainradar

# --- 5: config.js -----------------------------------------------------------
step "config.js einrichten"
if [ "$NO_WIZARD" -eq 1 ]; then
  # --no-wizard: statische Vorlage nutzen statt der settings.json-Pipeline
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
echo "${GRN}${BOLD}Grundinstallation fertig!${RST}"
echo "  • Edition:     $EDITION"
echo "  • config.js:   $MM_DIR/config/config.js (Platzhalter-Werte)"
echo "  • Neu konfigurieren jederzeit:  ./install.sh --reconfigure"
if [ "$WITH_PM2" -eq 1 ]; then echo "  • Läuft via pm2.  Logs:  pm2 logs MagicMirror"
else echo "  • Starten:  cd $MM_DIR && npm start"; fi
if [ "$WITH_SELFSERVICE" -eq 1 ]; then
  echo "  • Self-Service-Portal:  http://${HOSTNAME_NEW}.local:8092  (Logs: sudo journalctl -u lumira-portal -f)"
  echo "  • Persönliche Daten (Name, Standort, Kalender, WLAN …) jetzt dort eintragen"
  echo "    – entweder direkt im Heimnetz oder über den Setup-Access-Point \"LUMIRA-Setup\""
fi
echo "  • Testalarm:  http://<pi-ip>:8090/alarm?keyword=Test&unit=Test"
echo "  • Ports: 8080 MagicMirror · 8090 aPagerAlarm · 8091 SmartCompliments · 8092 lumira-portal"
echo
