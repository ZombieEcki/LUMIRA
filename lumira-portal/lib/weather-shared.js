// LUMIRA – Kopie von modules/MMM-LumiraWeather/payload.js (Portal und Spiegel
// laufen getrennt; test/weather.test.js prüft, dass beide gleich sind).
"use strict";

const ANCHORS = ["top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"];
const SEVERITY = { Minor: 1, Moderate: 2, Severe: 3, Extreme: 4 };
const SEVERITY_COLOR = { 1: "#ffeb3b", 2: "#fb8c00", 3: "#e53935", 4: "#880e4f" };
const SPEED_MS = { slow: 900, normal: 600, fast: 350 };
const SMALL_WORDS = ["mit", "und", "oder", "von", "vor", "in", "im", "auf", "bis", "über", "unter", "an", "am"];

const num = (v, min, max, d) => {
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};

// Gemeinsame Teile einer Kachel (Position, Größe, Transparenz, Schrift).
// Abstände in px oder in % der Bildschirmbreite/-höhe (unit "pct").
function cleanBox(b, d) {
	b = b || {};
	const unit = b.unit === "pct" ? "pct" : "px";
	const lim = unit === "pct" ? 100 : 3000;
	return {
		enabled: b.enabled === undefined ? d.enabled : !!b.enabled,
		anchor: ANCHORS.indexOf(b.anchor) === -1 ? d.anchor : b.anchor,
		unit,
		x: num(b.x, -lim, lim, d.x),
		y: num(b.y, -lim, lim, d.y),
		width: num(b.width, 160, 1600, d.width),
		height: num(b.height, 100, 1200, d.height),
		opacity: num(b.opacity, 0, 100, d.opacity),
		fontScale: num(b.fontScale, 60, 200, d.fontScale)
	};
}

const DEFAULTS = {
	enabled: false,
	location: { name: "", lat: 52.52, lon: 13.405 },
	radar: {
		enabled: true, anchor: "top_right", x: 0, y: 130, width: 340, height: 250, opacity: 35, fontScale: 100,
		basemap: "dwd", zoom: 8, animate: true, past: 60, future: 120, speed: "normal", legend: true
	},
	warnings: {
		enabled: true, anchor: "top_right", x: 0, y: 400, width: 340, height: 140, opacity: 35, fontScale: 100,
		whenNone: "hide", minSeverity: 1, max: 3, details: false
	},
	// Wetteranzeige (eigener Schalter, unabhängig von Radar & Warnungen)
	weather: {
		enabled: false, anchor: "top_right", x: 0, y: 0, width: 400, height: 600, opacity: 35, fontScale: 100,
		design: "classic", days: 5, wind: "kmh", interval: 15, padding: 16, border: true, shadow: true, photoOpacity: 85,
		show: {
			location: true, feels: true, desc: false, decimals: true, humidity: true, wind: true, pressure: true,
			uv: true, rain: false, sun: false, date: false, updated: false
		}
	}
};

// Muss zu view.js (DESIGNS, FIELDS) passen – der Test prüft das
const DESIGN_IDS = ["classic", "compact", "card", "vertical", "minimal", "detailed", "bar", "circle", "photo", "large", "icons", "elegant"];
const WIND_UNITS = ["kmh", "ms", "bft"];
const INTERVALS = [10, 15, 30, 60];

function cleanShow(s, d) {
	s = s || {};
	const out = {};
	Object.keys(d).forEach((k) => { out[k] = s[k] === undefined ? d[k] : !!s[k]; });
	return out;
}

function cleanConfig(raw) {
	const r = raw || {};
	const d = DEFAULTS;
	const rr = r.radar || {};
	const ww = r.warnings || {};
	const fx = r.weather || {};
	const dw = d.weather;
	const loc = r.location || {};
	const lat = Number(loc.lat);
	const lon = Number(loc.lon);
	return {
		enabled: !!r.enabled,
		location: {
			name: String(loc.name || "").slice(0, 60),
			lat: Number.isFinite(lat) && Math.abs(lat) <= 85 ? lat : d.location.lat,
			lon: Number.isFinite(lon) && Math.abs(lon) <= 180 ? lon : d.location.lon
		},
		radar: Object.assign(cleanBox(rr, d.radar), {
			basemap: rr.basemap === "osm" ? "osm" : "dwd",
			zoom: num(rr.zoom, 5, 11, d.radar.zoom),
			animate: rr.animate === undefined ? d.radar.animate : !!rr.animate,
			past: [0, 30, 60, 90, 120].indexOf(Number(rr.past)) === -1 ? d.radar.past : Number(rr.past),
			future: [0, 30, 60, 90, 120].indexOf(Number(rr.future)) === -1 ? d.radar.future : Number(rr.future),
			speed: SPEED_MS[rr.speed] ? rr.speed : d.radar.speed,
			legend: rr.legend === undefined ? d.radar.legend : !!rr.legend
		}),
		warnings: Object.assign(cleanBox(ww, d.warnings), {
			whenNone: ww.whenNone === "note" ? "note" : "hide",
			minSeverity: num(ww.minSeverity, 1, 4, d.warnings.minSeverity),
			max: num(ww.max, 1, 6, d.warnings.max),
			details: !!ww.details
		}),
		weather: Object.assign(cleanBox(fx, dw), {
			design: DESIGN_IDS.indexOf(fx.design) === -1 ? dw.design : fx.design,
			days: num(fx.days, 2, 7, dw.days),
			wind: WIND_UNITS.indexOf(fx.wind) === -1 ? dw.wind : fx.wind,
			interval: INTERVALS.indexOf(Number(fx.interval)) === -1 ? dw.interval : Number(fx.interval),
			padding: num(fx.padding, 0, 40, dw.padding),
			border: fx.border === undefined ? dw.border : !!fx.border,
			shadow: fx.shadow === undefined ? dw.shadow : !!fx.shadow,
			photoOpacity: num(fx.photoOpacity, 10, 100, dw.photoOpacity),
			show: cleanShow(fx.show, dw.show)
		})
	};
}

// ---------------------------------------------------------------------------
// Wetterdaten (Open-Meteo, Modelle u. a. des DWD; kostenlos, ohne Schlüssel)
// ---------------------------------------------------------------------------
function forecastUrl(lat, lon) {
	return "https://api.open-meteo.com/v1/forecast?latitude=" + Number(lat).toFixed(4) + "&longitude=" + Number(lon).toFixed(4) +
		"&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,pressure_msl,uv_index" +
		"&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset" +
		"&timezone=auto&timeformat=unixtime&forecast_days=8&wind_speed_unit=kmh";
}

const val = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Antwort → { offset, current, days[] }; fehlende Werte bleiben null
function parseForecast(json) {
	if (!json || typeof json !== "object" || !json.current || !json.daily || !Array.isArray(json.daily.time)) return null;
	const c = json.current;
	const dd = json.daily;
	const offset = val(json.utc_offset_seconds) || 0;
	const at = (k, i) => (Array.isArray(dd[k]) ? val(dd[k][i]) : null);
	const days = dd.time.map((t, i) => {
		const local = new Date((t + offset) * 1000);
		return {
			key: local.toISOString().slice(0, 10),
			wd: local.getUTCDay(),
			code: at("weather_code", i),
			max: at("temperature_2m_max", i),
			min: at("temperature_2m_min", i),
			pop: at("precipitation_probability_max", i),
			rain: at("precipitation_sum", i),
			sunrise: at("sunrise", i),
			sunset: at("sunset", i)
		};
	}).filter((d) => d.code !== null || d.max !== null);
	const code = val(c.weather_code);
	if (code === null && val(c.temperature_2m) === null) return null;
	return {
		offset,
		timezone: String(json.timezone || ""),
		current: {
			time: val(c.time),
			temp: val(c.temperature_2m),
			feels: val(c.apparent_temperature),
			code,
			isDay: c.is_day === undefined ? null : c.is_day === 1,
			humidity: val(c.relative_humidity_2m),
			wind: val(c.wind_speed_10m),
			windDir: val(c.wind_direction_10m),
			pressure: val(c.pressure_msl),
			uv: val(c.uv_index)
		},
		days
	};
}

// ---------------------------------------------------------------------------
// Radar: Zeitpunkte für die Animation (10-Minuten-Schritte)
// ---------------------------------------------------------------------------
const STEP_MIN = 10;

// Ende der Zeitachse aus dem WMS-GetCapabilities („…/2026-10-13T19:10:00.000Z/PT5M“)
function extentEnd(xml) {
	const m = /<Dimension name="time"[^>]*>([^<]+)</.exec(String(xml || ""));
	if (!m) return null;
	const parts = m[1].trim().split("/");
	const end = parts.length >= 2 ? parts[1] : m[1].split(",").pop();
	const t = Date.parse(end);
	return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// „Jetzt“ = letzte Messung (Vorhersage reicht 2 h darüber hinaus).
// Ohne Zeitachse vom DWD: aus der Uhr geschätzt (5 min Verzögerung).
function radarFrames(endIso, now, past, future) {
	const fiveMin = 5 * 60000;
	const end = endIso ? Date.parse(endIso) : NaN;
	let nowFrame = Math.floor((now.getTime() - fiveMin) / fiveMin) * fiveMin;
	if (Number.isFinite(end)) {
		// Die Zeitachse endet 2 h nach der letzten Messung – passt das zur Uhr
		// (± 30 min), gilt die Messung als „Jetzt“
		const analysis = end - 120 * 60000;
		if (Math.abs(analysis - nowFrame) <= 30 * 60000) nowFrame = analysis;
	}
	// auf volle 10 Minuten
	nowFrame = Math.floor(nowFrame / (STEP_MIN * 60000)) * STEP_MIN * 60000;
	const last = Number.isFinite(end) ? Math.min(end, nowFrame + future * 60000) : nowFrame + future * 60000;
	const out = [];
	for (let t = nowFrame - past * 60000; t <= last; t += STEP_MIN * 60000) {
		out.push({ time: new Date(t).toISOString(), offset: Math.round((t - nowFrame) / 60000) });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Warnungen (DWD-WFS „Warnungen_Gemeinden“, GeoJSON)
// ---------------------------------------------------------------------------
function niceEvent(s) {
	return String(s || "").toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => {
		if (i > 0 && SMALL_WORDS.indexOf(w) !== -1) return w;
		return w.charAt(0).toUpperCase() + w.slice(1);
	}).join(" ");
}

function colorOf(p, level) {
	const m = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/.exec(String(p.EC_AREA_COLOR || "").trim());
	return m ? "rgb(" + m[1] + "," + m[2] + "," + m[3] + ")" : SEVERITY_COLOR[level];
}

function parseWarnings(geojson, now, minSeverity) {
	const feats = (geojson && Array.isArray(geojson.features)) ? geojson.features : [];
	const seen = {};
	const out = [];
	for (const f of feats) {
		const p = (f && f.properties) || {};
		if (String(p.MSGTYPE || "") === "Cancel") continue;
		const expires = Date.parse(p.EXPIRES);
		if (Number.isFinite(expires) && expires <= now.getTime()) continue;
		const level = SEVERITY[p.SEVERITY] || 1;
		if (level < (minSeverity || 1)) continue;
		const key = [p.EVENT, p.ONSET, p.EXPIRES].join("|");
		if (seen[key]) continue;
		seen[key] = true;
		out.push({
			event: niceEvent(p.EVENT) || "Wetterwarnung",
			level,
			color: colorOf(p, level),
			group: String(p.EC_GROUP || "").toUpperCase().split(";")[0],
			onset: p.ONSET || null,
			expires: p.EXPIRES || null,
			area: String(p.AREADESC || "").slice(0, 80),
			preliminary: /VORABINFORMATION/i.test(String(p.HEADLINE || "")),
			description: String(p.DESCRIPTION || "").replace(/\s+/g, " ").trim().slice(0, 280),
			instruction: String(p.INSTRUCTION || "").replace(/\s+/g, " ").trim().slice(0, 200)
		});
	}
	out.sort((a, b) => b.level - a.level || String(a.onset).localeCompare(String(b.onset)));
	return out;
}

// Adresse für die Warnungen genau am Standort (Punkt in der Gemeinde)
function warningsUrl(lat, lon) {
	const props = "EVENT,HEADLINE,SEVERITY,ONSET,EXPIRES,EC_GROUP,EC_AREA_COLOR,AREADESC,DESCRIPTION,INSTRUCTION,MSGTYPE";
	return "https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature" +
		"&typeName=dwd:Warnungen_Gemeinden&outputFormat=application/json&propertyName=" + props +
		"&CQL_FILTER=" + encodeURIComponent("CONTAINS(THE_GEOM,POINT(" + Number(lat).toFixed(5) + " " + Number(lon).toFixed(5) + "))");
}

const RADAR_CAPS_URL = "https://maps.dwd.de/geoserver/dwd/Niederschlagsradar/ows?service=WMS&version=1.3.0&request=GetCapabilities";

module.exports = {
	ANCHORS, SEVERITY, SPEED_MS, DEFAULTS, DESIGN_IDS, WIND_UNITS, INTERVALS, cleanConfig, extentEnd, radarFrames, parseWarnings, niceEvent, warningsUrl, RADAR_CAPS_URL,
	forecastUrl, parseForecast
};
