// Spiegel-Module ein-/ausschalten (settings.modules → config.js)
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-modules-test-"));
process.env.LUMIRA_HOME = HOME;
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

function names(mods) {
	return mods.map((m) => m.module + (m.module === "weather" ? ":" + m.config.type : ""));
}

test("Standard: alle Module an", () => {
	const s = Object.assign(settingsLib.load(), { edition: "fire" });
	s.calendar = { urls: ["https://example.com/cal.ics"] };
	const n = names(buildModules(s));
	for (const m of ["clock", "MMM-aPagerAlarm", "weather:current", "weather:forecast", "calendar", "newsfeed", "MMM-SmartCompliments"]) {
		assert.ok(n.includes(m), m);
	}
	assert.equal(buildModules(s).find((m) => m.module === "MMM-LumiraStatus").config.showStatusHint, true);
});

test("Ausgeschaltet: Modul fehlt in config.js, Alarm-Bezüge verschwinden mit", () => {
	const saved = settingsLib.patch({ edition: "fire", modules: { clock: false, weather: false, news: false, alarm: false, compliments: false, statusHint: false } });
	assert.equal(saved.modules.alarm, false);
	assert.equal(saved.modules.calendar, true, "nicht genannte bleiben an");
	const mods = buildModules(saved);
	const n = names(mods);
	for (const m of ["clock", "MMM-aPagerAlarm", "weather:current", "weather:forecast", "newsfeed", "MMM-SmartCompliments"]) {
		assert.ok(!n.includes(m), m + " ist aus");
	}
	assert.ok(n.includes("MMM-LumiraStatus"), "Status bleibt (Setup-QR, Live-Bild), nur der Hinweis ist aus");
	assert.equal(mods.find((m) => m.module === "MMM-LumiraStatus").config.showStatusHint, false);
	assert.deepEqual(mods.find((m) => m.module === "MMM-Ambient").config.interruptOnAlarmPhases, [], "kein Alarm → nichts zu unterbrechen");
});

test("Familienplan/Sprüche ohne Alarm: blenden sich bei Alarm nicht aus", () => {
	const s = settingsLib.patch({ edition: "fire", modules: { alarm: false, compliments: true }, familyPlan: { enabled: true } });
	const mods = buildModules(s);
	const sc = mods.find((m) => m.module === "MMM-SmartCompliments");
	assert.equal(sc.config.firefighterIntegration, false);
	assert.deepEqual(sc.config.hideOnAlarmPhases, []);
	const fp = mods.find((m) => m.module === "MMM-FamilyPlan");
	if (fp) assert.deepEqual(fp.config.hideOnAlarmPhases, []);
});

test("Ungültige Schalter werden abgelehnt", () => {
	assert.throws(() => settingsLib.patch({ modules: { alarm: "nein" } }), settingsLib.ValidationError);
	// Unbekannte Felder verwirft das Speichern still (wie überall in settings.json)
	assert.equal(settingsLib.patch({ modules: { toaster: true } }).modules.toaster, undefined);
});

test("Familienplan-Größe: 60–200 %, landet in der config.js", () => {
	assert.throws(() => settingsLib.patch({ familyPlan: { scale: 250 } }), settingsLib.ValidationError);
	const s = settingsLib.patch({ edition: "fire", familyPlan: { enabled: true, scale: 130 } });
	const fp = buildModules(s).find((m) => m.module === "MMM-FamilyPlan");
	assert.equal(fp.config.scale, 130);
});
