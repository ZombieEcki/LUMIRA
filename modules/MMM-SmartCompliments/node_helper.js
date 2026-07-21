/* MagicMirror²
 * Node Helper: MMM-SmartCompliments
 *
 * Zwei Aufgaben:
 *  1) Kleiner HTTP-Server für den manuellen Ein-/Aus-Schalter (optional,
 *     nur wenn manualControlEnabled). Endpunkte (POST und GET):
 *       /compliments/off     -> ausblenden
 *       /compliments/on      -> einblenden
 *       /compliments/toggle  -> umschalten
 *       /compliments/status  -> Server-Status
 *  2) Liest die vom LUMIRA-Portal gepflegten Sprüche aus
 *     ~/.lumira/compliments.json und lädt sie live nach (fs.watch), ohne
 *     dass MagicMirror neu gestartet werden muss (siehe
 *     concept/smartcompliments-json.md). Die Datei liegt bewusst in
 *     ~/.lumira/ (nicht im Modulordner – der wird bei jedem Update per
 *     rsync --delete geleert).
 *
 * By Liam Eckhof
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const COMPLIMENTS_PATH = process.env.LUMIRA_COMPLIMENTS_PATH || path.join(LUMIRA_HOME, "compliments.json");

module.exports = NodeHelper.create({

	server: null,
	started: false,
	watcher: null,
	watchDebounce: null,

	start: function () {
		console.log("Starting node_helper for: " + this.name);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "SC_CONFIG" && !this.started) {
			this.config = payload;
			// Sprüche immer laden/überwachen (unabhängig vom Schalter-Server)
			this.startComplimentsWatch();
			if (this.config && this.config.manualControlEnabled) {
				this.startControlServer();
			}
			this.started = true;
		}
	},

	// -----------------------------------------------------------------
	// Sprüche aus compliments.json lesen + live überwachen
	// -----------------------------------------------------------------
	readCompliments: function () {
		try {
			if (!fs.existsSync(COMPLIMENTS_PATH)) return null;
			const raw = JSON.parse(fs.readFileSync(COMPLIMENTS_PATH, "utf8"));
			if (!raw || typeof raw !== "object") return null;
			// Flaches Objekt: categories hochgezogen + weekday/holiday/templates
			const out = {};
			if (raw.categories && typeof raw.categories === "object") {
				Object.assign(out, raw.categories);
			}
			out.weekdayMessages = raw.weekdayMessages || {};
			out.holidayMessages = raw.holidayMessages || {};
			out.templates = raw.templates || {};
			return out;
		} catch (err) {
			console.error(this.name + ": compliments.json konnte nicht gelesen werden: " + err.message);
			return null;
		}
	},

	pushCompliments: function () {
		const data = this.readCompliments();
		if (data) this.sendSocketNotification("SC_COMPLIMENTS", data);
	},

	startComplimentsWatch: function () {
		const self = this;
		const dir = path.dirname(COMPLIMENTS_PATH);
		try {
			fs.mkdirSync(dir, { recursive: true });
		} catch (err) {
			// Verzeichnis evtl. nicht anlegbar – Modul läuft dann mit Defaults weiter
		}

		// Einmal beim Start ausliefern (falls die Datei schon existiert)
		this.pushCompliments();

		try {
			// Das Portal schreibt atomar (.tmp + rename), deshalb das Verzeichnis
			// überwachen statt der Datei selbst. Debounced, um den rename-Doppel-
			// Event nicht doppelt zu verarbeiten.
			this.watcher = fs.watch(dir, (eventType, filename) => {
				if (filename && filename !== "compliments.json") return;
				clearTimeout(self.watchDebounce);
				self.watchDebounce = setTimeout(() => self.pushCompliments(), 300);
			});
		} catch (err) {
			console.error(self.name + ": Sprüche-Überwachung konnte nicht gestartet werden: " + err.message);
		}
	},

	// -----------------------------------------------------------------
	// Manueller Ein-/Aus-Schalter
	// -----------------------------------------------------------------
	startControlServer: function () {
		const self = this;
		const app = express();
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));

		const port = (this.config && this.config.port) || 8091;

		const send = (action, res) => {
			self.sendSocketNotification("SC_CONTROL", { action: action });
			res.status(200).json({ status: "ok", action: action });
		};

		const register = (path, action) => {
			app.get(path, (req, res) => send(action, res));
			app.post(path, (req, res) => send(action, res));
		};

		register("/compliments/off", "off");
		register("/compliments/on", "on");
		register("/compliments/toggle", "toggle");

		app.get("/compliments/status", (req, res) => {
			res.status(200).json({ status: "running", module: self.name });
		});

		try {
			this.server = app.listen(port, () => {
				console.log(self.name + ": Schalter-Server läuft auf Port " + port +
					" (/compliments/on, /off, /toggle)");
			});
			this.server.on("error", (err) => {
				console.error(self.name + ": Fehler beim Starten des Schalter-Servers", err.message);
			});
		} catch (err) {
			console.error(self.name + ": Konnte Schalter-Server nicht starten", err);
		}
	},

	stop: function () {
		if (this.watcher) this.watcher.close();
		if (this.server) this.server.close();
	}
});
