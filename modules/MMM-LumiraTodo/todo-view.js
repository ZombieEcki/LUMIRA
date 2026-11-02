/* MMM-LumiraTodo – To-do-Liste: 12 Designs aus denselben Bausteinen.
 *
 * Läuft im Browser (window.LumiraTodoView) – auf dem Bildschirm und im Portal
 * für Auswahl und Vorschau (dort als public/todo-view.js, der Test prüft
 * Gleichheit) – und in Node (Bereinigung der Anzeige, Auswahl, Tests).
 *
 *  clean(raw)                     Anzeige-Einstellungen aus todo.json bereinigen
 *  select(data, cfg, now)         welche Aufgaben wie gezeigt werden (je Liste)
 *  build(box, cfg, data, opts)    Element mit dem gewählten Design füllen
 *  fit(box)                       erst Schrift (bis 70 %), dann Aufgaben kürzen
 *
 * Reine Anzeige: Häkchen sind Bilder, bedient wird im Portal (kein Touch).
 * Priorität ist ohne Farbe erkennbar: !!! dringend, !! hoch, – niedrig.
 */
(function (root) {
	"use strict";

	var DAY = 86400000;
	var DESIGNS = [
		{ id: "classic", name: "Klassisch", width: 380, plain: true },
		{ id: "icons", name: "Modern mit Icons", width: 400 },
		{ id: "compact", name: "Kompakt", width: 320, plain: true },
		{ id: "categories", name: "Mit Kategorien", width: 380 },
		{ id: "progress", name: "Mit Fortschritt", width: 380 },
		{ id: "today", name: "Heute (mit Uhrzeit)", width: 420 },
		{ id: "minimal", name: "Minimal / Clean", width: 360, plain: true },
		{ id: "frame", name: "Elegant mit Rahmen", width: 380 },
		{ id: "tiles", name: "Kacheln", width: 380 },
		{ id: "priority", name: "Prioritäten", width: 400 },
		{ id: "notes", name: "Mit Notiz / Unteraufgaben", width: 400 },
		{ id: "week", name: "Wochenübersicht", width: 420 }
	];
	var IDS = DESIGNS.map(function (d) { return d.id; });
	var PRIORITIES = [["urgent", "dringend", "!!!"], ["high", "hoch", "!!"], ["normal", "normal", ""], ["low", "niedrig", "–"]];
	var PRIO_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
	var DONE_MODES = ["strike", "below", "hide"];
	var ANCHORS = ["top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"];
	// Font Awesome Free (solid) – auf dem Bildschirm aus MagicMirror, im Portal mitgeliefert
	var ICONS = [
		["list-check", "Aufgabe"], ["house", "Haushalt"], ["cart-shopping", "Einkaufen"], ["utensils", "Küche"], ["trash-can", "Müll"],
		["shirt", "Wäsche"], ["leaf", "Garten"], ["briefcase", "Arbeit"], ["calendar-days", "Termin"], ["heart-pulse", "Gesundheit"],
		["paw", "Tiere"], ["car", "Auto"], ["phone", "Anrufen"], ["envelope", "Post"], ["file-invoice", "Rechnung"],
		["gift", "Geschenk"], ["gamepad", "Freizeit"], ["book", "Lernen"], ["screwdriver-wrench", "Reparatur"], ["heart", "Sonstiges"]
	];

	var DEFAULTS = {
		design: "classic", title: "",
		lists: [], max: 8, more: true, done: "strike", doneHours: 24, range: 0,
		progress: true, count: true, icons: true, highlightDue: true,
		anchor: "middle_right", unit: "px", x: 30, y: 0, width: 380, height: 520,
		fontScale: 100, gap: 6, padding: 16, opacity: 35, glass: true, line: 1, accent: ""
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
			// leer = alle Listen, die „auf dem Bildschirm“ an sind
			lists: Array.isArray(r.lists) ? r.lists.filter(function (x) { return typeof x === "string"; }).slice(0, 50) : [],
			max: num(r.max, 1, 100, d.max),
			more: bool(r.more, d.more),
			done: DONE_MODES.indexOf(r.done) === -1 ? d.done : r.done,
			doneHours: num(r.doneHours, 0, 720, d.doneHours),
			range: num(r.range, 0, 365, d.range),
			progress: bool(r.progress, d.progress),
			count: bool(r.count, d.count),
			icons: bool(r.icons, d.icons),
			highlightDue: bool(r.highlightDue, d.highlightDue),
			anchor: ANCHORS.indexOf(r.anchor) === -1 ? d.anchor : r.anchor,
			unit: unit,
			x: num(r.x, -lim, lim, d.x),
			y: num(r.y, -lim, lim, d.y),
			width: num(r.width, 160, 1600, d.width),
			height: num(r.height, 100, 1600, d.height),
			fontScale: num(r.fontScale, 40, 300, d.fontScale),
			gap: num(r.gap, 0, 40, d.gap),
			padding: num(r.padding, 0, 60, d.padding),
			opacity: num(r.opacity, 0, 100, d.opacity),
			glass: bool(r.glass, d.glass),
			line: num(r.line, 0, 6, d.line),
			accent: /^#[0-9a-f]{6}$/i.test(String(r.accent || "")) ? String(r.accent).toLowerCase() : ""
		};
	}

	function design(id) {
		for (var i = 0; i < DESIGNS.length; i++) if (DESIGNS[i].id === id) return DESIGNS[i];
		return DESIGNS[0];
	}

	// ------------------------------------------------------------------ Datum
	function two(n) { return (n < 10 ? "0" : "") + n; }
	function dayKey(t) { var d = new Date(t); return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()); }
	function keyMs(k) { var p = String(k).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); }
	var WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
	var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
	function weekStart(now) { var d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }

	// „heute“, „morgen“, „überfällig“, sonst „Fr, 10.7.“
	function dueText(t, now) {
		if (!t.due) return "";
		var diff = Math.round((keyMs(t.due) - keyMs(dayKey(now))) / DAY);
		var d = new Date(keyMs(t.due));
		var s = diff === 0 ? "heute" : diff === 1 ? "morgen" : diff < 0 ? "überfällig" : WD_SHORT[d.getDay()] + ", " + d.getDate() + "." + (d.getMonth() + 1) + ".";
		return t.time ? s + " " + t.time : s;
	}

	// ------------------------------------------------------------------ Auswahl
	// data: { lists, categories, tasks }. Ergebnis je gezeigter Liste:
	// { list, open, done, shown (offen + sichtbare erledigte), total, doneCount }
	function select(data, cfg, now) {
		data = data || {};
		var lists = (data.lists || []).filter(function (l) {
			return cfg.lists.length ? cfg.lists.indexOf(l.id) !== -1 : l.enabled !== false;
		});
		var today = keyMs(dayKey(now));
		var until = cfg.range ? today + (cfg.range + 1) * DAY : Infinity;
		return lists.map(function (l) {
			var all = (data.tasks || []).filter(function (t) { return t.list === l.id; })
				.filter(function (t) { return !t.due || keyMs(t.due) < until; })
				.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
			var open = all.filter(function (t) { return !t.done; });
			var done = all.filter(function (t) {
				if (!t.done) return false;
				if (!cfg.doneHours) return true;
				return t.doneAt && now - Date.parse(t.doneAt) < cfg.doneHours * 3600000;
			});
			var shown;
			if (cfg.done === "hide") shown = open;
			else if (cfg.done === "below") shown = open.concat(done);
			else shown = all.filter(function (t) { return !t.done || done.indexOf(t) !== -1; });
			return { list: l, open: open, done: done, shown: shown, total: open.length + done.length, doneCount: done.length };
		});
	}

	// ------------------------------------------------------------------ Bausteine
	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	}
	function fa(name, cls) {
		var i = el("i", "fa-solid fa-" + name + (cls ? " " + cls : ""));
		i.setAttribute("aria-hidden", "true");
		return i;
	}

	function catOf(ctx, t) { return (t.category && ctx.cats[t.category]) || null; }
	function iconOf(ctx, t) { var c = catOf(ctx, t); return t.icon || (c && c.icon) || ""; }
	function colorOf(ctx, t) { var c = catOf(ctx, t); return (c && c.color) || "#8a93a6"; }

	// Häkchen (nur Bild): Kästchen oder Kreis, gefüllt wenn erledigt
	function box(t, round) {
		var b = el("span", "lt-box" + (round ? " lt-round" : "") + (t.done ? " is-on" : ""));
		if (t.done) b.appendChild(fa("check"));
		return b;
	}

	function prioMark(t, always) {
		var p = PRIORITIES.filter(function (x) { return x[0] === (t.priority || "normal"); })[0] || PRIORITIES[2];
		if (!p[2] && !always) return null;
		var m = el("span", "lt-prio lt-prio-" + p[0], p[2] || "○");
		m.title = p[1];
		return m;
	}

	function rowClasses(ctx, t) {
		var c = "lt-item" + (t.done ? " is-done" : "");
		if (ctx.cfg.highlightDue && !t.done && t.due) {
			var diff = keyMs(t.due) - keyMs(dayKey(ctx.now));
			if (diff < 0) c += " is-overdue"; else if (diff === 0) c += " is-today";
		}
		return c;
	}

	// Eine Aufgabe als Zeile
	function item(ctx, t, o) {
		o = o || {};
		var row = el("div", rowClasses(ctx, t));
		if (o.time) row.appendChild(el("span", "lt-time", t.time || ""));
		if (o.icon && ctx.cfg.icons) {
			var ic = iconOf(ctx, t);
			var s = row.appendChild(el("span", "lt-ic"));
			if (ic) { var i = s.appendChild(fa(ic)); i.style.color = colorOf(ctx, t); }
		}
		if (o.prio) { var pm = prioMark(t, true); if (pm) row.appendChild(pm); }
		if (o.dot) { var d = row.appendChild(el("span", "lt-dot" + (t.done ? " is-on" : ""))); d.style.background = colorOf(ctx, t); if (t.done) d.appendChild(fa("check")); }
		else if (!o.noBox) row.appendChild(box(t, o.round));
		var body = row.appendChild(el("span", "lt-body"));
		var title = body.appendChild(el("span", "lt-title", t.title));
		if (!o.prio && !ctx.plain) { var p = prioMark(t); if (p) title.insertBefore(p, title.firstChild); }
		var due = dueText(t, ctx.now);
		if (o.due !== false && due && !o.time) body.appendChild(el("span", "lt-due", due));
		if (o.subs && t.sub && t.sub.length) row.appendChild(el("span", "lt-subn", t.sub.filter(function (s) { return s.done; }).length + "/" + t.sub.length));
		return row;
	}

	function more(n) { var m = el("div", "lt-more", "+ " + n + " weitere"); m.setAttribute("data-more", n); return m; }

	function head(parent, ctx, g, right) {
		var h = parent.appendChild(el("div", "lt-head"));
		h.appendChild(el("span", "lt-head-t", ctx.titleOf(g)));
		if (right) h.appendChild(el("span", "lt-head-r", right));
		return h;
	}

	// Liste von Zeilen mit Höchstzahl und „+ X weitere“
	function rows(parent, ctx, tasks, o, g) {
		var wrap = parent.appendChild(el("div", "lt-list"));
		var lim = ctx.left;
		var list = tasks.slice(0, Math.max(0, lim));
		ctx.left -= list.length;
		if (!tasks.length && g) wrap.appendChild(el("div", "lt-empty", g.open.length || g.total ? "Alles erledigt 🎉" : "Keine Aufgaben"));
		list.forEach(function (t) { wrap.appendChild(item(ctx, t, o)); });
		if (tasks.length > list.length && ctx.cfg.more) wrap.appendChild(more(tasks.length - list.length));
		return wrap;
	}

	function countText(g) { return g.doneCount + " / " + g.total; }

	// ------------------------------------------------------------------ Designs
	function eachList(inner, ctx, fn) {
		ctx.groups.forEach(function (g) { fn(inner.appendChild(el("div", "lt-group")), g); });
	}

	var BUILD = {
		classic: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) { head(b, ctx, g, ctx.cfg.count ? countText(g) : ""); rows(b, ctx, g.shown, {}, g); });
		},
		icons: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) { head(b, ctx, g, ctx.cfg.count ? countText(g) : ""); rows(b, ctx, g.shown, { icon: true }, g); });
		},
		compact: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) { head(b, ctx, g, ctx.cfg.count ? g.doneCount + " / " + g.total : ""); rows(b, ctx, g.shown, { round: true }, g); });
		},
		categories: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) {
				head(b, ctx, g, "");
				var by = {};
				var order = [];
				g.open.forEach(function (t) { var k = t.category && ctx.cats[t.category] ? t.category : ""; if (!by[k]) { by[k] = 0; order.push(k); } by[k]++; });
				var wrap = b.appendChild(el("div", "lt-cats"));
				order.sort(function (a, z) { return (ctx.catOrder[a] === undefined ? 99 : ctx.catOrder[a]) - (ctx.catOrder[z] === undefined ? 99 : ctx.catOrder[z]); });
				order.slice(0, ctx.left).forEach(function (k) {
					var c = ctx.cats[k] || { name: "Ohne Kategorie", color: "#8a93a6", icon: "list-check" };
					var r = wrap.appendChild(el("div", "lt-cat lt-item"));
					r.style.background = c.color + "40";
					r.style.borderColor = c.color + "99";
					if (ctx.cfg.icons) { var i = r.appendChild(fa(c.icon || "list-check")); i.style.color = c.color; }
					r.appendChild(el("span", "lt-title", c.name));
					r.appendChild(el("span", "lt-badge", String(by[k])));
				});
				ctx.left -= Math.min(order.length, ctx.left);
				if (!order.length) wrap.appendChild(el("div", "lt-empty", g.total ? "Alles erledigt 🎉" : "Keine Aufgaben"));
			});
		},
		progress: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) {
				head(b, ctx, g, ctx.cfg.count ? g.doneCount + " / " + g.total + " erledigt" : "");
				if (ctx.cfg.progress) {
					var bar = b.appendChild(el("div", "lt-bar"));
					var f = bar.appendChild(el("span"));
					f.style.width = (g.total ? Math.round(g.doneCount / g.total * 100) : 0) + "%";
				}
				rows(b, ctx, g.shown, {}, g);
			});
		},
		today: function (inner, ctx) {
			var d = new Date(ctx.now);
			var tasks = [];
			ctx.groups.forEach(function (g) { tasks = tasks.concat(g.shown.filter(function (t) { return !t.due || keyMs(t.due) <= keyMs(dayKey(ctx.now)); })); });
			tasks.sort(function (a, z) { return (a.time || "99") < (z.time || "99") ? -1 : (a.time || "99") > (z.time || "99") ? 1 : 0; });
			var h = inner.appendChild(el("div", "lt-head"));
			h.appendChild(el("span", "lt-head-t", ctx.cfg.title || "Heute"));
			h.appendChild(el("span", "lt-head-r", WD_SHORT[d.getDay()] + ", " + d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear()));
			rows(inner, ctx, tasks, { time: true, icon: true }, { open: tasks, total: tasks.length });
		},
		minimal: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) { head(b, ctx, g, ""); rows(b, ctx, g.shown, { round: true, due: false }, g); });
		},
		frame: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) { head(b, ctx, g, ctx.cfg.count ? countText(g) : ""); rows(b, ctx, g.shown, { dot: true }, g); });
		},
		tiles: function (inner, ctx) {
			// eine Kachel je Kategorie (über alle gezeigten Listen): offen / gesamt
			var by = {};
			var order = [];
			ctx.groups.forEach(function (g) {
				g.open.concat(g.done).forEach(function (t) {
					var k = t.category && ctx.cats[t.category] ? t.category : "";
					if (!by[k]) { by[k] = { open: 0, all: 0 }; order.push(k); }
					by[k].all++;
					if (!t.done) by[k].open++;
				});
			});
			if (ctx.cfg.title) inner.appendChild(el("div", "lt-head")).appendChild(el("span", "lt-head-t", ctx.cfg.title));
			var grid = inner.appendChild(el("div", "lt-tiles"));
			order.sort(function (a, z) { return (ctx.catOrder[a] === undefined ? 99 : ctx.catOrder[a]) - (ctx.catOrder[z] === undefined ? 99 : ctx.catOrder[z]); });
			order.slice(0, ctx.cfg.max).forEach(function (k) {
				var c = ctx.cats[k] || { name: "Ohne Kategorie", color: "#8a93a6", icon: "list-check" };
				var tile = grid.appendChild(el("div", "lt-tile lt-item"));
				tile.style.background = c.color + "2e";
				tile.style.borderColor = c.color + "66";
				var i = tile.appendChild(fa(c.icon || "list-check", "lt-tile-ic"));
				i.style.color = c.color;
				tile.appendChild(el("div", "lt-tile-n", c.name));
				tile.appendChild(el("div", "lt-tile-c", (by[k].all - by[k].open) + "/" + by[k].all));
			});
			if (!order.length) grid.appendChild(el("div", "lt-empty", "Keine Aufgaben"));
		},
		priority: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) {
				head(b, ctx, g, ctx.cfg.count ? countText(g) : "");
				var sorted = g.shown.slice().sort(function (a, z) { return (a.done - z.done) || (PRIO_RANK[a.priority || "normal"] - PRIO_RANK[z.priority || "normal"]) || ((a.order || 0) - (z.order || 0)); });
				rows(b, ctx, sorted, { prio: true }, g);
			});
		},
		notes: function (inner, ctx) {
			eachList(inner, ctx, function (b, g) {
				head(b, ctx, g, ctx.cfg.count ? countText(g) : "");
				var wrap = b.appendChild(el("div", "lt-list"));
				var list = g.shown.slice(0, Math.max(0, ctx.left));
				ctx.left -= list.length;
				list.forEach(function (t) {
					wrap.appendChild(item(ctx, t, { subs: true }));
					if (t.done) return;
					(t.sub || []).forEach(function (s) {
						var r = wrap.appendChild(el("div", "lt-item lt-sub" + (s.done ? " is-done" : "")));
						r.appendChild(box(s));
						r.appendChild(el("span", "lt-title", s.title));
					});
					if (t.note) {
						var n = wrap.appendChild(el("div", "lt-item lt-note"));
						n.appendChild(fa("note-sticky"));
						n.appendChild(el("span", "lt-title", t.note));
					}
				});
				if (!g.shown.length) wrap.appendChild(el("div", "lt-empty", g.total ? "Alles erledigt 🎉" : "Keine Aufgaben"));
				if (g.shown.length > list.length && ctx.cfg.more) wrap.appendChild(more(g.shown.length - list.length));
			});
		},
		week: function (inner, ctx) {
			var ws = weekStart(ctx.now);
			var tasks = [];
			ctx.groups.forEach(function (g) { tasks = tasks.concat(g.open, g.done); });
			var inWeek = tasks.filter(function (t) { return t.due && keyMs(t.due) >= ws && keyMs(t.due) < ws + 7 * DAY; });
			var h = inner.appendChild(el("div", "lt-head"));
			h.appendChild(el("span", "lt-head-t", ctx.cfg.title || "Diese Woche"));
			if (ctx.cfg.count) h.appendChild(el("span", "lt-head-r", inWeek.filter(function (t) { return t.done; }).length + " / " + inWeek.length));
			var tab = inner.appendChild(el("div", "lt-week"));
			var todayKey = dayKey(ctx.now);
			for (var i = 0; i < 7; i++) {
				var dk = dayKey(ws + i * DAY + 2 * 3600000);
				var day = inWeek.filter(function (t) { return t.due === dk; });
				var r = tab.appendChild(el("div", "lt-wrow lt-item" + (dk === todayKey ? " is-now" : "")));
				r.appendChild(el("span", "lt-wd", WD_SHORT[(i + 1) % 7]));
				var cell = r.appendChild(el("span", "lt-wcell"));
				if (!day.length) cell.appendChild(el("span", "lt-wnone", "–"));
				day.slice(0, 2).forEach(function (t) { var x = cell.appendChild(el("span", "lt-wt" + (t.done ? " is-done" : ""))); x.appendChild(box(t)); x.appendChild(el("span", "lt-title", t.title)); });
				if (day.length > 2) cell.appendChild(el("span", "lt-wnone", "+" + (day.length - 2)));
				if (ctx.cfg.count) r.appendChild(el("span", "lt-wc", day.filter(function (t) { return t.done; }).length + " / " + day.length));
			}
		}
	};

	// ------------------------------------------------------------------ Aufbau
	// data: { lists, categories, tasks }; opts: { baseClass, align, now }
	function build(box, cfg, data, opts) {
		opts = opts || {};
		data = data || {};
		var d = design(cfg.design);
		var now = opts.now || Date.now();
		box.innerHTML = "";
		box.className = (opts.baseClass ? opts.baseClass + " " : "") + "lt-todo lt-d-" + d.id + (d.plain ? " lt-plain" : "") + (cfg.glass ? " lt-glassy" : "");
		box.setAttribute("data-align", opts.align || "left");
		var st = box.style;
		st.fontSize = (16 * cfg.fontScale / 100).toFixed(1) + "px";
		st.setProperty("--lt-gap", (cfg.gap / 16).toFixed(3) + "em");
		st.setProperty("--lt-pad", cfg.padding + "px");
		st.setProperty("--lt-line", cfg.line + "px");
		st.setProperty("--lt-bg", "rgba(14, 16, 22, " + (cfg.opacity / 100).toFixed(2) + ")");
		if (cfg.accent) st.setProperty("--lt-accent", cfg.accent); else st.removeProperty("--lt-accent");
		var cats = {};
		var catOrder = {};
		(data.categories || []).forEach(function (c, i) { if (!c.hidden) { cats[c.id] = c; catOrder[c.id] = i; } });
		var groups = select(data, cfg, now);
		var ctx = {
			cfg: cfg, now: now, cats: cats, catOrder: catOrder, groups: groups, plain: !!d.plain, left: cfg.max,
			titleOf: function (g) { return groups.length > 1 ? g.list.name : (cfg.title || (g && g.list.name) || "To-do"); }
		};
		var inner = box.appendChild(el("div", "lt-inner"));
		if (!groups.length) inner.appendChild(el("div", "lt-empty", "Keine Liste für den Bildschirm ausgewählt"));
		else {
			if (groups.length > 1 && cfg.title && ["today", "week", "tiles"].indexOf(d.id) === -1) inner.appendChild(el("div", "lt-head lt-head-main")).appendChild(el("span", "lt-head-t", cfg.title));
			BUILD[d.id](inner, ctx);
		}
		return box;
	}

	function overflows(a) {
		var r = a.getBoundingClientRect();
		var kids = a.querySelectorAll(".lt-inner *:not(span):not(i)");
		for (var i = 0; i < kids.length; i++) {
			var k = kids[i].getBoundingClientRect();
			if (!k.width && !k.height) continue;
			if (k.bottom > r.bottom + 2 || k.right > r.right + 2) return true;
		}
		return false;
	}

	// Erst die Schrift bis 70 % verkleinern, dann Aufgaben von hinten weglassen
	// (und „+ X weitere“ hochzählen) – nie abschneiden. Liefert den Faktor.
	function fit(box) {
		var base = parseFloat(box.style.fontSize) || 16;
		var size = base;
		for (var i = 0; i < 6 && overflows(box); i++) {
			size = Math.max(base * 0.7, size * 0.93);
			box.style.fontSize = size.toFixed(1) + "px";
		}
		var dropped = 0;
		for (var guard = 0; guard < 150 && overflows(box); guard++) {
			var items = box.querySelectorAll(".lt-list > .lt-item");
			if (!items.length) break;
			var last = items[items.length - 1];
			var list = last.parentNode;
			last.remove();
			dropped++;
			var m = list.querySelector(":scope > .lt-more");
			var n = (m ? Number(m.getAttribute("data-more")) : 0) + 1;
			if (m) m.remove();
			list.appendChild(more(n));
		}
		box.setAttribute("data-dropped", dropped);
		return size / base;
	}

	var api = {
		DESIGNS: DESIGNS, PRIORITIES: PRIORITIES, DONE_MODES: DONE_MODES, ANCHORS: ANCHORS, ICONS: ICONS, DEFAULTS: DEFAULTS,
		design: design, clean: clean, select: select, dayKey: dayKey, dueText: dueText, build: build, fit: fit
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.LumiraTodoView = api;
})(typeof window !== "undefined" ? window : globalThis);
