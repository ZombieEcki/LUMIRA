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
		this.sendSocketNotification("LUMIRA_CONFIG", this.config);
	},

	getStyles() {
		return ["MMM-LumiraStatus.css"];
	},

	socketNotificationReceived(notification, payload) {
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
