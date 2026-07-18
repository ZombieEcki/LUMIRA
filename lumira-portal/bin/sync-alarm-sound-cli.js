#!/usr/bin/env node
// LUMIRA – stellt einen per Portal hochgeladenen eigenen Alarmton wieder her,
// nachdem install.sh den Modulordner MMM-aPagerAlarm per rsync --delete
// geleert hat. Läuft unconditional bei jedem install.sh-Durchlauf, unabhängig
// von write_config()/--reconfigure (siehe lib/alarm-sound.js für den Hintergrund).
//
// Nutzung: node sync-alarm-sound-cli.js --mm-root=<pfad zu ~/MagicMirror>
"use strict";

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
	if (!args["mm-root"]) {
		process.stderr.write("[sync-alarm-sound] --mm-root fehlt\n");
		process.exit(1);
	}
	const settingsLib = require("../lib/settings");
	const alarmSoundLib = require("../lib/alarm-sound");
	const settings = settingsLib.load();
	alarmSoundLib.syncAlarmSound(path.resolve(args["mm-root"]), settings);
}

main();
