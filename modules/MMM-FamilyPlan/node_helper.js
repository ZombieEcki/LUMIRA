/* MagicMirror²
 * Node Helper: MMM-FamilyPlan
 *
 * Liest den vom LUMIRA-Portal gepflegten Familienplan aus
 * ~/.lumira/familyplan.json und schickt die laufende Woche fertig
 * aufbereitet an die Anzeige (Namen, Farben, Symbole, Avatar-URLs).
 *
 *  - Live-Reload per fs.watch auf das Verzeichnis (das Portal schreibt
 *    atomar per .tmp + rename), kein MagicMirror-Neustart nötig.
 *  - Kurz nach Mitternacht wird neu eingelesen, damit ein Wochenwechsel
 *    auch ohne Dateiänderung sichtbar wird.
 *  - Rechnet NIE selbst eine Rotation aus und schreibt nie – das macht nur
 *    das Portal (siehe concept/familienplan.md, Abschnitt 1 und 5.2).
 *  - Hochgeladene Fotos liefert der MagicMirror-eigene Express-Server unter
 *    /MMM-FamilyPlan/uploads/ aus (kein zusätzlicher Port).
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const PLAN_PATH = process.env.LUMIRA_FAMILYPLAN_PATH || path.join(LUMIRA_HOME, "familyplan.json");
const UPLOAD_DIR = path.join(path.dirname(PLAN_PATH), "familyplan", "avatars");

const { buildPayload } = require("./payload");

module.exports = NodeHelper.create({

	started: false,
	watcher: null,
	watchDebounce: null,
	midnightTimer: null,
	lastPayload: null,

	start: function () {
		console.log("Starting node_helper for: " + this.name);
		if (this.expressApp) {
			this.expressApp.use("/MMM-FamilyPlan/uploads", express.static(UPLOAD_DIR, { maxAge: "1h", fallthrough: false }));
		}
	},

	socketNotificationReceived: function (notification) {
		if (notification !== "FP_INIT") return;
		if (!this.started) {
			this.started = true;
			this.startWatch();
			this.scheduleMidnight();
		}
		this.push();
	},

	push: function () {
		let payload;
		try {
			if (!fs.existsSync(PLAN_PATH)) {
				payload = { state: "empty", title: "Unser Familienplan" };
			} else {
				payload = buildPayload(JSON.parse(fs.readFileSync(PLAN_PATH, "utf8")), new Date());
			}
			this.lastPayload = payload;
		} catch (err) {
			// Kaputte Datei: letzten guten Stand weiter zeigen, nie eine leere Box.
			console.error(this.name + ": familyplan.json konnte nicht gelesen werden: " + err.message);
			payload = this.lastPayload || { state: "empty", title: "Unser Familienplan" };
		}
		this.sendSocketNotification("FP_DATA", payload);
	},

	startWatch: function () {
		const self = this;
		const dir = path.dirname(PLAN_PATH);
		const file = path.basename(PLAN_PATH);
		try {
			fs.mkdirSync(dir, { recursive: true });
		} catch (err) {
			// Verzeichnis evtl. nicht anlegbar – Modul zeigt dann den Leer-Hinweis
		}
		try {
			this.watcher = fs.watch(dir, (eventType, filename) => {
				if (filename && filename !== file) return;
				clearTimeout(self.watchDebounce);
				self.watchDebounce = setTimeout(() => self.push(), 300);
			});
		} catch (err) {
			console.error(self.name + ": Überwachung von familyplan.json konnte nicht gestartet werden: " + err.message);
		}
	},

	scheduleMidnight: function () {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
		this.midnightTimer = setTimeout(() => {
			this.push();
			this.scheduleMidnight();
		}, next - now);
	},

	stop: function () {
		if (this.watcher) this.watcher.close();
		clearTimeout(this.midnightTimer);
	}
});

