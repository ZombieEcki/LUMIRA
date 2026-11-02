// LUMIRA – Bildschirm-Layout (Bildschirm → Übersicht): Classic oder Free.
//
// ~/.lumira/layout.json enthält NUR das Free-Layout: Modus, Profile mit
// Position/Größe/Ebene/Sichtbarkeit je Modul und die Editor-Einstellungen.
// Die eigenen Einstellungen der Module (clock.json, calendar.json …) werden
// nie angefasst – im Free-Modus legen die Module die Werte des aktiven
// Profils nur beim Anzeigen darüber (modules/*/lumira-layout.js). Classic ist
// damit immer genau der bisherige Stand.
//
// Vor jedem Schreiben ein Backup (~/.lumira/backups/layout.*.json, die
// letzten 30); „Rückgängig“ holt das neueste zurück. Kaputte Datei → Classic.
// Notfall ohne Portal: node lumira-portal/bin/layout-cli.js classic
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createJsonStore } = require("./store");
const { renameRetry } = require("./atomic");

class LayoutError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

// level: full = Position und Größe, position = nur Position, fixed = feste Stelle
const MODULES = [
	{ key: "clock", name: "Uhr", level: "full", page: "uhr" },
	{ key: "calendar", name: "Kalender", level: "full", page: "kalender" },
	{ key: "todo", name: "To-do-Liste", level: "full", page: "todo" },
	{ key: "weather", name: "Wetteranzeige", level: "full", page: "wetter" },
	{ key: "radar", name: "Regenradar", level: "full", page: "wetter" },
	{ key: "warnings", name: "Wetterwarnungen", level: "full", page: "wetter" },
	{ key: "compliments", name: "Sprüche", level: "full", page: "spruche" },
	{ key: "familyPlan", name: "Familienplan", level: "position", page: "familienplan", note: "Größe über „Größe auf dem Bildschirm“ im Familienplan" },
	{ key: "statusHint", name: "Portal-Hinweis", level: "position", page: "module", note: "kleine Zeile, Größe fest" },
	{ key: "news", name: "Nachrichten", level: "fixed", page: "news", note: "immer ganz unten" },
	{ key: "alarm", name: "Alarmierung", level: "fixed", page: "alarm", note: "Vollbild bei Alarm" },
	{ key: "ambient", name: "Dauerschleife", level: "fixed", page: "bildschirm", note: "Vollbild bzw. Hintergrund" },
	{ key: "doorbell", name: "Türklingel", level: "fixed", page: "klingel", note: "Mitte, nur beim Klingeln" }
];
const MOVABLE = MODULES.filter((m) => m.level !== "fixed").map((m) => m.key);
const FULL = MODULES.filter((m) => m.level === "full").map((m) => m.key);

// Ausgangslage, wenn der Bildschirm (noch) keine Positionen gemeldet hat
const FALLBACK = {
	clock: { x: 2, y: 3 }, familyPlan: { x: 2, y: 24 }, compliments: { x: 30, y: 6 }, calendar: { x: 2, y: 62 },
	weather: { x: 76, y: 3 }, radar: { x: 76, y: 42 }, warnings: { x: 76, y: 70 }, todo: { x: 52, y: 40 }, statusHint: { x: 86, y: 92 }
};
const GRIDS = [12, 16, 24, 32, 48];
const MAX_PROFILES = 12;

function defaultsDoc() {
	return {
		mode: "classic",
		active: "p-standard",
		profiles: [{ id: "p-standard", name: "Standard", items: {} }],
		editor: { grid: 24, snap: true, guides: true, showGrid: true }
	};
}

const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

function checkItems(items) {
	if (!items || typeof items !== "object" || Array.isArray(items)) throw new LayoutError("Ungültiges Layout");
	const out = {};
	Object.keys(items).forEach((k) => {
		if (MOVABLE.indexOf(k) === -1) throw new LayoutError("Unbekanntes oder festes Modul „" + String(k).slice(0, 20) + "“");
		const it = items[k];
		if (!it || typeof it !== "object") throw new LayoutError("Ungültige Werte für " + k);
		const x = num(it.x, -50, 150);
		const y = num(it.y, -50, 150);
		if (x === null || y === null) throw new LayoutError("Position außerhalb des erlaubten Bereichs (" + k + ")");
		const o = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(num(it.z, 0, 20) || 0), visible: it.visible !== false };
		if (FULL.indexOf(k) !== -1) {
			const w = num(it.w, 40, 4000);
			const h = num(it.h, 30, 4000);
			const f = num(it.font, 30, 400);
			if (w === null || h === null) throw new LayoutError("Breite/Höhe ungültig (" + k + ")");
			o.w = Math.round(w);
			o.h = Math.round(h);
			if (f !== null) o.font = Math.round(f);
		}
		out[k] = o;
	});
	return out;
}

function createLayout({ home, now = () => new Date() } = {}) {
	home = path.resolve(home);
	const statePath = path.join(home, "layout.json");
	const store = createJsonStore({ filePath: statePath, backupDir: path.join(home, "backups"), backupPrefix: "layout", maxBackups: 30 });

	// Kaputte Datei → wie neu (Classic); sie wird erst beim nächsten Speichern ersetzt, vorher gesichert
	function load() {
		let raw = null;
		try { raw = store.readRaw(); } catch (e) { raw = null; }
		const d = defaultsDoc();
		if (!raw || typeof raw !== "object") return d;
		const profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).filter((p) => p && /^p-[a-z0-9-]{1,30}$/.test(String(p.id))).slice(0, MAX_PROFILES).map((p) => {
			let items = {};
			try { items = checkItems(p.items || {}); } catch (e) { items = {}; }
			return { id: String(p.id), name: String(p.name || "Layout").slice(0, 30), items };
		});
		if (profiles.length) d.profiles = profiles;
		d.active = d.profiles.some((p) => p.id === raw.active) ? raw.active : d.profiles[0].id;
		d.mode = raw.mode === "free" ? "free" : "classic";
		const e = raw.editor || {};
		d.editor = { grid: GRIDS.indexOf(Number(e.grid)) === -1 ? 24 : Number(e.grid), snap: e.snap !== false, guides: e.guides !== false, showGrid: e.showGrid !== false };
		return d;
	}

	function save(d) {
		fs.mkdirSync(home, { recursive: true });
		store.backupExisting();
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(Object.assign({ version: 1, updatedAt: now().toISOString() }, d), null, 2) + "\n");
		renameRetry(tmp, statePath);
		return d;
	}

	function mirror() {
		try {
			const r = JSON.parse(fs.readFileSync(path.join(home, "layout-mirror.json"), "utf8"));
			return { at: String(r.at || ""), screen: r.screen && r.screen.width ? r.screen : null, rects: r.rects && typeof r.rects === "object" ? r.rects : {} };
		} catch (e) { return { at: "", screen: null, rects: {} }; }
	}

	// ctx (vom Server): { active: { key: bool }, current: { key: { w, h, font } } }
	function view(ctx) {
		ctx = ctx || {};
		const d = load();
		return Object.assign({}, d, {
			modules: MODULES.map((m) => Object.assign({}, m, { on: !!(ctx.active && ctx.active[m.key]), current: (ctx.current && ctx.current[m.key]) || null })),
			mirror: mirror(),
			backups: store.listBackups().length,
			grids: GRIDS,
			fallback: FALLBACK
		});
	}

	function find(d, id) {
		const p = d.profiles.find((x) => x.id === id);
		if (!p) throw new LayoutError("Layout nicht gefunden", 404);
		return p;
	}

	// Ausgangspunkt für ein neues Profil: so, wie der Bildschirm gerade aussieht
	function fromCurrent(ctx) {
		const m = mirror();
		const items = {};
		MOVABLE.forEach((k) => {
			if (!(ctx && ctx.active && ctx.active[k])) return;
			const r = m.rects[k];
			const cur = (ctx.current && ctx.current[k]) || {};
			const pos = r ? { x: r.x, y: r.y } : FALLBACK[k] || { x: 5, y: 5 };
			const it = { x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100, z: 0, visible: true };
			if (FULL.indexOf(k) !== -1) {
				it.w = Math.round(cur.w || (r && r.w) || 380);
				it.h = Math.round(cur.h || (r && r.h) || 300);
				if (cur.font) it.font = cur.font;
			}
			items[k] = it;
		});
		return items;
	}

	function addProfile(p, ctx) {
		if (!p || typeof p.name !== "string" || !p.name.trim() || p.name.length > 30) throw new LayoutError("Name 1 bis 30 Zeichen");
		const d = load();
		if (d.profiles.length >= MAX_PROFILES) throw new LayoutError("Höchstens " + MAX_PROFILES + " Layouts");
		const items = p.from && p.from !== "current" ? JSON.parse(JSON.stringify(find(d, p.from).items)) : fromCurrent(ctx);
		const id = "p-" + crypto.randomBytes(4).toString("hex");
		d.profiles.push({ id, name: p.name.trim(), items });
		save(d);
		return id;
	}

	function updateProfile(id, p) {
		if (!p || typeof p !== "object") throw new LayoutError("Ungültiges Layout");
		const d = load();
		const prof = find(d, id);
		if (p.name !== undefined) {
			if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 30) throw new LayoutError("Name 1 bis 30 Zeichen");
			prof.name = p.name.trim();
		}
		if (p.items !== undefined) prof.items = checkItems(p.items);
		save(d);
	}

	function removeProfile(id) {
		const d = load();
		find(d, id);
		if (d.profiles.length === 1) throw new LayoutError("Das letzte Layout kann nicht gelöscht werden");
		d.profiles = d.profiles.filter((p) => p.id !== id);
		if (d.active === id) d.active = d.profiles[0].id;
		save(d);
	}

	function setMode(mode, activeId) {
		if (["classic", "free"].indexOf(mode) === -1) throw new LayoutError("Modus Classic oder Free");
		const d = load();
		if (activeId !== undefined) { find(d, activeId); d.active = activeId; }
		d.mode = mode;
		save(d);
	}

	function setEditor(e) {
		if (!e || typeof e !== "object") throw new LayoutError("Ungültige Einstellungen");
		if (e.grid !== undefined && GRIDS.indexOf(Number(e.grid)) === -1) throw new LayoutError("Raster: " + GRIDS.join(", ") + " Spalten");
		["snap", "guides", "showGrid"].forEach((k) => { if (e[k] !== undefined && typeof e[k] !== "boolean") throw new LayoutError("Ungültiger Schalter"); });
		const d = load();
		d.editor = Object.assign({}, d.editor, e, e.grid !== undefined ? { grid: Number(e.grid) } : {});
		save(d);
	}

	// Letzte Speicherung zurücknehmen: neuestes Backup zurück, ohne neues Backup
	function undo() {
		const list = store.listBackups();
		if (!list.length) throw new LayoutError("Nichts zum Rückgängigmachen", 409);
		const name = list[list.length - 1];
		const raw = store.readBackup(name);
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(raw, null, 2) + "\n");
		renameRetry(tmp, statePath);
		fs.unlinkSync(path.join(home, "backups", name));
	}

	return { load, view, addProfile, updateProfile, removeProfile, setMode, setEditor, undo, fromCurrent, statePath };
}

module.exports = { createLayout, LayoutError, checkItems, MODULES, MOVABLE };
