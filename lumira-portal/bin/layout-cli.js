#!/usr/bin/env node
// LUMIRA – Notfall-Schalter für das Bildschirm-Layout, ohne Portal:
//   node ~/LUMIRA/lumira-portal/bin/layout-cli.js classic   → zurück zum bisherigen Layout
//   node ~/LUMIRA/lumira-portal/bin/layout-cli.js free      → Free-Layout wieder an
//   node ~/LUMIRA/lumira-portal/bin/layout-cli.js status    → Modus und aktives Layout
// Die Module lesen layout.json live – kein Neustart nötig.
"use strict";

const settingsLib = require("../lib/settings");
const { createLayout } = require("../lib/layout");

const cmd = process.argv[2] || "status";
const layout = createLayout({ home: settingsLib.LUMIRA_HOME });
try {
	if (cmd === "classic" || cmd === "free") {
		layout.setMode(cmd);
		process.stdout.write("Layout: " + (cmd === "classic" ? "Classic (wie bisher)" : "Free") + " ist aktiv.\n");
	} else {
		const d = layout.load();
		const p = d.profiles.find((x) => x.id === d.active);
		process.stdout.write("Modus: " + d.mode + " · aktives Layout: " + (p ? p.name : "?") + "\n");
	}
} catch (err) {
	process.stderr.write("[layout] " + err.message + "\n");
	process.exit(1);
}
