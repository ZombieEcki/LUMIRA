// LUMIRA – eigener Alarmton für MMM-aPagerAlarm.
//
// MMM-aPagerAlarm.js spielt den Ton über this.file("sounds/" + soundFile) ab
// (MagicMirror-eigener Static-Resolver) – die Datei muss also physisch im
// Modulordner liegen. install.sh leert diesen Ordner aber bei jedem Update
// per rsync --delete (siehe lib/settings.js-Kommentar zu DEFAULTS_PATH für
// den Vorfall, der zu dieser Regel geführt hat). Deshalb wird der Ton
// dauerhaft in ~/.lumira/sounds/ gehalten und bei jeder Config-Erzeugung
// (server.js regenerateAndRestart / bin/generate-config-cli.js /
// bin/sync-alarm-sound-cli.js) in den Modulordner zurückkopiert.
"use strict";

const fs = require("fs");
const path = require("path");
const settingsLib = require("./settings");

const SOUNDS_DIR = path.join(settingsLib.LUMIRA_HOME, "sounds");

const ALLOWED_MIME = {
	"audio/mpeg": ".mp3",
	"audio/wav": ".wav",
	"audio/x-wav": ".wav",
	"audio/ogg": ".ogg"
};

function ensureDir() {
	fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

// Löscht alle bisherigen "custom-alarm.*"-Dateien, bevor eine neue gespeichert
// wird - sonst könnte z.B. beim Wechsel von mp3 auf wav eine alte mp3-Leiche
// liegen bleiben und syncAlarmSound() würde die falsche kopieren.
function clearCustomFiles() {
	if (!fs.existsSync(SOUNDS_DIR)) return;
	for (const f of fs.readdirSync(SOUNDS_DIR)) {
		if (f.startsWith("custom-alarm.")) fs.unlinkSync(path.join(SOUNDS_DIR, f));
	}
}

function saveUpload(buffer, mimetype) {
	ensureDir();
	clearCustomFiles();
	const ext = ALLOWED_MIME[mimetype];
	const filename = `custom-alarm${ext}`;
	fs.writeFileSync(path.join(SOUNDS_DIR, filename), buffer);
	return filename;
}

function removeCustom() {
	clearCustomFiles();
}

// Kopiert den aktiven Alarmton (falls einer per Upload gesetzt ist) aus
// ~/.lumira/sounds/ in <mmRoot>/modules/MMM-aPagerAlarm/sounds/. Kein Fehler,
// falls nichts zu tun ist oder die Quelldatei (noch) fehlt - der Aufruf
// passiert bei jeder Config-Erzeugung, auch wenn kein eigener Ton gesetzt ist.
function syncAlarmSound(mmRoot, settings) {
	const soundFile = settings && settings.alarm && settings.alarm.soundFile;
	if (!soundFile) return;
	const src = path.join(SOUNDS_DIR, soundFile);
	if (!fs.existsSync(src)) {
		console.warn(`[lumira-portal] eigener Alarmton "${soundFile}" nicht gefunden unter ${src}`);
		return;
	}
	const destDir = path.join(mmRoot, "modules", "MMM-aPagerAlarm", "sounds");
	fs.mkdirSync(destDir, { recursive: true });
	fs.copyFileSync(src, path.join(destDir, soundFile));
}

module.exports = { SOUNDS_DIR, ALLOWED_MIME, saveUpload, removeCustom, syncAlarmSound };
