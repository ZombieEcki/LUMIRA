/* MagicMirror²
 * Node Helper: MMM-LumiraNews
 *
 * Liest ~/.lumira/news.json (gepflegt im LUMIRA-Portal, Bildschirm →
 * Nachrichten) per fs.watch und holt die aktiven Feeds im eingestellten
 * Abstand ab – nacheinander, damit der Pi 3 entspannt bleibt. Fällt ein
 * Feed aus, bleibt sein letzter Stand, die anderen laufen weiter.
 * Meldungen (ohne Doppelte, neueste zuerst) zusätzlich in
 * ~/.lumira/news-data.json: schneller Start und Vorschau im Portal.
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const os = require("os");
const rss = require("./rss");
const view = require("./news-view");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const STATE_PATH = path.join(LUMIRA_HOME, "news.json");
const DATA_PATH = path.join(LUMIRA_HOME, "news-data.json");

module.exports = NodeHelper.create({

	watcher: null,
	debounce: null,
	timer: null,
	config: null,
	sources: [],
	cache: {},       // id → { items, updatedAt, error, errorAt }
	busy: false,
	again: false,
	urlKey: "",

	start: function () {
		console.log("Starting node_helper for: " + this.name);
		try {
			const d = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
			Object.keys(d.status || {}).forEach((id) => {
				const st = d.status[id];
				this.cache[id] = { items: (d.items || []).filter((it) => it.src === id), updatedAt: st.updatedAt || null, error: st.error || "", errorAt: st.errorAt || null };
			});
		} catch (err) { /* noch keine Daten */ }
	},

	socketNotificationReceived: function (notification) {
		if (notification !== "LN_INIT") return;
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
		this.sources = list.map(view.cleanSource).filter((s) => s.id && rss.validUrl(s.url));
		const key = JSON.stringify([this.sources.map((s) => [s.id, s.url, s.enabled]), this.config.interval]);
		const changed = key !== this.urlKey;
		this.urlKey = key;
		return changed;
	},

	refresh: async function () {
		if (this.busy) { this.again = true; return; }
		this.busy = true;
		for (const s of this.sources) {
			if (!s.enabled) continue;
			const c = this.cache[s.id] || (this.cache[s.id] = { items: [], updatedAt: null, error: "", errorAt: null });
			try {
				c.items = rss.parse(await rss.fetchFeed(s.url)).items.map((it) => Object.assign(it, { src: s.id }));
				c.updatedAt = new Date().toISOString();
				c.error = "";
				c.errorAt = null;
			} catch (err) {
				c.error = err instanceof rss.NewsError ? err.message : "Feed nicht lesbar";
				c.errorAt = new Date().toISOString();
				console.warn(this.name + ": Feed „" + s.name + "“: " + c.error);
			}
		}
		Object.keys(this.cache).forEach((id) => { if (!this.sources.some((s) => s.id === id)) delete this.cache[id]; });
		this.busy = false;
		this.writeData();
		this.push();
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.refresh(), this.config.interval * 60000);
		if (this.again) { this.again = false; this.refresh(); }
	},

	merged: function () {
		return rss.merge(this.sources.filter((s) => s.enabled).map((s) => ({ src: s.id, items: (this.cache[s.id] && this.cache[s.id].items) || [] })));
	},

	status: function () {
		const st = {};
		this.sources.forEach((s) => {
			const c = this.cache[s.id];
			st[s.id] = { name: s.name, enabled: s.enabled, count: c ? c.items.length : 0, updatedAt: c ? c.updatedAt : null, error: c ? c.error : "", errorAt: c ? c.errorAt : null };
		});
		return st;
	},

	writeData: function () {
		try {
			fs.writeFileSync(DATA_PATH + ".tmp", JSON.stringify({ at: new Date().toISOString(), items: this.merged(), status: this.status() }));
			fs.renameSync(DATA_PATH + ".tmp", DATA_PATH);
		} catch (err) {
			console.error(this.name + ": Meldungen nicht gespeichert: " + err.message);
		}
	},

	push: function () {
		const src = {};
		this.sources.forEach((s) => { src[s.id] = { name: s.name, category: s.category, enabled: s.enabled }; });
		this.sendSocketNotification("LN_STATE", { config: this.config, sources: src, items: this.merged() });
	},

	startWatch: function () {
		try {
			fs.mkdirSync(LUMIRA_HOME, { recursive: true });
			this.watcher = fs.watch(LUMIRA_HOME, (eventType, filename) => {
				if (filename && filename !== "news.json") return;
				clearTimeout(this.debounce);
				this.debounce = setTimeout(() => { if (this.load()) this.refresh(); else this.push(); }, 300);
			});
		} catch (err) {
			console.error(this.name + ": Überwachung von news.json konnte nicht gestartet werden: " + err.message);
		}
	},

	stop: function () {
		if (this.watcher) this.watcher.close();
		clearTimeout(this.timer);
		clearTimeout(this.debounce);
	}
});
