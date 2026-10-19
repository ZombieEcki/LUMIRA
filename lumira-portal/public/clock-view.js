/* MMM-LumiraClock – Uhr: 16 Designs aus denselben Bausteinen.
 *
 * Läuft im Browser (window.LumiraClockView) – auf dem Bildschirm und im
 * Portal für Auswahl und Vorschau (dort als public/clock-view.js, der Test
 * prüft Gleichheit) – und in Node (require, für Tests und die Bereinigung
 * der Einstellungen im Portal und im node_helper).
 *
 *  clean(raw)              Einstellungen aus clock.json bereinigen
 *  build(box, cfg, opts)   Element mit dem gewählten Design füllen
 *  tick(box, now)          Uhrzeit, Zeiger und Datum auffrischen; liefert die
 *                          Millisekunden bis zum nächsten nötigen Aufruf
 *  fit(box)                Schrift verkleinern, bis nichts abgeschnitten ist
 *
 * Alles in em: Die Schriftgröße der Kachel vergrößert die ganze Uhr.
 * Keine Animationen, Leuchtkanten sind feste Schatten – schont den Pi 3.
 */
(function (root) {
	"use strict";

	// Reihenfolge = Auswahl im Portal. width = empfohlene Breite in px.
	// analog: Zifferblatt; ring: Uhrzeit in einem Kreis; surface: eigene Fläche.
	var DESIGNS = [
		{ id: "classic", name: "Klassisch Digital", width: 380 },
		{ id: "elegant", name: "Elegant Minimal", width: 380 },
		{ id: "card", name: "Modern mit Rahmen", width: 380, surface: true },
		{ id: "analog", name: "Analog Klassisch", width: 280, analog: true, accent: "#ff8a3d" },
		{ id: "analogGlow", name: "Analog Modern", width: 280, analog: true, accent: "#ff8a3d" },
		{ id: "weekday", name: "Digital mit Wochentag", width: 380 },
		{ id: "compact", name: "Kompakt", width: 420, surface: true },
		{ id: "vertical", name: "Vertikal", width: 220 },
		{ id: "circle", name: "Kreis mit Datum", width: 280, ring: true, accent: "#3aa0ff" },
		{ id: "glass", name: "Transparent / Glas", width: 380, surface: true },
		{ id: "line", name: "Elegant mit Linie", width: 420 },
		{ id: "creative", name: "Kreativ / Modern", width: 280, ring: true, accent: "#e040fb" },
		{ id: "side", name: "Seitlich mit Wochentag", width: 440 },
		{ id: "round", name: "Elegant Rund", width: 260, ring: true, accent: "#ffb46b" },
		{ id: "thin", name: "Dünn & Minimal", width: 380 },
		{ id: "neon", name: "Kreativ mit Rahmen", width: 400, surface: true, accent: "#4aa8ff" }
	];
	var IDS = DESIGNS.map(function (d) { return d.id; });

	function design(id) {
		for (var i = 0; i < DESIGNS.length; i++) if (DESIGNS[i].id === id) return DESIGNS[i];
		return DESIGNS[0];
	}

	// ------------------------------------------------------------------ Einstellungen
	// anchor "auto": wie die bisherige Uhr oben links im MagicMirror-Layout
	// (der Familienplan steht darunter); sonst frei auf dem Bildschirm.
	var ANCHORS = ["top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"];
	var DEFAULTS = {
		design: "classic",
		hour12: false, seconds: false,
		weekday: true, date: true, dateStyle: "long",
		digital: false,
		anchor: "auto", unit: "px", x: 0, y: 0, width: 380, height: 400,
		fontScale: 100, gap: 6, padding: 0,
		glass: false, opacity: 35, line: 2, accent: ""
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
			hour12: bool(r.hour12, d.hour12),
			seconds: bool(r.seconds, d.seconds),
			weekday: bool(r.weekday, d.weekday),
			date: bool(r.date, d.date),
			dateStyle: r.dateStyle === "short" ? "short" : "long",
			digital: bool(r.digital, d.digital),
			anchor: r.anchor === "auto" || ANCHORS.indexOf(r.anchor) !== -1 ? r.anchor : d.anchor,
			unit: unit,
			x: num(r.x, -lim, lim, d.x),
			y: num(r.y, -lim, lim, d.y),
			width: num(r.width, 120, 1600, d.width),
			height: num(r.height, 60, 1200, d.height),
			fontScale: num(r.fontScale, 40, 300, d.fontScale),
			gap: num(r.gap, 0, 60, d.gap),
			padding: num(r.padding, 0, 60, d.padding),
			glass: bool(r.glass, d.glass),
			opacity: num(r.opacity, 0, 100, d.opacity),
			line: num(r.line, 1, 8, d.line),
			accent: /^#[0-9a-f]{6}$/i.test(String(r.accent || "")) ? String(r.accent).toLowerCase() : ""
		};
	}

	// ------------------------------------------------------------------ Formate
	var WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
	var WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
	var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
	function two(n) { return (n < 10 ? "0" : "") + n; }

	// { hm, h, m, s, ampm } – 24 h als Standard, 12 h mit AM/PM
	function timeParts(now, hour12) {
		var h = now.getHours();
		var ampm = "";
		var hh = two(h);
		if (hour12) {
			ampm = h < 12 ? "AM" : "PM";
			h = h % 12 || 12;
			hh = String(h);
		}
		var m = two(now.getMinutes());
		return { hm: hh + ":" + m, h: hour12 ? two(h) : hh, m: m, s: two(now.getSeconds()), ampm: ampm };
	}

	// Wochentag und Datum, lang („Mittwoch“, „8. Juli 2026“) oder kurz („Mi“, „08.07.2026“)
	function dateParts(now, style) {
		var short = style === "short";
		return {
			weekday: (short ? WD_SHORT : WD)[now.getDay()],
			date: short ? two(now.getDate()) + "." + two(now.getMonth() + 1) + "." + now.getFullYear()
				: now.getDate() + ". " + MONTHS[now.getMonth()] + " " + now.getFullYear()
		};
	}

	// Eine Zeile aus dem, was eingeschaltet ist: „Mittwoch, 8. Juli 2026“
	function dateLine(now, cfg) {
		var p = dateParts(now, cfg.dateStyle);
		var out = [];
		if (cfg.weekday) out.push(p.weekday);
		if (cfg.date) out.push(p.date);
		return out.join(", ");
	}

	// ------------------------------------------------------------------ Bausteine
	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	}

	function timeEl(cfg, refs, cls) {
		var t = el("div", "lc-time" + (cls ? " " + cls : ""));
		refs.hm.push(t.appendChild(el("span", "lc-hm")));
		if (cfg.seconds) refs.sec.push(t.appendChild(el("span", "lc-sec")));
		if (cfg.hour12) refs.ampm.push(t.appendChild(el("span", "lc-ampm")));
		return t;
	}

	function rule(kind) { return el("div", "lc-rule" + (kind ? " lc-rule-" + kind : "")); }

	// Wochentag und Datum: getrennt (zwei Zeilen) oder als eine Zeile
	function dateEls(parent, cfg, refs, split, cls) {
		if (split) {
			if (cfg.weekday) refs.wd.push(parent.appendChild(el("div", "lc-wd" + (cls ? " " + cls : ""))));
			if (cfg.date) refs.date.push(parent.appendChild(el("div", "lc-date" + (cls ? " " + cls : ""))));
		} else if (cfg.weekday || cfg.date) {
			refs.line.push(parent.appendChild(el("div", "lc-dl" + (cls ? " " + cls : ""))));
		}
	}

	var SVGNS = "http://www.w3.org/2000/svg";
	function svg(tag, attrs) {
		var e = document.createElementNS(SVGNS, tag);
		Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
		return e;
	}

	// Zifferblatt 200 × 200: Striche, bei „Klassisch“ die Zahlen 12/3/6/9
	function dial(cfg, refs, numbers) {
		var s = svg("svg", { viewBox: "0 0 200 200", class: "lc-dial-svg", "aria-hidden": "true" });
		for (var i = 0; i < 60; i++) {
			var hour = i % 5 === 0;
			if (!hour && !numbers) continue;
			if (numbers && hour && i % 15 === 0) continue;
			var a = i * 6 * Math.PI / 180;
			var r1 = hour ? 80 : 86;
			s.appendChild(svg("line", {
				x1: (100 + Math.sin(a) * r1).toFixed(2), y1: (100 - Math.cos(a) * r1).toFixed(2),
				x2: (100 + Math.sin(a) * 92).toFixed(2), y2: (100 - Math.cos(a) * 92).toFixed(2),
				class: hour ? "lc-tick lc-tick-h" : "lc-tick"
			}));
		}
		if (numbers) {
			[[12, 100, 32], [3, 170, 107], [6, 100, 182], [9, 30, 107]].forEach(function (n) {
				var t = svg("text", { x: n[1], y: n[2], class: "lc-num", "text-anchor": "middle" });
				t.textContent = String(n[0]);
				s.appendChild(t);
			});
		}
		var hand = function (len, cls) {
			var g = svg("g", { class: "lc-hand " + cls });
			g.appendChild(svg("line", { x1: 100, y1: 112, x2: 100, y2: 100 - len }));
			s.appendChild(g);
			return g;
		};
		refs.hands.h = hand(48, "lc-hand-h");
		refs.hands.m = hand(72, "lc-hand-m");
		if (cfg.seconds) refs.hands.s = hand(80, "lc-hand-s");
		s.appendChild(svg("circle", { cx: 100, cy: 100, r: 4, class: "lc-hub" }));
		return s;
	}

	// ------------------------------------------------------------------ Designs
	var BUILD = {
		classic: function (b, cfg, refs) { b.appendChild(timeEl(cfg, refs)); dateEls(b, cfg, refs, false); },
		elegant: function (b, cfg, refs) {
			b.appendChild(timeEl(cfg, refs));
			if (cfg.weekday || cfg.date) b.appendChild(rule("dot"));
			dateEls(b, cfg, refs, true, "lc-caps");
		},
		card: function (b, cfg, refs) {
			var s = b.appendChild(el("div", "lc-surf"));
			s.appendChild(timeEl(cfg, refs));
			dateEls(s, cfg, refs, false);
		},
		analog: function (b, cfg, refs) { analogDesign(b, cfg, refs, true); },
		analogGlow: function (b, cfg, refs) { analogDesign(b, cfg, refs, false); },
		weekday: function (b, cfg, refs) {
			b.appendChild(timeEl(cfg, refs));
			if (cfg.weekday) refs.wd.push(b.appendChild(el("div", "lc-wd lc-caps lc-dash")));
			if (cfg.date) refs.date.push(b.appendChild(el("div", "lc-date lc-caps")));
		},
		compact: function (b, cfg, refs) {
			var s = b.appendChild(el("div", "lc-surf lc-row"));
			s.appendChild(timeEl(cfg, refs));
			if (cfg.weekday || cfg.date) {
				s.appendChild(rule("v"));
				dateEls(s.appendChild(el("div", "lc-col")), cfg, refs, true);
			}
		},
		vertical: function (b, cfg, refs) {
			var t = b.appendChild(el("div", "lc-time lc-vert"));
			refs.h.push(t.appendChild(el("div", "lc-vh")));
			t.appendChild(rule());
			var m = t.appendChild(el("div", "lc-vm"));
			refs.m.push(m.appendChild(el("span", "lc-vmm")));
			if (cfg.seconds) refs.sec.push(m.appendChild(el("span", "lc-sec")));
			if (cfg.hour12) refs.ampm.push(m.appendChild(el("span", "lc-ampm")));
			dateEls(b, cfg, refs, true);
		},
		circle: function (b, cfg, refs) {
			var r = ringEl(b);
			r.appendChild(timeEl(cfg, refs));
			if (cfg.weekday || cfg.date) r.appendChild(rule("dot"));
			dateEls(r, cfg, refs, true);
		},
		glass: function (b, cfg, refs) {
			var s = b.appendChild(el("div", "lc-surf lc-glass"));
			s.appendChild(timeEl(cfg, refs));
			dateEls(s, cfg, refs, false);
		},
		line: function (b, cfg, refs) {
			b.appendChild(timeEl(cfg, refs));
			if (cfg.weekday || cfg.date) b.appendChild(rule("diamond"));
			dateEls(b, cfg, refs, false, "lc-caps");
		},
		creative: function (b, cfg, refs) {
			var r = ringEl(b, "lc-grad-edge");
			r.appendChild(timeEl(cfg, refs));
			dateEls(r, cfg, refs, true);
		},
		side: function (b, cfg, refs) {
			var row = b.appendChild(el("div", "lc-row"));
			row.appendChild(timeEl(cfg, refs));
			if (cfg.weekday || cfg.date) {
				row.appendChild(rule("v"));
				dateEls(row.appendChild(el("div", "lc-col")), cfg, refs, true);
			}
		},
		round: function (b, cfg, refs) {
			var r = ringEl(b);
			r.appendChild(timeEl(cfg, refs));
			if (cfg.weekday || cfg.date) r.appendChild(rule());
			dateEls(r, cfg, refs, false);
		},
		thin: function (b, cfg, refs) { b.appendChild(timeEl(cfg, refs)); dateEls(b, cfg, refs, false); },
		neon: function (b, cfg, refs) {
			var s = b.appendChild(el("div", "lc-surf lc-neon lc-grad-edge"));
			s.appendChild(timeEl(cfg, refs));
			dateEls(s, cfg, refs, false);
		}
	};

	function ringEl(b, extra) {
		var ring = b.appendChild(el("div", "lc-ring" + (extra ? " " + extra : "")));
		return ring.appendChild(el("div", "lc-ring-in lc-fitarea"));
	}

	function analogDesign(b, cfg, refs, numbers) {
		var face = b.appendChild(el("div", "lc-dial"));
		face.appendChild(dial(cfg, refs, numbers));
		if (cfg.digital) b.appendChild(timeEl(cfg, refs, "lc-time-small"));
		dateEls(b, cfg, refs, false);
	}

	// ------------------------------------------------------------------ Aufbau
	// opts: { baseClass, align: "left"|"center"|"right", now }
	function build(box, cfg, opts) {
		opts = opts || {};
		var d = design(cfg.design);
		box.innerHTML = "";
		box.className = (opts.baseClass ? opts.baseClass + " " : "") + "lc-clock lc-d-" + d.id +
			(d.surface ? " lc-has-surf" : "") + (cfg.glass ? " lc-glassy" : "") + (d.ring ? " lc-has-ring" : "") + (d.analog ? " lc-is-analog" : "");
		box.setAttribute("data-align", opts.align || "left");
		var st = box.style;
		st.fontSize = (16 * cfg.fontScale / 100).toFixed(1) + "px";
		st.setProperty("--lc-gap", (cfg.gap / 16).toFixed(3) + "em");
		st.setProperty("--lc-pad", cfg.padding + "px");
		st.setProperty("--lc-line", cfg.line + "px");
		st.setProperty("--lc-bg", "rgba(14, 16, 22, " + (cfg.opacity / 100).toFixed(2) + ")");
		if (cfg.accent || d.accent) st.setProperty("--lc-accent", cfg.accent || d.accent);
		else st.removeProperty("--lc-accent");
		var refs = { hm: [], sec: [], ampm: [], h: [], m: [], wd: [], date: [], line: [], hands: {} };
		var inner = box.appendChild(el("div", "lc-inner"));
		BUILD[d.id](inner, cfg, refs);
		box._lc = { cfg: cfg, refs: refs, last: "" };
		tick(box, opts.now || new Date());
		return box;
	}

	function setText(list, text) {
		for (var i = 0; i < list.length; i++) if (list[i].textContent !== text) list[i].textContent = text;
	}

	// Liefert, wann der nächste Aufruf nötig ist: mit Sekunden zur nächsten
	// Sekunde, sonst kurz nach dem nächsten Minutenwechsel.
	function tick(box, now) {
		var st = box && box._lc;
		now = now || new Date();
		if (!st) return 60000;
		var cfg = st.cfg;
		var r = st.refs;
		var t = timeParts(now, cfg.hour12);
		setText(r.hm, t.hm);
		setText(r.h, t.h);
		setText(r.m, t.m);
		setText(r.sec, ":" + t.s);
		setText(r.ampm, t.ampm);
		var p = dateParts(now, cfg.dateStyle);
		setText(r.wd, p.weekday);
		setText(r.date, p.date);
		setText(r.line, dateLine(now, cfg));
		var hd = r.hands;
		if (hd.h) {
			var sec = now.getSeconds();
			var min = now.getMinutes() + (cfg.seconds ? sec / 60 : 0);
			hd.h.setAttribute("transform", "rotate(" + (((now.getHours() % 12) + min / 60) * 30).toFixed(2) + " 100 100)");
			hd.m.setAttribute("transform", "rotate(" + (min * 6).toFixed(2) + " 100 100)");
			if (hd.s) hd.s.setAttribute("transform", "rotate(" + (sec * 6) + " 100 100)");
		}
		var ms = now.getMilliseconds();
		return cfg.seconds ? 1000 - ms + 5 : (60 - now.getSeconds()) * 1000 - ms + 50;
	}

	// Ragt ein Baustein über den Rand? Gemessen an den Kästen der Elemente,
	// nicht an scrollHeight – große Schrift mit engem Zeilenabstand zählt dort
	// ihre Unterlängen mit, obwohl nichts abgeschnitten wird.
	function overflows(a) {
		var r = a.getBoundingClientRect();
		var kids = a.querySelectorAll(".lc-inner *:not(span):not(svg *)");
		for (var i = 0; i < kids.length; i++) {
			var k = kids[i].getBoundingClientRect();
			if (!k.width && !k.height) continue;
			if (k.right > r.right + 2 || k.bottom > r.bottom + 2 || k.left < r.left - 2 || k.top < r.top - 2) return true;
		}
		return false;
	}

	// Schrift verkleinern, bis nichts abgeschnitten ist: erst der Inhalt der
	// Kreise (der Kreis wächst mit der Schrift mit), dann die ganze Kachel.
	// Liefert den Faktor der Kachel (1 = passt wie eingestellt).
	function fit(box) {
		Array.prototype.forEach.call(box.querySelectorAll(".lc-fitarea"), function (a) {
			a.style.fontSize = "";
			for (var k = 1, i = 0; i < 12 && overflows(a); i++) {
				k = Math.max(0.45, k * 0.92);
				a.style.fontSize = k.toFixed(3) + "em";
			}
		});
		var base = parseFloat(box.style.fontSize) || 16;
		var size = base;
		for (var i = 0; i < 10 && overflows(box); i++) {
			size = Math.max(base * 0.4, size * 0.92);
			box.style.fontSize = size.toFixed(1) + "px";
		}
		return size / base;
	}

	var api = {
		DESIGNS: DESIGNS, ANCHORS: ANCHORS, DEFAULTS: DEFAULTS, design: design, clean: clean,
		timeParts: timeParts, dateParts: dateParts, dateLine: dateLine,
		build: build, tick: tick, fit: fit
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.LumiraClockView = api;
})(typeof window !== "undefined" ? window : globalThis);
