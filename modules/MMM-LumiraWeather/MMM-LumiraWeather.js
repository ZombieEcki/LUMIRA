/* MagicMirror²
 * Module: MMM-LumiraWeather
 *
 * Regenradar und amtliche Wetterwarnungen (Deutscher Wetterdienst) als
 * zwei unabhängige, frei platzierbare Glas-Kacheln:
 *  - Regenradar: dunkle DWD-Karte oder OpenStreetMap, darüber das
 *    Niederschlagsradar; läuft automatisch von „vor 1 h“ über „Jetzt“ bis
 *    „+2 h“ (Vorhersage des DWD) und wieder von vorn.
 *  - Warnungen: die aktuellen DWD-Warnungen genau für den Standort.
 *  - Wetteranzeige: aktuelles Wetter und Vorhersage (Open-Meteo) in einem
 *    von 12 Designs (weather-view.js / weather-view.css), eigener Schalter.
 *
 * Einstellungen kommen live aus dem LUMIRA-Portal (Bildschirm → Wetter)
 * über ~/.lumira/weather.json. Die Kacheln hängen direkt am
 * <body>, die Module-Position in der config.js spielt keine Rolle.
 *
 * MIT Licensed.
 */

Module.register("MMM-LumiraWeather", {

	defaults: {},

	getStyles: function () {
		return ["MMM-LumiraWeather.css", "weather-view.css"];
	},

	getScripts: function () {
		return ["weather-geo.js", "weather-view.js"];
	},

	start: function () {
		this.state = null;
		this.radarEl = null;
		this.warnEl = null;
		this.mapKey = "";
		this.framesKey = "";
		this.frameImgs = [];
		this.frameIdx = 0;
		this.anim = null;
		this.pause = 0;
		this.lastReport = "";
		this.reportTimer = null;
		this.wxEl = null;
		this.wxKey = "";
		window.addEventListener("resize", () => { this.mapKey = ""; this.wxKey = ""; this.render(); });
		// Uhrzeit (Design „Detailliert“), Tageswechsel, „veraltet“
		setInterval(() => this.renderWeather(), 30000);
		this.sendSocketNotification("LW_INIT");
	},

	getDom: function () {
		return document.createElement("div");
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "LW_STATE") return;
		this.state = payload;
		this.render();
		this.broadcast();
	},

	// Für andere Module (z. B. MMM-SmartCompliments): aktuelles Wetter und
	// amtliche Warnungen – nur, was wirklich geliefert wurde, mit Zeitstempel
	broadcast: function () {
		const st = this.state || {};
		const c = st.config;
		if (!c) return;
		const fx = st.forecast || {};
		const cur = c.weather.enabled && fx.data && fx.data.current;
		const warnOn = (c.enabled && c.warnings.enabled) || c.weather.enabled;
		const w = st.warnings || {};
		this.sendNotification("LUMIRA_WEATHER", {
			current: cur ? { temp: cur.temp, code: cur.code, isDay: cur.isDay, wind: cur.wind } : null,
			updatedAt: cur ? fx.updatedAt : null,
			warnings: warnOn && w.updatedAt ? {
				list: (w.list || []).map((x) => ({ event: x.event, level: x.level, group: x.group, onset: x.onset, expires: x.expires })),
				updatedAt: w.updatedAt
			} : null
		});
	},

	// ------------------------------------------------------------------ Hilfen
	el: function (tag, cls, text) {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	},

	icon: function (name) {
		const i = this.el("i", "fa-solid fa-" + name);
		i.setAttribute("aria-hidden", "true");
		return i;
	},

	hhmm: function (iso) {
		const d = new Date(iso);
		return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
	},

	// Position und Größe einer Kachel; Abstände in px oder % des Bildschirms
	applyPos: function (el, b, autoHeight) {
		const s = el.style;
		s.left = s.right = s.top = s.bottom = "";
		const t = [];
		const [v, h] = b.anchor.split("_");
		const ux = b.unit === "pct" ? "vw" : "px";
		const uy = b.unit === "pct" ? "vh" : "px";
		if (v === "top") s.top = b.y + uy;
		else if (v === "bottom") s.bottom = b.y + uy;
		else { s.top = "calc(50% + " + b.y + uy + ")"; t.push("translateY(-50%)"); }
		if (h === "left") s.left = b.x + ux;
		else if (h === "right") s.right = b.x + ux;
		else { s.left = "calc(50% + " + b.x + ux + ")"; t.push("translateX(-50%)"); }
		s.transform = t.join(" ");
		s.width = b.width + "px";
		if (autoHeight) { s.height = ""; s.maxHeight = b.height + "px"; } else { s.height = b.height + "px"; s.maxHeight = ""; }
	},

	// … dazu Transparenz und Schrift (Radar, Warnungen)
	applyBox: function (el, b, autoHeight) {
		this.applyPos(el, b, autoHeight);
		el.style.background = "rgba(14, 16, 22, " + (b.opacity / 100).toFixed(2) + ")";
		el.style.fontSize = (15 * b.fontScale / 100).toFixed(1) + "px";
	},

	// ------------------------------------------------------------------ Anzeige
	render: function () {
		const st = this.state;
		const c = st && st.config;
		this.renderWeather();
		if (!c || !c.enabled) {
			this.removeRadar();
			this.removeWarnings();
			this.scheduleReport();
			return;
		}
		if (c.radar.enabled) this.renderRadar(c, st.frames || [], st.radar || {}); else this.removeRadar();
		if (c.warnings.enabled) this.renderWarnings(c, st.warnings || {}); else this.removeWarnings();
		this.scheduleReport();
	},

	// ------------------------------------------------------------------ Radar
	renderRadar: function (c, frames, info) {
		const r = c.radar;
		if (!this.radarEl) {
			const p = this.el("div", "lw-panel lw-radar");
			const head = this.el("div", "lw-head");
			head.appendChild(this.icon("cloud-showers-heavy"));
			head.appendChild(this.el("span", "lw-title", "Regenradar"));
			const time = this.el("span", "lw-time");
			time.appendChild(this.el("span", "lw-rel"));
			time.appendChild(this.el("b", "lw-clock"));
			head.appendChild(time);
			p.appendChild(head);
			const map = this.el("div", "lw-map");
			map.appendChild(this.el("div", "lw-base"));
			map.appendChild(this.el("div", "lw-frames"));
			const marker = this.el("div", "lw-marker");
			map.appendChild(marker);
			map.appendChild(this.el("div", "lw-attr"));
			map.appendChild(this.el("div", "lw-msg"));
			p.appendChild(map);
			const foot = this.el("div", "lw-foot");
			const track = this.el("div", "lw-track");
			track.appendChild(this.el("div", "lw-now"));
			track.appendChild(this.el("div", "lw-pos"));
			foot.appendChild(track);
			const legend = this.el("div", "lw-legend");
			[["#00b4ff", "Leicht"], ["#ffd400", "Mäßig"], ["#ff2a2a", "Stark"]].forEach((x) => {
				const it = this.el("span", "lw-leg");
				const dot = this.el("i", "lw-leg-dot"); dot.style.background = x[0];
				it.appendChild(dot); it.appendChild(document.createTextNode(x[1]));
				legend.appendChild(it);
			});
			foot.appendChild(legend);
			p.appendChild(foot);
			document.body.appendChild(p);
			this.radarEl = p;
			this.mapKey = "";
			this.framesKey = "";
		}
		const p = this.radarEl;
		this.applyBox(p, r, false);
		p.querySelector(".lw-legend").hidden = !r.legend;
		p.querySelector(".lw-foot").hidden = !r.legend && frames.length < 2;
		p.querySelector(".lw-track").hidden = frames.length < 2;

		// Karte neu aufbauen, wenn Ort, Zoom, Karte oder Größe sich ändern
		const map = p.querySelector(".lw-map");
		const w = map.clientWidth;
		const h = map.clientHeight;
		const mapKey = [c.location.lat, c.location.lon, r.zoom, r.basemap, w, h].join("|");
		if (mapKey !== this.mapKey && w > 10 && h > 10) {
			this.mapKey = mapKey;
			this.framesKey = "";
			this.geo = window.LumiraGeo.frame(c.location.lat, c.location.lon, r.zoom, w, h);
			this.buildBase(map.querySelector(".lw-base"), r.basemap);
			const mk = map.querySelector(".lw-marker");
			mk.style.left = this.geo.marker.x + "px";
			mk.style.top = this.geo.marker.y + "px";
			mk.title = c.location.name || "";
			map.querySelector(".lw-attr").textContent = r.basemap === "osm" ? "© OpenStreetMap · Radar: DWD" : "Quelle: DWD";
		}
		const framesKey = this.mapKey + "|" + frames.map((f) => f.time).join(",");
		if (this.geo && framesKey !== this.framesKey) {
			this.framesKey = framesKey;
			this.buildFrames(map.querySelector(".lw-frames"), frames, r);
		}
		const msg = map.querySelector(".lw-msg");
		msg.textContent = info.error && !this.frameImgs.some((f) => f.ok) ? "Radar gerade nicht verfügbar" : "";
	},

	wmsUrl: function (layers, time) {
		const g = this.geo;
		return "https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.3.0&request=GetMap&layers=" + layers +
			"&styles=&crs=EPSG:3857&bbox=" + g.bbox.map((v) => v.toFixed(1)).join(",") +
			"&width=" + g.width + "&height=" + g.height + "&format=image/png&transparent=true" + (time ? "&time=" + encodeURIComponent(time) : "");
	},

	buildBase: function (base, kind) {
		base.innerHTML = "";
		base.className = "lw-base lw-base-" + kind;
		if (kind === "osm") {
			this.geo.tiles.forEach((t) => {
				const img = this.el("img", "lw-tile");
				img.alt = "";
				img.src = "https://tile.openstreetmap.org/" + t.z + "/" + t.x + "/" + t.y + ".png";
				img.style.left = t.left + "px";
				img.style.top = t.top + "px";
				base.appendChild(img);
			});
		} else {
			const img = this.el("img", "lw-dwdmap");
			img.alt = "";
			img.src = this.wmsUrl("dwd:Laender,dwd:Warngebiete_Kreise");
			base.appendChild(img);
		}
	},

	buildFrames: function (box, frames, r) {
		this.stopAnim();
		box.innerHTML = "";
		const nowIdx = Math.max(0, frames.findIndex((f) => f.offset === 0));
		this.frames = frames;
		this.frameImgs = frames.map((f) => {
			const img = this.el("img", "lw-frame");
			img.alt = "";
			const rec = { img, ok: false, frame: f };
			img.onload = () => { rec.ok = true; if (this.frameIdx === frames.indexOf(f)) this.showFrame(this.frameIdx); };
			img.onerror = () => { rec.ok = false; };
			img.src = this.wmsUrl("dwd:Niederschlagsradar", f.time);
			box.appendChild(img);
			return rec;
		});
		// Zeitleiste: Markierung für „Jetzt“
		const track = this.radarEl.querySelector(".lw-track");
		const n = Math.max(1, frames.length - 1);
		track.querySelector(".lw-now").style.left = (nowIdx / n * 100) + "%";
		this.frameIdx = nowIdx;
		this.showFrame(nowIdx);
		if (r.animate && frames.length > 1) this.startAnim(Number({ slow: 900, normal: 600, fast: 350 }[r.speed]) || 600, nowIdx);
	},

	showFrame: function (i) {
		if (!this.radarEl || !this.frames || !this.frames[i]) return;
		this.frameIdx = i;
		const rec = this.frameImgs[i];
		this.frameImgs.forEach((f, k) => { f.img.classList.toggle("is-on", k === i && f.ok); });
		const f = this.frames[i];
		const rel = this.radarEl.querySelector(".lw-rel");
		rel.textContent = f.offset === 0 ? "jetzt" : (f.offset > 0 ? "+" : "−") + Math.abs(f.offset) + " min";
		rel.classList.toggle("is-future", f.offset > 0);
		this.radarEl.querySelector(".lw-clock").textContent = this.hhmm(f.time);
		const n = Math.max(1, this.frames.length - 1);
		this.radarEl.querySelector(".lw-pos").style.left = (i / n * 100) + "%";
		if (rec && !rec.ok) rec.img.classList.remove("is-on");
	},

	// Durchlauf: alle Bilder nacheinander, am Ende kurz stehen bleiben, dann
	// wieder von vorn; „Jetzt“ bekommt ebenfalls eine kurze Pause
	startAnim: function (ms, nowIdx) {
		this.stopAnim();
		this.pause = 4;
		this.anim = setInterval(() => {
			if (this.pause > 0) { this.pause--; return; }
			let next = this.frameIdx + 1;
			if (next >= this.frames.length) next = 0;
			// noch nicht geladene Bilder überspringen
			for (let k = 0; k < this.frames.length && !this.frameImgs[next].ok; k++) next = (next + 1) % this.frames.length;
			this.showFrame(next);
			if (next === this.frames.length - 1) this.pause = 4;
			else if (next === nowIdx) this.pause = 2;
		}, ms);
	},

	stopAnim: function () {
		clearInterval(this.anim);
		this.anim = null;
	},

	removeRadar: function () {
		this.stopAnim();
		if (this.radarEl) this.radarEl.remove();
		this.radarEl = null;
		this.mapKey = "";
		this.framesKey = "";
		this.frameImgs = [];
	},

	// ------------------------------------------------------------------ Warnungen
	GROUP_ICON: {
		THUNDERSTORM: "cloud-bolt", WIND: "wind", RAIN: "cloud-showers-heavy", SNOWFALL: "snowflake",
		FROST: "temperature-low", GLAZE: "icicles", FOG: "smog", HEAT: "temperature-high", UV: "sun"
	},

	whenText: function (w) {
		const now = new Date();
		const day = (iso) => {
			const d = new Date(iso);
			const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
			const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t0) / 864e5);
			return diff === 0 ? "Heute" : diff === 1 ? "Morgen" : ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()];
		};
		if (!w.onset && !w.expires) return "";
		if (w.onset && Date.parse(w.onset) > now.getTime()) {
			const same = w.expires && day(w.onset) === day(w.expires);
			return day(w.onset) + ", " + this.hhmm(w.onset) + (w.expires ? " – " + (same ? "" : day(w.expires) + " ") + this.hhmm(w.expires) : "") + " Uhr";
		}
		return w.expires ? "bis " + (day(w.expires) === "Heute" ? "" : day(w.expires) + " ") + this.hhmm(w.expires) + " Uhr" : "aktiv";
	},

	renderWarnings: function (c, info) {
		const ww = c.warnings;
		const list = (info.list || []).slice(0, ww.max);
		if (!list.length && ww.whenNone === "hide") { this.removeWarnings(); return; }
		if (!this.warnEl) {
			this.warnEl = this.el("div", "lw-panel lw-warn");
			document.body.appendChild(this.warnEl);
		}
		const p = this.warnEl;
		this.applyBox(p, ww, true);
		p.innerHTML = "";
		const top = list.length ? list[0] : null;
		p.classList.toggle("is-calm", !top);
		p.style.borderColor = top ? top.color : "";

		const head = this.el("div", "lw-head");
		const hi = this.icon(top ? "triangle-exclamation" : "circle-check");
		if (top) hi.style.color = top.color;
		head.appendChild(hi);
		head.appendChild(this.el("span", "lw-title", top ? (list.length > 1 ? "Wetterwarnungen" : "Wetterwarnung") : "Keine Wetterwarnung"));
		head.appendChild(this.el("span", "lw-badge", "DWD"));
		p.appendChild(head);

		if (!top) {
			p.appendChild(this.el("div", "lw-none", info.error && !info.updatedAt ? "Warnungen gerade nicht abrufbar" : "Für " + (c.location.name || "euren Ort") + " liegt gerade nichts vor."));
			return;
		}
		list.forEach((w) => {
			const row = this.el("div", "lw-w");
			const ic = this.el("span", "lw-w-ic");
			ic.appendChild(this.icon(this.GROUP_ICON[w.group] || "triangle-exclamation"));
			ic.style.color = w.color;
			row.appendChild(ic);
			const txt = this.el("div", "lw-w-txt");
			const t = this.el("div", "lw-w-t", w.event);
			if (w.preliminary) t.appendChild(this.el("span", "lw-w-tag", "Vorabinfo"));
			const lvl = this.el("span", "lw-w-lvl");
			lvl.style.background = w.color;
			lvl.title = "Warnstufe " + w.level;
			t.insertBefore(lvl, t.firstChild);
			txt.appendChild(t);
			const when = this.whenText(w);
			if (when) txt.appendChild(this.el("div", "lw-w-s", when));
			if (w.area) txt.appendChild(this.el("div", "lw-w-a", "Für " + w.area));
			if (ww.details && w.description) txt.appendChild(this.el("div", "lw-w-d", w.description));
			row.appendChild(txt);
			p.appendChild(row);
		});
		if (info.error) p.appendChild(this.el("div", "lw-stale", "Stand " + (info.updatedAt ? this.hhmm(info.updatedAt) : "?") + " – Aktualisierung gerade nicht möglich"));
	},

	removeWarnings: function () {
		if (this.warnEl) this.warnEl.remove();
		this.warnEl = null;
	},

	// ------------------------------------------------------------------ Wetteranzeige
	renderWeather: function () {
		const st = this.state;
		const c = st && st.config;
		if (!c || !c.weather || !c.weather.enabled || !window.LumiraWeatherView) { this.removeWeather(); return; }
		const w = c.weather;
		const fx = st.forecast || {};
		const now = new Date();
		// „veraltet“: älter als zwei Abrufabstände, mindestens 1 Stunde
		const stale = !!fx.updatedAt && now.getTime() - Date.parse(fx.updatedAt) > Math.max(60, 2 * w.interval) * 60000;
		if (!this.wxEl) {
			this.wxEl = this.el("div", "lw-wxpanel");
			document.body.appendChild(this.wxEl);
			this.wxKey = "";
		}
		this.applyPos(this.wxEl, w, true);
		const tick = w.show.date ? Math.floor(now.getTime() / 60000) : now.getDate() + "|" + now.getHours();
		const key = JSON.stringify([w, c.location.name, fx.updatedAt, fx.error, stale, tick]);
		if (key === this.wxKey) return;
		this.wxKey = key;
		window.LumiraWeatherView.build(this.wxEl, fx.data, w, {
			baseClass: "lw-wxpanel",
			name: c.location.name,
			now,
			updatedAt: fx.updatedAt,
			error: fx.error,
			stale,
			iconUrl: (n) => this.file("icons/" + n + ".svg"),
			bgUrl: (n) => this.file("backgrounds/" + n + ".jpg")
		});
		// erst nach dem Laden der Symbole messen
		setTimeout(() => {
			if (!this.wxEl) return;
			window.LumiraWeatherView.fit(this.wxEl);
			this.scheduleReport();
		}, 300);
	},

	removeWeather: function () {
		if (this.wxEl) this.wxEl.remove();
		this.wxEl = null;
		this.wxKey = "";
	},

	// ------------------------------------------------------------------ Rückmeldung
	// Überdeckt eine Kachel andere Module (Uhr, Familienplan, Kalender …)?
	NAMES: {
		clock: "Uhr", "MMM-LumiraClock": "Uhr", weather: "bisheriges Wetter", calendar: "Kalender", newsfeed: "Nachrichten", "MMM-FamilyPlan": "Familienplan",
		"MMM-SmartCompliments": "Sprüche", "MMM-RainRadarDWD": "altes Regenradar", "MMM-aPagerAlarm": "Alarm", "MMM-LumiraStatus": "Portal-Hinweis"
	},

	scheduleReport: function () {
		clearTimeout(this.reportTimer);
		this.reportTimer = setTimeout(() => this.report(), 1500);
	},

	report: function () {
		const mods = [];
		document.querySelectorAll(".module").forEach((m) => {
			if (m.classList.contains("MMM-LumiraWeather") || m.classList.contains("MMM-Ambient") || m.classList.contains("MMM-Doorbell")) return;
			const r = m.getBoundingClientRect();
			if (r.width < 4 || r.height < 4 || getComputedStyle(m).visibility === "hidden" || Number(getComputedStyle(m).opacity) === 0) return;
			const name = Object.keys(this.NAMES).find((k) => m.classList.contains(k));
			if (name) mods.push({ name: this.NAMES[name], r });
		});
		// die eigenen Kacheln untereinander
		[[this.radarEl, "Regenradar"], [this.warnEl, "Warnungen"], [this.wxEl, "Wetteranzeige"]].forEach((x) => {
			if (x[0]) mods.push({ name: x[1], r: x[0].getBoundingClientRect(), el: x[0] });
		});
		// frei platzierte Kacheln anderer LUMIRA-Module (z. B. die Uhr)
		document.querySelectorAll("[data-lumira-tile]").forEach((t) => mods.push({ name: t.getAttribute("data-lumira-tile"), r: t.getBoundingClientRect() }));
		const hits = (el) => {
			if (!el) return [];
			const a = el.getBoundingClientRect();
			return mods.filter((m) => m.el !== el && a.left < m.r.right - 2 && a.right > m.r.left + 2 && a.top < m.r.bottom - 2 && a.bottom > m.r.top + 2)
				.map((m) => m.name).filter((x, i, arr) => arr.indexOf(x) === i);
		};
		const off = (el) => {
			if (!el) return false;
			const a = el.getBoundingClientRect();
			return a.left < -2 || a.top < -2 || a.right > window.innerWidth + 2 || a.bottom > window.innerHeight + 2;
		};
		const rep = {
			screen: { width: window.innerWidth, height: window.innerHeight },
			overlaps: { radar: hits(this.radarEl), warnings: hits(this.warnEl), weather: hits(this.wxEl) },
			offscreen: { radar: off(this.radarEl), warnings: off(this.warnEl), weather: off(this.wxEl) }
		};
		const key = JSON.stringify(rep);
		if (key === this.lastReport) return;
		this.lastReport = key;
		this.sendSocketNotification("LW_REPORT", rep);
	}
});
