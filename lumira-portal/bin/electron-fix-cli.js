#!/usr/bin/env node
// LUMIRA – bekannte fehlerhafte Electron-Version in MagicMirror austauschen
// (siehe lib/electron-fix.js). Von install.sh nach Installation/Update genutzt.
//
// Nutzung: node electron-fix-cli.js --mm-root=<pfad zu ~/MagicMirror>
"use strict";

const path = require("path");
const { execFile } = require("child_process");
const { applyFix, installedElectron } = require("../lib/electron-fix");

const arg = process.argv.slice(2).find((a) => a.startsWith("--mm-root="));
if (!arg) {
	console.error("Aufruf: electron-fix-cli.js --mm-root=<pfad>");
	process.exit(2);
}
const mmRoot = path.resolve(arg.slice("--mm-root=".length));

function npm(args, cwd) {
	return new Promise((resolve, reject) => {
		execFile(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) { err.message = String(stderr || err.message).trim().split("\n").pop(); return reject(err); }
			resolve({ stdout: String(stdout || "") });
		});
	});
}

applyFix(mmRoot, { npm, log: (l) => console.log("  " + l) })
	.then((r) => {
		if (!r.fixed) console.log(`  ✓ Electron ${installedElectron(mmRoot) || "(nicht gefunden)"} – kein bekannter Fehler`);
	})
	.catch((err) => {
		console.error("  ! Electron-Austausch fehlgeschlagen: " + err.message);
		process.exit(1);
	});
