#!/usr/bin/env node
// LUMIRA – CLI-Wrapper um lib/generate-config.js, damit install.sh denselben
// Generator nutzt wie das Web-Portal (siehe concept/selfservice.md Abschnitt 7).
//
// Nutzung:
//   node generate-config-cli.js [--settings=<pfad>] [--out=<pfad>]
// Ohne --settings: Standardpfad aus lib/settings.js (~/.lumira/settings.json).
// Ohne --out: Ausgabe auf stdout.
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
	const out = {};
	for (const arg of argv) {
		const m = /^--([a-z-]+)=(.*)$/.exec(arg);
		if (m) out[m[1]] = m[2];
	}
	return out;
}

function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.settings) {
		process.env.LUMIRA_SETTINGS_PATH = path.resolve(args.settings);
	}

	const settingsLib = require("../lib/settings");
	const { generateConfig } = require("../lib/generate-config");

	const settings = settingsLib.load();
	try {
		settingsLib.validate(settings);
	} catch (err) {
		process.stderr.write(`[generate-config] Warnung: settings.json ungültig (${err.field}: ${err.message}) – erzeuge trotzdem\n`);
	}

	const output = generateConfig(settings);

	if (args.out) {
		const dest = path.resolve(args.out);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, output, "utf8");
		process.stderr.write(`[generate-config] geschrieben: ${dest}\n`);
	} else {
		process.stdout.write(output);
	}
}

main();
