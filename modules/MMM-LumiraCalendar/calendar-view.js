/* MMM-LumiraCalendar – Kalender: 12 Designs aus denselben Bausteinen.
 *
 * Läuft im Browser (window.LumiraCalendarView) – auf dem Bildschirm und im
 * Portal für Auswahl und Vorschau (dort als public/calendar-view.js, der Test
 * prüft Gleichheit) – und in Node (Bereinigung der Einstellungen, Tests).
 *
 *  clean(raw)                   Einstellungen aus calendar.json bereinigen
 *  visible(events, cfg, now)    welche Termine gezeigt werden (Zeitraum, Anzahl …)
 *  build(box, cfg, data, opts)  Element mit dem gewählten Design füllen;
 *                               data: { events, sources: {id: {...}}, now, problems }
 *  fit(box)                     erst Schrift (bis 70 %), dann Zeilen kürzen –
 *                               nie abschneiden; „+ N weitere“ zählt mit
 *
 * Reine Anzeige: keine Pfeile, kein Klicken – der Bildschirm hat keinen Touch.
 */
(function (root) {
	"use strict";

	var DAY = 86400000;

	// Reihenfolge = Auswahl im Portal. width = empfohlene Breite in px.
	// plain: schlicht, ohne Farben; list: zeigt eine Terminliste (Anzahl wirkt)
	var DESIGNS = [
		{ id: "month", name: "Monat klassisch", width: 420 },
		{ id: "monthPlain", name: "Monat schlicht", width: 420, plain: true },
		{ id: "monthList", name: "Monat + Terminliste", width: 760, list: true },
		{ id: "dayPlain", name: "Tagesliste schlicht", width: 420, list: true, plain: true },
		{ id: "agenda", name: "Agenda", width: 440, list: true },
		{ id: "next", name: "Nächste Termine kompakt", width: 440, list: true },
		{ id: "today", name: "Nur heute, minimal", width: 400, list: true, todayOnly: true },
		{ id: "bigDate", name: "Großes Datum + Liste", width: 520, list: true },
		{ id: "weekTable", name: "Woche als Tabelle", width: 480 },
		{ id: "weekCols", name: "Woche quer", width: 760 },
		{ id: "timeline", name: "Tages-Zeitstrahl", width: 440, list: true },
		{ id: "overview", name: "Übersicht", width: 520, list: true }
	];
	var IDS = DESIGNS.map(function (d) { return d.id; });

	// Kalenderfarben (kräftig genug für den dunklen Hintergrund) und Symbole
	// (Font Awesome Free, solid – auf dem Bildschirm aus MagicMirror, im Portal mitgeliefert)
	var COLORS = ["#f5b942", "#ef5350", "#2ecc71", "#a66bff", "#3d9cff", "#ff7eb6", "#26c6da", "#ff8a3d", "#9ccc65", "#bdbdbd"];
	var ICONS = [
		["calendar-days", "Kalender"], ["users", "Familie"], ["briefcase", "Arbeit"], ["fire", "Feuerwehr"],
		["cake-candles", "Geburtstag"], ["person-running", "Sport"], ["school", "Schule"], ["star", "Feiertage"],
		["umbrella-beach", "Urlaub/Ferien"], ["heart-pulse", "Gesundheit"], ["utensils", "Essen"], ["car", "Unterwegs"],
		["music", "Musik"], ["house", "Zuhause"], ["futbol", "Verein"], ["gift", "Anlässe"]
	];
	var ICON_IDS = ICONS.map(function (i) { return i[0]; });
	var ANCHORS = ["top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"];
	var RANGES = [1, 2, 7, 14, 31];
	var INTERVALS = [5, 10, 15, 30, 60];
	var MARKS = ["color", "icon", "both", "none"];

	var DEFAULTS = {
		design: "agenda", title: "",
		range: 7, max: 8, more: true, past: false, allDay: true,
		time: true, endTime: false, location: false, mark: "color", wrap: false, interval: 15,
		anchor: "auto", unit: "px", x: 0, y: 0, width: 440, height: 520,
		fontScale: 100, gap: 6, padding: 16, opacity: 35, glass: true, line: 1
	};

	function num(v, min, max, d) {
		var n = Number(v);
		return isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, Math.round(n))) : d;
	}
	function bool(v, d) { return v === undefined ? d : !!v; }

	function clean(raw) {
		var r = raw && typeof raw === "object" ? raw : {};
		var d = DEFAULTS;
		var unit = r.unit === "pct" ? "pct" : "px";
		var lim = unit === "pct" ? 100 : 3000;
		return {
			design: IDS.indexOf(r.design) === -1 ? d.design : r.design,
			title: String(r.title || "").slice(0, 40),
			range: num(r.range, 1, 62, d.range),
			max: num(r.max, 1, 100, d.max),
			more: bool(r.more, d.more),
			past: bool(r.past, d.past),
			allDay: bool(r.allDay, d.allDay),
			time: bool(r.time, d.time),
			endTime: bool(r.endTime, d.endTime),
			location: bool(r.location, d.location),
			mark: MARKS.indexOf(r.mark) === -1 ? d.mark : r.mark,
			wrap: bool(r.wrap, d.wrap),
			interval: INTERVALS.indexOf(Number(r.interval)) === -1 ? d.interval : Number(r.interval),
			anchor: r.anchor === "auto" || ANCHORS.indexOf(r.anchor) !== -1 ? r.anchor : d.anchor,
			unit: unit,
			x: num(r.x, -lim, lim, d.x),
			y: num(r.y, -lim, lim, d.y),
			width: num(r.width, 200, 1600, d.width),
			height: num(r.height, 100, 1600, d.height),
			fontScale: num(r.fontScale, 40, 300, d.fontScale),
			gap: num(r.gap, 0, 40, d.gap),
			padding: num(r.padding, 0, 60, d.padding),
			opacity: num(r.opacity, 0, 100, d.opacity),
			glass: bool(r.glass, d.glass),
			line: num(r.line, 0, 4, d.line)
		};
	}

	// Eine Kalenderquelle (ohne Link – der bleibt im Portal bzw. node_helper)
	function cleanSource(s, i) {
		s = s && typeof s === "object" ? s : {};
		return {
			id: /^[a-z0-9]{4,16}$/.test(String(s.id || "")) ? String(s.id) : "",
			name: String(s.name || "").trim().slice(0, 40) || "Kalender " + ((i || 0) + 1),
			enabled: s.enabled === undefined ? true : !!s.enabled,
			color: /^#[0-9a-f]{6}$/i.test(String(s.color || "")) ? String(s.color).toLowerCase() : COLORS[(i || 0) % COLORS.length],
			icon: ICON_IDS.indexOf(s.icon) === -1 ? "calendar-days" : s.icon,
			showTitle: s.showTitle === undefined ? true : !!s.showTitle,
			showLocation: s.showLocation === undefined ? true : !!s.showLocation,
			showTime: s.showTime === undefined ? true : !!s.showTime
		};
	}

	// ------------------------------------------------------------------ Datum & Text
	var WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
	var WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
	var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
	function two(n) { return (n < 10 ? "0" : "") + n; }
	function day0(t) { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
	function addDays(t, n) { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
	function hm(t) { var d = new Date(t); return two(d.getHours()) + ":" + two(d.getMinutes()); }
	function longDate(t) { var d = new Date(t); return WD[d.getDay()] + ", " + d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
	function shortDay(t) { var d = new Date(t); return WD_SHORT[d.getDay()] + ", " + d.getDate() + "." + (d.getMonth() + 1) + "."; }

	// „Heute“, „Morgen“, sonst „Fr, 10.7.“
	function dayLabel(t, now, long) {
		var diff = Math.round((day0(t) - day0(now)) / DAY);
		if (diff === 0) return "Heute";
		if (diff === 1) return "Morgen";
		if (diff === -1) return "Gestern";
		if (long) { var d = new Date(t); return WD[d.getDay()] + ", " + d.getDate() + ". " + MONTHS[d.getMonth()]; }
		return shortDay(t);
	}

	// Montag der Woche
	function weekStart(t) { var d = new Date(day0(t)); return addDays(d.getTime(), -((d.getDay() + 6) % 7)); }

	// ------------------------------------------------------------------ Auswahl
	// Termine im Zeitraum: ab heute (ohne vergangene, außer „vergangene
	// zeigen“), laufende mehrtägige mit; ganztägige optional; nur aktive Quellen.
	function inRange(events, sources, cfg, now, days) {
		var t0 = day0(now);
		var t1 = addDays(t0, days);
		return (events || []).filter(function (e) {
			var s = sources && sources[e.src];
			if (sources && (!s || s.enabled === false)) return false;
			if (e.allDay && !cfg.allDay) return false;
			if (e.start >= t1) return false;
			var end = e.end > e.start ? e.end : e.start + (e.allDay ? DAY : 1);
			if (cfg.past) return end > t0;
			return end > now;
		});
	}

	function visible(events, cfg, now, sources) {
		var d = design(cfg.design);
		var list = inRange(events, sources, cfg, now, d.todayOnly ? 1 : cfg.range);
		list.sort(function (x, y) { return x.start - y.start || ((y.allDay ? 1 : 0) - (x.allDay ? 1 : 0)) || String(x.title).localeCompare(String(y.title)); });
		return { list: list.slice(0, cfg.max), more: Math.max(0, list.length - cfg.max), total: list.length };
	}

	function design(id) {
		for (var i = 0; i < DESIGNS.length; i++) if (DESIGNS[i].id === id) return DESIGNS[i];
		return DESIGNS[0];
	}

	// ------------------------------------------------------------------ Bausteine
	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	}

	function srcOf(ctx, e) { return (ctx.sources && ctx.sources[e.src]) || { color: "#bdbdbd", icon: "calendar-days", showTitle: true, showLocation: true, showTime: true, name: "" }; }

	function titleOf(ctx, e) { return srcOf(ctx, e).showTitle ? e.title : "Belegt"; }

	function timeText(ctx, e) {
		var s = srcOf(ctx, e);
		if (e.allDay) return "ganztags";
		if (!s.showTime) return "";
		var t = hm(e.start);
		if (ctx.cfg.endTime && e.end > e.start && day0(e.end) === day0(e.start)) t += "–" + hm(e.end);
		return t;
	}

	// Kennzeichnung je Kalender: Farbstreifen/Punkt, Symbol, beides oder nichts
	function mark(ctx, e, kind) {
		var m = ctx.plain ? "none" : ctx.cfg.mark;
		var s = srcOf(ctx, e);
		var wrap = el("span", "lk-mk");
		if (m === "color" || m === "both") {
			var c = el("span", kind === "dot" ? "lk-dot" : "lk-bar");
			c.style.background = s.color;
			wrap.appendChild(c);
		}
		if (m === "icon" || m === "both") {
			var i = el("i", "lk-ic fa-solid fa-" + s.icon);
			i.setAttribute("aria-hidden", "true");
			i.style.color = s.color;
			wrap.appendChild(i);
		}
		if (m === "none" && ctx.plain && kind === "dot") wrap.appendChild(el("span", "lk-dot lk-neutral"));
		return wrap;
	}

	// Ein Termin als Zeile: [Marke] Zeit Titel (Ort)
	function item(ctx, e, opts) {
		opts = opts || {};
		var row = el("div", "lk-item" + (e.end <= ctx.now && !e.allDay ? " is-past" : ""));
		if (opts.day) row.appendChild(el("span", "lk-day", dayLabel(e.start, ctx.now)));
		if (!opts.noMark) row.appendChild(mark(ctx, e, opts.dot ? "dot" : "bar"));
		var t = timeText(ctx, e);
		if (ctx.cfg.time && !opts.timeRight) row.appendChild(el("span", "lk-time", t));
		var body = el("span", "lk-body");
		body.appendChild(el("span", "lk-title", titleOf(ctx, e)));
		var s = srcOf(ctx, e);
		if (ctx.cfg.location && s.showLocation && s.showTitle && e.location) body.appendChild(el("span", "lk-loc", e.location));
		row.appendChild(body);
		if (ctx.cfg.time && opts.timeRight) row.appendChild(el("span", "lk-time lk-time-r", t));
		return row;
	}

	function moreEl(n) { var m = el("div", "lk-more", "+ " + n + " weitere" + (n === 1 ? "r Termin" : " Termine")); m.setAttribute("data-more", n); return m; }
	function emptyEl(text) { return el("div", "lk-empty", text); }
	function rangeWord(cfg) {
		return cfg.range === 1 ? "heute" : cfg.range === 2 ? "heute und morgen" : "den nächsten " + cfg.range + " Tagen";
	}

	// Liste, wahlweise nach Tagen gruppiert
	function listInto(parent, ctx, vis, opts) {
		opts = opts || {};
		var wrap = parent.appendChild(el("div", "lk-list"));
		if (!vis.list.length) { wrap.appendChild(emptyEl(opts.empty || "Keine Termine " + (ctx.cfg.range === 1 ? "heute" : "in " + rangeWord(ctx.cfg)))); return wrap; }
		var lastDay = null;
		vis.list.forEach(function (e) {
			var d = Math.max(day0(e.start), day0(ctx.now));
			if (opts.group && d !== lastDay) {
				lastDay = d;
				var gh = el("div", "lk-group", opts.groupLong ? dayLabel(d, ctx.now, true) : dayLabel(d, ctx.now));
				if (opts.groupDate && Math.round((d - day0(ctx.now)) / DAY) < 2) gh.appendChild(el("span", "lk-group-d", shortDay(d)));
				wrap.appendChild(gh);
			}
			wrap.appendChild(item(ctx, e, opts.item));
		});
		if (vis.more && ctx.cfg.more) wrap.appendChild(moreEl(vis.more));
		return wrap;
	}

	function head(parent, text, right) {
		var h = parent.appendChild(el("div", "lk-head"));
		h.appendChild(el("span", "lk-head-t", text));
		if (right) h.appendChild(el("span", "lk-head-r", right));
		return h;
	}

	// Monatsraster: Wochen ab Montag, heute markiert, Punkte für Tage mit Terminen
	function monthGrid(parent, ctx) {
		var now = new Date(ctx.now);
		var first = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
		var next = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
		var g = parent.appendChild(el("div", "lk-month"));
		head(g, MONTHS[now.getMonth()] + " " + now.getFullYear());
		var grid = g.appendChild(el("div", "lk-grid"));
		["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(function (w) { grid.appendChild(el("span", "lk-wd", w)); });
		var start = weekStart(first);
		var today = day0(ctx.now);
		var all = inRange(ctx.events, ctx.sources, Object.assign({}, ctx.cfg, { past: true }), start, 43);
		for (var t = start, i = 0; i < 42 && (t < next || i % 7 !== 0); t = addDays(t, 1), i++) {
			var cell = grid.appendChild(el("span", "lk-cell" + (t < first || t >= next ? " is-out" : "") + (t === today ? " is-today" : "")));
			cell.appendChild(el("span", "lk-num", String(new Date(t).getDate())));
			var t1 = addDays(t, 1);
			var hits = all.filter(function (e) { var end = e.end > e.start ? e.end : e.start + 1; return e.start < t1 && end > t; });
			if (hits.length) {
				var dots = cell.appendChild(el("span", "lk-dots"));
				var seen = [];
				hits.forEach(function (e) {
					var c = ctx.plain || ctx.cfg.mark === "none" || ctx.cfg.mark === "icon" ? "" : srcOf(ctx, e).color;
					if (seen.indexOf(c) !== -1 || seen.length >= 3) return;
					seen.push(c);
					var d = dots.appendChild(el("span", "lk-dot" + (c ? "" : " lk-neutral")));
					if (c) d.style.background = c;
				});
			}
		}
		return g;
	}

	// ------------------------------------------------------------------ Designs
	var BUILD = {
		month: function (b, ctx) { monthGrid(b, ctx); },
		monthPlain: function (b, ctx) { monthGrid(b, ctx); },
		monthList: function (b, ctx) {
			var row = b.appendChild(el("div", "lk-split"));
			monthGrid(row, ctx);
			var side = row.appendChild(el("div", "lk-side"));
			head(side, ctx.cfg.title || "Termine");
			listInto(side, ctx, ctx.vis, { group: true, item: {} });
		},
		dayPlain: function (b, ctx) {
			head(b, ctx.cfg.title || longDate(ctx.now));
			listInto(b, ctx, ctx.vis, { group: ctx.cfg.range > 1, groupLong: true, item: { noMark: true } });
		},
		agenda: function (b, ctx) {
			if (ctx.cfg.title) head(b, ctx.cfg.title);
			listInto(b, ctx, ctx.vis, { group: true, groupLong: true, groupDate: true, item: {} });
		},
		next: function (b, ctx) {
			head(b, ctx.cfg.title || "Nächste Termine");
			listInto(b, ctx, ctx.vis, { item: { day: true, dot: true, timeRight: true } });
		},
		today: function (b, ctx) {
			head(b, ctx.cfg.title || "Heute", shortDay(ctx.now) + new Date(ctx.now).getFullYear());
			listInto(b, ctx, ctx.vis, { empty: "Heute keine Termine", item: { dot: true } });
		},
		bigDate: function (b, ctx) {
			var row = b.appendChild(el("div", "lk-split lk-big"));
			var d = new Date(ctx.now);
			var left = row.appendChild(el("div", "lk-bigdate"));
			left.appendChild(el("div", "lk-bd-wd", WD[d.getDay()]));
			left.appendChild(el("div", "lk-bd-d", two(d.getDate())));
			left.appendChild(el("div", "lk-bd-m", MONTHS[d.getMonth()] + " " + d.getFullYear()));
			var side = row.appendChild(el("div", "lk-side"));
			if (ctx.cfg.title) head(side, ctx.cfg.title);
			listInto(side, ctx, ctx.vis, { item: { day: ctx.cfg.range > 1 } });
		},
		weekTable: function (b, ctx) {
			var ws = weekStart(ctx.now);
			var we = addDays(ws, 6);
			var a = new Date(ws), z = new Date(we);
			head(b, ctx.cfg.title || (a.getDate() + "." + (a.getMonth() === z.getMonth() ? "" : (a.getMonth() + 1) + ".") + " – " + z.getDate() + ". " + MONTHS[z.getMonth()] + " " + z.getFullYear()));
			var tab = b.appendChild(el("div", "lk-week"));
			var all = inRange(ctx.events, ctx.sources, Object.assign({}, ctx.cfg, { past: true }), ws, 7);
			for (var i = 0; i < 7; i++) {
				var t = addDays(ws, i);
				var t1 = addDays(t, 1);
				var row = tab.appendChild(el("div", "lk-wrow" + (t === day0(ctx.now) ? " is-today" : "")));
				row.appendChild(el("span", "lk-wd", WD_SHORT[new Date(t).getDay()]));
				row.appendChild(el("span", "lk-num", String(new Date(t).getDate())));
				var cell = row.appendChild(el("span", "lk-wcell"));
				var hits = all.filter(function (e) { var end = e.end > e.start ? e.end : e.start + 1; return e.start < t1 && end > t; });
				if (!hits.length) cell.appendChild(el("span", "lk-wnone", "–"));
				hits.slice(0, 3).forEach(function (e) { cell.appendChild(item(ctx, e, { dot: true, timeRight: true })); });
				if (hits.length > 3) cell.appendChild(el("span", "lk-wmore", "+" + (hits.length - 3)));
			}
		},
		weekCols: function (b, ctx) {
			var ws = weekStart(ctx.now);
			var z = new Date(addDays(ws, 6));
			var a = new Date(ws);
			head(b, ctx.cfg.title || (a.getDate() + ". – " + z.getDate() + ". " + MONTHS[z.getMonth()] + " " + z.getFullYear()));
			var cols = b.appendChild(el("div", "lk-cols"));
			var all = inRange(ctx.events, ctx.sources, Object.assign({}, ctx.cfg, { past: true }), ws, 7);
			for (var i = 0; i < 7; i++) {
				var t = addDays(ws, i);
				var t1 = addDays(t, 1);
				var col = cols.appendChild(el("div", "lk-col" + (t === day0(ctx.now) ? " is-today" : "")));
				var h = col.appendChild(el("div", "lk-col-h"));
				h.appendChild(el("span", "lk-wd", WD_SHORT[new Date(t).getDay()]));
				h.appendChild(el("span", "lk-num", String(new Date(t).getDate())));
				var hits = all.filter(function (e) { var end = e.end > e.start ? e.end : e.start + 1; return e.start < t1 && end > t; });
				hits.slice(0, 4).forEach(function (e) {
					var chip = col.appendChild(el("div", "lk-chip"));
					var c = ctx.cfg.mark === "none" ? "#8a93a6" : srcOf(ctx, e).color;
					chip.style.borderLeftColor = c;
					chip.style.background = c + "33";
					if (ctx.cfg.time && !e.allDay && srcOf(ctx, e).showTime) chip.appendChild(el("span", "lk-chip-t", hm(e.start)));
					chip.appendChild(el("span", "lk-chip-n", titleOf(ctx, e)));
				});
				if (hits.length > 4) col.appendChild(el("div", "lk-wmore", "+" + (hits.length - 4)));
			}
		},
		timeline: function (b, ctx) {
			head(b, ctx.cfg.title || longDate(ctx.now));
			var tl = b.appendChild(el("div", "lk-tl"));
			if (!ctx.vis.list.length) tl.appendChild(emptyEl("Keine Termine " + (ctx.cfg.range === 1 ? "heute" : "in " + rangeWord(ctx.cfg))));
			var last = day0(ctx.now);
			ctx.vis.list.forEach(function (e) {
				var d = Math.max(day0(e.start), day0(ctx.now));
				if (d !== last) { last = d; tl.appendChild(el("div", "lk-group", dayLabel(d, ctx.now, true))); }
				var row = tl.appendChild(el("div", "lk-item lk-tl-row" + (e.end <= ctx.now && !e.allDay ? " is-past" : "")));
				row.appendChild(el("span", "lk-time", ctx.cfg.time ? timeText(ctx, e) : ""));
				var dot = row.appendChild(el("span", "lk-tl-dot"));
				var c = ctx.cfg.mark === "none" ? "#c8cdd8" : srcOf(ctx, e).color;
				dot.style.background = c;
				var pill = row.appendChild(el("span", "lk-pill"));
				pill.style.background = c + "4d";
				pill.style.borderColor = c;
				if (ctx.cfg.mark === "icon" || ctx.cfg.mark === "both") {
					var ic = pill.appendChild(el("i", "lk-ic fa-solid fa-" + srcOf(ctx, e).icon));
					ic.setAttribute("aria-hidden", "true");
				}
				pill.appendChild(el("span", "lk-title", titleOf(ctx, e)));
			});
			if (ctx.vis.more && ctx.cfg.more) tl.appendChild(moreEl(ctx.vis.more));
		},
		overview: function (b, ctx) {
			if (ctx.cfg.title) head(b, ctx.cfg.title);
			var t0 = day0(ctx.now);
			var cnt = function (from, days) {
				return inRange(ctx.events, ctx.sources, Object.assign({}, ctx.cfg, { past: true }), from, days).filter(function (e) { return e.start >= from || e.allDay; }).length;
			};
			var we = addDays(weekStart(ctx.now), 7);
			var cards = b.appendChild(el("div", "lk-cards"));
			var md = new Date(addDays(t0, 1));
			[["Heute", shortDay(t0), cnt(t0, 1), "#3d9cff"], ["Morgen", WD_SHORT[md.getDay()] + ", " + md.getDate() + "." + (md.getMonth() + 1) + ".", cnt(addDays(t0, 1), 1), "#2ecc71"],
				["Diese Woche", "bis " + shortDay(addDays(we, -1)), cnt(t0, Math.round((we - t0) / DAY)), "#a66bff"]].forEach(function (x) {
				var c = cards.appendChild(el("div", "lk-card"));
				c.appendChild(el("div", "lk-card-t", x[0]));
				c.appendChild(el("div", "lk-card-d", x[1]));
				c.appendChild(el("div", "lk-card-n", String(x[2])));
				c.appendChild(el("div", "lk-card-u", x[2] === 1 ? "Termin" : "Termine"));
				var bar = c.appendChild(el("div", "lk-card-bar"));
				var fill = bar.appendChild(el("span"));
				fill.style.width = Math.min(100, x[2] * 20) + "%";
				fill.style.background = ctx.cfg.mark === "none" ? "#c8cdd8" : x[3];
			});
			listInto(b, ctx, ctx.vis, { item: { day: true, dot: true } });
		}
	};

	// ------------------------------------------------------------------ Aufbau
	// opts: { baseClass, align }
	function build(box, cfg, data, opts) {
		opts = opts || {};
		data = data || {};
		var d = design(cfg.design);
		var now = data.now ? new Date(data.now).getTime() : Date.now();
		box.innerHTML = "";
		box.className = (opts.baseClass ? opts.baseClass + " " : "") + "lk-cal lk-d-" + d.id + (d.plain ? " lk-plain" : "") +
			(cfg.glass ? " lk-glassy" : "") + (cfg.wrap ? " lk-wrap" : "");
		box.setAttribute("data-align", opts.align || "left");
		var st = box.style;
		st.fontSize = (16 * cfg.fontScale / 100).toFixed(1) + "px";
		st.setProperty("--lk-gap", (cfg.gap / 16).toFixed(3) + "em");
		st.setProperty("--lk-pad", cfg.padding + "px");
		st.setProperty("--lk-line", cfg.line + "px");
		st.setProperty("--lk-bg", "rgba(14, 16, 22, " + (cfg.opacity / 100).toFixed(2) + ")");
		var ctx = { cfg: cfg, now: now, events: data.events || [], sources: data.sources || null, plain: !!d.plain };
		ctx.vis = visible(ctx.events, cfg, now, ctx.sources);
		var inner = box.appendChild(el("div", "lk-inner"));
		BUILD[d.id](inner, ctx);
		var probs = data.problems || [];
		if (probs.length) inner.appendChild(el("div", "lk-stale", "⚠ " + probs.join(" · ")));
		return box;
	}

	// Ragt ein Baustein über den Rand? (Kästen der Elemente, nicht scrollHeight)
	function overflows(a) {
		var r = a.getBoundingClientRect();
		var kids = a.querySelectorAll(".lk-inner *:not(span):not(i)");
		for (var i = 0; i < kids.length; i++) {
			var k = kids[i].getBoundingClientRect();
			if (!k.width && !k.height) continue;
			if (k.bottom > r.bottom + 2 || k.right > r.right + 2) return true;
		}
		return false;
	}

	// Erst die Schrift bis 70 % verkleinern, dann Termine von hinten weglassen
	// (und „+ N weitere“ hochzählen) – nie abschneiden. Liefert den Faktor.
	function fit(box) {
		var base = parseFloat(box.style.fontSize) || 16;
		var size = base;
		for (var i = 0; i < 6 && overflows(box); i++) {
			size = Math.max(base * 0.7, size * 0.93);
			box.style.fontSize = size.toFixed(1) + "px";
		}
		var lists = box.querySelectorAll(".lk-list, .lk-tl");
		var dropped = 0;
		for (var guard = 0; guard < 120 && overflows(box); guard++) {
			var items = [];
			lists.forEach(function (l) { l.querySelectorAll(":scope > .lk-item").forEach(function (x) { items.push(x); }); });
			if (!items.length) break;
			var last = items[items.length - 1];
			var list = last.parentNode;
			var prev = last.previousElementSibling;
			last.remove();
			dropped++;
			// leere Tagesüberschrift mit entfernen
			if (prev && prev.classList.contains("lk-group") && (!prev.nextElementSibling || !prev.nextElementSibling.classList.contains("lk-item"))) prev.remove();
			var more = list.querySelector(":scope > .lk-more");
			var n = (more ? Number(more.getAttribute("data-more")) : 0) + 1;
			if (more) more.remove();
			list.appendChild(moreEl(n));
		}
		box.setAttribute("data-dropped", dropped);
		return size / base;
	}

	var api = {
		DESIGNS: DESIGNS, COLORS: COLORS, ICONS: ICONS, ANCHORS: ANCHORS, RANGES: RANGES, INTERVALS: INTERVALS, MARKS: MARKS, DEFAULTS: DEFAULTS,
		design: design, clean: clean, cleanSource: cleanSource, visible: visible, dayLabel: dayLabel, longDate: longDate,
		build: build, fit: fit
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.LumiraCalendarView = api;
})(typeof window !== "undefined" ? window : globalThis);
