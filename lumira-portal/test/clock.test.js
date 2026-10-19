// Uhr: Einstellungen (lib/clock.js), Formate und Designs (clock-view.js),
// Einbindung in die config.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-clock-test-"));
process.env.LUMIRA_HOME = HOME;
const clockLib = require("../lib/clock");
const view = require("../public/clock-view");
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");
const MOD = path.join(__dirname, "..", "..", "modules", "MMM-LumiraClock");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("Portal und Bildschirm nutzen dieselbe Uhr (clock-view.js/.css)", () => {
	assert.equal(read(path.join(__dirname, "..", "public", "clock-view.js")), read(path.join(MOD, "clock-view.js")));
	assert.equal(read(path.join(__dirname, "..", "public", "clock-view.css")), read(path.join(MOD, "clock-view.css")));
});

test("16 Designs, jedes hat Stil im CSS und einen Aufbau", () => {
	assert.equal(view.DESIGNS.length, 16);
	const css = read(path.join(MOD, "clock-view.css"));
	const src = read(path.join(MOD, "clock-view.js"));
	const ids = view.DESIGNS.map((d) => d.id);
	assert.equal(new Set(ids).size, 16, "eindeutige IDs");
	for (const d of view.DESIGNS) {
		assert.ok(css.includes(".lc-d-" + d.id), d.id + " im CSS");
		assert.ok(new RegExp("\n\t\t" + d.id + ": function").test(src), d.id + " in BUILD");
		assert.ok(d.width >= 120 && d.width <= 1600, d.id + " Breite");
	}
});

test("Uhrzeit: 24 h Standard, 12 h mit AM/PM, Sekunden", () => {
	const t = new Date(2026, 6, 8, 15, 58, 7);
	assert.deepEqual(view.timeParts(t, false), { hm: "15:58", h: "15", m: "58", s: "07", ampm: "" });
	assert.equal(view.timeParts(t, true).hm, "3:58");
	assert.equal(view.timeParts(t, true).ampm, "PM");
	assert.equal(view.timeParts(new Date(2026, 6, 8, 0, 5), true).hm, "12:05");
	assert.equal(view.timeParts(new Date(2026, 6, 8, 0, 5), true).ampm, "AM");
	assert.equal(view.timeParts(new Date(2026, 6, 8, 9, 5), false).hm, "09:05");
});

test("Datum deutsch: lang, kurz, nur Wochentag, nur Datum", () => {
	const d = new Date(2026, 6, 8, 12, 0);
	const line = (o) => view.dateLine(d, Object.assign({ weekday: true, date: true, dateStyle: "long" }, o));
	assert.equal(line({}), "Mittwoch, 8. Juli 2026");
	assert.equal(line({ dateStyle: "short" }), "Mi, 08.07.2026");
	assert.equal(line({ date: false }), "Mittwoch");
	assert.equal(line({ weekday: false }), "8. Juli 2026");
	assert.equal(line({ weekday: false, date: false }), "");
	assert.equal(view.dateParts(new Date(2026, 2, 1), "long").date, "1. März 2026");
});

test("Einstellungen: Standard wie bisher, Grenzen, verständliche Fehler", () => {
	const c = clockLib.createClock({ home: path.join(HOME, "cfg") });
	const v = c.view();
	assert.equal(v.design, "classic");
	assert.equal(v.anchor, "auto", "Standard: wie die alte Uhr oben links");
	assert.equal(v.hour12, false);
	assert.equal(v.seconds, false);
	assert.equal(v.report, null);
	const s = c.setConfig({ design: "analog", anchor: "bottom_right", x: 40, unit: "pct", seconds: true, accent: "#FF00AA" });
	assert.equal(s.design, "analog");
	assert.equal(s.anchor, "bottom_right");
	assert.equal(s.accent, "#ff00aa");
	assert.equal(c.load().seconds, true, "gespeichert");
	assert.equal(JSON.parse(fs.readFileSync(c.statePath, "utf8")).version, 1);
	assert.throws(() => c.setConfig({ design: "rokoko" }), /unbekanntes Design/);
	assert.throws(() => c.setConfig({ anchor: "oben" }), /unbekannte Position/);
	assert.throws(() => c.setConfig({ width: 50 }), /Breite 120 bis 1600/);
	assert.throws(() => c.setConfig({ fontScale: "" }), /Schriftgröße/);
	assert.throws(() => c.setConfig({ seconds: "ja" }), /ungültiger Schalter/);
	assert.throws(() => c.setConfig({ accent: "rot" }), /#RRGGBB/);
	assert.throws(() => c.setConfig({ dateStyle: "mittel" }), /lang oder kurz/);
	assert.equal(c.setConfig({ accent: "" }).accent, "", "zurück zur Farbe des Designs");
	// kaputte Datei: Standard statt Absturz
	fs.writeFileSync(c.statePath, "{kaputt");
	assert.equal(c.load().design, "classic");
});

test("Rückmeldung des Bildschirms wird gelesen", () => {
	const home = path.join(HOME, "rep");
	const c = clockLib.createClock({ home });
	fs.mkdirSync(home, { recursive: true });
	fs.writeFileSync(path.join(home, "clock-mirror.json"), JSON.stringify({ at: "x", screen: { width: 1080, height: 1920 }, overlaps: ["Familienplan"], offscreen: true }));
	const r = c.view().report;
	assert.deepEqual(r.overlaps, ["Familienplan"]);
	assert.equal(r.offscreen, true);
	assert.equal(r.screen.width, 1080);
});

test("config.js: MMM-LumiraClock statt clock, oben links vor dem Familienplan", () => {
	const s = Object.assign(settingsLib.load(), { edition: "home" });
	s.familyPlan = Object.assign({}, s.familyPlan, { enabled: true });
	const mods = buildModules(s);
	const names = mods.map((m) => m.module);
	assert.ok(!names.includes("clock"), "alte Uhr entfernt");
	const i = names.indexOf("MMM-LumiraClock");
	assert.ok(i !== -1);
	assert.equal(mods[i].position, "top_left");
	if (names.includes("MMM-FamilyPlan")) assert.ok(names.indexOf("MMM-FamilyPlan") > i, "Familienplan unter der Uhr");
	s.modules = Object.assign({}, s.modules, { clock: false });
	assert.ok(!buildModules(s).some((m) => m.module === "MMM-LumiraClock"), "aus heißt weg");
});
