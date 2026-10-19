// LUMIRA – Kalender (Bildschirm → Kalender), Modul MMM-LumiraCalendar.
//
// ~/.lumira/calendar.json: Darstellung und die Kalenderquellen MIT ihren
// geheimen Links. Nur das Portal schreibt (atomar, Rechte 600), der
// node_helper liest per fs.watch – Änderungen wirken ohne Neustart. Ans
// Portal im Browser gehen die Links nie zurück, nur der Rechnername
// („p52-caldav.icloud.com/…“); geändert wird ein Link durch Neueingabe.
//
// Lesen der Abos teilt sich das Portal mit dem Modul: lib/calendar-ics.js
// ist eine Kopie von modules/MMM-LumiraCalendar/ics.js, die Darstellung
// public/calendar-view.js – der Test prüft beides auf Gleichheit.
//
// Vorschau-Termine: bevorzugt, was der Bildschirm gerade zeigt
// (calendar-data.json, ohne Links), sonst ein eigener Abruf (10 Minuten
// zwischengespeichert). Ein/aus bleibt settings.modules.calendar (Neustart).
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { renameRetry } = require("./atomic");
const ics = require("./calendar-ics");
const view = require("../public/calendar-view");

class CalendarError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

const MAX_SOURCES = 20;
const MIRROR_DATA_MAX_AGE = 30 * 60000;
const FETCH_CACHE_MS = 10 * 60000;

const LIMITS = {
	range: [1, 62, "Zeitraum (Tage)"], max: [1, 100, "Höchstens angezeigte Termine"],
	x: [-3000, 3000, "Abstand waagerecht"], y: [-3000, 3000, "Abstand senkrecht"],
	width: [200, 1600, "Breite"], height: [100, 1600, "Höhe"], fontScale: [40, 300, "Schriftgröße"],
	gap: [0, 40, "Abstand zwischen Terminen"], padding: [0, 60, "Innenabstand"], opacity: [0, 100, "Deckkraft"], line: [0, 4, "Linienstärke"]
};
const BOOLS = ["more", "past", "allDay", "time", "endTime", "location", "wrap", "glass"];
const IDS = view.DESIGNS.map((d) => d.id);

function checkPatch(p) {
	if (!p || typeof p !== "object" || Array.isArray(p)) throw new CalendarError("Ungültige Einstellungen");
	if (p.design !== undefined && IDS.indexOf(p.design) === -1) throw new CalendarError("Kalender: unbekanntes Design");
	if (p.anchor !== undefined && p.anchor !== "auto" && view.ANCHORS.indexOf(p.anchor) === -1) throw new CalendarError("Kalender: unbekannte Position");
	if (p.unit !== undefined && ["px", "pct"].indexOf(p.unit) === -1) throw new CalendarError("Kalender: Abstände in px oder %");
	if (p.mark !== undefined && view.MARKS.indexOf(p.mark) === -1) throw new CalendarError("Kalender: Kennzeichnung Farbe, Symbol, beides oder keine");
	if (p.interval !== undefined && view.INTERVALS.indexOf(Number(p.interval)) === -1) throw new CalendarError("Kalender: Abruf alle 5, 10, 15, 30 oder 60 Minuten");
	if (p.title !== undefined && (typeof p.title !== "string" || p.title.length > 40)) throw new CalendarError("Kalender: Überschrift höchstens 40 Zeichen");
	for (const k of BOOLS) if (p[k] !== undefined && typeof p[k] !== "boolean") throw new CalendarError("Kalender: ungültiger Schalter „" + k + "“");
	for (const k of Object.keys(LIMITS)) {
		if (p[k] === undefined) continue;
		const n = Number(p[k]);
		const [min, max, label] = LIMITS[k];
		if (p[k] === "" || p[k] === null || !Number.isFinite(n) || n < min || n > max) throw new CalendarError(`Kalender: ${label} ${min} bis ${max}`);
	}
	if (p.sources !== undefined) throw new CalendarError("Kalender: Quellen bitte einzeln bearbeiten");
}

function checkSource(p, isNew) {
	if (!p || typeof p !== "object") throw new CalendarError("Ungültige Kalenderquelle");
	if (p.name !== undefined && (typeof p.name !== "string" || !p.name.trim() || p.name.length > 40)) throw new CalendarError("Name 1 bis 40 Zeichen");
	if (isNew || (p.url !== undefined && p.url !== "")) {
		if (typeof p.url !== "string" || !ics.validUrl(p.url)) throw new CalendarError("Bitte einen Kalender-Link (https:// oder webcal://) eintragen");
		if (p.url.length > 2000) throw new CalendarError("Kalender-Link zu lang");
	}
	if (p.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(p.color))) throw new CalendarError("Farbe als #RRGGBB");
	if (p.icon !== undefined && !view.ICONS.some((i) => i[0] === p.icon)) throw new CalendarError("Unbekanntes Symbol");
	for (const k of ["enabled", "showTitle", "showLocation", "showTime"]) if (p[k] !== undefined && typeof p[k] !== "boolean") throw new CalendarError("Ungültiger Schalter „" + k + "“");
}

function createCalendar({ home, now = () => new Date(), fetchImpl } = {}) {
	home = path.resolve(home);
	const statePath = path.join(home, "calendar.json");
	const dataPath = path.join(home, "calendar-data.json");
	const reportPath = path.join(home, "calendar-mirror.json");
	let cache = null; // { key, at, events, status }

	function readRaw() {
		try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) { return null; }
	}

	function load() {
		const raw = readRaw();
		const list = raw && Array.isArray(raw.sources) ? raw.sources : [];
		return {
			config: view.clean(raw),
			sources: list.map((s, i) => Object.assign(view.cleanSource(s, i), { url: s && typeof s.url === "string" ? s.url.trim() : "" })).filter((s) => s.id),
			legacyMigrated: !!(raw && raw.legacyMigrated)
		};
	}

	function save(st) {
		fs.mkdirSync(home, { recursive: true });
		const out = Object.assign({ version: 1, updatedAt: now().toISOString() }, st.config, { sources: st.sources }, st.legacyMigrated ? { legacyMigrated: true } : {});
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(out, null, 2), { mode: 0o600 });
		try { fs.chmodSync(tmp, 0o600); } catch (e) { /* Windows */ }
		renameRetry(tmp, statePath);
		cache = null;
	}

	function readJson(p) {
		try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
	}

	function report() {
		const r = readJson(reportPath);
		if (!r) return null;
		return { at: String(r.at || ""), screen: r.screen || null, overlaps: Array.isArray(r.overlaps) ? r.overlaps.map(String) : [], offscreen: !!r.offscreen, dropped: Number(r.dropped) || 0 };
	}

	function publicSource(s) {
		const out = Object.assign({}, s, { host: s.url ? ics.maskUrl(s.url) : "", hasUrl: !!s.url });
		delete out.url;
		return out;
	}

	function current() {
		const st = load();
		const data = readJson(dataPath);
		return Object.assign({}, st.config, {
			sources: st.sources.map(publicSource),
			status: (data && data.status) || {},
			statusAt: (data && data.at) || null,
			report: report(),
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

	function addSource(p) {
		checkSource(p, true);
		const st = load();
		if (st.sources.length >= MAX_SOURCES) throw new CalendarError("Höchstens " + MAX_SOURCES + " Kalender");
		const id = crypto.randomBytes(5).toString("hex");
		const s = Object.assign(view.cleanSource(Object.assign({}, p, { id }), st.sources.length), { url: p.url.trim() });
		st.sources.push(s);
		save(st);
		return current();
	}

	function updateSource(id, p) {
		checkSource(p, false);
		const st = load();
		const i = st.sources.findIndex((s) => s.id === id);
		if (i === -1) throw new CalendarError("Kalender nicht gefunden", 404);
		const cur = st.sources[i];
		const next = Object.assign({}, cur, p, { id });
		delete next.url;
		st.sources[i] = Object.assign(view.cleanSource(next, i), { url: p.url ? p.url.trim() : cur.url });
		save(st);
		return current();
	}

	function removeSource(id) {
		const st = load();
		const n = st.sources.length;
		st.sources = st.sources.filter((s) => s.id !== id);
		if (st.sources.length === n) throw new CalendarError("Kalender nicht gefunden", 404);
		save(st);
		return current();
	}

	// Reihenfolge (wichtig für Doppelte: der obere Kalender gewinnt)
	function orderSources(ids) {
		if (!Array.isArray(ids)) throw new CalendarError("Ungültige Reihenfolge");
		const st = load();
		const byId = {};
		st.sources.forEach((s) => { byId[s.id] = s; });
		const ordered = ids.map((id) => byId[id]).filter(Boolean);
		st.sources.forEach((s) => { if (ordered.indexOf(s) === -1) ordered.push(s); });
		st.sources = ordered;
		save(st);
		return current();
	}

	function windowOf(t) {
		const d = new Date(t);
		const first = new Date(d.getFullYear(), d.getMonth(), 1);
		const from = new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7)).getTime();
		return { from, to: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 63).getTime() };
	}

	async function readSource(url) {
		const text = await ics.fetchIcs(url, { fetchImpl });
		const parsed = ics.parse(text);
		const win = windowOf(now().getTime());
		return { name: parsed.name, events: ics.expand(parsed.events, win.from, win.to, { max: 1500 }) };
	}

	// „Testen“: eine gespeicherte Quelle (id) oder ein neu eingegebener Link
	async function test(p) {
		let url = p && p.url;
		if (p && p.id) {
			const s = load().sources.find((x) => x.id === p.id);
			if (!s) throw new CalendarError("Kalender nicht gefunden", 404);
			url = url || s.url;
		}
		if (!url || !ics.validUrl(url)) throw new CalendarError("Bitte einen Kalender-Link (https:// oder webcal://) eintragen");
		try {
			const r = await readSource(url);
			const t = now().getTime();
			const next = r.events.filter((e) => e.end > t).slice(0, 3).map((e) => ({ title: e.title, start: e.start, allDay: e.allDay }));
			return { ok: true, name: r.name, count: r.events.length, next, host: ics.maskUrl(url) };
		} catch (err) {
			return { ok: false, error: err instanceof ics.IcsError ? err.message : "Kalender nicht lesbar", host: ics.maskUrl(url) };
		}
	}

	// Termine für die Vorschau im Portal
	async function events() {
		const st = load();
		const active = st.sources.filter((s) => s.enabled && s.url);
		const data = readJson(dataPath);
		const t = now().getTime();
		if (data && data.at && t - Date.parse(data.at) < MIRROR_DATA_MAX_AGE &&
			active.every((s) => data.status && data.status[s.id] && data.status[s.id].updatedAt)) {
			return { events: data.events || [], status: data.status || {}, updatedAt: data.at, source: "mirror" };
		}
		const key = JSON.stringify(active.map((s) => [s.id, s.url]));
		if (cache && cache.key === key && t - cache.at < FETCH_CACHE_MS) return { events: cache.events, status: cache.status, updatedAt: new Date(cache.at).toISOString(), source: "portal" };
		const all = [];
		const status = {};
		const seen = {};
		for (const s of active) {
			try {
				const r = await readSource(s.url);
				r.events.forEach((e) => {
					const k = [e.title, e.start, e.end, e.allDay].join("|");
					if (seen[k]) return;
					seen[k] = true;
					all.push(Object.assign(e, { src: s.id }));
				});
				status[s.id] = { name: s.name, enabled: true, hasUrl: true, count: r.events.length, updatedAt: new Date(t).toISOString(), error: "" };
			} catch (err) {
				status[s.id] = { name: s.name, enabled: true, hasUrl: true, count: 0, updatedAt: null, error: err instanceof ics.IcsError ? err.message : "Kalender nicht lesbar" };
			}
		}
		all.sort((a, b) => a.start - b.start || (b.allDay - a.allDay) || a.title.localeCompare(b.title));
		cache = { key, at: t, events: all, status };
		return { events: all, status, updatedAt: new Date(t).toISOString(), source: "portal" };
	}

	// Einmalig: die bis zu 3 Links des alten Kalendermoduls übernehmen
	function migrateLegacy(settings, opts) {
		const st = load();
		if (st.legacyMigrated || fs.existsSync(statePath)) {
			if (!st.legacyMigrated) { st.legacyMigrated = true; save(st); }
			return false;
		}
		const urls = ((settings && settings.calendar && settings.calendar.urls) || []).filter((u) => ics.validUrl(u));
		const hasFamily = !!(opts && opts.hasFamily);
		st.sources = urls.slice(0, MAX_SOURCES).map((u, i) => Object.assign(view.cleanSource({
			id: crypto.randomBytes(5).toString("hex"),
			name: urls.length === 1 ? (hasFamily ? "Familienkalender" : "Kalender") : "Kalender " + (i + 1),
			icon: hasFamily ? "users" : "calendar-days"
		}, i), { url: String(u).trim() }));
		// wie bisher: Liste mit Überschrift, unten links
		st.config = view.clean({ design: "agenda", title: hasFamily ? "Familienkalender" : "Kalender", max: 5 });
		st.legacyMigrated = true;
		save(st);
		return urls.length > 0;
	}

	return { load, view: current, setConfig, addSource, updateSource, removeSource, orderSources, test, events, migrateLegacy, statePath };
}

module.exports = { createCalendar, CalendarError, checkPatch };
