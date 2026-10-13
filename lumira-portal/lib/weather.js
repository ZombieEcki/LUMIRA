// LUMIRA – Regenradar & Wetterwarnungen (Spiegel → Radar & Warnungen).
//
// Einstellungen in ~/.lumira/weather.json. Nur das Portal schreibt (atomar
// per .tmp + rename), MMM-LumiraWeather liest per fs.watch – Änderungen an
// Position, Größe, Transparenz usw. sind sofort auf dem Spiegel, ohne
// Neustart. Der Standort kommt aus den Einstellungen (Standort & Wetter).
// Die Bereinigung teilt sich das Portal mit dem Modul (payload.js), damit
// beide dieselben Grenzen kennen – der Test prüft, dass die Kopie gleich ist.
"use strict";

const fs = require("fs");
const path = require("path");
const shared = require("./weather-shared");

class WeatherError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

const BOX_LIMITS = { x: [-3000, 3000], y: [-3000, 3000], width: [160, 1600], height: [100, 1200], opacity: [0, 100], fontScale: [60, 200] };
const BOX_LABEL = { x: "Abstand waagerecht", y: "Abstand senkrecht", width: "Breite", height: "Höhe", opacity: "Deckkraft", fontScale: "Schriftgröße" };

// Prüft eine Änderung aus dem Portal und meldet Fehler verständlich
function checkPatch(p) {
	if (!p || typeof p !== "object") throw new WeatherError("Ungültige Einstellungen");
	for (const part of ["radar", "warnings"]) {
		const b = p[part];
		if (!b) continue;
		const what = part === "radar" ? "Regenradar" : "Warnungen";
		if (b.anchor !== undefined && shared.ANCHORS.indexOf(b.anchor) === -1) throw new WeatherError(what + ": unbekannte Position");
		for (const k of Object.keys(BOX_LIMITS)) {
			if (b[k] === undefined) continue;
			const n = Number(b[k]);
			if (!Number.isFinite(n) || n < BOX_LIMITS[k][0] || n > BOX_LIMITS[k][1]) throw new WeatherError(`${what}: ${BOX_LABEL[k]} ${BOX_LIMITS[k][0]} bis ${BOX_LIMITS[k][1]}`);
		}
	}
	if (p.radar) {
		if (p.radar.basemap !== undefined && ["dwd", "osm"].indexOf(p.radar.basemap) === -1) throw new WeatherError("Regenradar: Karte DWD oder OpenStreetMap");
		if (p.radar.zoom !== undefined && (!Number.isInteger(Number(p.radar.zoom)) || p.radar.zoom < 5 || p.radar.zoom > 11)) throw new WeatherError("Regenradar: Kartenausschnitt 5 bis 11");
		if (p.radar.speed !== undefined && !shared.SPEED_MS[p.radar.speed]) throw new WeatherError("Regenradar: Tempo langsam, normal oder schnell");
	}
	if (p.warnings) {
		if (p.warnings.whenNone !== undefined && ["hide", "note"].indexOf(p.warnings.whenNone) === -1) throw new WeatherError("Warnungen: ohne Warnung ausblenden oder Hinweis zeigen");
		if (p.warnings.minSeverity !== undefined && [1, 2, 3, 4].indexOf(Number(p.warnings.minSeverity)) === -1) throw new WeatherError("Warnungen: Mindeststufe 1 bis 4");
	}
}

function createWeather({ home, now = () => new Date() } = {}) {
	home = path.resolve(home);
	const statePath = path.join(home, "weather.json");
	const reportPath = path.join(home, "weather-mirror.json");

	function load() {
		try {
			return shared.cleanConfig(JSON.parse(fs.readFileSync(statePath, "utf8")));
		} catch (e) {
			return shared.cleanConfig(null);
		}
	}

	function save(cfg) {
		fs.mkdirSync(home, { recursive: true });
		const out = Object.assign({ version: 1, updatedAt: now().toISOString() }, cfg);
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
		fs.renameSync(tmp, statePath);
		return cfg;
	}

	// Rückmeldung des Spiegels: überdeckt eine Kachel etwas?
	function report() {
		try {
			const r = JSON.parse(fs.readFileSync(reportPath, "utf8"));
			return {
				at: String(r.at || ""),
				screen: r.screen || null,
				overlaps: { radar: (r.overlaps && r.overlaps.radar) || [], warnings: (r.overlaps && r.overlaps.warnings) || [] },
				offscreen: { radar: !!(r.offscreen && r.offscreen.radar), warnings: !!(r.offscreen && r.offscreen.warnings) }
			};
		} catch (e) {
			return null;
		}
	}

	function view() {
		return Object.assign(load(), { report: report(), defaults: shared.DEFAULTS });
	}

	function setConfig(patch) {
		checkPatch(patch);
		const cur = load();
		const p = patch;
		const next = {
			enabled: p.enabled === undefined ? cur.enabled : !!p.enabled,
			location: cur.location,
			radar: Object.assign({}, cur.radar, p.radar || {}),
			warnings: Object.assign({}, cur.warnings, p.warnings || {})
		};
		save(shared.cleanConfig(next));
		return view();
	}

	// Standort aus den Portal-Einstellungen übernehmen (Standort & Wetter)
	function setLocation(loc) {
		if (!loc) return;
		const cur = load();
		const next = shared.cleanConfig(Object.assign({}, cur, { location: { name: loc.name, lat: loc.lat, lon: loc.lon } }));
		if (JSON.stringify(next.location) === JSON.stringify(cur.location) && fs.existsSync(statePath)) return;
		save(next);
	}

	return { load, view, setConfig, setLocation, statePath };
}

module.exports = { createWeather, WeatherError, checkPatch };
