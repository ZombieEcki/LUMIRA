// LUMIRA – Nachrichten (Bildschirm → Nachrichten), Modul MMM-LumiraNews.
//
// ~/.lumira/news.json: Darstellung und die Liste der Feeds (vordefinierte
// mit preset-ID und eigene) in ihrer Reihenfolge. Nur das Portal schreibt
// (atomar), der node_helper liest per fs.watch – wirkt ohne Neustart.
// Ein/aus bleibt settings.modules.news (Neustart).
//
// Feeds lesen teilt sich das Portal mit dem Modul: lib/news-rss.js ist eine
// Kopie von modules/MMM-LumiraNews/rss.js, die Darstellung public/news-view.js
// – der Test prüft beides auf Gleichheit.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { renameRetry } = require("./atomic");
const rss = require("./news-rss");
const view = require("../public/news-view");

class NewsError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

const MAX_SOURCES = 30;
const MIRROR_DATA_MAX_AGE = 30 * 60000;
const FETCH_CACHE_MS = 10 * 60000;
const LIMITS = {
	hours: [1, 720, "Zeitraum (Stunden)"], rotate: [4, 120, "Wechsel (Sekunden)"], cards: [1, 6, "Anzahl Karten"],
	fontScale: [60, 200, "Schriftgröße"], opacity: [0, 100, "Deckkraft"]
};
const BOOLS = ["source", "age", "images", "label"];

function checkPatch(p) {
	if (!p || typeof p !== "object" || Array.isArray(p)) throw new NewsError("Ungültige Einstellungen");
	if (p.variant !== undefined && view.VARIANTS.indexOf(p.variant) === -1) throw new NewsError("Nachrichten: Variante kompakt oder Karten");
	if (p.interval !== undefined && view.INTERVALS.indexOf(Number(p.interval)) === -1) throw new NewsError("Nachrichten: Abruf alle 5, 10, 15, 30 oder 60 Minuten");
	for (const k of BOOLS) if (p[k] !== undefined && typeof p[k] !== "boolean") throw new NewsError("Nachrichten: ungültiger Schalter „" + k + "“");
	for (const k of Object.keys(LIMITS)) {
		if (p[k] === undefined) continue;
		const n = Number(p[k]);
		const [min, max, label] = LIMITS[k];
		if (p[k] === "" || p[k] === null || !Number.isFinite(n) || n < min || n > max) throw new NewsError(`Nachrichten: ${label} ${min} bis ${max}`);
	}
	if (p.sources !== undefined) throw new NewsError("Nachrichten: Feeds bitte einzeln bearbeiten");
}

function checkSource(p, isNew) {
	if (!p || typeof p !== "object") throw new NewsError("Ungültiger Feed");
	if (p.name !== undefined && (typeof p.name !== "string" || !p.name.trim() || p.name.length > 40)) throw new NewsError("Name 1 bis 40 Zeichen");
	if (isNew || p.url !== undefined) {
		if (typeof p.url !== "string" || !rss.validUrl(p.url) || p.url.length > 2000) throw new NewsError("Bitte eine Feed-Adresse (https://…) eintragen");
	}
	if (p.category !== undefined && (typeof p.category !== "string" || !p.category.trim() || p.category.length > 24)) throw new NewsError("Kategorie 1 bis 24 Zeichen");
	if (p.enabled !== undefined && typeof p.enabled !== "boolean") throw new NewsError("Ungültiger Schalter");
}

function createNews({ home, now = () => new Date(), fetchImpl } = {}) {
	home = path.resolve(home);
	const statePath = path.join(home, "news.json");
	const dataPath = path.join(home, "news-data.json");
	let cache = null;

	function readJson(p) {
		try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
	}

	function load() {
		const raw = readJson(statePath);
		const list = raw && Array.isArray(raw.sources) ? raw.sources : [];
		return { config: view.clean(raw), sources: list.map(view.cleanSource).filter((s) => s.id), legacyMigrated: !!(raw && raw.legacyMigrated) };
	}

	function save(st) {
		fs.mkdirSync(home, { recursive: true });
		const out = Object.assign({ version: 1, updatedAt: now().toISOString() }, st.config, { sources: st.sources }, st.legacyMigrated ? { legacyMigrated: true } : {});
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
		renameRetry(tmp, statePath);
		cache = null;
	}

	function current() {
		const st = load();
		const data = readJson(dataPath);
		return Object.assign({}, st.config, {
			sources: st.sources,
			presets: rss.PRESETS,
			categories: rss.CATEGORIES,
			status: (data && data.status) || {},
			statusAt: (data && data.at) || null,
			defaults: view.DEFAULTS
		});
	}

	function setConfig(patch) {
		checkPatch(patch);
		const st = load();
		st.config = view.clean(Object.assign({}, st.config, patch));
		save(st);
		return current();
	}

	function fromPreset(p) {
		return view.cleanSource({ id: p.id, preset: p.id, name: p.name, category: p.category, url: p.url });
	}

	// Vordefinierten Feed an-/abwählen
	function setPreset(id, on) {
		const p = rss.PRESETS.find((x) => x.id === id);
		if (!p) throw new NewsError("Unbekannter Feed", 404);
		const st = load();
		const has = st.sources.some((s) => s.preset === id);
		if (on && !has) {
			if (st.sources.length >= MAX_SOURCES) throw new NewsError("Höchstens " + MAX_SOURCES + " Feeds");
			st.sources.push(fromPreset(p));
		}
		if (!on) st.sources = st.sources.filter((s) => s.preset !== id);
		save(st);
		return current();
	}

	function addSource(p) {
		checkSource(p, true);
		const st = load();
		if (st.sources.length >= MAX_SOURCES) throw new NewsError("Höchstens " + MAX_SOURCES + " Feeds");
		st.sources.push(view.cleanSource({ id: "own-" + crypto.randomBytes(4).toString("hex"), name: p.name, category: p.category || "Eigene", url: p.url.trim(), enabled: p.enabled }));
		save(st);
		return current();
	}

	function updateSource(id, p) {
		checkSource(p, false);
		const st = load();
		const i = st.sources.findIndex((s) => s.id === id);
		if (i === -1) throw new NewsError("Feed nicht gefunden", 404);
		const cur = st.sources[i];
		// bei vordefinierten bleibt die geprüfte Adresse
		const next = Object.assign({}, cur, p, { id, preset: cur.preset });
		if (cur.preset) next.url = cur.url;
		st.sources[i] = view.cleanSource(next);
		save(st);
		return current();
	}

	function removeSource(id) {
		const st = load();
		const n = st.sources.length;
		st.sources = st.sources.filter((s) => s.id !== id);
		if (st.sources.length === n) throw new NewsError("Feed nicht gefunden", 404);
		save(st);
		return current();
	}

	function orderSources(ids) {
		if (!Array.isArray(ids)) throw new NewsError("Ungültige Reihenfolge");
		const st = load();
		const byId = {};
		st.sources.forEach((s) => { byId[s.id] = s; });
		const ordered = ids.map((id) => byId[id]).filter(Boolean);
		st.sources.forEach((s) => { if (ordered.indexOf(s) === -1) ordered.push(s); });
		st.sources = ordered;
		save(st);
		return current();
	}

	// „Testen“: Feed abrufen, Meldungen zählen, die neuesten drei zeigen
	async function test(p) {
		let url = p && p.url;
		if (p && p.id && !url) {
			const s = load().sources.find((x) => x.id === p.id);
			if (!s) throw new NewsError("Feed nicht gefunden", 404);
			url = s.url;
		}
		if (!url || !rss.validUrl(url)) throw new NewsError("Bitte eine Feed-Adresse (https://…) eintragen");
		try {
			const f = rss.parse(await rss.fetchFeed(url, { fetchImpl }));
			const dated = f.items.filter((it) => it.date);
			return {
				ok: true, title: f.title, count: f.items.length, undated: f.items.length - dated.length,
				images: f.items.filter((it) => it.image).length,
				newest: rss.merge([{ src: "t", items: dated }]).slice(0, 3).map((it) => ({ title: it.title, date: it.date }))
			};
		} catch (err) {
			return { ok: false, error: err instanceof rss.NewsError ? err.message : "Feed nicht lesbar" };
		}
	}

	// Meldungen für die Vorschau im Portal
	async function items() {
		const st = load();
		const active = st.sources.filter((s) => s.enabled && rss.validUrl(s.url));
		const data = readJson(dataPath);
		const t = now().getTime();
		if (data && data.at && t - Date.parse(data.at) < MIRROR_DATA_MAX_AGE && active.every((s) => data.status && data.status[s.id] && data.status[s.id].updatedAt)) {
			return { items: data.items || [], status: data.status || {}, updatedAt: data.at, source: "mirror" };
		}
		const key = JSON.stringify(active.map((s) => [s.id, s.url]));
		if (cache && cache.key === key && t - cache.at < FETCH_CACHE_MS) return { items: cache.items, status: cache.status, updatedAt: new Date(cache.at).toISOString(), source: "portal" };
		const lists = [];
		const status = {};
		for (const s of active) {
			try {
				const f = rss.parse(await rss.fetchFeed(s.url, { fetchImpl }));
				lists.push({ src: s.id, items: f.items });
				status[s.id] = { name: s.name, enabled: true, count: f.items.length, updatedAt: new Date(t).toISOString(), error: "" };
			} catch (err) {
				status[s.id] = { name: s.name, enabled: true, count: 0, updatedAt: null, error: err instanceof rss.NewsError ? err.message : "Feed nicht lesbar" };
			}
		}
		const all = rss.merge(lists);
		cache = { key, at: t, items: all, status };
		return { items: all, status, updatedAt: new Date(t).toISOString(), source: "portal" };
	}

	// Einmalig: bisherigen Feed (settings.news) übernehmen; ohne alten Feed die Tagesschau
	function migrateLegacy(settings) {
		const st = load();
		if (st.legacyMigrated || fs.existsSync(statePath)) {
			if (!st.legacyMigrated) { st.legacyMigrated = true; save(st); }
			return false;
		}
		const old = (settings && settings.news) || {};
		const url = rss.validUrl(old.url) ? String(old.url).trim() : "";
		const preset = rss.PRESETS.find((p) => p.url === url) || (url ? null : rss.PRESETS.find((p) => p.id === "tagesschau"));
		st.sources = [preset ? fromPreset(preset) : view.cleanSource({ id: "own-" + crypto.randomBytes(4).toString("hex"), name: String(old.title || "Nachrichten").slice(0, 40), category: "Eigene", url })];
		st.config = view.clean({});
		st.legacyMigrated = true;
		save(st);
		return !!url;
	}

	return { load, view: current, setConfig, setPreset, addSource, updateSource, removeSource, orderSources, test, items, migrateLegacy, statePath };
}

module.exports = { createNews, NewsError, checkPatch };
