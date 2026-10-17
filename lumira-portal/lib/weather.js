// LUMIRA – Regenradar & Wetterwarnungen (Spiegel → Radar & Warnungen) und
// Wetteranzeige (Spiegel → Wetteranzeige).
//
// Einstellungen in ~/.lumira/weather.json. Nur das Portal schreibt (atomar
// per .tmp + rename), MMM-LumiraWeather liest per fs.watch – Änderungen an
// Position, Größe, Transparenz usw. sind sofort auf dem Spiegel, ohne
// Neustart. Der Standort kommt aus den Einstellungen (Standort & Wetter).
// Die Bereinigung teilt sich das Portal mit dem Modul (payload.js), damit
// beide dieselben Grenzen kennen – der Test prüft, dass die Kopie gleich ist.
//
// Wetterdaten für die Vorschau im Portal: bevorzugt der Stand, den der
// Spiegel gerade zeigt (weather-data.json), sonst ein eigener Abruf bei
// Open-Meteo (10 Minuten zwischengespeichert).
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
const PART_LABEL = { radar: "Regenradar", warnings: "Warnungen", weather: "Wetteranzeige" };
const SHOW_KEYS = Object.keys(shared.DEFAULTS.weather.show);
const MIRROR_DATA_MAX_AGE = 30 * 60000;
const FETCH_CACHE_MS = 10 * 60000;

const sameLoc = (a, b) => !!(a && b) && Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lon - b.lon) < 0.001;

// Prüft eine Änderung aus dem Portal und meldet Fehler verständlich
function checkPatch(p) {
	if (!p || typeof p !== "object") throw new WeatherError("Ungültige Einstellungen");
	for (const part of ["radar", "warnings", "weather"]) {
		const b = p[part];
		if (!b) continue;
		if (typeof b !== "object") throw new WeatherError("Ungültige Einstellungen");
		const what = PART_LABEL[part];
		if (b.anchor !== undefined && shared.ANCHORS.indexOf(b.anchor) === -1) throw new WeatherError(what + ": unbekannte Position");
		if (b.unit !== undefined && ["px", "pct"].indexOf(b.unit) === -1) throw new WeatherError(what + ": Abstände in px oder %");
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
	if (p.weather) {
		const w = p.weather;
		if (w.design !== undefined && shared.DESIGN_IDS.indexOf(w.design) === -1) throw new WeatherError("Wetteranzeige: unbekanntes Design");
		if (w.wind !== undefined && shared.WIND_UNITS.indexOf(w.wind) === -1) throw new WeatherError("Wetteranzeige: Wind in km/h, m/s oder Beaufort");
		if (w.interval !== undefined && shared.INTERVALS.indexOf(Number(w.interval)) === -1) throw new WeatherError("Wetteranzeige: Aktualisierung alle 10, 15, 30 oder 60 Minuten");
		if (w.days !== undefined && (!Number.isInteger(Number(w.days)) || w.days < 2 || w.days > 7)) throw new WeatherError("Wetteranzeige: 2 bis 7 Tage Vorhersage");
		if (w.padding !== undefined && !(Number(w.padding) >= 0 && Number(w.padding) <= 40)) throw new WeatherError("Wetteranzeige: Innenabstand 0 bis 40 px");
		if (w.photoOpacity !== undefined && !(Number(w.photoOpacity) >= 10 && Number(w.photoOpacity) <= 100)) throw new WeatherError("Wetteranzeige: Deckkraft des Bildes 10 bis 100 %");
		if (w.show !== undefined) {
			if (!w.show || typeof w.show !== "object") throw new WeatherError("Wetteranzeige: ungültige Auswahl der Werte");
			for (const k of Object.keys(w.show)) if (SHOW_KEYS.indexOf(k) === -1) throw new WeatherError("Wetteranzeige: unbekannter Wert „" + String(k).slice(0, 20) + "“");
		}
	}
	if (p.warnings) {
		if (p.warnings.whenNone !== undefined && ["hide", "note"].indexOf(p.warnings.whenNone) === -1) throw new WeatherError("Warnungen: ohne Warnung ausblenden oder Hinweis zeigen");
		if (p.warnings.minSeverity !== undefined && [1, 2, 3, 4].indexOf(Number(p.warnings.minSeverity)) === -1) throw new WeatherError("Warnungen: Mindeststufe 1 bis 4");
	}
}

function createWeather({ home, now = () => new Date(), fetchImpl = (...a) => fetch(...a) } = {}) {
	home = path.resolve(home);
	const statePath = path.join(home, "weather.json");
	const reportPath = path.join(home, "weather-mirror.json");
	const dataPath = path.join(home, "weather-data.json");
	let cache = null; // { location, at, data }

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
			const o = r.overlaps || {};
			const off = r.offscreen || {};
			return {
				at: String(r.at || ""),
				screen: r.screen || null,
				overlaps: { radar: o.radar || [], warnings: o.warnings || [], weather: o.weather || [] },
				offscreen: { radar: !!off.radar, warnings: !!off.warnings, weather: !!off.weather }
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
			warnings: Object.assign({}, cur.warnings, p.warnings || {}),
			weather: Object.assign({}, cur.weather, p.weather || {}, {
				show: Object.assign({}, cur.weather.show, (p.weather && p.weather.show) || {})
			})
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

	// Aktuelles Wetter + Vorhersage für die Vorschau im Portal
	async function forecast() {
		const loc = load().location;
		const t = now().getTime();
		try {
			const f = JSON.parse(fs.readFileSync(dataPath, "utf8"));
			const at = Date.parse(f.at);
			if (f.data && f.data.current && sameLoc(f.location, loc) && t - at < MIRROR_DATA_MAX_AGE) {
				return { data: f.data, updatedAt: f.at, source: "mirror", error: "" };
			}
		} catch (e) { /* Spiegel hat (noch) nichts abgerufen */ }
		if (cache && sameLoc(cache.location, loc) && t - cache.at < FETCH_CACHE_MS) {
			return { data: cache.data, updatedAt: new Date(cache.at).toISOString(), source: "portal", error: "" };
		}
		try {
			const res = await fetchImpl(shared.forecastUrl(loc.lat, loc.lon), { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "LUMIRA-Portal/1.0" } });
			if (!res.ok) throw new Error("HTTP " + res.status);
			const data = shared.parseForecast(await res.json());
			if (!data) throw new Error("Antwort unvollständig");
			cache = { location: { lat: loc.lat, lon: loc.lon }, at: t, data };
			return { data, updatedAt: new Date(t).toISOString(), source: "portal", error: "" };
		} catch (err) {
			const old = cache && sameLoc(cache.location, loc) ? cache : null;
			return { data: old ? old.data : null, updatedAt: old ? new Date(old.at).toISOString() : null, source: "portal", error: "Open-Meteo gerade nicht erreichbar (" + err.message + ")" };
		}
	}

	return { load, view, setConfig, setLocation, forecast, statePath };
}

module.exports = { createWeather, WeatherError, checkPatch };
