/* MagicMirror²
 * Node Helper: MMM-LumiraClock
 *
 * Liest die Einstellungen aus ~/.lumira/clock.json (gepflegt im
 * LUMIRA-Portal, Bildschirm → Uhr) und beobachtet die Datei per fs.watch –
 * Änderungen sind nach wenigen Sekunden auf dem Bildschirm, ohne Neustart.
 * Die Rückmeldung der Anzeige (Überschneidungen, außerhalb des Bildschirms)
 * landet in ~/.lumira/clock-mirror.json, das Portal zeigt sie an.
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { clean } = require("./clock-view");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const STATE_PATH = path.join(LUMIRA_HOME, "clock.json");
const REPORT_PATH = path.join(LUMIRA_HOME, "clock-mirror.json");

module.exports = NodeHelper.create({

	watcher: null,
	debounce: null,
	config: null,

	start: function () {
		console.log("Starting node_helper for: " + this.name);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "LC_REPORT") { this.writeReport(payload); return; }
		if (notification !== "LC_INIT") return;
		if (!this.watcher) this.startWatch();
		this.load();
		this.push();
	},

	load: function () {
		let raw = null;
		try { raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch (err) { raw = null; }
		this.config = clean(raw);
	},

	push: function () {
		this.sendSocketNotification("LC_STATE", { config: this.config });
	},

	startWatch: function () {
		try {
			fs.mkdirSync(LUMIRA_HOME, { recursive: true });
			this.watcher = fs.watch(LUMIRA_HOME, (eventType, filename) => {
				if (filename && filename !== "clock.json") return;
				clearTimeout(this.debounce);
				this.debounce = setTimeout(() => { this.load(); this.push(); }, 200);
			});
		} catch (err) {
			console.error(this.name + ": Überwachung von clock.json konnte nicht gestartet werden: " + err.message);
		}
	},

	// Rückmeldung der Anzeige: überdeckt die Uhr andere Module?
	writeReport: function (p) {
		if (!p || typeof p !== "object") return;
		const out = {
			at: new Date().toISOString(),
			screen: { width: Number(p.screen && p.screen.width) || 0, height: Number(p.screen && p.screen.height) || 0 },
			overlaps: Array.isArray(p.overlaps) ? p.overlaps.map((x) => String(x).slice(0, 40)).slice(0, 12) : [],
			offscreen: !!p.offscreen
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
		clearTimeout(this.debounce);
	}
});
