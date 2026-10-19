/* MagicMirror²
 * Node Helper: MMM-LumiraCalendar
 *
 * Liest ~/.lumira/calendar.json (gepflegt im LUMIRA-Portal, Bildschirm →
 * Kalender; enthält die geheimen Kalender-Links) per fs.watch und holt die
 * aktiven Kalender im eingestellten Abstand ab – nacheinander, damit der
 * Pi 3 entspannt bleibt. Wiederholungen, Ausnahmen und Zeitzonen löst
 * ics.js auf. Fällt ein Kalender aus, bleibt sein letzter Stand (als
 * „Stand …“ gekennzeichnet), die anderen laufen weiter.
 *
 * Nur lesen: Es werden nie Termine angelegt, geändert oder gelöscht.
 * Links erscheinen nie in Logs oder an der Anzeige – nur Name und Rechner.
 *
 * Termine (ohne Links) liegen zusätzlich in ~/.lumira/calendar-data.json:
 * für einen schnellen Start und die Vorschau im Portal.
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const os = require("os");
const ics = require("./ics");
const view = require("./calendar-view");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const STATE_PATH = path.join(LUMIRA_HOME, "calendar.json");
const DATA_PATH = path.join(LUMIRA_HOME, "calendar-data.json");
const REPORT_PATH = path.join(LUMIRA_HOME, "calendar-mirror.json");

// Zeitraum, der abgerufen wird: ab dem Monatsraster (Montag vor dem 1.)
// bis 63 Tage voraus – reicht für alle Designs und Zeiträume
function windowOf(now) {
	const d = new Date(now);
	const first = new Date(d.getFullYear(), d.getMonth(), 1);
	const from = new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7)).getTime();
	return { from, to: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 63).getTime() };
}

module.exports = NodeHelper.create({

	watcher: null,
	debounce: null,
	timer: null,
	config: null,
	sources: [],      // mit url (bleibt hier)
	cache: {},        // id → { events, updatedAt, error, errorAt }
	busy: false,
	again: false,
	urlKey: "",

	start: function () {
		console.log("Starting node_helper for: " + this.name);
		this.readData();
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "LK_REPORT") { this.writeReport(payload); return; }
		if (notification !== "LK_INIT") return;
		if (!this.watcher) {
			this.startWatch();
			this.load();
			this.refresh();
		} else {
			this.push();
		}
	},

	load: function () {
		let raw = null;
		try { raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch (err) { raw = null; }
		this.config = view.clean(raw);
		const list = raw && Array.isArray(raw.sources) ? raw.sources : [];
		this.sources = list.map((s, i) => Object.assign(view.cleanSource(s, i), { url: ics.validUrl(s && s.url) ? String(s.url).trim() : "" }))
			.filter((s) => s.id);
		const key = JSON.stringify([this.sources.map((s) => [s.id, s.url, s.enabled]), this.config.interval]);
		const changed = key !== this.urlKey;
		this.urlKey = key;
		return changed;
	},

	// Letzter Stand vom Datenträger: sofort etwas zeigen, auch ohne Internet
	readData: function () {
		try {
			const d = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
			Object.keys(d.status || {}).forEach((id) => {
				const st = d.status[id];
				this.cache[id] = { events: (d.events || []).filter((e) => e.src === id), updatedAt: st.updatedAt || null, error: st.error || "", errorAt: st.errorAt || null };
			});
		} catch (err) { /* noch keine Daten */ }
	},

	schedule: function () {
		clearTimeout(this.timer);
		const min = (this.config && this.config.interval) || 15;
		this.timer = setTimeout(() => this.refresh(), min * 60000);
	},

	refresh: async function () {
		if (this.busy) { this.again = true; return; }
		this.busy = true;
		const now = Date.now();
		const win = windowOf(now);
		for (const s of this.sources) {
			if (!s.enabled || !s.url) continue;
			const c = this.cache[s.id] || (this.cache[s.id] = { events: [], updatedAt: null, error: "", errorAt: null });
			try {
				const text = await ics.fetchIcs(s.url);
				const parsed = ics.parse(text);
				c.events = ics.expand(parsed.events, win.from, win.to, { max: 1500 }).map((e) => Object.assign(e, { src: s.id }));
				c.updatedAt = new Date().toISOString();
				c.error = "";
				c.errorAt = null;
			} catch (err) {
				c.error = err instanceof ics.IcsError ? err.message : "Kalender nicht lesbar";
				c.errorAt = new Date().toISOString();
				console.warn(this.name + ": Kalender „" + s.name + "“ (" + ics.maskUrl(s.url) + "): " + c.error);
			}
		}
		// entfernte Quellen vergessen
		Object.keys(this.cache).forEach((id) => { if (!this.sources.some((s) => s.id === id)) delete this.cache[id]; });
		this.busy = false;
		this.writeData();
		this.push();
		this.schedule();
		if (this.again) { this.again = false; this.refresh(); }
	},

	// Alle aktiven Termine, sortiert; gleiche Termine aus zwei Kalendern nur einmal
	merged: function () {
		const out = [];
		const seen = {};
		this.sources.forEach((s) => {
			if (!s.enabled) return;
			((this.cache[s.id] && this.cache[s.id].events) || []).forEach((e) => {
				const k = [e.title, e.start, e.end, e.allDay].join("|");
				if (seen[k]) return;
				seen[k] = true;
				out.push(e);
			});
		});
		out.sort((a, b) => a.start - b.start || (b.allDay - a.allDay) || a.title.localeCompare(b.title));
		return out;
	},

	status: function () {
		const st = {};
		this.sources.forEach((s) => {
			const c = this.cache[s.id];
			st[s.id] = {
				name: s.name, enabled: s.enabled, hasUrl: !!s.url,
				count: c ? c.events.length : 0, updatedAt: c ? c.updatedAt : null, error: c ? c.error : "", errorAt: c ? c.errorAt : null
			};
		});
		return st;
	},

	writeData: function () {
		const out = { at: new Date().toISOString(), events: this.merged(), status: this.status() };
		try {
			fs.writeFileSync(DATA_PATH + ".tmp", JSON.stringify(out), { mode: 0o600 });
			fs.renameSync(DATA_PATH + ".tmp", DATA_PATH);
		} catch (err) {
			console.error(this.name + ": Termine nicht gespeichert: " + err.message);
		}
	},

	push: function () {
		const src = {};
		this.sources.forEach((s) => { src[s.id] = { name: s.name, enabled: s.enabled, color: s.color, icon: s.icon, showTitle: s.showTitle, showLocation: s.showLocation, showTime: s.showTime }; });
		this.sendSocketNotification("LK_STATE", { config: this.config, sources: src, events: this.merged(), status: this.status() });
	},

	startWatch: function () {
		try {
			fs.mkdirSync(LUMIRA_HOME, { recursive: true });
			this.watcher = fs.watch(LUMIRA_HOME, (eventType, filename) => {
				if (filename && filename !== "calendar.json") return;
				clearTimeout(this.debounce);
				this.debounce = setTimeout(() => {
					// neue/geänderte Links → gleich abrufen, sonst nur neu zeichnen
					if (this.load()) this.refresh(); else this.push();
				}, 300);
			});
		} catch (err) {
			console.error(this.name + ": Überwachung von calendar.json konnte nicht gestartet werden: " + err.message);
		}
	},

	writeReport: function (p) {
		if (!p || typeof p !== "object") return;
		const out = {
			at: new Date().toISOString(),
			screen: { width: Number(p.screen && p.screen.width) || 0, height: Number(p.screen && p.screen.height) || 0 },
			overlaps: Array.isArray(p.overlaps) ? p.overlaps.map((x) => String(x).slice(0, 40)).slice(0, 12) : [],
			offscreen: !!p.offscreen,
			dropped: Number(p.dropped) || 0
		};
		try {
			fs.writeFileSync(REPORT_PATH + ".tmp", JSON.stringify(out));
			fs.renameSync(REPORT_PATH + ".tmp", REPORT_PATH);
		} catch (err) {
			console.error(this.name + ": Rückmeldung nicht gespeichert: " + err.message);
		}
	},

	stop: function () {
		if (this.watcher) this.watcher.close();
		clearTimeout(this.timer);
		clearTimeout(this.debounce);
	}
});

