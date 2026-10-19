/* MagicMirror²
 * Module: MMM-LumiraClock
 *
 * Eigene Uhr für LUMIRA, ersetzt das MagicMirror-Modul „clock“:
 * 16 Designs (digital und analog, clock-view.js / clock-view.css), Datum und
 * Wochentag ein-/ausblendbar, 24 h (Standard) oder 12 h, Sekunden optional.
 *
 * Position:
 *  - „Wie bisher“ (anchor "auto"): im MagicMirror-Layout oben links, wie die
 *    alte Uhr – der Familienplan steht weiter darunter.
 *  - frei: eine Kachel direkt am <body>, 9 Grundpositionen plus Abstände in
 *    px oder % des Bildschirms.
 *
 * Einstellungen kommen live aus dem LUMIRA-Portal (Bildschirm → Uhr) über
 * ~/.lumira/clock.json – kein Neustart. Aktualisiert wird nur, wenn sich die
 * Anzeige ändert: einmal pro Minute, mit Sekunden einmal pro Sekunde.
 *
 * MIT Licensed.
 */

Module.register("MMM-LumiraClock", {

	defaults: {},

	getStyles: function () {
		return ["clock-view.css"];
	},

	getScripts: function () {
		return ["clock-view.js"];
	},

	start: function () {
		this.cfg = null;
		this.box = null;
		this.slot = null;
		this.timer = null;
		this.key = "";
		this.lastReport = "";
		this.reportTimer = null;
		window.addEventListener("resize", () => { this.key = ""; this.render(); });
		this.sendSocketNotification("LC_INIT");
	},

	getDom: function () {
		// Platz im Layout für „Wie bisher“; die Uhr selbst wandert je nach
		// Einstellung hier hinein oder an den <body>
		if (!this.slot) this.slot = document.createElement("div");
		if (this.cfg) setTimeout(() => this.render(), 0);
		return this.slot;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "LC_STATE") return;
		this.cfg = payload && payload.config;
		this.key = "";
		this.render();
	},

	free: function () {
		return !!(this.cfg && this.cfg.anchor !== "auto");
	},

	// Position und Größe; Abstände in px oder % des Bildschirms
	applyPos: function (el, c) {
		const s = el.style;
		s.left = s.right = s.top = s.bottom = s.transform = "";
		s.width = c.width + "px";
		s.maxWidth = "100vw";
		s.maxHeight = c.height + "px";
		if (!this.free()) { s.position = s.zIndex = ""; return; }
		const t = [];
		const [v, h] = c.anchor.split("_");
		const ux = c.unit === "pct" ? "vw" : "px";
		const uy = c.unit === "pct" ? "vh" : "px";
		// wie die Wetter-Kacheln: über dem Layout, unter dem Alarm
		s.position = "fixed";
		s.zIndex = "5";
		if (v === "top") s.top = c.y + uy;
		else if (v === "bottom") s.bottom = c.y + uy;
		else { s.top = "calc(50% + " + c.y + uy + ")"; t.push("translateY(-50%)"); }
		if (h === "left") s.left = c.x + ux;
		else if (h === "right") s.right = c.x + ux;
		else { s.left = "calc(50% + " + c.x + ux + ")"; t.push("translateX(-50%)"); }
		s.transform = t.join(" ");
	},

	align: function () {
		if (!this.free()) return "left";
		const h = this.cfg.anchor.split("_")[1];
		return h === "center" ? "center" : h;
	},

	render: function () {
		const c = this.cfg;
		const View = window.LumiraClockView;
		if (!c || !View) return;
		if (!this.box) this.box = document.createElement("div");
		const parent = this.free() ? document.body : this.slot;
		if (parent && this.box.parentNode !== parent) parent.appendChild(this.box);
		const key = JSON.stringify(c) + "|" + window.innerWidth + "x" + window.innerHeight;
		if (key !== this.key) {
			this.key = key;
			View.build(this.box, c, { baseClass: "lc-panel", align: this.align() });
			if (this.free()) this.box.setAttribute("data-lumira-tile", "Uhr");
			else this.box.removeAttribute("data-lumira-tile");
			this.applyPos(this.box, c);
			// erst nach dem Zeichnen messen
			setTimeout(() => {
				if (!this.box) return;
				View.fit(this.box);
				this.scheduleReport();
			}, 200);
		}
		this.schedule();
	},

	// Nächster Aufruf genau dann, wenn sich etwas ändert
	schedule: function () {
		clearTimeout(this.timer);
		const View = window.LumiraClockView;
		if (!this.box || !View) return;
		const ms = View.tick(this.box, new Date());
		this.timer = setTimeout(() => this.schedule(), Math.max(200, ms));
	},

	// ------------------------------------------------------------------ Rückmeldung
	// Überdeckt die frei platzierte Uhr andere Module? (fürs Portal)
	NAMES: {
		calendar: "Kalender", "MMM-LumiraCalendar": "Kalender", newsfeed: "Nachrichten", "MMM-FamilyPlan": "Familienplan",
		"MMM-SmartCompliments": "Sprüche", "MMM-aPagerAlarm": "Alarm", "MMM-LumiraStatus": "Portal-Hinweis"
	},

	scheduleReport: function () {
		clearTimeout(this.reportTimer);
		this.reportTimer = setTimeout(() => this.report(), 1500);
	},

	report: function () {
		const free = this.free() && this.box;
		const hits = [];
		let off = false;
		if (this.box) {
			const a = this.box.getBoundingClientRect();
			if (free) {
				const rects = [];
				document.querySelectorAll(".module").forEach((m) => {
					if (m.classList.contains(this.name)) return;
					const r = m.getBoundingClientRect();
					if (r.width < 4 || r.height < 4 || getComputedStyle(m).visibility === "hidden" || Number(getComputedStyle(m).opacity) === 0) return;
					const name = Object.keys(this.NAMES).find((k) => m.classList.contains(k));
					if (name) rects.push({ name: this.NAMES[name], r });
				});
				document.querySelectorAll(".lw-panel, .lw-wxpanel").forEach((el) => {
					rects.push({ name: el.classList.contains("lw-wxpanel") ? "Wetteranzeige" : el.classList.contains("lw-radar") ? "Regenradar" : "Warnungen", r: el.getBoundingClientRect() });
				});
				document.querySelectorAll(".sc-free").forEach((el) => rects.push({ name: "Sprüche", r: el.getBoundingClientRect() }));
				document.querySelectorAll("[data-lumira-tile]").forEach((el) => { if (el !== this.box) rects.push({ name: el.getAttribute("data-lumira-tile"), r: el.getBoundingClientRect() }); });
				rects.forEach((m) => {
					if (a.left < m.r.right - 2 && a.right > m.r.left + 2 && a.top < m.r.bottom - 2 && a.bottom > m.r.top + 2 && hits.indexOf(m.name) === -1) hits.push(m.name);
				});
			}
			off = a.left < -2 || a.top < -2 || a.right > window.innerWidth + 2 || a.bottom > window.innerHeight + 2;
		}
		const rep = { screen: { width: window.innerWidth, height: window.innerHeight }, overlaps: hits, offscreen: off };
		const key = JSON.stringify(rep);
		if (key === this.lastReport) return;
		this.lastReport = key;
		this.sendSocketNotification("LC_REPORT", rep);
	}
});
