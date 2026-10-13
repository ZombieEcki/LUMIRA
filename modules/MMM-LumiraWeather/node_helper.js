/* MagicMirror²
 * Node Helper: MMM-LumiraWeather
 *
 * Liest die Einstellungen aus ~/.lumira/weather.json (gepflegt im
 * LUMIRA-Portal, Spiegel → Radar & Warnungen) per fs.watch – kein Neustart.
 * Holt alle 5 Minuten:
 *  - die amtlichen Warnungen des DWD genau für den Standort (WFS, GeoJSON),
 *  - die Zeitachse des DWD-Niederschlagsradars (für „Jetzt“ und +2 h).
 * Die Radarbilder selbst lädt die Anzeige direkt beim DWD (WMS, PNG).
 * Fehler bei den Daten blockieren nichts: Die Anzeige behält den letzten
 * Stand und zeigt sein Alter.
 *
 * Schreibt nur ~/.lumira/weather-mirror.json (Rückmeldung für das Portal:
 * überdeckt eine Kachel andere Module?) – weather.json bleibt beim Portal.
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const STATE_PATH = path.join(LUMIRA_HOME, "weather.json");
const REPORT_PATH = path.join(LUMIRA_HOME, "weather-mirror.json");
const REFRESH_MS = 5 * 60 * 1000;

const { cleanConfig, extentEnd, radarFrames, parseWarnings, warningsUrl, RADAR_CAPS_URL } = require("./payload");

module.exports = NodeHelper.create({

	started: false,
	watcher: null,
	debounce: null,
	timer: null,
	config: null,
	warnings: { list: [], updatedAt: null, error: "" },
	radar: { end: null, updatedAt: null, error: "" },

	start: function () {
		console.log("Starting node_helper for: " + this.name);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "LW_REPORT") { this.writeReport(payload); return; }
		if (notification !== "LW_INIT") return;
		if (!this.started) {
			this.started = true;
			this.startWatch();
			this.load();
			this.refresh();
			this.timer = setInterval(() => this.refresh(), REFRESH_MS);
		}
		this.push();
	},

	load: function () {
		let raw = null;
		try { raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch (err) { raw = null; }
		const before = this.config ? JSON.stringify([this.config.location, this.config.warnings.minSeverity]) : "";
		this.config = cleanConfig(raw);
		return before && before !== JSON.stringify([this.config.location, this.config.warnings.minSeverity]);
	},

	fetchText: async function (url) {
		const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "LUMIRA-MagicMirror/1.0" } });
		if (!res.ok) throw new Error("HTTP " + res.status);
		return res.text();
	},

	refresh: async function () {
		const c = this.config;
		if (!c || !c.enabled) return;
		const now = new Date();
		if (c.warnings.enabled) {
			try {
				const json = JSON.parse(await this.fetchText(warningsUrl(c.location.lat, c.location.lon)));
				this.warnings = { list: parseWarnings(json, now, c.warnings.minSeverity), updatedAt: now.toISOString(), error: "" };
			} catch (err) {
				this.warnings = Object.assign({}, this.warnings, { error: "Warnungen nicht abrufbar (" + err.message + ")" });
				console.warn(this.name + ": DWD-Warnungen: " + err.message);
			}
		}
		if (c.radar.enabled) {
			try {
				const end = extentEnd(await this.fetchText(RADAR_CAPS_URL));
				this.radar = { end, updatedAt: now.toISOString(), error: end ? "" : "Zeitachse unbekannt" };
			} catch (err) {
				this.radar = Object.assign({}, this.radar, { error: "Radar-Zeitachse nicht abrufbar (" + err.message + ")" });
				console.warn(this.name + ": DWD-Radar: " + err.message);
			}
		}
		this.push();
	},

	push: function () {
		const c = this.config || cleanConfig(null);
		const now = new Date();
		this.sendSocketNotification("LW_STATE", {
			config: c,
			frames: c.radar.enabled ? radarFrames(this.radar.end, now, c.radar.animate ? c.radar.past : 0, c.radar.animate ? c.radar.future : 0) : [],
			radar: { updatedAt: this.radar.updatedAt, error: this.radar.error },
			// abgelaufene Warnungen fliegen auch ohne neuen Abruf heraus
			warnings: {
				list: this.warnings.list.filter((w) => !w.expires || Date.parse(w.expires) > now.getTime()),
				updatedAt: this.warnings.updatedAt,
				error: this.warnings.error
			}
		});
	},

	startWatch: function () {
		const self = this;
		try {
			fs.mkdirSync(LUMIRA_HOME, { recursive: true });
			this.watcher = fs.watch(LUMIRA_HOME, (eventType, filename) => {
				if (filename && filename !== "weather.json") return;
				clearTimeout(self.debounce);
				self.debounce = setTimeout(() => {
					const wasOff = !(self.config && self.config.enabled);
					const changed = self.load();
					// Standort/Filter geändert oder gerade eingeschaltet → sofort neu abrufen
					if (changed || (wasOff && self.config.enabled)) self.refresh();
					else self.push();
				}, 200);
			});
		} catch (err) {
			console.error(this.name + ": Überwachung von weather.json konnte nicht gestartet werden: " + err.message);
		}
	},

	// Rückmeldung der Anzeige: überdeckt eine Kachel andere Module?
	writeReport: function (p) {
		if (!p || typeof p !== "object") return;
		const clean = (list) => (Array.isArray(list) ? list.map((x) => String(x).slice(0, 40)).slice(0, 12) : []);
		const out = {
			at: new Date().toISOString(),
			screen: { width: Number(p.screen && p.screen.width) || 0, height: Number(p.screen && p.screen.height) || 0 },
			overlaps: { radar: clean(p.overlaps && p.overlaps.radar), warnings: clean(p.overlaps && p.overlaps.warnings) },
			offscreen: { radar: !!(p.offscreen && p.offscreen.radar), warnings: !!(p.offscreen && p.offscreen.warnings) }
		};
		try {
			fs.writeFileSync(REPORT_PATH + ".tmp", JSON.stringify(out));
			fs.renameSync(REPORT_PATH + ".tmp", REPORT_PATH);
		} catch (err) {
			console.error(this.name + ": Rückmeldung nicht gespeichert: " + err.message);
		}
	},

	stop: function () {
		if (this.watcher) this.watcher.close();
		clearInterval(this.timer);
		clearTimeout(this.debounce);
	}
});
