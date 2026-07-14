/* MagicMirror²
 * Node Helper: MMM-aPagerAlarm
 *
 * Startet einen kleinen HTTP-Server (Express), der den Webhook von aPager PRO
 * entgegennimmt und den empfangenen Alarm sofort an das Frontend-Modul weitergibt.
 *
 * By Liam Eckhof
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const https = require("https");
const { URL } = require("url");

module.exports = NodeHelper.create({

	server: null,
	started: false,

	start: function () {
		console.log("Starting node_helper for: " + this.name);
	},

	// Konfiguration vom Frontend-Modul erhalten -> Webhook-Server starten
	socketNotificationReceived: function (notification, payload) {
		if (notification === "CONFIG") {
			this.config = payload;
			if (!this.started) {
				this.startWebhookServer();
				this.started = true;
			}
		} else if (notification === "FORWARD_STATE") {
			this.forwardState(payload);
		}
	},

	// Zustandswechsel an alle konfigurierten Ziel-URLs senden (z. B. Home Assistant)
	forwardState: function (payload) {
		const targets = (this.config && this.config.forwardTargets) || [];
		targets.forEach((url) => this.postJson(url, payload));
	},

	// Kleiner JSON-POST mit Node-Bordmitteln (kein zusätzliches Paket nötig)
	postJson: function (urlStr, data) {
		const self = this;
		try {
			const u = new URL(urlStr);
			const lib = u.protocol === "https:" ? https : http;
			const body = JSON.stringify(data);
			const req = lib.request({
				hostname: u.hostname,
				port: u.port || (u.protocol === "https:" ? 443 : 80),
				path: u.pathname + u.search,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body)
				}
			}, (res) => { res.on("data", () => {}); });
			req.on("error", (err) => {
				console.error(self.name + ": Forward an " + urlStr + " fehlgeschlagen: " + err.message);
			});
			req.write(body);
			req.end();
		} catch (err) {
			console.error(self.name + ": Ungültige Forward-URL '" + urlStr + "': " + err.message);
		}
	},

	startWebhookServer: function () {
		const self = this;
		const app = express();

		// JSON- und Formular-Bodies verarbeiten (aPager kann beides senden)
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));

		const path = this.config.webhookPath || "/alarm";
		const port = this.config.webhookPort || 8080;

		// Webhook-Endpunkt: aPager sendet hierhin einen HTTP POST
		app.post(path, (req, res) => {
			const data = req.body || {};

			const alarm = {
				unit: data.unit || data.einheit || "",
				keyword: data.keyword || data.stichwort || "Alarm",
				time: Date.now()
			};

			console.log(self.name + ": Alarm empfangen ->", alarm);

			// Sofort an das Frontend-Modul weitergeben
			self.sendSocketNotification("NEW_ALARM", alarm);

			res.status(200).json({ status: "ok", received: alarm });
		});

		// Zusätzlich GET erlauben (Test per Browser: ?keyword=...&unit=...)
		app.get(path, (req, res) => {
			const q = req.query || {};
			const alarm = {
				unit: q.unit || q.einheit || "",
				keyword: q.keyword || q.stichwort || "Testalarm",
				time: Date.now()
			};

			console.log(self.name + ": Alarm (GET) empfangen ->", alarm);
			self.sendSocketNotification("NEW_ALARM", alarm);

			res.status(200).json({ status: "ok", received: alarm });
		});

		// Laufenden Alarm sofort deaktivieren (POST und GET)
		const clearPath = this.config.clearPath || "/clear";

		const clearHandler = (req, res) => {
			console.log(self.name + ": Alarm wird deaktiviert (clear)");
			self.sendSocketNotification("CLEAR_ALARM", {});
			res.status(200).json({ status: "cleared" });
		};

		app.post(clearPath, clearHandler);
		app.get(clearPath, clearHandler);

		// "Zuhause": sofort in Phase 3 springen (POST und GET)
		const homePath = this.config.homePath || "/home";

		const homeHandler = (req, res) => {
			console.log(self.name + ": 'Zuhause' empfangen -> Phase 3");
			self.sendSocketNotification("GO_HOME", {});
			res.status(200).json({ status: "home" });
		};

		app.post(homePath, homeHandler);
		app.get(homePath, homeHandler);

		// Einfacher Health-Check
		app.get("/apager/health", (req, res) => {
			res.status(200).json({ status: "running", module: self.name });
		});

		try {
			this.server = app.listen(port, () => {
				console.log(self.name + ": Webhook-Server läuft auf Port " + port + ", Alarm-Endpunkt " + path + ", Clear-Endpunkt " + clearPath + ", Home-Endpunkt " + homePath);
			});

			this.server.on("error", (err) => {
				console.error(self.name + ": Fehler beim Starten des Webhook-Servers", err.message);
			});
		} catch (err) {
			console.error(self.name + ": Konnte Webhook-Server nicht starten", err);
		}
	}
});
