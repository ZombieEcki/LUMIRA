// LUMIRA – Uhr (Bildschirm → Uhr), Modul MMM-LumiraClock.
//
// Einstellungen in ~/.lumira/clock.json. Nur das Portal schreibt (atomar per
// .tmp + rename), MMM-LumiraClock liest per fs.watch – Design, Position,
// Größe usw. sind nach wenigen Sekunden auf dem Bildschirm, ohne Neustart.
// Ein/aus bleibt der Schalter „Uhr“ (settings.modules.clock, mit Neustart).
// Die Bereinigung steckt in clock-view.js, das sich Portal und Modul teilen
// (public/clock-view.js = modules/MMM-LumiraClock/clock-view.js, der Test
// prüft Gleichheit).
"use strict";

const fs = require("fs");
const path = require("path");
const { renameRetry } = require("./atomic");
const view = require("../public/clock-view");

class ClockError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

const LIMITS = {
	x: [-3000, 3000, "Abstand waagerecht"], y: [-3000, 3000, "Abstand senkrecht"],
	width: [120, 1600, "Breite"], height: [60, 1200, "Höhe"], fontScale: [40, 300, "Schriftgröße"],
	gap: [0, 60, "Abstand Uhrzeit–Datum"], padding: [0, 60, "Innenabstand"],
	opacity: [0, 100, "Deckkraft"], line: [1, 8, "Linienstärke"]
};
const BOOLS = ["hour12", "seconds", "weekday", "date", "digital", "glass"];
const IDS = view.DESIGNS.map((d) => d.id);

// Prüft eine Änderung aus dem Portal und meldet Fehler verständlich
function checkPatch(p) {
	if (!p || typeof p !== "object" || Array.isArray(p)) throw new ClockError("Ungültige Einstellungen");
	if (p.design !== undefined && IDS.indexOf(p.design) === -1) throw new ClockError("Uhr: unbekanntes Design");
	if (p.anchor !== undefined && p.anchor !== "auto" && view.ANCHORS.indexOf(p.anchor) === -1) throw new ClockError("Uhr: unbekannte Position");
	if (p.unit !== undefined && ["px", "pct"].indexOf(p.unit) === -1) throw new ClockError("Uhr: Abstände in px oder %");
	if (p.dateStyle !== undefined && ["long", "short"].indexOf(p.dateStyle) === -1) throw new ClockError("Uhr: Datum lang oder kurz");
	for (const k of BOOLS) {
		if (p[k] !== undefined && typeof p[k] !== "boolean") throw new ClockError("Uhr: ungültiger Schalter „" + k + "“");
	}
	for (const k of Object.keys(LIMITS)) {
		if (p[k] === undefined) continue;
		const n = Number(p[k]);
		const [min, max, label] = LIMITS[k];
		if (p[k] === "" || p[k] === null || !Number.isFinite(n) || n < min || n > max) throw new ClockError(`Uhr: ${label} ${min} bis ${max}`);
	}
	if (p.accent !== undefined && p.accent !== "" && !/^#[0-9a-f]{6}$/i.test(String(p.accent))) throw new ClockError("Uhr: Farbe als #RRGGBB");
}

function createClock({ home, now = () => new Date() } = {}) {
	home = path.resolve(home);
	const statePath = path.join(home, "clock.json");
	const reportPath = path.join(home, "clock-mirror.json");

	function load() {
		try {
			return view.clean(JSON.parse(fs.readFileSync(statePath, "utf8")));
		} catch (e) {
			return view.clean(null);
		}
	}

	function save(cfg) {
		fs.mkdirSync(home, { recursive: true });
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(Object.assign({ version: 1, updatedAt: now().toISOString() }, cfg), null, 2));
		renameRetry(tmp, statePath);
		return cfg;
	}

	// Rückmeldung des Bildschirms: überdeckt die Uhr etwas, ragt sie hinaus?
	function report() {
		try {
			const r = JSON.parse(fs.readFileSync(reportPath, "utf8"));
			return {
				at: String(r.at || ""),
				screen: r.screen || null,
				overlaps: Array.isArray(r.overlaps) ? r.overlaps.map(String) : [],
				offscreen: !!r.offscreen
			};
		} catch (e) {
			return null;
		}
	}

	function current() {
		return Object.assign(load(), { report: report(), defaults: view.DEFAULTS });
	}

	function setConfig(patch) {
		checkPatch(patch);
		const next = Object.assign(load(), patch);
		save(view.clean(next));
		return current();
	}

	return { load, view: current, setConfig, statePath };
}

module.exports = { createClock, ClockError, checkPatch };
