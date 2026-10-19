/* MagicMirror²
 * Module: MMM-LumiraCalendar
 *
 * Eigener Kalender für LUMIRA, ersetzt das MagicMirror-Modul „calendar“:
 * beliebig viele Kalender-Abos (ICS: iCloud, Google, Outlook, Vereine,
 * Feiertage …) zusammengeführt, 12 Designs (calendar-view.js /
 * calendar-view.css), Farbe und Symbol je Kalender, Zeitraum und maximale
 * Anzahl getrennt einstellbar. Reine Anzeige – kein Touch nötig.
 *
 * Position:
 *  - „Wie bisher“ (anchor "auto"): im MagicMirror-Layout unten links.
 *  - frei: eine Kachel direkt am <body>, 9 Grundpositionen plus Abstände.
 *
 * Einstellungen live aus dem LUMIRA-Portal (Bildschirm → Kalender) über
 * ~/.lumira/calendar.json – kein Neustart. Für andere Module (Sprüche)
 * gehen die Termine wie beim alten Kalender als CALENDAR_EVENTS hinaus.
 *
 * MIT Licensed.
 */

Module.register("MMM-LumiraCalendar", {

	defaults: {},

	getStyles: function () {
		return ["calendar-view.css"];
	},

	getScripts: function () {
		return ["calendar-view.js"];
	},

	start: function () {
		this.state = null;
		this.box = null;
		this.slot = null;
		this.key = "";
		this.lastReport = "";
		this.reportTimer = null;
		window.addEventListener("resize", () => { this.key = ""; this.render(); });
		// Zeit läuft weiter: vergangene Termine, „Heute/Morgen“, Monatswechsel
		setInterval(() => this.render(), 60000);
		this.sendSocketNotification("LK_INIT");
	},

	getDom: function () {
		if (!this.slot) this.slot = document.createElement("div");
		if (this.state) setTimeout(() => { this.key = ""; this.render(); }, 0);
		return this.slot;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "LK_STATE") return;
		this.state = payload;
		this.key = "";
		this.render();
		this.broadcast();
	},

	// Wie das alte Kalendermodul: für MMM-SmartCompliments (Kalender-Anlässe)
	broadcast: function () {
		const st = this.state || {};
		const src = st.sources || {};
		const list = (st.events || []).filter((e) => src[e.src] && src[e.src].enabled !== false).map((e) => ({
			title: src[e.src].showTitle === false ? "Belegt" : e.title,
			startDate: String(e.start),
			endDate: String(e.end),
			fullDayEvent: !!e.allDay,
			location: src[e.src].showLocation === false ? "" : e.location || "",
			calendarName: src[e.src].name || ""
		}));
		this.sendNotification("CALENDAR_EVENTS", list);
	},

	free: function () {
		const c = this.state && this.state.config;
		return !!(c && c.anchor !== "auto");
	},

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

	// Kalender, die gerade nicht erreichbar sind (letzter Stand bleibt)
	problems: function () {
		const st = (this.state && this.state.status) || {};
		const hhmm = (iso) => { const d = new Date(iso); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); };
		return Object.keys(st).filter((id) => st[id].enabled && st[id].error).map((id) =>
			st[id].name + ": " + (st[id].updatedAt ? "Stand " + hhmm(st[id].updatedAt) : "gerade nicht erreichbar"));
	},

	render: function () {
		const st = this.state;
		const c = st && st.config;
		const View = window.LumiraCalendarView;
		if (!c || !View) return;
		if (!this.box) this.box = document.createElement("div");
		const parent = this.free() ? document.body : this.slot;
		if (parent && this.box.parentNode !== parent) parent.appendChild(this.box);
		const now = new Date();
		const minute = Math.floor(now.getTime() / 60000);
		const key = JSON.stringify([c, st.events && st.events.length, st.status, minute, window.innerWidth, window.innerHeight]);
		if (key === this.key) return;
		this.key = key;
		const h = c.anchor === "auto" ? "left" : c.anchor.split("_")[1];
		View.build(this.box, c, { events: st.events, sources: st.sources, now: now.getTime(), problems: this.problems() },
			{ baseClass: "lk-panel", align: h === "center" ? "center" : h });
		if (this.free()) this.box.setAttribute("data-lumira-tile", "Kalender");
		else this.box.removeAttribute("data-lumira-tile");
		this.applyPos(this.box, c);
		setTimeout(() => {
			if (!this.box) return;
			View.fit(this.box);
			this.scheduleReport();
		}, 300);
	},

	// ------------------------------------------------------------------ Rückmeldung
	NAMES: {
		"MMM-LumiraClock": "Uhr", newsfeed: "Nachrichten", "MMM-FamilyPlan": "Familienplan",
		"MMM-SmartCompliments": "Sprüche", "MMM-aPagerAlarm": "Alarm", "MMM-LumiraStatus": "Portal-Hinweis"
	},

	scheduleReport: function () {
		clearTimeout(this.reportTimer);
		this.reportTimer = setTimeout(() => this.report(), 1500);
	},

	report: function () {
		const hits = [];
		let off = false;
		if (this.box) {
			const a = this.box.getBoundingClientRect();
			if (this.free()) {
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
		const rep = {
			screen: { width: window.innerWidth, height: window.innerHeight }, overlaps: hits, offscreen: off,
			dropped: this.box ? Number(this.box.getAttribute("data-dropped")) || 0 : 0
		};
		const key = JSON.stringify(rep);
		if (key === this.lastReport) return;
		this.lastReport = key;
		this.sendSocketNotification("LK_REPORT", rep);
	}
});
