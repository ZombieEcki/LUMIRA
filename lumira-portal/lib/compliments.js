// LUMIRA – compliments.json laden/speichern/validieren.
//
// Die Sprüche von MMM-SmartCompliments (siehe concept/smartcompliments-json.md
// und docs/SPRUECHE.md) liegen in ~/.lumira/compliments.json – getrennt vom
// Verhaltens-Teil in settings.json/config.js. Das Modul lädt die Datei live
// nach (kein Neustart). Inhalt:
//   categories      eigene Listen je Kategorie (leer = eingebaute Sprüche)
//   weekdayMessages, holidayMessages, templates  wie bisher
//   enabled         Kategorie an/aus (Schlüssel aus dem Katalog bzw. eigene)
//   off             einzelne Sprüche aus, je Kategorie
//   own             eigene Kategorien { key, label, icon, items }
//   words           Stichwörter der Kalender-Anlässe
//   display         Position, Größe, Schrift, Symbol
//   behavior        Wechsel, Wiederholung, Rätsel, Anlässe und Reihenfolge
// Welche Kategorien es gibt, steht im Katalog des Moduls (public/spruch/
// catalog.js = modules/MMM-SmartCompliments/catalog.js, Test prüft Gleichheit).
//
// Backup vor jedem Schreiben und atomarer .tmp+rename-Schreibvorgang kommen
// aus dem gemeinsamen lib/store.js (wie bei settings.json/familyplan.json).
"use strict";

const path = require("path");
const settingsLib = require("./settings");
const { createJsonStore } = require("./store");
const Catalog = require("../public/spruch/catalog");
const Logic = require("../public/spruch/logic");

const LUMIRA_HOME = settingsLib.LUMIRA_HOME;
const COMPLIMENTS_PATH = process.env.LUMIRA_COMPLIMENTS_PATH || path.join(LUMIRA_HOME, "compliments.json");
const REPORT_PATH = path.join(path.dirname(COMPLIMENTS_PATH), "compliments-mirror.json");
const BACKUP_DIR = path.join(LUMIRA_HOME, "backups");
const store = createJsonStore({ filePath: COMPLIMENTS_PATH, backupDir: BACKUP_DIR, backupPrefix: "compliments", maxBackups: 15 });

// Größenlimits (verhindert, dass ein verunglücktes Bulk-Paste Speicher/Anzeige sprengt)
const MAX_ENTRIES_PER_CATEGORY = 200;
const MAX_CHARS_PER_ENTRY = 300;
const MAX_OWN = 20;

// Erlaubte Listen: alle Kategorien des Katalogs (keine beliebigen neuen Felder)
const LIST_CATEGORIES = Catalog.CATEGORIES.map((c) => c.list);
const RIDDLE_LISTS = Catalog.CATEGORIES.filter((c) => c.riddle).map((c) => c.list);
const CALENDAR_KEYS = Catalog.CATEGORIES.filter((c) => c.group === "calendar").map((c) => c.key);
const TEMPLATE_KEYS = ["birthdayText", "weddingText"];
const HOLIDAY_RE = /^\d{2}-\d{2}$/;
const OWN_KEY_RE = /^own_[a-z0-9]{4,12}$/;

const DISPLAY_RULES = {
	x: [-3000, 3000, "Abstand waagerecht"], y: [-3000, 3000, "Abstand senkrecht"], width: [0, 3000, "Breite"],
	height: [0, 2000, "Höhe"], fontScale: [50, 250, "Schriftgröße"], padding: [0, 60, "Innenabstand"]
};
const BEHAVIOR_RULES = {
	interval: [10, 600, "Wechsel alle … Sekunden"], remember: [0, 100, "Nicht wiederholen"],
	riddleDelay: [3, 120, "Rätsel-Lösung nach … Sekunden"], share: [0, 100, "Anteil der Anlass-Sprüche"]
};

function emptyShape() {
	const categories = {};
	for (const key of LIST_CATEGORIES) categories[key] = [];
	const weekdayMessages = {};
	for (let d = 0; d <= 6; d++) weekdayMessages[String(d)] = [];
	const s = Logic.cleanSettings(null);
	return {
		version: 2,
		updatedAt: "",
		categories,
		weekdayMessages,
		holidayMessages: {},
		templates: { birthdayText: "", weddingText: "" },
		enabled: s.enabled,
		off: s.off,
		own: s.own,
		words: s.words,
		display: s.display,
		behavior: s.behavior
	};
}

class ValidationError extends Error {
	constructor(field, message) {
		super(message);
		this.name = "ValidationError";
		this.field = field;
	}
}

function isStringArray(v) {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isRiddleArray(v) {
	return Array.isArray(v) && v.every((x) => x && typeof x.q === "string" && typeof x.a === "string");
}

function labelOf(key, own) {
	const c = Catalog.byList(key) || Catalog.byKey(key);
	if (c) return c.label;
	const o = (own || []).find((x) => x.key === key);
	return o ? o.label : key;
}

function load() {
	const base = emptyShape();
	if (!store.exists()) return base;
	try {
		const raw = store.readRaw();
		return mergeKnown(base, raw);
	} catch (err) {
		console.error("[lumira-portal] compliments.json ist beschädigt, nutze Leer-Schema:", err.message);
		return base;
	}
}

// Übernimmt aus raw nur die bekannten Strukturen ins Leer-Schema.
function mergeKnown(base, raw) {
	const out = emptyShape();
	if (!raw || typeof raw !== "object") return out;
	if (raw.categories && typeof raw.categories === "object") {
		for (const key of LIST_CATEGORIES) {
			const list = raw.categories[key];
			if (RIDDLE_LISTS.indexOf(key) !== -1 ? isRiddleArray(list) : isStringArray(list)) out.categories[key] = list.slice();
		}
	}
	if (raw.weekdayMessages && typeof raw.weekdayMessages === "object") {
		for (let d = 0; d <= 6; d++) {
			const k = String(d);
			if (isStringArray(raw.weekdayMessages[k])) out.weekdayMessages[k] = raw.weekdayMessages[k].slice();
		}
	}
	if (raw.holidayMessages && typeof raw.holidayMessages === "object") {
		for (const k of Object.keys(raw.holidayMessages)) {
			if (HOLIDAY_RE.test(k) && isStringArray(raw.holidayMessages[k])) {
				out.holidayMessages[k] = raw.holidayMessages[k].slice();
			}
		}
	}
	if (raw.templates && typeof raw.templates === "object") {
		for (const k of TEMPLATE_KEYS) {
			if (typeof raw.templates[k] === "string") out.templates[k] = raw.templates[k];
		}
	}
	const s = Logic.cleanSettings(raw);
	const known = (k) => !!Catalog.byKey(k) || s.own.some((o) => o.key === k);
	out.own = s.own.slice(0, MAX_OWN);
	Object.keys(s.enabled).forEach((k) => { if (known(k)) out.enabled[k] = s.enabled[k]; });
	Object.keys(s.off).forEach((k) => { if (known(k)) out.off[k] = s.off[k]; });
	Object.keys(s.words).forEach((k) => { if (CALENDAR_KEYS.indexOf(k) !== -1) out.words[k] = s.words[k]; });
	out.display = s.display;
	out.behavior = s.behavior;
	return out;
}

function checkList(field, list, riddle) {
	if (riddle ? !isRiddleArray(list) : !isStringArray(list)) {
		throw new ValidationError(field, riddle ? `${field}: Rätsel brauchen Frage und Lösung` : `${field} muss eine Liste aus Texten sein`);
	}
	if (list.length > MAX_ENTRIES_PER_CATEGORY) {
		throw new ValidationError(field, `${field}: höchstens ${MAX_ENTRIES_PER_CATEGORY} Einträge erlaubt`);
	}
	for (const entry of list) {
		const t = riddle ? entry.q + entry.a : entry;
		if (t.length > MAX_CHARS_PER_ENTRY) {
			throw new ValidationError(field, `${field}: ein Eintrag ist länger als ${MAX_CHARS_PER_ENTRY} Zeichen`);
		}
	}
}

function checkRange(field, v, rule) {
	const n = Number(v);
	if (!Number.isFinite(n) || n < rule[0] || n > rule[1]) throw new ValidationError(field, `${rule[2]}: ${rule[0]} bis ${rule[1]}`);
}

function validate(data, own) {
	own = own || [];
	const known = (k) => !!Catalog.byKey(k) || own.some((o) => o.key === k);
	if (data.categories) {
		for (const key of Object.keys(data.categories)) {
			if (LIST_CATEGORIES.indexOf(key) === -1) {
				throw new ValidationError(`categories.${key}`, `Unbekannte Kategorie "${key}"`);
			}
			checkList(`categories.${key}`, data.categories[key], RIDDLE_LISTS.indexOf(key) !== -1);
		}
	}
	if (data.weekdayMessages) {
		for (const key of Object.keys(data.weekdayMessages)) {
			if (!/^[0-6]$/.test(key)) {
				throw new ValidationError(`weekdayMessages.${key}`, `Wochentag muss 0-6 sein, nicht "${key}"`);
			}
			checkList(`weekdayMessages.${key}`, data.weekdayMessages[key]);
		}
	}
	if (data.holidayMessages) {
		for (const key of Object.keys(data.holidayMessages)) {
			if (!HOLIDAY_RE.test(key)) {
				throw new ValidationError(`holidayMessages.${key}`, `Feiertag-Datum muss MM-TT sein, nicht "${key}"`);
			}
			checkList(`holidayMessages.${key}`, data.holidayMessages[key]);
		}
	}
	if (data.templates) {
		for (const key of Object.keys(data.templates)) {
			if (TEMPLATE_KEYS.indexOf(key) === -1) {
				throw new ValidationError(`templates.${key}`, `Unbekannte Vorlage "${key}"`);
			}
			if (typeof data.templates[key] !== "string" || data.templates[key].length > MAX_CHARS_PER_ENTRY) {
				throw new ValidationError(`templates.${key}`, `${key} muss ein Text bis ${MAX_CHARS_PER_ENTRY} Zeichen sein`);
			}
		}
	}
	if (data.own !== undefined) {
		if (!Array.isArray(data.own)) throw new ValidationError("own", "Eigene Kategorien müssen eine Liste sein");
		if (data.own.length > MAX_OWN) throw new ValidationError("own", `Höchstens ${MAX_OWN} eigene Kategorien`);
		const seen = {};
		data.own.forEach((o, i) => {
			if (!o || !OWN_KEY_RE.test(o.key) || seen[o.key]) throw new ValidationError(`own.${i}`, "Eigene Kategorie: ungültiger Schlüssel");
			seen[o.key] = true;
			if (typeof o.label !== "string" || !o.label.trim() || o.label.length > 40) throw new ValidationError(`own.${i}`, "Eigene Kategorie: Name mit 1 bis 40 Zeichen");
			if (o.icon !== undefined && (typeof o.icon !== "string" || o.icon.length > 8)) throw new ValidationError(`own.${i}`, "Eigene Kategorie: Symbol zu lang");
			checkList(`own.${o.label}`, o.items || []);
		});
	}
	if (data.enabled !== undefined) {
		if (!data.enabled || typeof data.enabled !== "object") throw new ValidationError("enabled", "Ungültige Schalter");
		for (const k of Object.keys(data.enabled)) {
			if (!known(k)) throw new ValidationError(`enabled.${k}`, `Unbekannte Kategorie "${k}"`);
			if (typeof data.enabled[k] !== "boolean") throw new ValidationError(`enabled.${k}`, "Schalter muss an oder aus sein");
		}
	}
	if (data.off !== undefined) {
		if (!data.off || typeof data.off !== "object") throw new ValidationError("off", "Ungültige Auswahl");
		for (const k of Object.keys(data.off)) {
			if (!known(k)) throw new ValidationError(`off.${k}`, `Unbekannte Kategorie "${k}"`);
			checkList(`off.${k}`, data.off[k]);
		}
	}
	if (data.words !== undefined) {
		if (!data.words || typeof data.words !== "object") throw new ValidationError("words", "Ungültige Stichwörter");
		for (const k of Object.keys(data.words)) {
			if (CALENDAR_KEYS.indexOf(k) === -1) throw new ValidationError(`words.${k}`, `Stichwörter gibt es nur für Kalender-Anlässe`);
			if (typeof data.words[k] !== "string" || data.words[k].length > 300) throw new ValidationError(`words.${k}`, "Stichwörter: Text bis 300 Zeichen");
		}
	}
	if (data.display !== undefined) {
		const d = data.display;
		if (!d || typeof d !== "object") throw new ValidationError("display", "Ungültige Darstellung");
		if (d.anchor !== undefined && Logic.ANCHORS.indexOf(d.anchor) === -1) throw new ValidationError("display.anchor", "Unbekannte Position");
		if (d.unit !== undefined && ["px", "pct"].indexOf(d.unit) === -1) throw new ValidationError("display.unit", "Abstände in px oder %");
		if (d.icon !== undefined && Logic.ICON_MODES.indexOf(d.icon) === -1) throw new ValidationError("display.icon", "Symbol: darunter, am Zeilenende oder aus");
		for (const k of Object.keys(DISPLAY_RULES)) if (d[k] !== undefined) checkRange(`display.${k}`, d[k], DISPLAY_RULES[k]);
	}
	if (data.behavior !== undefined) {
		const b = data.behavior;
		if (!b || typeof b !== "object") throw new ValidationError("behavior", "Ungültige Einstellungen");
		for (const k of Object.keys(BEHAVIOR_RULES)) if (b[k] !== undefined) checkRange(`behavior.${k}`, b[k], BEHAVIOR_RULES[k]);
		if (b.order !== undefined) {
			const ok = Array.isArray(b.order) && b.order.length === Logic.GROUP_KEYS.length &&
				Logic.GROUP_KEYS.every((g) => b.order.indexOf(g) !== -1);
			if (!ok) throw new ValidationError("behavior.order", "Reihenfolge der Anlässe unvollständig");
		}
	}
	return true;
}

// Wie früher bei den Stimmungen: mindestens eine allgemeine Kategorie bleibt an
function checkAnyGeneral(data) {
	let moods = {};
	try { moods = (settingsLib.load().compliments || {}).moods || {}; } catch (e) { moods = {}; }
	const legacy = { herzlich: moods.herzlich !== false, motivierend: moods.motivierend !== false, humorvoll: moods.humorvoll !== false };
	if (!Logic.anyGeneralOn(Logic.cleanSettings(data), legacy, { alarm: true }, data.categories)) {
		throw new ValidationError("enabled", "Mindestens eine Kategorie muss an bleiben");
	}
}

function save(data) {
	validate(data, data.own);
	checkAnyGeneral(data);
	return store.write(mergeKnown(null, Object.assign({}, data, { version: 2, updatedAt: new Date().toISOString() })));
}

// Teil-Änderung: Listen und Stichwörter je Kategorie ersetzen, Schalter und
// Darstellung zusammenführen, eigene Kategorien als Ganzes ersetzen.
function patch(partial) {
	partial = partial || {};
	const current = load();
	const own = partial.own !== undefined ? partial.own : current.own;
	validate(partial, own);
	const next = Object.assign({}, current);
	for (const part of ["categories", "weekdayMessages", "holidayMessages", "templates", "off", "words"]) {
		if (partial[part]) next[part] = Object.assign({}, current[part], partial[part]);
	}
	if (partial.enabled) next.enabled = Object.assign({}, current.enabled, partial.enabled);
	if (partial.own !== undefined) {
		next.own = partial.own.map((o) => ({ key: o.key, label: o.label.trim(), icon: o.icon || "", items: (o.items || []).slice() }));
		// Schalter und Aus-Listen gelöschter eigener Kategorien weg
		const keys = next.own.map((o) => o.key);
		for (const part of ["enabled", "off"]) {
			next[part] = Object.assign({}, next[part]);
			Object.keys(next[part]).forEach((k) => { if (/^own_/.test(k) && keys.indexOf(k) === -1) delete next[part][k]; });
		}
	}
	if (partial.display) next.display = Object.assign({}, current.display, partial.display);
	if (partial.behavior) next.behavior = Object.assign({}, current.behavior, partial.behavior);
	return save(next);
}

// Sicherung einspielen: ersetzt alles (gleiche Prüfung wie beim Speichern)
function importAll(data) {
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new ValidationError("import", "Die Datei enthält keine Sprüche-Sicherung");
	const shape = emptyShape();
	const next = {};
	for (const k of Object.keys(shape)) next[k] = data[k] !== undefined ? data[k] : shape[k];
	if (data.categories && typeof data.categories === "object") {
		// unbekannte Listen (z. B. aus einer neueren Version) still übergehen
		next.categories = {};
		Object.keys(data.categories).forEach((k) => { if (LIST_CATEGORIES.indexOf(k) !== -1) next.categories[k] = data.categories[k]; });
	}
	return save(next);
}

// Rückmeldung des Spiegels (MMM-SmartCompliments): aktueller Spruch, Überschneidungen
function report() {
	try {
		const fs = require("fs");
		const r = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
		return {
			at: String(r.at || ""),
			screen: r.screen || null,
			text: String(r.text || ""),
			cat: String(r.cat || ""),
			overlaps: Array.isArray(r.overlaps) ? r.overlaps : [],
			offscreen: !!r.offscreen
		};
	} catch (e) {
		return null;
	}
}

module.exports = {
	COMPLIMENTS_PATH,
	LIST_CATEGORIES,
	load,
	save,
	patch,
	importAll,
	report,
	validate,
	labelOf,
	ValidationError
};
