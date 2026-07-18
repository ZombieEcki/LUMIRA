// LUMIRA – node_helper für MMM-LumiraStatus.
// Pollt lumira-portal (server.js) über /api/status und erzeugt bei Bedarf
// den WLAN-QR-Code für den Setup-Access-Point (siehe
// concept/selfservice.md Abschnitt 5 + 9).
const NodeHelper = require("node_helper");
const http = require("http");
const QRCode = require("qrcode");

module.exports = NodeHelper.create({
	start() {
		this.started = false;
		this.timer = null;
		this.lastQrKey = null;
		this.lastQrDataUrl = null;
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "LUMIRA_CONFIG" && !this.started) {
			this.started = true;
			this.config = payload;
			this.poll();
			this.timer = setInterval(() => this.poll(), this.config.pollInterval || 5000);
		}
	},

	poll() {
		const self = this;
		const url = new URL(this.config.statusUrl || "http://127.0.0.1:8092/api/status");
		const req = http.get({ host: url.hostname, port: url.port, path: url.pathname, timeout: 4000 }, (res) => {
			let body = "";
			res.on("data", (chunk) => (body += chunk));
			res.on("end", async () => {
				try {
					const status = JSON.parse(body);
					await self.handleStatus(status);
				} catch (err) {
					console.error("[MMM-LumiraStatus] Antwort konnte nicht gelesen werden:", err.message);
				}
			});
		});
		req.on("timeout", () => req.destroy());
		req.on("error", (err) => {
			// lumira-portal evtl. noch nicht gestartet - kein Dauer-Log-Spam
			self.sendSocketNotification("LUMIRA_STATUS", { mode: "UNKNOWN", error: err.message });
		});
	},

	async handleStatus(status) {
		const payload = {
			mode: status.mode,
			hostname: status.hostname,
			portalUrl: status.portalUrl,
			network: status.network,
			showStatusHint: this.config.showStatusHint !== false
		};

		if (status.mode === "SETUP" && status.ap && status.ap.ssid) {
			const key = `${status.ap.ssid}:${status.ap.psk || ""}`;
			if (key !== this.lastQrKey) {
				try {
					const wifiText = `WIFI:T:WPA;S:${status.ap.ssid};P:${status.ap.psk || ""};;`;
					this.lastQrDataUrl = await QRCode.toDataURL(wifiText, { margin: 1, width: 220 });
					this.lastQrKey = key;
				} catch (err) {
					console.error("[MMM-LumiraStatus] QR-Code konnte nicht erzeugt werden:", err.message);
				}
			}
			payload.apSsid = status.ap.ssid;
			payload.apPsk = status.ap.psk;
			payload.qrDataUrl = this.lastQrDataUrl;
		}

		this.sendSocketNotification("LUMIRA_STATUS", payload);
	},

	stop() {
		if (this.timer) clearInterval(this.timer);
	}
});
