/* MagicMirror²
 * Node Helper: MMM-SmartCompliments
 *
 * Kleiner HTTP-Server für den manuellen Ein-/Aus-Schalter.
 * So kannst du die Kompliments jederzeit per URL (Browser/Handy) ausblenden
 * oder wieder einblenden – unabhängig von allen anderen Regeln.
 *
 * Endpunkte (POST und GET):
 *   /compliments/off     -> ausblenden
 *   /compliments/on      -> einblenden
 *   /compliments/toggle  -> umschalten
 *   /compliments/status  -> Server-Status
 *
 * By Liam Eckhof
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const express = require("express");
const bodyParser = require("body-parser");

module.exports = NodeHelper.create({

	server: null,
	started: false,

	start: function () {
		console.log("Starting node_helper for: " + this.name);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "SC_CONFIG" && !this.started) {
			this.config = payload;
			this.startControlServer();
			this.started = true;
		}
	},

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
	}
});
