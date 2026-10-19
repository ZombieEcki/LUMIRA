/* MagicMirror²
 * Node Helper: MMM-Ambient
 *
 * Liest die vom LUMIRA-Portal gepflegte Dauerschleife aus
 * ~/.lumira/ambient.json (Bildschirm → Dauerschleife) und schickt den Zustand an
 * die Anzeige. Live per fs.watch, kein MagicMirror-Neustart nötig. Schreibt
 * nie – das macht nur das Portal (lumira-portal/lib/ambient.js).
 *
 * Die hochgeladenen Medien liefert der MagicMirror-eigene Express-Server
 * unter /MMM-Ambient/media/ aus.
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const STATE_PATH = path.join(LUMIRA_HOME, "ambient.json");
const MEDIA_DIR = path.join(LUMIRA_HOME, "media");

const { toPayload, youtubeEmbedUrl } = require("./payload");

module.exports = NodeHelper.create({

	started: false,
	watcher: null,
	debounce: null,
	timer: null,

	start: function () {
		console.log("Starting node_helper for: " + this.name);
		if (this.expressApp) {
			this.expressApp.use("/MMM-Ambient/media", express.static(MEDIA_DIR, { maxAge: "1d", fallthrough: false, dotfiles: "deny" }));
		}
	},

	socketNotificationReceived: function (notification) {
		if (notification !== "AMBIENT_INIT") return;
		if (!this.started) {
			this.started = true;
			this.startWatch();
		}
		this.push();
	},

	read: function () {
		try {
			return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
		} catch (err) {
			return null; // keine Datei bzw. gerade im Schreiben → aus
		}
	},

	push: function () {
		const payload = toPayload(this.read(), new Date());
		if (payload.enabled && payload.media.kind === "youtube") payload.media.embedUrl = youtubeEmbedUrl(payload.media, payload.sound);
		this.sendSocketNotification("AMBIENT_STATE", payload);
		// Timer: zum Ablaufzeitpunkt noch einmal schicken (Portal schaltet
		// minütlich aus, die Anzeige soll aber pünktlich verschwinden)
		clearTimeout(this.timer);
		if (payload.enabled && payload.until) {
			const ms = Date.parse(payload.until) - Date.now();
			if (ms > 0) this.timer = setTimeout(() => this.push(), Math.min(ms + 500, 2147483000));
		}
	},

	startWatch: function () {
		const self = this;
		try {
			fs.mkdirSync(LUMIRA_HOME, { recursive: true });
			this.watcher = fs.watch(LUMIRA_HOME, (eventType, filename) => {
				if (filename && filename !== "ambient.json") return;
				clearTimeout(self.debounce);
				self.debounce = setTimeout(() => self.push(), 200);
			});
		} catch (err) {
			console.error(this.name + ": Überwachung von ambient.json konnte nicht gestartet werden: " + err.message);
		}
	},

	stop: function () {
		if (this.watcher) this.watcher.close();
		clearTimeout(this.timer);
		clearTimeout(this.debounce);
	}
});
