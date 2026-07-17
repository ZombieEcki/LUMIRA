#!/usr/bin/env node
// LUMIRA – CLI-Wrapper um lib/settings.js#patch(), damit install.sh die
// Wizard-Antworten in dieselbe settings.json schreibt, die auch das
// Web-Portal nutzt (siehe concept/selfservice.md Abschnitt 7).
//
// Nutzung: JSON-Patch über stdin
//   echo '{"edition":"fire", ...}' | node save-settings-cli.js
"use strict";

const settingsLib = require("../lib/settings");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
	let patch;
	try {
		patch = JSON.parse(input || "{}");
	} catch (err) {
		console.error("[save-settings] Ungültiges JSON auf stdin:", err.message);
		process.exit(1);
	}
	try {
		const saved = settingsLib.patch(patch);
		process.stdout.write(JSON.stringify(saved, null, 2) + "\n");
	} catch (err) {
		console.error(`[save-settings] ${err.field ? err.field + ": " : ""}${err.message}`);
		process.exit(1);
	}
});
