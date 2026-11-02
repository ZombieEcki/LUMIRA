/* MMM-LumiraNews – Nachrichten unten am Bildschirm, zwei Varianten:
 *  - "bar":   kompakte Leiste, eine Schlagzeile, wechselt alle paar Sekunden
 *  - "cards": mehrere niedrige Karten nebeneinander (Quelle, Titel, Alter,
 *             Vorschaubild, wenn der Feed eines liefert), blättern seitenweise
 *
 * Läuft im Browser (window.LumiraNewsView) – auf dem Bildschirm und im Portal
 * für die Vorschau (dort als public/news-view.js, der Test prüft Gleichheit) –
 * und in Node (Bereinigung, Tests).
 *
 *  clean(raw)                    Einstellungen aus news.json bereinigen
 *  visible(items, cfg, now)      Meldungen im Zeitraum, neueste zuerst
 *  pages(n, cfg)                 wie viele Seiten es zum Durchwechseln gibt
 *  build(box, cfg, items, opts)  eine Seite zeichnen; opts: { page, sources, now }
 *
 * Regel für die Zeit: Nur Meldungen mit Zeitangabe, die höchstens „hours“
 * Stunden alt ist. Ohne Zeitangabe oder mehr als eine Stunde in der Zukunft
 * (Uhr des Anbieters falsch) gilt eine Meldung als unzuverlässig und wird
 * nicht gezeigt – so rutscht nichts Altes als „neu“ durch.
 * Fremde Inhalte nur per textContent; Bilder ohne Referrer, Fehler → weg.
 */
(function (root) {
	"use strict";

	var HOUR = 3600000;
	var VARIANTS = ["bar", "cards"];
	var DEFAULTS = {
		variant: "bar", hours: 24, interval: 15, rotate: 10, cards: 4,
		source: true, age: true, images: true, label: true, fontScale: 100, opacity: 35
	};
	var INTERVALS = [5, 10, 15, 30, 60];

	function num(v, min, max, d) {
		var n = Number(v);
		return isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, Math.round(n))) : d;
	}
	function bool(v, d) { return v === undefined ? d : !!v; }

	function clean(raw) {
		var r = raw && typeof raw === "object" ? raw : {};
		var d = DEFAULTS;
		return {
			variant: VARIANTS.indexOf(r.variant) === -1 ? d.variant : r.variant,
			hours: num(r.hours, 1, 720, d.hours),
			interval: INTERVALS.indexOf(Number(r.interval)) === -1 ? d.interval : Number(r.interval),
			rotate: num(r.rotate, 4, 120, d.rotate),
			cards: num(r.cards, 1, 6, d.cards),
			source: bool(r.source, d.source),
			age: bool(r.age, d.age),
			images: bool(r.images, d.images),
			label: bool(r.label, d.label),
			fontScale: num(r.fontScale, 60, 200, d.fontScale),
			opacity: num(r.opacity, 0, 100, d.opacity)
		};
	}

	// Eine Quelle (vordefiniert: preset = ID aus PRESETS; eigene: preset "")
	function cleanSource(s, i) {
		s = s && typeof s === "object" ? s : {};
		return {
			id: /^[a-z0-9-]{3,24}$/.test(String(s.id || "")) ? String(s.id) : "",
			preset: /^[a-z0-9-]{2,24}$/.test(String(s.preset || "")) ? String(s.preset) : "",
			name: String(s.name || "").trim().slice(0, 40) || "Feed " + ((i || 0) + 1),
			category: String(s.category || "Eigene").trim().slice(0, 24) || "Eigene",
			url: String(s.url || "").trim().slice(0, 2000),
			enabled: s.enabled === undefined ? true : !!s.enabled
		};
	}

	// ------------------------------------------------------------------ Auswahl
	function visible(items, cfg, now, sources) {
		var oldest = now - cfg.hours * HOUR;
		return (items || []).filter(function (it) {
			var s = sources && sources[it.src];
			if (sources && (!s || s.enabled === false)) return false;
			return typeof it.date === "number" && it.date >= oldest && it.date <= now + HOUR;
		}).sort(function (a, b) { return b.date - a.date; });
	}

	function perPage(cfg) { return cfg.variant === "cards" ? cfg.cards : 1; }
	function pages(n, cfg) { return Math.max(1, Math.ceil(n / perPage(cfg))); }

	// „gerade eben“, „vor 5 Minuten“, „vor 2 Stunden“, „vor 3 Tagen“
	function ago(t, now) {
		var m = Math.max(0, Math.round((now - t) / 60000));
		if (m < 2) return "gerade eben";
		if (m < 60) return "vor " + m + " Minuten";
		var h = Math.round(m / 60);
		if (h < 24) return "vor " + h + (h === 1 ? " Stunde" : " Stunden");
		var d = Math.round(h / 24);
		return "vor " + d + (d === 1 ? " Tag" : " Tagen");
	}

	// ------------------------------------------------------------------ Bausteine
	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	}
	function icon(name) {
		var i = el("i", "fa-solid fa-" + name);
		i.setAttribute("aria-hidden", "true");
		return i;
	}

	function label(box) {
		var l = box.appendChild(el("div", "ln-label"));
		l.appendChild(icon("rss"));
		l.appendChild(el("span", null, "Nachrichten"));
		return l;
	}

	function srcName(opts, it) {
		var s = opts.sources && opts.sources[it.src];
		return s ? s.name : "";
	}
	function srcCat(opts, it) {
		var s = opts.sources && opts.sources[it.src];
		return s ? s.category : "";
	}

	function buildBar(inner, cfg, list, opts) {
		if (cfg.label) label(inner);
		var it = list.length ? list[(opts.page || 0) % list.length] : null;
		if (!it) { inner.appendChild(el("div", "ln-empty", "Gerade keine Nachrichten aus den letzten " + cfg.hours + " Stunden")); return; }
		var row = inner.appendChild(el("div", "ln-one"));
		row.appendChild(el("span", "ln-title", it.title));
		var meta = [];
		if (cfg.source && srcName(opts, it)) meta.push(srcName(opts, it));
		if (cfg.age) meta.push(ago(it.date, opts.now));
		if (meta.length) row.appendChild(el("span", "ln-meta", meta.join(" · ")));
	}

	function buildCards(inner, cfg, list, opts) {
		if (cfg.label) label(inner);
		if (!list.length) { inner.appendChild(el("div", "ln-empty", "Gerade keine Nachrichten aus den letzten " + cfg.hours + " Stunden")); return; }
		var start = ((opts.page || 0) % pages(list.length, cfg)) * cfg.cards;
		var row = inner.appendChild(el("div", "ln-cards"));
		row.style.setProperty("--ln-n", cfg.cards);
		list.slice(start, start + cfg.cards).forEach(function (it) {
			var c = row.appendChild(el("div", "ln-card"));
			if (cfg.images && it.image) {
				var img = c.appendChild(el("img", "ln-img"));
				img.alt = "";
				img.decoding = "async";
				img.referrerPolicy = "no-referrer";
				img.onerror = function () { img.remove(); };
				img.src = it.image;
			}
			var t = c.appendChild(el("div", "ln-ct"));
			if (cfg.source) t.appendChild(el("div", "ln-cat", srcCat(opts, it) === "Eigene" || !srcCat(opts, it) ? srcName(opts, it) : srcCat(opts, it) + " · " + srcName(opts, it)));
			t.appendChild(el("div", "ln-title", it.title));
			if (cfg.age) {
				var a = t.appendChild(el("div", "ln-age"));
				a.appendChild(icon("clock"));
				a.appendChild(document.createTextNode(" " + ago(it.date, opts.now)));
			}
		});
	}

	function build(box, cfg, items, opts) {
		opts = opts || {};
		opts.now = opts.now || Date.now();
		var list = visible(items, cfg, opts.now, opts.sources);
		box.innerHTML = "";
		box.className = (opts.baseClass ? opts.baseClass + " " : "") + "ln-news ln-v-" + cfg.variant;
		box.style.fontSize = (16 * cfg.fontScale / 100).toFixed(1) + "px";
		box.style.setProperty("--ln-bg", "rgba(14, 16, 22, " + (cfg.opacity / 100).toFixed(2) + ")");
		var inner = box.appendChild(el("div", "ln-inner"));
		(cfg.variant === "cards" ? buildCards : buildBar)(inner, cfg, list, opts);
		return list.length;
	}

	var api = {
		VARIANTS: VARIANTS, DEFAULTS: DEFAULTS, INTERVALS: INTERVALS,
		clean: clean, cleanSource: cleanSource, visible: visible, pages: pages, ago: ago, build: build
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.LumiraNewsView = api;
})(typeof window !== "undefined" ? window : globalThis);
