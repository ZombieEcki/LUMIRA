// LUMIRA – node_helper für MMM-LumiraStatus.
// Pollt lumira-portal (server.js) über /api/status und erzeugt bei Bedarf
// den WLAN-QR-Code für den Setup-Access-Point (siehe
// concept/selfservice.md Abschnitt 5 + 9). Liefert außerdem das Live-Bild
// des Spiegels für das Portal (GET /lumira/screenshot, siehe screenshot.js).
const NodeHelper = require("node_helper");
const http = require("http");
const QRCode = require("qrcode");
const { createCapturer, isLoopback } = require("./screenshot");
const fs = require("fs");
const os = require("os");
const path = require("path");
const layout = require("./lumira-layout");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
// Module in MagicMirror-Bereichen, die das Free-Layout per Hülle verschiebt
const REGION_KEYS = ["familyPlan", "statusHint"];

module.exports = NodeHelper.create({
	start() {
		this.started = false;
		this.timer = null;
		this.lastQrKey = null;
		this.lastQrDataUrl = null;
		this.capturer = createCapturer();
		if (this.expressApp) {
			this.expressApp.get("/lumira/screenshot", (req, res) => this.sendScreenshot(req, res));
		}
	},

	sendScreenshot(req, res) {
		if (!isLoopback(req.socket.remoteAddress)) {
			return res.status(403).json({ error: "Nur über das LUMIRA-Portal" });
		}
		this.capturer.capture().then((shot) => {
			res.set({
				"Content-Type": "image/jpeg",
				"Cache-Control": "no-store",
				"X-Lumira-Captured-At": new Date(shot.at).toISOString(),
				"X-Lumira-Capture-Method": shot.method
			});
			res.send(shot.buffer);
		}).catch((err) => {
			res.status(503).json({ error: "Kein Bild vom Spiegel: " + err.message });
		});
	},

	// Free-Layout an die Anzeige (nur die Bereichs-Module; die eigenen Kachel-Module lesen selbst)
	pushLayout() {
		const items = layout.read(LUMIRA_HOME) || {};
		const out = {};
		REGION_KEYS.forEach((k) => { if (items[k]) out[k] = layout.apply({ width: 0 }, items[k]); });
		this.sendSocketNotification("LUMIRA_LAYOUT", out);
	},

	watchLayout() {
		try {
			fs.mkdirSync(LUMIRA_HOME, { recursive: true });
			this.layoutWatcher = fs.watch(LUMIRA_HOME, (eventType, filename) => {
				if (filename && filename !== layout.FILE) return;
				clearTimeout(this.layoutDebounce);
				this.layoutDebounce = setTimeout(() => this.pushLayout(), 200);
			});
		} catch (err) {
			console.error("[MMM-LumiraStatus] Layout-Überwachung nicht möglich:", err.message);
		}
	},

	// Wo die Module gerade wirklich stehen (für den Layout-Editor im Portal)
	writeRects(p) {
		if (!p || typeof p !== "object" || !p.rects) return;
		const rects = {};
		Object.keys(p.rects).slice(0, 30).forEach((k) => {
			const r = p.rects[k];
			if (!/^[a-zA-Z]{2,20}$/.test(k) || !r) return;
			rects[k] = ["x", "y", "w", "h"].reduce((o, f) => { o[f] = Math.round((Number(r[f]) || 0) * 100) / 100; return o; }, {});
		});
		const out = { at: new Date().toISOString(), screen: { width: Number(p.screen && p.screen.width) || 0, height: Number(p.screen && p.screen.height) || 0 }, rects };
		try {
			fs.writeFileSync(path.join(LUMIRA_HOME, "layout-mirror.json.tmp"), JSON.stringify(out));
			fs.renameSync(path.join(LUMIRA_HOME, "layout-mirror.json.tmp"), path.join(LUMIRA_HOME, "layout-mirror.json"));
		} catch (err) {
			console.error("[MMM-LumiraStatus] Positionen nicht gespeichert:", err.message);
		}
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "LUMIRA_RECTS") { this.writeRects(payload); return; }
		if (notification === "LUMIRA_CONFIG" && !this.started) {
			this.started = true;
			this.watchLayout();
			this.pushLayout();
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
