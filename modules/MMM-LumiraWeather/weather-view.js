/* MMM-LumiraWeather – Wetteranzeige: 12 Designs aus denselben Bausteinen.
 *
 * Läuft im Browser (window.LumiraWeatherView) – auf dem Spiegel und im Portal
 * für die Vorschau (dort als public/weather-view.js, der Test prüft Gleichheit)
 * – und in Node (require, für Tests der reinen Hilfen).
 *
 * build(box, data, cfg, opts) füllt ein Element mit dem gewählten Design:
 *  - data: aufbereitete Open-Meteo-Daten (payload.parseForecast) oder null,
 *  - cfg:  Einstellungen der Kachel (weather.json → weather),
 *  - opts: { name, now, updatedAt, error, stale, iconUrl(name), bgUrl(scene), baseClass }.
 * Werte, die die Quelle nicht liefert, werden weggelassen – nie erfunden.
 * fit(box) verkleinert die Schrift, bis nichts mehr abgeschnitten ist.
 */
(function (root) {
	"use strict";

	// Reihenfolge = Auswahl im Portal. width = empfohlene Breite in px.
	var DESIGNS = [
		{ id: "classic", name: "Klassisch", width: 400, days: true },
		{ id: "compact", name: "Kompakt minimal", width: 300, days: true, tomorrow: true, maxOnly: true },
		{ id: "card", name: "Modern mit Karte", width: 440, days: true },
		{ id: "vertical", name: "Vertikal / schmal", width: 230, days: true },
		{ id: "minimal", name: "Transparent minimal", width: 340, days: true, tomorrow: true, maxOnly: true },
		{ id: "detailed", name: "Detailliert mit Infos", width: 480, days: true, details: true, date: true },
		{ id: "bar", name: "Horizontale Leiste", width: 780, days: true, tomorrow: true },
		{ id: "circle", name: "Kreis-Design", width: 260 },
		{ id: "photo", name: "Modern mit Hintergrund", width: 430, days: true, photo: true },
		{ id: "large", name: "Klar & groß", width: 520 },
		{ id: "icons", name: "Icon-only (sehr kompakt)", width: 380, days: true, iconsOnly: true, maxOnly: true },
		{ id: "elegant", name: "Elegant mit Details", width: 960, days: true, details: true }
	];

	// Ein-/ausblendbare Werte. Welches Design was zeigen kann: supports().
	var FIELDS = [
		["location", "Ort"],
		["feels", "Gefühlte Temperatur"],
		["desc", "Wetterbeschreibung"],
		["decimals", "Temperatur mit Nachkommastelle"],
		["humidity", "Luftfeuchtigkeit"],
		["wind", "Wind"],
		["pressure", "Luftdruck"],
		["uv", "UV-Index"],
		["rain", "Regen (Wahrscheinlichkeit, Menge)"],
		["sun", "Sonnenauf- und -untergang"],
		["date", "Datum und Uhrzeit"],
		["updated", "Stand der Daten"]
	];
	var DETAIL_FIELDS = ["humidity", "wind", "pressure", "uv", "rain", "sun"];

	function design(id) {
		for (var i = 0; i < DESIGNS.length; i++) if (DESIGNS[i].id === id) return DESIGNS[i];
		return DESIGNS[0];
	}

	function supports(id, field) {
		var d = design(id);
		if (field === "updated") return true;
		if (field === "location" || field === "feels" || field === "desc" || field === "decimals") return !d.iconsOnly;
		if (field === "date") return !!d.date;
		if (field === "rain") return !!(d.details || d.days);
		if (DETAIL_FIELDS.indexOf(field) !== -1) return !!d.details;
		return false;
	}

	// ------------------------------------------------------------------ Wetterlage (WMO-Code)
	var TEXT = {
		1: "Heiter", 2: "Teilweise bewölkt", 3: "Bedeckt", 45: "Nebel", 48: "Reifnebel",
		51: "Leichter Nieselregen", 53: "Nieselregen", 55: "Starker Nieselregen", 56: "Gefrierender Nieselregen", 57: "Gefrierender Nieselregen",
		61: "Leichter Regen", 63: "Regen", 65: "Starker Regen", 66: "Gefrierender Regen", 67: "Gefrierender Regen",
		71: "Leichter Schneefall", 73: "Schneefall", 75: "Starker Schneefall", 77: "Schneegriesel",
		80: "Leichte Regenschauer", 81: "Regenschauer", 82: "Heftige Regenschauer", 85: "Leichte Schneeschauer", 86: "Schneeschauer",
		95: "Gewitter", 96: "Gewitter mit Hagel", 99: "Schweres Gewitter mit Hagel"
	};

	function describe(code, isDay) {
		if (code === 0) return isDay === false ? "Klar" : "Sonnig";
		return TEXT[code] || "";
	}

	function iconOf(code, isDay) {
		var dn = isDay === false ? "night" : "day";
		switch (code) {
			case 0: return "clear-" + dn;
			case 1: case 2: return "partly-cloudy-" + dn;
			case 3: return "overcast";
			case 45: case 48: return "fog-" + dn;
			case 51: return "partly-cloudy-" + dn + "-drizzle";
			case 53: case 55: return "drizzle";
			case 56: case 57: case 66: case 67: return "sleet";
			case 61: case 80: case 81: return "partly-cloudy-" + dn + "-rain";
			case 63: case 65: case 82: return "rain";
			case 71: case 85: return "partly-cloudy-" + dn + "-snow";
			case 73: case 75: case 77: case 86: return "snow";
			case 95: return "thunderstorms-" + dn + "-rain";
			case 96: case 99: return "hail";
			default: return "not-available";
		}
	}

	// Hintergrundbild für „Modern mit Hintergrund“: erst das Wetter, bei klarem
	// oder leicht bewölktem Himmel die Tageszeit (Morgen-/Abendrot, Nacht).
	// Zeiten in Sekunden (Unix). night = Bild abdunkeln.
	function sceneOf(code, isDay, now, sunrise, sunset) {
		var night = isDay === false;
		var s;
		if (code >= 95) s = "storm";
		else if ([71, 73, 75, 77, 85, 86].indexOf(code) !== -1) s = "snow";
		else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) s = "rain";
		else if (code === 45 || code === 48) s = "fog";
		else if (code === 3) s = "cloudy";
		else {
			var golden = now && sunrise && sunset &&
				((now >= sunrise - 1800 && now <= sunrise + 2700) || (now >= sunset - 3600 && now <= sunset + 1200));
			if (golden) return { scene: "golden", night: false };
			if (night) return { scene: "dusk", night: false };
			s = code === 0 ? "sunny" : "fair";
		}
		return { scene: s, night: night };
	}

	// ------------------------------------------------------------------ Formate
	function fin(v) { return typeof v === "number" && isFinite(v); }

	function deg(v, decimals) {
		if (!fin(v)) return "–";
		var s = decimals ? (Math.round(v * 10) / 10).toFixed(1).replace(".", ",") : String(Math.round(v));
		if (s === "-0" || s === "-0,0") s = s.slice(1);
		return s + "°";
	}

	var BFT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
	function beaufort(kmh) {
		var b = 0;
		while (b < 12 && kmh >= BFT[b]) b++;
		return b;
	}

	var COMPASS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
	function compass(d) {
		if (!fin(d)) return "";
		return COMPASS[Math.round((((d % 360) + 360) % 360) / 45) % 8];
	}

	function windText(kmh, unit, dir) {
		if (!fin(kmh)) return null;
		var v = unit === "ms" ? (kmh / 3.6).toFixed(1).replace(".", ",") + " m/s"
			: unit === "bft" ? "Bft " + beaufort(kmh)
				: Math.round(kmh) + " km/h";
		var c = compass(dir);
		return c ? v + " " + c : v;
	}

	function uvText(uv) {
		if (!fin(uv)) return null;
		var n = Math.round(uv);
		var t = n <= 2 ? "niedrig" : n <= 5 ? "mäßig" : n <= 7 ? "hoch" : n <= 10 ? "sehr hoch" : "extrem";
		return n + " (" + t + ")";
	}

	function pad(n) { return ("0" + n).slice(-2); }

	// Uhrzeit am Standort (Unix-Sekunden + Versatz der Zeitzone)
	function hm(sec, offset) {
		if (!fin(sec)) return "";
		var d = new Date((sec + (offset || 0)) * 1000);
		return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
	}

	function dayKey(ms, offset) {
		return new Date(ms + (offset || 0) * 1000).toISOString().slice(0, 10);
	}

	var WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
	var WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
	var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

	// Tage ab heute (am Standort); ältere fallen weg, falls die Daten von gestern sind
	function upcoming(data, now) {
		if (!data || !data.days) return [];
		var today = dayKey(now.getTime(), data.offset);
		return data.days.filter(function (d) { return d.key >= today; }).map(function (d) {
			return Object.assign({}, d, { label: d.key === today ? "Heute" : WD[d.wd], today: d.key === today });
		});
	}

	// ------------------------------------------------------------------ Bausteine
	function Ctx(box, data, cfg, opts) {
		this.doc = box.ownerDocument;
		this.d = data;
		this.c = cfg;
		this.o = opts || {};
		this.now = this.o.now || new Date();
		this.show = cfg.show || {};
		this.design = design(cfg.design);
		this.days = upcoming(data, this.now);
		this.today = this.days.length && this.days[0].today ? this.days[0] : null;
	}

	Ctx.prototype.el = function (tag, cls, text) {
		var e = this.doc.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	};

	Ctx.prototype.on = function (field) {
		return !!this.show[field] && supports(this.design.id, field);
	};

	Ctx.prototype.icon = function (name, cls) {
		var img = this.el("img", "lwv-ic" + (cls ? " " + cls : ""));
		img.alt = "";
		img.src = this.o.iconUrl ? this.o.iconUrl(name) : name + ".svg";
		return img;
	};

	Ctx.prototype.cur = function () { return (this.d && this.d.current) || {}; };

	Ctx.prototype.loc = function (cls) {
		if (!this.on("location") || !this.o.name) return null;
		return this.el("div", "lwv-loc" + (cls ? " " + cls : ""), this.o.name);
	};

	Ctx.prototype.temp = function (cls) {
		return this.el("div", "lwv-t" + (cls ? " " + cls : ""), deg(this.cur().temp, this.on("decimals")));
	};

	Ctx.prototype.feels = function () {
		var f = this.cur().feels;
		if (!this.on("feels") || !fin(f)) return null;
		return this.el("div", "lwv-feels", "Gefühlt " + deg(f, this.on("decimals")));
	};

	Ctx.prototype.desc = function () {
		var t = describe(this.cur().code, this.cur().isDay);
		if (!this.on("desc") || !t) return null;
		return this.el("div", "lwv-desc", t);
	};

	Ctx.prototype.curIcon = function (cls) {
		return this.icon(iconOf(this.cur().code, this.cur().isDay), cls);
	};

	// Temperatur, darunter gefühlt und Beschreibung
	Ctx.prototype.tblock = function (cls) {
		var b = this.el("div", "lwv-tb" + (cls ? " " + cls : ""));
		add(b, [this.temp(), this.feels(), this.desc()]);
		return b;
	};

	// Symbol + Temperaturblock
	Ctx.prototype.hero = function (cls) {
		var h = this.el("div", "lwv-hero" + (cls ? " " + cls : ""));
		h.appendChild(this.curIcon("lwv-ic-hero"));
		h.appendChild(this.tblock());
		return h;
	};

	// Vorhersage: Spalten nebeneinander oder Zeilen untereinander
	Ctx.prototype.forecast = function (opt) {
		opt = opt || {};
		var list = this.days.slice();
		if (opt.tomorrow && list.length && list[0].today) list.shift();
		list = list.slice(0, Math.max(1, this.c.days || 5));
		if (!list.length) return null;
		var wrap = this.el("div", "lwv-days" + (opt.rows ? " lwv-rows" : ""));
		var self = this;
		list.forEach(function (d) {
			var it = self.el("div", "lwv-day");
			it.appendChild(self.el("span", "lwv-dn", opt.rows && d.today ? "Heute" : d.label));
			it.appendChild(self.icon(iconOf(d.code, true), "lwv-ic-day"));
			var t = self.el("span", "lwv-dt");
			t.appendChild(self.el("b", null, deg(d.max)));
			if (!opt.maxOnly && fin(d.min)) {
				t.appendChild(self.doc.createTextNode(" / "));
				t.appendChild(self.el("span", "lwv-min", deg(d.min)));
			}
			it.appendChild(t);
			if (self.on("rain") && fin(d.pop) && d.pop > 0) it.appendChild(self.el("span", "lwv-pop", d.pop + " %"));
			wrap.appendChild(it);
		});
		return wrap;
	};

	// Messwerte (nur, was die Quelle liefert)
	Ctx.prototype.detailItems = function () {
		var c = this.cur();
		var t = this.today || {};
		var out = [];
		if (this.on("humidity") && fin(c.humidity)) out.push(["humidity", "Luftfeuchtigkeit", Math.round(c.humidity) + " %"]);
		if (this.on("wind")) { var w = windText(c.wind, this.c.wind, c.windDir); if (w) out.push(["wind", "Wind", w]); }
		if (this.on("pressure") && fin(c.pressure)) out.push(["barometer", "Luftdruck", Math.round(c.pressure) + " hPa"]);
		if (this.on("uv")) { var u = uvText(c.uv); if (u) out.push(["uv-index", "UV-Index", u]); }
		if (this.on("rain") && (fin(t.pop) || fin(t.rain))) {
			var r = [];
			if (fin(t.pop)) r.push(t.pop + " %");
			if (fin(t.rain)) r.push(String(Math.round(t.rain * 10) / 10).replace(".", ",") + " mm");
			out.push(["umbrella", "Regen heute", r.join(" · ")]);
		}
		if (this.on("sun") && fin(t.sunrise) && fin(t.sunset)) out.push(["sunrise", "Sonne", hm(t.sunrise, this.d.offset) + " – " + hm(t.sunset, this.d.offset)]);
		return out;
	};

	Ctx.prototype.details = function (inline) {
		var items = this.detailItems();
		if (!items.length) return null;
		var wrap = this.el("div", inline ? "lwv-det lwv-det-inline" : "lwv-det");
		var self = this;
		items.forEach(function (x) {
			var row = self.el("div", "lwv-di");
			row.appendChild(self.icon(x[0], "lwv-ic-det"));
			row.appendChild(self.el("span", "lwv-dl", x[1]));
			row.appendChild(self.el("span", "lwv-dv", x[2]));
			wrap.appendChild(row);
		});
		return wrap;
	};

	Ctx.prototype.dateBlock = function () {
		if (!this.on("date")) return null;
		var n = this.now;
		var b = this.el("div", "lwv-date");
		b.appendChild(this.el("div", null, WD_LONG[n.getDay()] + ", " + n.getDate() + ". " + MONTHS[n.getMonth()] + " " + n.getFullYear()));
		b.appendChild(this.el("div", "lwv-clock", pad(n.getHours()) + ":" + pad(n.getMinutes())));
		return b;
	};

	Ctx.prototype.hr = function () { return this.el("div", "lwv-hr"); };

	Ctx.prototype.foot = function () {
		var o = this.o;
		if (o.stale || (o.error && o.updatedAt)) {
			return this.el("div", "lwv-foot is-stale", "Stand " + (o.updatedAt ? clock(o.updatedAt) : "?") + " · veraltet");
		}
		if (this.on("updated") && o.updatedAt) return this.el("div", "lwv-foot", "Stand " + clock(o.updatedAt));
		return null;
	};

	function clock(iso) {
		var d = new Date(iso);
		return pad(d.getHours()) + ":" + pad(d.getMinutes());
	}

	function add(parent, kids) {
		kids.forEach(function (k) { if (k) parent.appendChild(k); });
		return parent;
	}

	function row(x, cls, kids) { return add(x.el("div", cls), kids); }

	// ------------------------------------------------------------------ Designs
	var LAYOUT = {
		classic: function (x) {
			return [x.loc(), x.hero(), x.hr(), x.forecast()];
		},
		compact: function (x) {
			return [x.loc(), x.hero("lwv-center"), x.hr(), x.forecast({ tomorrow: true, maxOnly: true })];
		},
		card: function (x) {
			var inner = row(x, "lwv-inner", [
				row(x, "lwv-inner-txt", [x.loc(), x.tblock()]),
				x.curIcon("lwv-ic-xl")
			]);
			return [inner, x.forecast()];
		},
		vertical: function (x) {
			return [x.loc(), x.hero("lwv-hero-sm"), x.hr(), x.forecast({ rows: true })];
		},
		minimal: function (x) {
			return [x.hero("lwv-hero-lg"), x.loc(), x.hr(), x.forecast({ tomorrow: true, maxOnly: true })];
		},
		detailed: function (x) {
			var top = row(x, "lwv-top", [x.loc(), x.dateBlock()]);
			var mid = row(x, "lwv-mid", [x.hero(), x.details(false)]);
			return [top.firstChild ? top : null, mid, x.hr(), x.forecast()];
		},
		bar: function (x) {
			var txt = x.el("div", "lwv-bar-txt");
			add(txt, [x.loc()]);
			var t = row(x, "lwv-bar-t", [x.temp(), x.feels()]);
			txt.appendChild(t);
			add(txt, [x.desc()]);
			return [row(x, "lwv-bar", [x.curIcon("lwv-ic-hero"), txt, x.forecast({ tomorrow: true })])];
		},
		circle: function (x) {
			var ring = x.el("div", "lwv-ring");
			ring.appendChild(ringSvg(x));
			var inner = row(x, "lwv-ring-in", [x.curIcon("lwv-ic-ring"), x.temp(), x.feels(), x.desc()]);
			ring.appendChild(inner);
			return [ring, x.loc("lwv-center")];
		},
		photo: function (x) {
			return [x.loc(), x.hero(), x.forecast()];
		},
		large: function (x) {
			var side = row(x, "lwv-large-side", [x.loc(), x.desc()]);
			var tb = row(x, "lwv-tb", [x.temp(), x.feels()]);
			return [row(x, "lwv-large", [x.curIcon("lwv-ic-xl"), tb, side.firstChild ? x.el("div", "lwv-vr") : null, side.firstChild ? side : null])];
		},
		icons: function (x) {
			return [x.forecast({ maxOnly: true })];
		},
		elegant: function (x) {
			var left = row(x, "lwv-el-left", [x.loc(), x.hero()]);
			return [row(x, "lwv-elegant", [left, x.details(true), x.forecast()])];
		}
	};

	// Ring: wo liegt die Temperatur jetzt zwischen Tagestief und Tageshoch?
	function ringSvg(x) {
		var NS = "http://www.w3.org/2000/svg";
		var svg = x.doc.createElementNS(NS, "svg");
		svg.setAttribute("viewBox", "0 0 100 100");
		svg.setAttribute("class", "lwv-ring-svg");
		var mk = function (cls, dash) {
			var c = x.doc.createElementNS(NS, "circle");
			c.setAttribute("cx", "50"); c.setAttribute("cy", "50"); c.setAttribute("r", "44");
			c.setAttribute("pathLength", "100");
			c.setAttribute("stroke-dasharray", dash);
			c.setAttribute("transform", "rotate(135 50 50)");
			c.setAttribute("class", cls);
			return c;
		};
		svg.appendChild(mk("lwv-ring-track", "75 100"));
		var t = x.cur().temp;
		var d = x.today;
		if (d && fin(t) && fin(d.min) && fin(d.max)) {
			var f = d.max > d.min ? Math.min(1, Math.max(0, (t - d.min) / (d.max - d.min))) : 0.5;
			svg.appendChild(mk("lwv-ring-val", (Math.max(0.02, f) * 75).toFixed(2) + " 100"));
			var lo = x.doc.createElementNS(NS, "text");
			lo.setAttribute("x", "22"); lo.setAttribute("y", "92"); lo.setAttribute("class", "lwv-ring-lbl");
			lo.textContent = deg(d.min);
			var hi = x.doc.createElementNS(NS, "text");
			hi.setAttribute("x", "78"); hi.setAttribute("y", "92"); hi.setAttribute("class", "lwv-ring-lbl");
			hi.textContent = deg(d.max);
			svg.appendChild(lo);
			svg.appendChild(hi);
		}
		return svg;
	}

	// ------------------------------------------------------------------ Aufbau
	function build(box, data, cfg, opts) {
		opts = opts || {};
		var x = new Ctx(box, data, cfg, opts);
		var d = x.design;
		var cls = [opts.baseClass || "", "lwv", "lwv-d-" + d.id];
		if (cfg.border) cls.push("has-border");
		if (cfg.shadow) cls.push("has-shadow");
		if (opts.stale) cls.push("is-stale");
		box.className = cls.join(" ").trim();
		box.innerHTML = "";
		var op = Math.max(0, Math.min(100, Number(cfg.opacity) || 0)) / 100;
		box.style.background = d.photo ? "rgba(14, 16, 22, 0.9)" : "rgba(14, 16, 22, " + op.toFixed(2) + ")";
		box.style.padding = (Number(cfg.padding) >= 0 ? Number(cfg.padding) : 14) + "px";
		box.style.fontSize = (15 * (Number(cfg.fontScale) || 100) / 100).toFixed(1) + "px";

		if (!data || !data.current) {
			add(box, [x.loc(), x.el("div", "lwv-wait", opts.error ? "Wetter gerade nicht abrufbar" : "Wetterdaten werden geladen …")]);
			return box;
		}
		if (d.photo) {
			var c = data.current;
			var s = sceneOf(c.code, c.isDay, Math.round(x.now.getTime() / 1000), x.today && x.today.sunrise, x.today && x.today.sunset);
			var bg = x.el("img", "lwv-bg" + (s.night ? " is-night" : ""));
			bg.alt = "";
			bg.src = opts.bgUrl ? opts.bgUrl(s.scene) : s.scene + ".jpg";
			bg.style.opacity = (Math.max(0, Math.min(100, Number(cfg.photoOpacity))) / 100).toFixed(2);
			box.appendChild(bg);
			box.appendChild(x.el("div", "lwv-shade"));
		}
		var body = add(x.el("div", "lwv-body"), LAYOUT[d.id](x));
		box.appendChild(body);
		var f = x.foot();
		if (f) body.appendChild(f);
		return box;
	}

	// Nichts abschneiden: Schrift schrittweise verkleinern, bis alles passt
	// (höchstens auf 55 %). Das Element muss dafür im Dokument hängen.
	function fit(box) {
		var base = parseFloat(box.style.fontSize) || 15;
		var size = base;
		for (var i = 0; i < 8; i++) {
			if (box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1) break;
			size = Math.max(base * 0.55, size * 0.92);
			box.style.fontSize = size.toFixed(1) + "px";
		}
		return size / base;
	}

	var api = {
		DESIGNS: DESIGNS, FIELDS: FIELDS, design: design, supports: supports,
		describe: describe, iconOf: iconOf, sceneOf: sceneOf,
		deg: deg, beaufort: beaufort, compass: compass, windText: windText, uvText: uvText, hm: hm, dayKey: dayKey, upcoming: upcoming,
		build: build, fit: fit
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.LumiraWeatherView = api;
})(typeof window !== "undefined" ? window : globalThis);
