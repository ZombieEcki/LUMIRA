/* MagicMirror²
 * Node Helper: MMM-Doorbell
 *
 * Liest das vom LUMIRA-Portal gepflegte Klingel-Ereignis aus
 * ~/.lumira/doorbell.json (Spiegel → Klingel) und schickt es an die Anzeige.
 * Live per fs.watch, kein MagicMirror-Neustart nötig. Schreibt nie – das macht
 * nur das Portal (lumira-portal/lib/doorbell.js), auch die Ring-Verbindung
 * läuft dort.
 *
 * Der MagicMirror-eigene Express-Server liefert aus:
 *   /MMM-Doorbell/live/   – Live-Video (HLS) und Standbilder der Klingel
 *   /MMM-Doorbell/sound/  – der eigene Klingelton
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const STATE_PATH = path.join(LUMIRA_HOME, "doorbell.json");
const SOUND_DIR = path.join(LUMIRA_HOME, "doorbell");

const { toPayload, liveDirFor } = require("./payload");

const LIVE_DIR = liveDirFor(LUMIRA_HOME);

module.exports = NodeHelper.create({

	started: false,
	watcher: null,
	debounce: null,
	timers: [],

	start: function () {
		console.log("Starting node_helper for: " + this.name);
		if (this.expressApp) {
			const noStore = (res) => res.setHeader("Cache-Control", "no-store");
			this.expressApp.use("/MMM-Doorbell/live", express.static(LIVE_DIR, { fallthrough: false, dotfiles: "deny", setHeaders: noStore }));
			this.expressApp.use("/MMM-Doorbell/sound", express.static(SOUND_DIR, { fallthrough: false, dotfiles: "deny", setHeaders: noStore }));
		}
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "DOORBELL_REPORT") { this.writeReport(payload); return; }
		if (notification !== "DOORBELL_INIT") return;
		if (!this.started) {
			this.started = true;
			this.startWatch();
		}
		this.push();
	},

	// Rückmeldung der Anzeige (Video läuft / Fehler) für das Portal. Eigene
	// Datei – doorbell.json bleibt allein beim Portal.
	writeReport: function (p) {
		if (!p || !/^ev_[a-f0-9]{8}$/.test(String(p.eventId))) return;
		const out = {
			eventId: p.eventId,
			state: String(p.state || "").slice(0, 20),
			detail: String(p.detail || "").slice(0, 200),
			width: Number(p.width) || 0,
			height: Number(p.height) || 0,
			at: new Date().toISOString()
		};
		try {
			const file = path.join(LUMIRA_HOME, "doorbell-mirror.json");
			fs.writeFileSync(file + ".tmp", JSON.stringify(out));
			fs.renameSync(file + ".tmp", file);
		} catch (err) {
			console.error(this.name + ": Rückmeldung nicht gespeichert: " + err.message);
		}
		if (out.state === "error" || out.state === "timeout") console.warn(this.name + ": kein Bild vom Live-Video – " + out.detail);
	},

	read: function () {
		try {
			return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
		} catch (err) {
			return null; // keine Datei bzw. gerade im Schreiben → nichts anzeigen
		}
	},

	push: function () {
		const payload = toPayload(this.read(), new Date());
		this.sendSocketNotification("DOORBELL_STATE", payload);
		// Zum Ausblenden der Meldung und zum Ende noch einmal schicken
		// (das Portal räumt auch auf, die Anzeige soll aber pünktlich sein)
		this.timers.forEach(clearTimeout);
		this.timers = [];
		if (payload.active) {
			for (const at of [payload.notifyUntil, payload.until]) {
				const ms = Date.parse(at) - Date.now();
				if (ms > 0) this.timers.push(setTimeout(() => this.push(), Math.min(ms + 300, 2147483000)));
			}
		}
	},

	startWatch: function () {
		const self = this;
		try {
			fs.mkdirSync(LUMIRA_HOME, { recursive: true });
			this.watcher = fs.watch(LUMIRA_HOME, (eventType, filename) => {
				if (filename && filename !== "doorbell.json") return;
				clearTimeout(self.debounce);
				self.debounce = setTimeout(() => self.push(), 100);
			});
		} catch (err) {
			console.error(this.name + ": Überwachung von doorbell.json konnte nicht gestartet werden: " + err.message);
		}
	},

	stop: function () {
		if (this.watcher) this.watcher.close();
		this.timers.forEach(clearTimeout);
		clearTimeout(this.debounce);
	}
});
