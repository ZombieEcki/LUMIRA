// LUMIRA – Betriebsmodus-Zustand (FAMILY / SETUP), siehe
// concept/selfservice.md Abschnitt 2 (Zustandsmaschine).
//
// Wird von provision.js (Watchdog) geschrieben und von server.js sowie
// MMM-LumiraStatus/node_helper.js gelesen – eine einfache JSON-Datei statt
// eines Sockets, damit auch ein frisch gestarteter Prozess sofort den
// aktuellen Stand kennt.
"use strict";

const fs = require("fs");
const path = require("path");
const { LUMIRA_HOME } = require("./settings");

const MODE_PATH = process.env.LUMIRA_MODE_PATH || path.join(LUMIRA_HOME, "mode.json");

const MODES = { FAMILY: "FAMILY", SETUP: "SETUP" };

function defaultState() {
	return {
		mode: MODES.FAMILY,
		since: new Date().toISOString(),
		reason: "start",
		apSsid: "",
		apPsk: ""
	};
}

function get() {
	if (!fs.existsSync(MODE_PATH)) return defaultState();
	try {
		return Object.assign(defaultState(), JSON.parse(fs.readFileSync(MODE_PATH, "utf8")));
	} catch (err) {
		console.error("[lumira-portal] mode.json ist beschädigt, nutze FAMILY:", err.message);
		return defaultState();
	}
}

function set(mode, extra) {
	if (mode !== MODES.FAMILY && mode !== MODES.SETUP) {
		throw new Error(`Ungültiger Modus: ${mode}`);
	}
	const current = get();
	const next = Object.assign({}, current, extra, {
		mode,
		since: current.mode === mode ? current.since : new Date().toISOString()
	});
	fs.mkdirSync(path.dirname(MODE_PATH), { recursive: true });
	const tmp = `${MODE_PATH}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
	fs.renameSync(tmp, MODE_PATH);
	return next;
}

module.exports = { MODE_PATH, MODES, get, set };
