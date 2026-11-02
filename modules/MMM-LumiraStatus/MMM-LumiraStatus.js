// LUMIRA – MMM-LumiraStatus
// Zeigt den Betriebsmodus des Self-Service-Portals auf dem Spiegel selbst
// an (siehe concept/selfservice.md Abschnitt 5):
//   SETUP  -> grosse Anleitung mit QR-Code (Ersteinrichtung/WLAN-Rueckfall)
//   FAMILY -> kleine, dezente Statuszeile (per showStatusHint abschaltbar)
Module.register("MMM-LumiraStatus", {
	defaults: {
		portalUrl: "http://lumira.local:8092",
		statusUrl: "http://127.0.0.1:8092/api/status",
		pollInterval: 5000,
		showStatusHint: true
	},

	state: null,

	start() {
		this.layout = {};
		this.lastRects = "";
		this.sendSocketNotification("LUMIRA_CONFIG", this.config);
		// Positionen fürs Portal (Layout-Editor) – selten und nur bei Änderung
		setInterval(() => this.reportRects(), 20000);
		setTimeout(() => this.reportRects(), 8000);
	},

	// Free-Layout für Module in MagicMirror-Bereichen: die Hülle verschieben
	REGION: { familyPlan: ".module.MMM-FamilyPlan", statusHint: ".module.MMM-LumiraStatus" },

	applyLayout() {
		Object.keys(this.REGION).forEach((k) => {
			const el = document.querySelector(this.REGION[k]);
			if (!el) return;
			const it = this.layout[k];
			const s = el.style;
			if (!it) { s.position = s.left = s.top = s.zIndex = s.display = ""; return; }
			s.position = "fixed";
			s.left = it.x + "vw";
			s.top = it.y + "vh";
			s.zIndex = String(5 + (it.z || 0));
			s.display = it.hidden ? "none" : "";
			// MagicMirror setzt beim Wieder-Einblenden (z. B. nach dem Alarm) position: static – dann zurück
			if (!el.lumiraObserved) {
				el.lumiraObserved = true;
				new MutationObserver(() => {
					if (this.layout[k] && el.style.position === "static") el.style.position = "fixed";
				}).observe(el, { attributes: true, attributeFilter: ["style"] });
			}
		});
		setTimeout(() => this.reportRects(), 1500);
	},

	// Kacheln und Bereichs-Module → Position in % des Bildschirms, Größe in px
	RECTS: {
		clock: ".lc-panel", calendar: ".lk-panel", todo: ".lt-panel", weather: ".lw-wxpanel", radar: ".lw-radar", warnings: ".lw-warn",
		compliments: ".sc-free, .module.MMM-SmartCompliments .smartcompliments:not(.sc-hidden)", familyPlan: ".module.MMM-FamilyPlan",
		news: ".module.MMM-LumiraNews", statusHint: ".module.MMM-LumiraStatus .lumira-status-hint"
	},

	reportRects() {
		const W = window.innerWidth;
		const H = window.innerHeight;
		const rects = {};
		Object.keys(this.RECTS).forEach((k) => {
			const el = document.querySelector(this.RECTS[k]);
			if (!el || getComputedStyle(el).display === "none") return;
			const r = el.getBoundingClientRect();
			if (r.width < 4 || r.height < 4) return;
			rects[k] = { x: r.left / W * 100, y: r.top / H * 100, w: r.width, h: r.height };
		});
		const key = JSON.stringify([W, H, rects]);
		if (key === this.lastRects) return;
		this.lastRects = key;
		this.sendSocketNotification("LUMIRA_RECTS", { screen: { width: W, height: H }, rects });
	},

	getStyles() {
		return ["MMM-LumiraStatus.css"];
	},

	socketNotificationReceived(notification, payload) {
		if (notification === "LUMIRA_LAYOUT") { this.layout = payload || {}; this.applyLayout(); return; }
		if (notification !== "LUMIRA_STATUS") return;
		this.state = payload;
		this.updateDom(300);
	},

	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = "lumira-status";

		if (!this.state || this.state.mode === "UNKNOWN") {
			return wrapper;
		}

		if (this.state.mode === "SETUP") {
			wrapper.appendChild(this.buildSetupCard());
			return wrapper;
		}

		if (this.config.showStatusHint && this.state.showStatusHint) {
			wrapper.appendChild(this.buildHint());
		}
		return wrapper;
	},

	buildSetupCard() {
		const card = document.createElement("div");
		card.className = "lumira-status-card";

		const title = document.createElement("div");
		title.className = "lumira-status-title";
		title.innerHTML = "📶 LUMIRA einrichten";
		card.appendChild(title);

		const step1 = document.createElement("div");
		step1.className = "lumira-status-step";
		step1.innerHTML = `1. Verbinde dich mit dem WLAN:<br><span class="lumira-status-mono">${this.state.apSsid || "LUMIRA-Setup"}</span>`;
		if (this.state.apPsk) {
			step1.innerHTML += `<br>Passwort: <span class="lumira-status-mono">${this.state.apPsk}</span>`;
		}
		card.appendChild(step1);

		const step2 = document.createElement("div");
		step2.className = "lumira-status-step";
		step2.innerHTML = `2. Öffne im Browser:<br><span class="lumira-status-mono">${(this.state.portalUrl || this.config.portalUrl).replace(/^https?:\/\//, "")}</span>`;
		card.appendChild(step2);

		if (this.state.qrDataUrl) {
			const qr = document.createElement("img");
			qr.className = "lumira-status-qr";
			qr.src = this.state.qrDataUrl;
			qr.alt = "WLAN-QR-Code";
			card.appendChild(qr);
		}

		return card;
	},

	buildHint() {
		const hint = document.createElement("div");
		hint.className = "lumira-status-hint";
		const host = (this.state.portalUrl || this.config.portalUrl).replace(/^https?:\/\//, "").replace(/:\d+$/, "");
		hint.textContent = `⚙ ${host}`;
		return hint;
	}
});
