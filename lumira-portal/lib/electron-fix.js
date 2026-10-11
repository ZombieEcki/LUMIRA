// LUMIRA – bekannte fehlerhafte Electron-Versionen in MagicMirror austauschen.
//
// MagicMirror² 2.38.0 liefert Electron 44.4.5 aus. Damit bleibt der Bildschirm
// auf dem Raspberry Pi 3 schwarz: Der Server läuft, das Anzeigefenster stirbt
// (MagicMirrorOrg/MagicMirror#4287). Electron 44.5.1 behebt das; MagicMirror
// zieht das mit dem nächsten Release nach.
//
// Nach jeder MagicMirror-Installation bzw. jedem Update (install.sh, Portal →
// Info) prüft LUMIRA die installierte Version und tauscht sie bei Bedarf aus –
// mit --no-save --package-lock=false, damit der MagicMirror-Ordner für git
// sauber bleibt (sonst würde die Update-Prüfung „lokale Änderungen“ melden).
// Liefert MagicMirror eine andere Version aus, greift hier nichts mehr.
"use strict";

const fs = require("fs");
const path = require("path");

const FIXES = {
	"44.4.5": {
		to: "44.5.1",
		reason: "schwarzer Bildschirm auf dem Raspberry Pi 3 (MagicMirror-Fehler #4287)"
	}
};

function installedElectron(mmRoot) {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(mmRoot, "node_modules", "electron", "package.json"), "utf8"));
		return typeof pkg.version === "string" ? pkg.version : null;
	} catch (err) {
		return null;
	}
}

// { from, to, reason } oder null
function needsFix(mmRoot) {
	const v = installedElectron(mmRoot);
	if (!v || !Object.prototype.hasOwnProperty.call(FIXES, v)) return null;
	return { from: v, to: FIXES[v].to, reason: FIXES[v].reason };
}

/**
 * Tauscht eine fehlerhafte Electron-Version aus.
 * @param {string} mmRoot
 * @param {object} opts
 * @param {Function} opts.npm  (args, cwd) → Promise<{stdout}>
 * @param {Function} [opts.log]
 * @returns {Promise<{fixed: boolean, from?: string, to?: string}>}
 */
async function applyFix(mmRoot, { npm, log = () => {} }) {
	const fix = needsFix(mmRoot);
	if (!fix) return { fixed: false };
	log(`Electron ${fix.from} ist fehlerhaft (${fix.reason}) – tausche gegen ${fix.to} …`);
	log(`$ npm install --no-save --package-lock=false electron@${fix.to}   (lädt rund 100 MB, dauert auf dem Pi einige Minuten)`);
	const r = await npm(["install", "--no-save", "--package-lock=false", "--no-audit", "--no-fund", `electron@${fix.to}`], mmRoot);
	if (r && r.stdout) log(r.stdout.split("\n").filter(Boolean).slice(-5).join("\n"));
	const now = installedElectron(mmRoot);
	if (now !== fix.to) throw new Error(`Electron ist danach ${now || "nicht installiert"} statt ${fix.to}`);
	log(`Electron ${fix.to} installiert.`);
	return { fixed: true, from: fix.from, to: fix.to };
}

module.exports = { FIXES, installedElectron, needsFix, applyFix };
