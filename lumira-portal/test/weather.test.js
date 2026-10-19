// Regenradar & Warnungen: Einstellungen (lib/weather.js), Aufbereitung
// (MMM-LumiraWeather/payload.js), Kartenausschnitt (weather-geo.js)
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
const geo = require("../../modules/MMM-LumiraWeather/weather-geo");
const view = require("../../modules/MMM-LumiraWeather/weather-view");
const MOD = path.join(__dirname, "..", "..", "modules", "MMM-LumiraWeather");
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("Portal und Spiegel nutzen dieselbe Aufbereitung und dieselbe Kartenrechnung", () => {
	const mod = read(path.join(__dirname, "..", "..", "modules", "MMM-LumiraWeather", "payload.js")).split("\n").slice(2).join("\n");
	const copy = read(path.join(__dirname, "..", "lib", "weather-shared.js")).split("\n").slice(2).join("\n");
	assert.equal(copy, mod, "lib/weather-shared.js = modules/MMM-LumiraWeather/payload.js (ohne Kopfzeilen)");
	assert.equal(read(path.join(__dirname, "..", "public", "weather-geo.js")), read(path.join(__dirname, "..", "..", "modules", "MMM-LumiraWeather", "weather-geo.js")));
	assert.equal(read(path.join(__dirname, "..", "public", "weather-view.js")), read(path.join(MOD, "weather-view.js")), "public/weather-view.js = weather-view.js");
	assert.equal(read(path.join(__dirname, "..", "public", "weather-view.css")), read(path.join(MOD, "weather-view.css")), "public/weather-view.css = weather-view.css");
});

test("Wetteranzeige: Designs, Werte und Symbole passen zusammen", () => {
	assert.deepEqual(view.DESIGNS.map((d) => d.id), payload.DESIGN_IDS);
	assert.deepEqual(view.FIELDS.map((f) => f[0]).sort(), Object.keys(payload.DEFAULTS.weather.show).sort());
	// jedes Symbol, das vorkommen kann, liegt im Modul
	const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99, 42];
	const names = new Set(["humidity", "wind", "barometer", "uv-index", "umbrella", "sunrise"]);
	codes.forEach((c) => { names.add(view.iconOf(c, true)); names.add(view.iconOf(c, false)); });
	names.forEach((n) => assert.ok(fs.existsSync(path.join(MOD, "icons", n + ".svg")), "Symbol fehlt: " + n));
	["sunny", "fair", "golden", "cloudy", "rain", "storm", "snow", "fog", "dusk"].forEach((s) => assert.ok(fs.existsSync(path.join(MOD, "backgrounds", s + ".jpg")), "Bild fehlt: " + s));
	assert.ok(fs.existsSync(path.join(MOD, "icons", "LICENSE")), "Lizenz der Meteocons liegt bei");
	// Was welches Design zeigen kann
	assert.equal(view.supports("detailed", "humidity"), true);
	assert.equal(view.supports("classic", "humidity"), false);
	assert.equal(view.supports("classic", "rain"), true, "Regen pro Tag in der Vorhersage");
	assert.equal(view.supports("icons", "location"), false);
	assert.equal(view.supports("detailed", "date"), true);
	assert.equal(view.supports("bar", "date"), false);
});

test("Wetteranzeige: Wetterlage, Hintergrundbild, Formate", () => {
	assert.equal(view.iconOf(0, true), "clear-day");
	assert.equal(view.iconOf(0, false), "clear-night");
	assert.equal(view.iconOf(61, false), "partly-cloudy-night-rain");
	assert.equal(view.iconOf(65, true), "rain");
	assert.equal(view.iconOf(99, true), "hail");
	assert.equal(view.iconOf(7, true), "not-available");
	assert.equal(view.describe(0, true), "Sonnig");
	assert.equal(view.describe(0, false), "Klar");
	assert.equal(view.describe(80, true), "Leichte Regenschauer");
	const rise = 1792301870, set = 1792340348;
	assert.equal(view.sceneOf(95, true, rise + 9000, rise, set).scene, "storm");
	assert.equal(view.sceneOf(73, true, rise + 9000, rise, set).scene, "snow");
	assert.equal(view.sceneOf(81, true, rise + 9000, rise, set).scene, "rain");
	assert.equal(view.sceneOf(45, true, rise + 9000, rise, set).scene, "fog");
	assert.equal(view.sceneOf(3, true, rise + 9000, rise, set).scene, "cloudy");
	assert.equal(view.sceneOf(0, true, rise + 9000, rise, set).scene, "sunny");
	assert.equal(view.sceneOf(2, true, rise + 9000, rise, set).scene, "fair");
	assert.equal(view.sceneOf(0, true, set - 600, rise, set).scene, "golden", "Abendrot");
	assert.equal(view.sceneOf(1, true, rise + 600, rise, set).scene, "golden", "Morgenrot");
	assert.deepEqual(view.sceneOf(0, false, set + 7200, rise, set), { scene: "dusk", night: false });
	assert.deepEqual(view.sceneOf(63, false, set + 7200, rise, set), { scene: "rain", night: true }, "Regen nachts: Bild abgedunkelt");
	assert.equal(view.deg(22.24, true), "22,2°");
	assert.equal(view.deg(-0.04, true), "0,0°");
	assert.equal(view.deg(-0.4), "0°");
	assert.equal(view.deg(null), "–");
	assert.equal(view.windText(12.4, "kmh", 340), "12 km/h N");
	assert.equal(view.windText(12.4, "ms", 225), "3,4 m/s SW");
	assert.equal(view.windText(30, "bft", 90), "Bft 5 O");
	assert.equal(view.windText(null, "kmh", 90), null);
	assert.equal(view.beaufort(0.5), 0);
	assert.equal(view.beaufort(130), 12);
	assert.equal(view.uvText(5.4), "5 (mäßig)");
	assert.equal(view.uvText(0), "0 (niedrig)");
	assert.equal(view.hm(rise, 7200), "07:37");
});

// Gekürzte echte Antwort von Open-Meteo (Allershausen, 18.10.2026 nachts)
const OPEN_METEO = {
	utc_offset_seconds: 7200, timezone: "Europe/Berlin",
	current: { time: 1792275300, temperature_2m: 10.2, apparent_temperature: 8.7, relative_humidity_2m: 95, weather_code: 3, is_day: 0, wind_speed_10m: 9.6, wind_direction_10m: 340, pressure_msl: 1020.6, uv_index: 0 },
	daily: {
		time: [1792274400, 1792360800, 1792447200],
		weather_code: [80, 3, 2], temperature_2m_max: [17.5, 16.1, 16.5], temperature_2m_min: [8.7, 6.1, 3.7],
		precipitation_probability_max: [55, 0, null], precipitation_sum: [1.4, 0, 0],
		sunrise: [1792301870, 1792388362, 1792474853], sunset: [1792340348, 1792426634, 1792512921]
	}
};

test("Wetterdaten: Open-Meteo aufbereitet, fehlende Werte bleiben leer, Tage am Standort", () => {
	const d = payload.parseForecast(OPEN_METEO);
	assert.equal(d.current.temp, 10.2);
	assert.equal(d.current.isDay, false);
	assert.equal(d.current.pressure, 1020.6);
	assert.equal(d.days.length, 3);
	assert.equal(d.days[0].key, "2026-10-18");
	assert.equal(d.days[0].wd, 0, "Sonntag");
	assert.equal(d.days[2].pop, null, "nicht geliefert → null, nicht 0");
	assert.equal(payload.parseForecast(null), null);
	assert.equal(payload.parseForecast({ current: {}, daily: { time: [] } }), null);
	// ohne UV in der Antwort: null
	const noUv = JSON.parse(JSON.stringify(OPEN_METEO));
	delete noUv.current.uv_index;
	assert.equal(payload.parseForecast(noUv).current.uv, null);
	// „Heute“ am Standort; Tage von gestern fallen weg
	const up = view.upcoming(d, new Date("2026-10-19T08:00:00Z"));
	assert.deepEqual(up.map((x) => x.label), ["Heute", "Di"]);
	assert.ok(payload.forecastUrl(48.43, 11.59).includes("latitude=48.4300&longitude=11.5900"));
	assert.ok(payload.forecastUrl(48.43, 11.59).includes("timezone=auto"));
});

test("Wetteranzeige: Einstellungen, Abstände in %, verständliche Fehler", () => {
	const w = weatherLib.createWeather({ home: path.join(HOME, "cfg-wx") });
	let v = w.view();
	assert.equal(v.weather.enabled, false, "neu: erst einmal aus");
	assert.equal(v.weather.design, "classic");
	assert.equal(v.weather.unit, "px");
	v = w.setConfig({ weather: { enabled: true, design: "photo", width: 430, show: { rain: true } } });
	assert.equal(v.weather.design, "photo");
	assert.equal(v.weather.show.rain, true);
	assert.equal(v.weather.show.location, true, "andere Werte bleiben");
	assert.equal(v.enabled, false, "Radar & Warnungen bleiben aus");
	v = w.setConfig({ weather: { unit: "pct", x: 5, y: 3 } });
	assert.equal(v.weather.unit, "pct");
	assert.equal(v.weather.x, 5);
	assert.equal(payload.cleanConfig({ weather: { unit: "pct", x: 400 } }).weather.x, 100, "höchstens 100 %");
	assert.throws(() => w.setConfig({ weather: { design: "bunt" } }), /unbekanntes Design/);
	assert.throws(() => w.setConfig({ weather: { wind: "knoten" } }), /km\/h, m\/s oder Beaufort/);
	assert.throws(() => w.setConfig({ weather: { interval: 5 } }), /10, 15, 30 oder 60/);
	assert.throws(() => w.setConfig({ weather: { days: 9 } }), /2 bis 7 Tage/);
	assert.throws(() => w.setConfig({ weather: { show: { foo: true } } }), /unbekannter Wert/);
	assert.throws(() => w.setConfig({ radar: { unit: "em" } }), /px oder %/);
});

test("Wetteranzeige: Vorschau-Daten vom Spiegel, sonst eigener Abruf (zwischengespeichert)", async () => {
	const home = path.join(HOME, "cfg-fx");
	let t = Date.parse("2026-10-18T10:00:00Z");
	let calls = 0;
	let fail = false;
	const fetchImpl = async (url) => {
		calls++;
		assert.ok(url.startsWith("https://api.open-meteo.com/v1/forecast?"));
		if (fail) throw new Error("offline");
		return { ok: true, json: async () => OPEN_METEO };
	};
	const w = weatherLib.createWeather({ home, now: () => new Date(t), fetchImpl });
	w.setLocation({ name: "Allershausen", lat: 48.43, lon: 11.59 });
	let r = await w.forecast();
	assert.equal(r.source, "portal");
	assert.equal(r.data.current.temp, 10.2);
	assert.equal(calls, 1);
	await w.forecast();
	assert.equal(calls, 1, "10 Minuten zwischengespeichert");
	// frischer Stand des Spiegels hat Vorrang
	fs.writeFileSync(path.join(home, "weather-data.json"), JSON.stringify({ at: new Date(t - 60000).toISOString(), location: { lat: 48.43, lon: 11.59 }, data: Object.assign({}, r.data, { offset: 3600 }) }));
	r = await w.forecast();
	assert.equal(r.source, "mirror");
	assert.equal(r.data.offset, 3600);
	// anderer Ort im Spiegel-Stand → nicht verwenden
	w.setLocation({ name: "Berlin", lat: 52.52, lon: 13.405 });
	t += 11 * 60000;
	fail = true;
	r = await w.forecast();
	assert.equal(r.data, null, "keine alten Daten eines anderen Orts");
	assert.match(r.error, /nicht erreichbar/);
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

test("Altes Wetter/Regenradar: Schalter werden einmalig übernommen", () => {
	const fresh = (name) => weatherLib.createWeather({ home: path.join(HOME, "legacy-" + name) });

	// altes Wetter an (Standard), altes Radar an → Wetteranzeige + Radar an, Radar darunter
	let w = fresh("beide");
	assert.equal(w.migrateLegacy({ modules: {}, rainRadar: { enabled: true } }, { hasRain: true }), true);
	let c = w.load();
	assert.equal(c.weather.enabled, true);
	assert.equal(c.enabled, true);
	assert.equal(c.radar.enabled, true);
	assert.equal(c.warnings.enabled, false);
	if (c.radar.anchor === "top_right") assert.ok(c.radar.y >= 330, "Radar unter der Wetteranzeige");

	// nur einmal: danach ausgeschaltet bleibt aus
	w.setConfig({ weather: { enabled: false } });
	assert.equal(w.migrateLegacy({ modules: {}, rainRadar: { enabled: true } }, { hasRain: true }), false);
	assert.equal(w.load().weather.enabled, false);

	// altes Wetter aus, Edition ohne Radar → nichts an
	w = fresh("aus");
	w.migrateLegacy({ modules: { weather: false }, rainRadar: { enabled: true } }, { hasRain: false });
	c = w.load();
	assert.equal(c.weather.enabled, false);
	assert.equal(c.enabled, false);
	assert.equal(JSON.parse(fs.readFileSync(w.statePath, "utf8")).legacyMigrated, true, "Merker gesetzt");
});
