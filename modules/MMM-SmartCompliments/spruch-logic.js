/* MMM-SmartCompliments – Auswahl und Darstellung (ohne MagicMirror testbar).
 *
 * Läuft im Browser (window.LumiraSpruchLogic) – auf dem Spiegel und im Portal
 * (public/spruch/spruch-logic.js, gleicher Inhalt) – und in Node (Tests, Prüfung der
 * Einstellungen im Portal). Braucht den Katalog (spruch-catalog.js).
 *
 * Auswahl je Wechsel:
 *  1. Anlässe in der eingestellten Reihenfolge (Wetterwarnung, Kalender,
 *     Wetter): der erste, der gerade zutrifft, liefert – im eingestellten
 *     Anteil der Wechsel – den Spruch.
 *  2. Sonst der allgemeine Mix: erst eine Kategorie (alle gleich oft), dann
 *     ein Spruch daraus, den es zuletzt nicht gab.
 * Ausgeschaltete Kategorien und Sprüche kommen nie vor, auch nicht als Ersatz.
 * Wetter und Warnungen gelten nur, solange sie frisch sind.
 */
(function (root) {
	"use strict";

	var Catalog = typeof module !== "undefined" && module.exports ? require("./spruch-catalog") : root.LumiraSpruchCatalog;

	var ANCHORS = ["auto", "top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"];
	var ICON_MODES = ["below", "inline", "off"];
	var GROUP_KEYS = ["warning", "calendar", "weather"];
	var WEATHER_MAX_AGE = 3 * 3600000;
	var WARNINGS_MAX_AGE = 90 * 60000;

	var DEFAULTS = {
		display: { anchor: "auto", unit: "px", x: 0, y: 0, width: 0, height: 0, fontScale: 100, padding: 0, icon: "below" },
		behavior: {
			interval: 30, remember: 10, riddleDelay: 15, share: 50,
			weather: true, warnings: true, calendar: true, order: ["warning", "calendar", "weather"]
		}
	};

	function num(v, min, max, d) {
		var n = Number(v);
		return isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, Math.round(n))) : d;
	}

	function str(v, max) { return String(v === undefined || v === null ? "" : v).slice(0, max); }

	// ------------------------------------------------------------------ Einstellungen
	// Neue Teile von compliments.json (die Listen bereinigt das Portal selbst)
	function cleanSettings(raw) {
		raw = raw || {};
		var d = DEFAULTS;
		var dp = raw.display || {};
		var bh = raw.behavior || {};
		var unit = dp.unit === "pct" ? "pct" : "px";
		var lim = unit === "pct" ? 100 : 3000;
		var order = Array.isArray(bh.order) ? bh.order.filter(function (g, i, a) { return GROUP_KEYS.indexOf(g) !== -1 && a.indexOf(g) === i; }) : [];
		GROUP_KEYS.forEach(function (g) { if (order.indexOf(g) === -1) order.push(g); });
		var enabled = {};
		if (raw.enabled && typeof raw.enabled === "object") {
			Object.keys(raw.enabled).forEach(function (k) { if (typeof raw.enabled[k] === "boolean") enabled[k] = raw.enabled[k]; });
		}
		var off = {};
		if (raw.off && typeof raw.off === "object") {
			Object.keys(raw.off).forEach(function (k) {
				if (Array.isArray(raw.off[k])) off[k] = raw.off[k].filter(function (t) { return typeof t === "string"; });
			});
		}
		var words = {};
		if (raw.words && typeof raw.words === "object") {
			Object.keys(raw.words).forEach(function (k) { if (typeof raw.words[k] === "string") words[k] = str(raw.words[k], 300); });
		}
		var own = Array.isArray(raw.own) ? raw.own.filter(function (o) { return o && /^own_[a-z0-9]{4,12}$/.test(o.key); }).map(function (o) {
			return {
				key: o.key,
				label: str(o.label, 40) || "Eigene Kategorie",
				icon: str(o.icon, 8),
				items: Array.isArray(o.items) ? o.items.filter(function (t) { return typeof t === "string" && t.trim(); }) : []
			};
		}) : [];
		return {
			enabled: enabled,
			off: off,
			words: words,
			own: own,
			display: {
				anchor: ANCHORS.indexOf(dp.anchor) === -1 ? d.display.anchor : dp.anchor,
				unit: unit,
				x: num(dp.x, -lim, lim, 0),
				y: num(dp.y, -lim, lim, 0),
				width: num(dp.width, 0, 3000, 0),
				height: num(dp.height, 0, 2000, 0),
				fontScale: num(dp.fontScale, 50, 250, 100),
				padding: num(dp.padding, 0, 60, 0),
				icon: ICON_MODES.indexOf(dp.icon) === -1 ? d.display.icon : dp.icon
			},
			behavior: {
				interval: num(bh.interval, 10, 600, d.behavior.interval),
				remember: num(bh.remember, 0, 100, d.behavior.remember),
				riddleDelay: num(bh.riddleDelay, 3, 120, d.behavior.riddleDelay),
				share: num(bh.share, 0, 100, d.behavior.share),
				weather: bh.weather === undefined ? true : !!bh.weather,
				warnings: bh.warnings === undefined ? true : !!bh.warnings,
				calendar: bh.calendar === undefined ? true : !!bh.calendar,
				order: order
			}
		};
	}

	// Alle Kategorien: Katalog + eigene
	function allCategories(s) {
		var own = (s && s.own || []).map(function (o) {
			return { key: o.key, list: o.key, label: o.label, group: "general", icon: o.icon || "💬", on: true, own: true, items: o.items };
		});
		return Catalog.CATEGORIES.concat(own);
	}

	// An/aus: eigener Schalter > alte Stimmungs-Schalter (config.js) > ab Werk
	function isEnabled(cat, s, legacy) {
		if (s && s.enabled && typeof s.enabled[cat.key] === "boolean") return s.enabled[cat.key];
		if (legacy && typeof legacy[cat.key] === "boolean") return legacy[cat.key];
		return cat.on !== false;
	}

	// Darf die Kategorie heute überhaupt vorkommen? (Ausgabe, Wochentag)
	function allowed(cat, now, flags) {
		if (cat.need === "alarm" && !(flags && flags.alarm)) return false;
		if (cat.days && cat.days.indexOf(now.getDay()) === -1) return false;
		return true;
	}

	function itemKey(it) { return typeof it === "string" ? it : (it && it.q) || ""; }

	// Wirksame Sprüche: eigene Liste (wenn nicht leer) sonst eingebaute, ohne ausgeschaltete
	function itemsOf(cat, s, lists) {
		var own = lists && lists[cat.list];
		var base = cat.own ? cat.items : (Array.isArray(own) && own.length ? own : cat.items);
		var off = (s && s.off && s.off[cat.key]) || [];
		return base.filter(function (it) { return itemKey(it) && off.indexOf(itemKey(it)) === -1; });
	}

	// ------------------------------------------------------------------ Wetter
	// w: { temp, windKmh, code (WMO, MMM-LumiraWeather), isDay, type (altes Wettermodul), at }
	function weatherTriggers(w, th, now) {
		var out = [];
		if (!w || !w.at || now.getTime() - w.at > WEATHER_MAX_AGE) return out;
		th = th || {};
		var c = typeof w.code === "number" ? w.code : null;
		var t = String(w.type || "").toLowerCase();
		var add = function (x) { if (out.indexOf(x) === -1) out.push(x); };
		if (c !== null) {
			if (c >= 95) add("gewitter");
			else if ([71, 73, 75, 77, 85, 86].indexOf(c) !== -1) add("schnee");
			else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) add("regen");
			else if (c === 45 || c === 48) add("nebel");
			else if (c <= 1 && w.isDay !== false) add("sonne");
		} else if (t) {
			if (t.indexOf("thunder") !== -1 || t.indexOf("lightning") !== -1) add("gewitter");
			else if (t.indexOf("snow") !== -1 || t.indexOf("sleet") !== -1) add("schnee");
			else if (/rain|shower|sprinkle|drizzle|regen/.test(t)) add("regen");
			else if (t.indexOf("fog") !== -1 || t.indexOf("haze") !== -1) add("nebel");
			else if (/sunny|clear/.test(t) && t.indexOf("night") === -1) add("sonne");
		}
		if (typeof w.temp === "number" && w.temp >= (th.heatTemp === undefined ? 30 : th.heatTemp)) add("hitze");
		if (typeof w.temp === "number" && w.temp <= (th.frostTemp === undefined ? 0 : th.frostTemp)) add("frost");
		if (typeof w.windKmh === "number" && w.windKmh >= (th.stormWindKmh === undefined ? 50 : th.stormWindKmh)) add("wind");
		return out;
	}

	// Gültige amtliche Warnungen (nur frisch und nicht abgelaufen)
	function activeWarnings(wr, now) {
		if (!wr || !wr.at || now.getTime() - wr.at > WARNINGS_MAX_AGE || !Array.isArray(wr.list)) return [];
		return wr.list.filter(function (x) { return x && x.event && (!x.expires || Date.parse(x.expires) > now.getTime()); });
	}

	// ------------------------------------------------------------------ Kalender
	function wordList(text) {
		return String(text || "").split(/[,;\n]/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
	}

	function eventRange(e) {
		var start = Number(e.startDate || e.startdate);
		var end = Number(e.endDate || e.enddate);
		if (!isFinite(start)) return null;
		if (!isFinite(end) || end <= start) end = start + 3600000;
		return [start, end];
	}

	// Termine von heute, deren Titel ein Stichwort enthält → [{ key, title }]
	function calendarHits(events, cats, s, now) {
		var day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		var day1 = day0 + 86400000;
		var today = (Array.isArray(events) ? events : []).filter(function (e) {
			var r = e && eventRange(e);
			return r && r[0] < day1 && r[1] > day0;
		});
		var out = [];
		cats.forEach(function (cat) {
			if (cat.group !== "calendar") return;
			var words = wordList(s && s.words && typeof s.words[cat.key] === "string" ? s.words[cat.key] : cat.words);
			today.forEach(function (e) {
				var title = String(e.title || "");
				var low = title.toLowerCase();
				if (words.some(function (w) { return low.indexOf(w) !== -1; })) out.push({ key: cat.key, title: title.slice(0, 40) });
			});
		});
		return out;
	}

	// ------------------------------------------------------------------ Auswahl
	function fill(text, vars) {
		return String(text).replace(/\{(event|title|name)\}/g, function (m, k) { return vars && vars[k] ? vars[k] : ""; });
	}

	function toMsg(it, cat, vars) {
		if (typeof it === "string") return { text: fill(it, vars), icon: cat.icon || "", cat: cat.key, id: it };
		return { text: it.q, answer: it.a, icon: cat.icon || "", cat: cat.key, id: it.q };
	}

	// Pools: [{ cat, items, vars }] – erst Kategorie, dann Spruch; zuletzt
	// gezeigte meiden (gibt es nur noch solche, dann doch einen davon)
	function pickFrom(pools, history, rnd) {
		pools = pools.filter(function (p) { return p.items.length; });
		if (!pools.length) return null;
		var fresh = pools.map(function (p) {
			return { p: p, items: p.items.filter(function (it) { return history.indexOf(itemKey(it)) === -1; }) };
		}).filter(function (x) { return x.items.length; });
		var x = fresh.length ? fresh[Math.floor(rnd() * fresh.length)] : { p: pools[Math.floor(rnd() * pools.length)], items: null };
		var items = x.items || x.p.items;
		return toMsg(items[Math.floor(rnd() * items.length)], x.p.cat, x.p.vars);
	}

	// Anlass-Pools in Reihenfolge; der erste nicht leere zählt
	function contextPool(st, cats, s, now) {
		var b = s.behavior;
		var on = function (c) { return isEnabled(c, s, st.legacy) && allowed(c, now, st.flags); };
		for (var i = 0; i < b.order.length; i++) {
			var g = b.order[i];
			var pools = [];
			if (g === "warning" && b.warnings) {
				var wl = activeWarnings(st.warnings, now);
				if (wl.length) {
					cats.forEach(function (c) {
						if (c.group === "warning" && on(c)) pools.push({ cat: c, items: itemsOf(c, s, st.lists), vars: { event: wl[0].event } });
					});
				}
			} else if (g === "calendar" && b.calendar) {
				calendarHits(st.events, cats, s, now).forEach(function (h) {
					var c = cats.filter(function (x) { return x.key === h.key; })[0];
					if (c && on(c)) pools.push({ cat: c, items: itemsOf(c, s, st.lists), vars: { title: h.title } });
				});
			} else if (g === "weather" && b.weather) {
				var tr = weatherTriggers(st.weather, st.thresholds, now);
				cats.forEach(function (c) {
					if (c.group === "weather" && tr.indexOf(c.trigger) !== -1 && on(c)) pools.push({ cat: c, items: itemsOf(c, s, st.lists) });
				});
			}
			pools = pools.filter(function (p) { return p.items.length; });
			if (pools.length) return { group: g, pools: pools };
		}
		return null;
	}

	// Allgemeiner Mix: Tageszeit/Wochentag/Jahreszeit … (extra) + Kategorien;
	// „Nach dem Einsatz“ nur, wenn ausdrücklich für den Mix eingeschaltet
	function generalPools(st, cats, s, now) {
		var pools = (st.extra || []).filter(function (p) { return p && p.items && p.items.length; }).map(function (p) {
			return { cat: { key: p.key, icon: p.icon || "" }, items: p.items };
		});
		cats.forEach(function (c) {
			if ((c.group !== "general" && c.group !== "duty") || !isEnabled(c, s, st.legacy) || !allowed(c, now, st.flags)) return;
			pools.push({ cat: c, items: itemsOf(c, s, st.lists) });
		});
		return pools;
	}

	// Ist mindestens eine allgemeine Kategorie an (und nicht leer)?
	function anyGeneralOn(s, legacy, flags, lists) {
		return allCategories(s).some(function (c) {
			return c.group === "general" && (c.need !== "alarm" || (flags && flags.alarm)) && isEnabled(c, s, legacy) && itemsOf(c, s, lists).length;
		});
	}

	// st: { now, settings, lists, legacy, flags, weather, warnings, events, thresholds, extra, history, random }
	function choose(st) {
		var now = st.now || new Date();
		var s = st.settings || cleanSettings(null);
		var rnd = st.random || Math.random;
		var history = st.history || [];
		var cats = allCategories(s);
		var ctx = contextPool(st, cats, s, now);
		if (ctx && rnd() * 100 < s.behavior.share) {
			var m = pickFrom(ctx.pools, history, rnd);
			if (m) { m.context = ctx.group; return m; }
		}
		return pickFrom(generalPools(st, cats, s, now), history, rnd);
	}

	// ------------------------------------------------------------------ Darstellung
	var EMOJI_RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|⃣|\p{Emoji_Modifier}|‍(?:\p{Extended_Pictographic}|\p{Regional_Indicator})️?)*/gu;

	// Symbole aus dem Text lösen (für „groß darunter“ bzw. „aus“)
	function splitEmoji(text) {
		var icons = String(text).match(EMOJI_RE) || [];
		var rest = String(text).replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").replace(/\n +/g, "\n").trim();
		return { text: rest, icons: icons };
	}

	function addLines(doc, parent, text) {
		String(text).split("\n").forEach(function (line, i) {
			if (i > 0) parent.appendChild(doc.createElement("br"));
			parent.appendChild(doc.createTextNode(line));
		});
	}

	// Füllt el mit dem Spruch; Text nur als Textknoten (nie als HTML)
	function render(el, msg, display, opts) {
		opts = opts || {};
		var doc = el.ownerDocument;
		var mode = (display && display.icon) || "below";
		el.innerHTML = "";
		if (!msg || !msg.text) return el;
		var text = msg.text;
		var icons = [];
		if (mode !== "inline") {
			var sp = splitEmoji(text);
			text = sp.text;
			icons = sp.icons;
			if (mode === "below" && !icons.length && msg.icon) icons = [msg.icon];
		}
		var t = doc.createElement("div");
		t.className = "sc-text";
		addLines(doc, t, text || "");
		el.appendChild(t);
		if (msg.answer) {
			var a = doc.createElement("div");
			a.className = "sc-answer" + (opts.reveal ? " is-on" : "");
			a.textContent = "Lösung: " + msg.answer;
			el.appendChild(a);
		}
		if (mode === "below" && icons.length) {
			var ic = doc.createElement("div");
			ic.className = "sc-icon";
			ic.textContent = icons.slice(0, 2).join(" ");
			el.appendChild(ic);
		}
		return el;
	}

	// Nichts abschneiden: Schrift schrittweise verkleinern (höchstens auf 50 %)
	function fit(box) {
		var scale = 1;
		for (var i = 0; i < 9; i++) {
			if (box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1) break;
			scale = Math.max(0.5, scale * 0.9);
			box.style.setProperty("--sc-fit", scale.toFixed(3));
		}
		return scale;
	}

	var api = {
		ANCHORS: ANCHORS, ICON_MODES: ICON_MODES, GROUP_KEYS: GROUP_KEYS, DEFAULTS: DEFAULTS,
		cleanSettings: cleanSettings, allCategories: allCategories, isEnabled: isEnabled, allowed: allowed,
		itemsOf: itemsOf, itemKey: itemKey, anyGeneralOn: anyGeneralOn, weatherTriggers: weatherTriggers, activeWarnings: activeWarnings,
		wordList: wordList, calendarHits: calendarHits, fill: fill, choose: choose,
		splitEmoji: splitEmoji, render: render, fit: fit
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.LumiraSpruchLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
