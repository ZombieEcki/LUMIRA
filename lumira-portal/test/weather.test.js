// Regenradar & Warnungen: Einstellungen (lib/weather.js), Aufbereitung
// (MMM-LumiraWeather/payload.js), Kartenausschnitt (geo.js)
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-weather-test-"));
process.env.LUMIRA_HOME = HOME;
const weatherLib = require("../lib/weather");
const payload = require("../../modules/MMM-LumiraWeather/payload");
const geo = require("../../modules/MMM-LumiraWeather/geo");
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("Portal und Spiegel nutzen dieselbe Aufbereitung und dieselbe Kartenrechnung", () => {
	const mod = read(path.join(__dirname, "..", "..", "modules", "MMM-LumiraWeather", "payload.js")).split("\n").slice(2).join("\n");
	const copy = read(path.join(__dirname, "..", "lib", "weather-shared.js")).split("\n").slice(2).join("\n");
	assert.equal(copy, mod, "lib/weather-shared.js = modules/MMM-LumiraWeather/payload.js (ohne Kopfzeilen)");
	assert.equal(read(path.join(__dirname, "..", "public", "weather-geo.js")), read(path.join(__dirname, "..", "..", "modules", "MMM-LumiraWeather", "geo.js")));
});

test("Einstellungen: Standard, Grenzen, verständliche Fehler, Standort aus den Einstellungen", () => {
	const w = weatherLib.createWeather({ home: path.join(HOME, "cfg") });
	let v = w.view();
	assert.equal(v.enabled, false);
	assert.equal(v.radar.anchor, "top_right");
	assert.equal(v.radar.basemap, "dwd");
	assert.equal(v.warnings.whenNone, "hide");
	v = w.setConfig({ enabled: true, radar: { anchor: "bottom_left", x: 40, y: 30, width: 500, opacity: 20, basemap: "osm", zoom: 9 }, warnings: { minSeverity: 2, whenNone: "note" } });
	assert.equal(v.enabled, true);
	assert.equal(v.radar.anchor, "bottom_left");
	assert.equal(v.radar.width, 500);
	assert.equal(v.radar.basemap, "osm");
	assert.equal(v.radar.height, 250, "nicht genannte Werte bleiben");
	assert.equal(v.warnings.minSeverity, 2);
	assert.throws(() => w.setConfig({ radar: { anchor: "irgendwo" } }), /unbekannte Position/);
	assert.throws(() => w.setConfig({ warnings: { width: 50 } }), /Breite 160 bis 1600/);
	assert.throws(() => w.setConfig({ radar: { basemap: "google" } }), /DWD oder OpenStreetMap/);
	assert.throws(() => w.setConfig({ radar: { zoom: 15 } }), /5 bis 11/);
	w.setLocation({ name: "Allershausen", lat: 48.43, lon: 11.59 });
	v = w.view();
	assert.deepEqual(v.location, { name: "Allershausen", lat: 48.43, lon: 11.59 });
	assert.equal(v.radar.anchor, "bottom_left", "Standort übernehmen ändert sonst nichts");
	const file = JSON.parse(fs.readFileSync(w.statePath, "utf8"));
	assert.equal(file.location.name, "Allershausen");
});

test("Radar: von −60 min über „jetzt“ bis +2 h in 10-Minuten-Schritten, „jetzt“ aus der DWD-Zeitachse", () => {
	const xml = '<Layer><Name>Niederschlagsradar</Name><Dimension name="time" default="current" units="ISO8601">2026-10-10T00:00:00.000Z/2026-10-13T19:10:00.000Z/PT5M</Dimension></Layer>';
	const end = payload.extentEnd(xml);
	assert.equal(end, "2026-10-13T19:10:00.000Z");
	const now = new Date("2026-10-13T17:13:47Z");
	const f = payload.radarFrames(end, now, 60, 120);
	assert.equal(f[0].offset, -60);
	assert.equal(f.find((x) => x.offset === 0).time, "2026-10-13T17:10:00.000Z");
	assert.equal(f[f.length - 1].time, "2026-10-13T19:10:00.000Z");
	assert.equal(f.length, 19);
	// ohne Zeitachse: aus der Uhr geschätzt, nur „jetzt“
	const only = payload.radarFrames(null, now, 0, 0);
	assert.equal(only.length, 1);
	assert.equal(only[0].offset, 0);
	assert.equal(only[0].time, "2026-10-13T17:00:00.000Z");
});

test("Warnungen: aufbereitet, sortiert, gefiltert, abgelaufene und Aufhebungen raus", () => {
	const now = new Date("2026-10-13T15:00:00Z");
	const p = (o) => ({ properties: Object.assign({ MSGTYPE: "Alert", ONSET: "2026-10-13T14:00:00Z", EXPIRES: "2026-10-13T20:00:00Z", AREADESC: "Gemeinde Allershausen" }, o) });
	const json = {
		features: [
			p({ EVENT: "STURMBÖEN", SEVERITY: "Moderate", EC_GROUP: "WIND", EC_AREA_COLOR: "251 140 0", HEADLINE: "Amtliche WARNUNG vor STURMBÖEN" }),
			p({ EVENT: "STURMBÖEN", SEVERITY: "Moderate", EC_GROUP: "WIND", HEADLINE: "Amtliche WARNUNG vor STURMBÖEN" }), // doppelt
			p({ EVENT: "SCHWERES GEWITTER mit HAGEL", SEVERITY: "Severe", EC_GROUP: "THUNDERSTORM;HAIL", HEADLINE: "Amtliche UNWETTERWARNUNG vor SCHWEREM GEWITTER mit HAGEL", ONSET: "2026-10-13T16:00:00Z" }),
			p({ EVENT: "FROST", SEVERITY: "Minor", EC_GROUP: "FROST", HEADLINE: "Amtliche WARNUNG vor FROST" }),
			p({ EVENT: "GLÄTTE", SEVERITY: "Minor", EXPIRES: "2026-10-13T12:00:00Z" }), // abgelaufen
			p({ EVENT: "NEBEL", SEVERITY: "Minor", MSGTYPE: "Cancel" }), // aufgehoben
			p({ EVENT: "DAUERREGEN", SEVERITY: "Moderate", HEADLINE: "VORABINFORMATION DAUERREGEN" })
		]
	};
	const all = payload.parseWarnings(json, now, 1);
	assert.deepEqual(all.map((w) => w.event), ["Schweres Gewitter mit Hagel", "Sturmböen", "Dauerregen", "Frost"]);
	assert.equal(all[0].level, 3);
	assert.equal(all[0].group, "THUNDERSTORM");
	assert.equal(all[1].color, "rgb(251,140,0)");
	assert.equal(all[2].preliminary, true);
	assert.deepEqual(payload.parseWarnings(json, now, 2).map((w) => w.event), ["Schweres Gewitter mit Hagel", "Sturmböen", "Dauerregen"]);
	assert.deepEqual(payload.parseWarnings(null, now, 1), []);
	assert.ok(payload.warningsUrl(48.43, 11.59).includes("POINT(48.43000%2011.59000)"), "Punkt in der Reihenfolge Breite, Länge");
});

test("Kartenausschnitt: BBOX passt zu Breite × Höhe, Kacheln decken alles ab, Standort in der Mitte", () => {
	const f = geo.frame(48.43, 11.59, 8, 400, 280);
	const res = 2 * Math.PI * 6378137 / (256 * 256);
	assert.ok(Math.abs((f.bbox[2] - f.bbox[0]) - 400 * res) < 1e-6);
	assert.ok(Math.abs((f.bbox[3] - f.bbox[1]) - 280 * res) < 1e-6);
	assert.deepEqual(f.marker, { x: 200, y: 140 });
	assert.ok(f.tiles.length >= 2 && f.tiles.length <= 9);
	assert.ok(f.tiles.every((t) => t.z === 8 && t.left <= 400 && t.top <= 280 && t.left > -256 && t.top > -256));
	assert.ok(f.km > 100 && f.km < 200, "z8 bei 400 px ≈ 160 km: " + f.km);
	// Probe: dieselbe BBOX wie die DWD-Testabfrage um Allershausen
	assert.deepEqual(f.bbox.map((v) => v.toFixed(1)), ["1167893.7", "6093082.5", "1412492.1", "6264301.5"]);
});

test("config.js: MMM-LumiraWeather immer geladen (zeigt nur etwas, wenn im Portal an)", () => {
	const s = Object.assign(settingsLib.load(), { edition: "fire" });
	assert.ok(buildModules(s).some((m) => m.module === "MMM-LumiraWeather"));
});
