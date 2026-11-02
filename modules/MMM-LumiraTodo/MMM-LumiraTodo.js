/* MagicMirror²
 * Module: MMM-LumiraTodo
 *
 * To-do-Liste für LUMIRA: mehrere Listen, Kategorien, Prioritäten,
 * Fälligkeit, Unteraufgaben – 12 Designs (todo-view.js / todo-view.css).
 * Eine frei platzierte Kachel direkt am <body> (9 Grundpositionen plus
 * Abstände), unabhängig vom Familienplan und allen anderen Modulen.
 * Reine Anzeige; abgehakt und gepflegt wird im LUMIRA-Portal, live über
 * ~/.lumira/todo.json – kein Neustart.
 *
 * MIT Licensed.
 */

Module.register("MMM-LumiraTodo", {

	defaults: {},

	getStyles: function () {
		return ["todo-view.css"];
	},

	getScripts: function () {
		return ["todo-view.js"];
	},

	start: function () {
		this.state = null;
		this.box = null;
		this.key = "";
		this.lastReport = "";
		this.reportTimer = null;
		window.addEventListener("resize", () => { this.key = ""; this.render(); });
		// „heute“/„überfällig“ und das Ausblenden erledigter Aufgaben laufen mit der Zeit
		setInterval(() => this.render(), 60000);
		this.sendSocketNotification("LT_INIT");
	},

	getDom: function () {
		return document.createElement("div");
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "LT_STATE") return;
		this.state = payload;
		this.key = "";
		this.render();
	},

	applyPos: function (el, c) {
		const s = el.style;
		const t = [];
		const [v, h] = c.anchor.split("_");
		const ux = c.unit === "pct" ? "vw" : "px";
		const uy = c.unit === "pct" ? "vh" : "px";
		s.left = s.right = s.top = s.bottom = "";
		// wie die Wetter-Kacheln: über dem Layout, unter dem Alarm
		s.position = "fixed";
		s.zIndex = String(5 + (c.z || 0));
		s.width = c.width + "px";
		s.maxWidth = "100vw";
		s.maxHeight = c.height + "px";
		if (v === "top") s.top = c.y + uy;
		else if (v === "bottom") s.bottom = c.y + uy;
		else { s.top = "calc(50% + " + c.y + uy + ")"; t.push("translateY(-50%)"); }
		if (h === "left") s.left = c.x + ux;
		else if (h === "right") s.right = c.x + ux;
		else { s.left = "calc(50% + " + c.x + ux + ")"; t.push("translateX(-50%)"); }
		s.transform = t.join(" ");
	},

	render: function () {
		const st = this.state;
		const View = window.LumiraTodoView;
		if (!st || !st.display || !View) return;
		const c = st.display;
		const key = JSON.stringify([st, Math.floor(Date.now() / 60000), window.innerWidth, window.innerHeight]);
		if (key === this.key) return;
		this.key = key;
		if (!this.box) {
			this.box = document.createElement("div");
			this.box.setAttribute("data-lumira-tile", "To-do");
			document.body.appendChild(this.box);
		}
		const h = c.anchor.split("_")[1];
		View.build(this.box, c, st.data, { baseClass: "lt-panel", align: h === "center" ? "center" : h, now: Date.now() });
		this.box.setAttribute("data-lumira-tile", "To-do");
		this.box.style.display = c.hidden ? "none" : "";
		this.applyPos(this.box, c);
		setTimeout(() => {
			if (!this.box) return;
			View.fit(this.box);
			this.scheduleReport();
		}, 300);
	},

	// ------------------------------------------------------------------ Rückmeldung
	NAMES: {
		"MMM-LumiraClock": "Uhr", "MMM-LumiraCalendar": "Kalender", "MMM-LumiraNews": "Nachrichten", "MMM-FamilyPlan": "Familienplan",
		"MMM-SmartCompliments": "Sprüche", "MMM-LumiraStatus": "Portal-Hinweis"
	},

	scheduleReport: function () {
		clearTimeout(this.reportTimer);
		this.reportTimer = setTimeout(() => this.report(), 1500);
	},

	report: function () {
		if (!this.box) return;
		const a = this.box.getBoundingClientRect();
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
		const hits = [];
		rects.forEach((m) => {
			if (a.left < m.r.right - 2 && a.right > m.r.left + 2 && a.top < m.r.bottom - 2 && a.bottom > m.r.top + 2 && hits.indexOf(m.name) === -1) hits.push(m.name);
		});
		const rep = {
			screen: { width: window.innerWidth, height: window.innerHeight }, overlaps: hits,
			offscreen: a.left < -2 || a.top < -2 || a.right > window.innerWidth + 2 || a.bottom > window.innerHeight + 2,
			dropped: Number(this.box.getAttribute("data-dropped")) || 0
		};
		const k = JSON.stringify(rep);
		if (k === this.lastReport) return;
		this.lastReport = k;
		this.sendSocketNotification("LT_REPORT", rep);
	}
});
