// LUMIRA – Datei atomar ersetzen (.tmp → Ziel) auch unter Windows.
//
// Auf dem Raspberry Pi (Linux) ist rename atomar und klappt immer. Unter
// Windows (Entwicklung, Tests) hält manchmal der Virenscanner oder die Suche
// die gerade geschriebene Datei für einige Millisekunden offen – rename
// scheitert dann mit EPERM/EACCES/EBUSY. Dann kurz warten und erneut
// versuchen (insgesamt höchstens rund eine Sekunde), statt den Speichervorgang
// abzubrechen.
"use strict";

const fs = require("fs");

const RETRY_CODES = ["EPERM", "EACCES", "EBUSY"];
const WAITS_MS = [5, 10, 20, 40, 80, 120, 160, 200, 250, 300];

function sleepSync(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameRetry(from, to) {
	for (let i = 0; ; i++) {
		try {
			fs.renameSync(from, to);
			return;
		} catch (err) {
			if (RETRY_CODES.indexOf(err.code) === -1 || i >= WAITS_MS.length) throw err;
			sleepSync(WAITS_MS[i]);
		}
	}
}

module.exports = { renameRetry, RETRY_CODES };
