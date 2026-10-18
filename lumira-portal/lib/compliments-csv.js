// LUMIRA – Sprüche als CSV: einlesen (Import mit Vorschau) und ausgeben.
//
// Format (Kopfzeile optional, Reihenfolge frei, wenn Kopfzeile vorhanden):
//   Kategorie;Spruch;Lösung;Aktiv
// - Trennzeichen ; , oder Tab (wird erkannt), Felder mit "…" dürfen das
//   Trennzeichen, "" (= ") und Zeilenumbrüche enthalten; \n im Text = neue Zeile
// - Kategorie: Name wie im Portal („Flachwitze“) oder Schlüssel („flachwitze“);
//   unbekannte Namen werden auf Wunsch als eigene Kategorie angelegt
// - Lösung: nur für „Denk mal nach“ (Pflicht dort)
// - Aktiv: leer/ja = an, nein/aus/0 = Spruch ausgeschaltet
// - Zeilen, die mit # beginnen, und leere Zeilen werden übersprungen
// Die Datei wird geprüft wie jede andere Änderung (lib/compliments.js).
"use strict";

const Catalog = require("../public/spruch/spruch-catalog");
const Logic = require("../public/spruch/spruch-logic");

const MAX_CHARS = 300;
const MAX_PER_CATEGORY = 200;
const MAX_OWN = 20;
const OFF_WORDS = ["nein", "n", "aus", "0", "false", "no", "inaktiv"];
const HEADER = { kategorie: "cat", category: "cat", spruch: "text", text: "text", "lösung": "answer", loesung: "answer", antwort: "answer", aktiv: "active", an: "active" };

class CsvError extends Error {}

// Trennzeichen aus der ersten echten Zeile (außerhalb von Anführungszeichen)
function detectDelimiter(text) {
	const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
	const first = lines[0] || "";
	const count = { ";": 0, ",": 0, "\t": 0 };
	let q = false;
	for (const ch of first) {
		if (ch === "\"") q = !q;
		else if (!q && count[ch] !== undefined) count[ch]++;
	}
	const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
	return count[best] ? best : ";";
}

// RFC-4180-artig: [{ line, cells }]
function parseCsv(text) {
	text = String(text || "").replace(/^﻿/, "");
	const d = detectDelimiter(text);
	const rows = [];
	let cells = [];
	let cell = "";
	let q = false;
	let line = 1;
	let start = 1;
	let quoted = false;
	const endCell = () => { cells.push(quoted ? cell : cell.trim()); cell = ""; quoted = false; };
	const endRow = () => { endCell(); rows.push({ line: start, cells }); cells = []; start = line; };
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (q) {
			if (ch === "\"") {
				if (text[i + 1] === "\"") { cell += "\""; i++; } else q = false;
			} else {
				if (ch === "\n") line++;
				cell += ch;
			}
			continue;
		}
		if (ch === "\"" && cell.trim() === "") { q = true; quoted = true; cell = ""; continue; }
		if (ch === d) { endCell(); continue; }
		if (ch === "\r") continue;
		if (ch === "\n") { line++; endRow(); continue; }
		cell += ch;
	}
	if (cell !== "" || cells.length) endRow();
	return { delimiter: d, rows: rows.filter((r) => r.cells.some((c) => c.trim()) && !/^\s*#/.test(r.cells[0] || "")) };
}

function norm(s) {
	return String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
}

// Kategorie zu einem Namen aus der Datei: Schlüssel, Liste, Anzeigename,
// eigene Kategorie, zuletzt Anfang des Namens („Versaut“). Feuerwehr-
// Kategorien außerhalb der Feuerwehr-Ausgabe: { hidden: true }.
function findCategory(name, own, flags) {
	const n = norm(name);
	if (!n) return null;
	const exact = (c) => norm(c.key) === n || norm(c.list) === n || norm(c.label) === n;
	const prefix = (c) => n.length >= 5 && norm(c.label).indexOf(n) === 0;
	const hit = Catalog.CATEGORIES.find(exact);
	const o = (own || []).find((x) => norm(x.label) === n || norm(x.key) === n);
	const found = hit || (o ? null : Catalog.CATEGORIES.find(prefix));
	if (found) return found.need === "alarm" && !(flags && flags.alarm) ? { hidden: true, label: found.label } : found;
	return o ? { key: o.key, list: o.key, label: o.label, own: true, items: o.items } : null;
}

function newKey(used) {
	let k;
	do { k = "own_" + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "a"); } while (used.indexOf(k) !== -1);
	return k;
}

// Plan: was würde der Import ändern? data = aktueller Stand (lib/compliments load()).
// opts: { mode: "add" | "replace", createOwn: true, flags: { alarm } }
// Ergebnis: { next (ganzer neuer Stand), summary[], warnings[], fatal[], rows }
function plan(text, data, opts) {
	opts = opts || {};
	const mode = opts.mode === "replace" ? "replace" : "add";
	const createOwn = opts.createOwn !== false;
	const parsed = parseCsv(text);
	const warnings = [];
	const fatal = [];
	let rows = parsed.rows;
	if (!rows.length) throw new CsvError("Die Datei enthält keine Sprüche.");

	// Spalten: Kopfzeile erkennen, sonst Kategorie;Spruch;Lösung;Aktiv
	let cols = { cat: 0, text: 1, answer: 2, active: 3 };
	const head = rows[0].cells.map((c) => HEADER[c.trim().toLowerCase()]);
	if (head.indexOf("cat") !== -1 && head.indexOf("text") !== -1) {
		cols = {};
		head.forEach((h, i) => { if (h && cols[h] === undefined) cols[h] = i; });
		rows = rows.slice(1);
	}

	const own = (data.own || []).map((o) => ({ key: o.key, label: o.label, icon: o.icon || "", items: o.items.slice() }));
	const created = [];
	const groups = {}; // key → { cat, items: [], off: [] }
	const order = [];
	rows.forEach((r) => {
		const name = (r.cells[cols.cat] || "").trim();
		let text = (r.cells[cols.text] || "").replace(/\\n/g, "\n").replace(/\r/g, "").trim();
		const answer = cols.answer !== undefined ? (r.cells[cols.answer] || "").replace(/\\n/g, "\n").trim() : "";
		const active = cols.active !== undefined ? (r.cells[cols.active] || "").trim().toLowerCase() : "";
		if (!text) { if (name) warnings.push({ line: r.line, message: "kein Spruch – übersprungen" }); return; }
		if (!name) { warnings.push({ line: r.line, message: "keine Kategorie – übersprungen" }); return; }
		let cat = findCategory(name, own, opts.flags);
		if (cat && cat.hidden) { warnings.push({ line: r.line, message: "„" + cat.label + "“ gibt es nur in der Feuerwehr-Ausgabe – übersprungen" }); return; }
		if (!cat) {
			if (!createOwn) { warnings.push({ line: r.line, message: "unbekannte Kategorie „" + name.slice(0, 40) + "“ – übersprungen" }); return; }
			if (own.length >= MAX_OWN) { warnings.push({ line: r.line, message: "höchstens " + MAX_OWN + " eigene Kategorien – „" + name.slice(0, 40) + "“ übersprungen" }); return; }
			const o = { key: newKey(own.map((x) => x.key)), label: name.slice(0, 40), icon: "", items: [] };
			own.push(o);
			created.push(o.label);
			cat = { key: o.key, list: o.key, label: o.label, own: true, items: [] };
		}
		if (cat.riddle && !answer) { warnings.push({ line: r.line, message: "„" + cat.label + "“ braucht eine Lösung – übersprungen" }); return; }
		if ((text + answer).length > MAX_CHARS) { warnings.push({ line: r.line, message: "länger als " + MAX_CHARS + " Zeichen – übersprungen" }); return; }
		if (!groups[cat.key]) { groups[cat.key] = { cat, items: [], off: [] }; order.push(cat.key); }
		const g = groups[cat.key];
		const item = cat.riddle ? { q: text, a: answer } : text;
		if (g.items.some((x) => Logic.itemKey(x) === Logic.itemKey(item))) { warnings.push({ line: r.line, message: "doppelt in der Datei – übersprungen" }); return; }
		g.items.push(item);
		if (OFF_WORDS.indexOf(active) !== -1) g.off.push(Logic.itemKey(item));
	});

	// Neuen Stand zusammenbauen
	const next = JSON.parse(JSON.stringify(data));
	next.own = own;
	next.off = Object.assign({}, data.off || {});
	next.categories = Object.assign({}, data.categories || {});
	const summary = [];
	order.forEach((key) => {
		const g = groups[key];
		const c = g.cat;
		let base;
		if (c.own) base = mode === "replace" ? [] : (own.find((o) => o.key === key).items || []).slice();
		else {
			const custom = next.categories[c.list];
			base = mode === "replace" ? [] : (custom && custom.length ? custom : (Catalog.byKey(key).items || [])).slice();
		}
		const known = base.map(Logic.itemKey);
		let added = 0;
		let dup = 0;
		g.items.forEach((it) => {
			if (known.indexOf(Logic.itemKey(it)) !== -1) { dup++; return; }
			base.push(it);
			known.push(Logic.itemKey(it));
			added++;
		});
		if (base.length > MAX_PER_CATEGORY) fatal.push("„" + c.label + "“: " + base.length + " Sprüche – höchstens " + MAX_PER_CATEGORY + " erlaubt");
		if (c.own) own.find((o) => o.key === key).items = base;
		else next.categories[c.list] = base;
		const offBefore = mode === "replace" ? [] : (next.off[key] || []);
		next.off[key] = offBefore.concat(g.off.filter((k) => offBefore.indexOf(k) === -1)).filter((k) => known.indexOf(k) !== -1);
		summary.push({ key, label: c.label, added, dup, total: base.length, off: g.off.length, created: created.indexOf(c.label) !== -1 && !!c.own });
	});
	if (!order.length) fatal.push("Keine gültige Zeile gefunden.");
	return { next, summary, warnings, fatal, rows: rows.length, delimiter: parsed.delimiter === "\t" ? "Tab" : parsed.delimiter };
}

// Alle wirksamen Sprüche als CSV (Semikolon, UTF-8 mit BOM – Excel-tauglich)
function exportCsv(data, flags) {
	const q = (s) => {
		const t = String(s).replace(/\n/g, "\\n");
		return /[;"\r\n]/.test(t) || t !== t.trim() ? "\"" + t.replace(/"/g, "\"\"") + "\"" : t;
	};
	const s = Logic.cleanSettings(data);
	const lines = ["Kategorie;Spruch;Lösung;Aktiv"];
	Logic.allCategories(s).forEach((c) => {
		if (c.need === "alarm" && !(flags && flags.alarm)) return;
		const custom = data.categories && data.categories[c.list];
		const items = c.own ? c.items : (custom && custom.length ? custom : c.items);
		const off = (s.off && s.off[c.key]) || [];
		items.forEach((it) => {
			const k = Logic.itemKey(it);
			lines.push([q(c.label), q(k), q(typeof it === "string" ? "" : it.a), off.indexOf(k) !== -1 ? "nein" : ""].join(";"));
		});
	});
	return "﻿" + lines.join("\r\n") + "\r\n";
}

module.exports = { parseCsv, findCategory, plan, exportCsv, CsvError };
