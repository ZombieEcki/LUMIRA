// LUMIRA – gemeinsamer JSON-Speicher für settings.json, compliments.json und
// familyplan.json.
//
// Backup vor jedem Schreiben (die letzten maxBackups Stände in
// ~/.lumira/backups/<prefix>.<zeitstempel>.json) und atomarer Schreibvorgang
// (.tmp + rename), damit eine halb geschriebene Datei nach Stromausfall nie
// die einzige Wahrheit zerstört. Früher war das in settings.js und
// compliments.js je einmal kopiert (siehe concept/familienplan.md Phase 0).
"use strict";

const fs = require("fs");
const path = require("path");

function createJsonStore({ filePath, backupDir, backupPrefix, maxBackups = 15 }) {
	const prefix = `${backupPrefix}.`;

	function ensureDirs() {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.mkdirSync(backupDir, { recursive: true });
	}

	function exists() {
		return fs.existsSync(filePath);
	}

	// Liefert das geparste JSON oder null (Datei fehlt). Wirft bei kaputtem
	// JSON – der Aufrufer entscheidet, ob er auf Defaults zurückfällt.
	function readRaw() {
		if (!exists()) return null;
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	}

	function listBackups() {
		if (!fs.existsSync(backupDir)) return [];
		return fs.readdirSync(backupDir).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort();
	}

	// Sichert die aktuelle Datei (falls vorhanden) und behält nur die letzten
	// maxBackups Stände.
	function backupExisting() {
		if (!exists()) return null;
		ensureDirs();
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		const dest = path.join(backupDir, `${prefix}${stamp}.json`);
		fs.copyFileSync(filePath, dest);
		const files = listBackups();
		while (files.length > maxBackups) {
			fs.unlinkSync(path.join(backupDir, files.shift()));
		}
		return dest;
	}

	function write(data) {
		ensureDirs();
		backupExisting();
		const tmp = `${filePath}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
		fs.renameSync(tmp, filePath);
		return data;
	}

	// Liest ein Backup (nur Dateinamen aus listBackups(), kein Pfad von außen).
	function readBackup(name) {
		if (listBackups().indexOf(name) === -1) return null;
		return JSON.parse(fs.readFileSync(path.join(backupDir, name), "utf8"));
	}

	return { filePath, exists, readRaw, write, backupExisting, listBackups, readBackup };
}

module.exports = { createJsonStore };
