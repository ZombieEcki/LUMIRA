// LUMIRA – Free-Layout lesen (gemeinsamer Baustein, identisch in allen
// LUMIRA-Modulen, die das Layout beachten – der Test prüft Gleichheit).
//
// ~/.lumira/layout.json schreibt nur das Portal (Bildschirm → Übersicht).
// Im Classic-Modus (Standard), bei fehlender oder kaputter Datei gilt nichts
// davon: Jedes Modul nimmt seine eigenen Einstellungen – so kann ein
// fehlerhaftes Layout den Bildschirm nie unbenutzbar machen.
//
//  read(home)            → Einträge des aktiven Profils { key: item } oder null
//  apply(cfg, item)      → Kopie von cfg mit Position/Größe/Ebene/Sichtbarkeit
//  FILE                  → Dateiname für fs.watch
//
// item: { x, y } in % des Bildschirms (linke obere Ecke), { w, h } in px,
// font in %, z (Ebene 0–20), visible.
"use strict";

const fs = require("fs");
const path = require("path");

const FILE = "layout.json";

function num(v, min, max) {
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

function read(home) {
	try {
		const raw = JSON.parse(fs.readFileSync(path.join(home, FILE), "utf8"));
		if (!raw || raw.mode !== "free" || !Array.isArray(raw.profiles)) return null;
		const p = raw.profiles.find((x) => x && x.id === raw.active);
		return p && p.items && typeof p.items === "object" ? p.items : null;
	} catch (err) {
		return null;
	}
}

// Nur gültige Werte übernehmen; was fehlt oder kaputt ist, bleibt wie im Modul
function apply(cfg, item) {
	if (!cfg || !item || typeof item !== "object") return cfg;
	const x = num(item.x, -50, 150);
	const y = num(item.y, -50, 150);
	if (x === null || y === null) return cfg;
	const out = Object.assign({}, cfg, { anchor: "top_left", unit: "pct", x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
	const w = num(item.w, 40, 4000);
	const h = num(item.h, 30, 4000);
	const f = num(item.font, 30, 400);
	const z = num(item.z, 0, 20);
	if (w !== null && cfg.width !== undefined) out.width = Math.round(w);
	if (h !== null && cfg.height !== undefined) out.height = Math.round(h);
	if (f !== null && cfg.fontScale !== undefined) out.fontScale = Math.round(f);
	out.z = z === null ? 0 : Math.round(z);
	out.hidden = item.visible === false;
	return out;
}

module.exports = { FILE, read, apply };
