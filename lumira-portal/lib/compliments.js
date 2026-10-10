// LUMIRA – compliments.json laden/speichern/validieren.
//
// Die Sprüche-Textbausteine von MMM-SmartCompliments (siehe
// concept/smartcompliments-json.md) liegen in ~/.lumira/compliments.json –
// getrennt vom Verhaltens-Teil (der bleibt in settings.json/config.js).
// Nur was der Kunde tatsächlich anpasst landet hier; leere/fehlende Listen
// bedeuten "eingebauten Standardtext des Moduls behalten".
//
// Backup vor jedem Schreiben und atomarer .tmp+rename-Schreibvorgang kommen
// aus dem gemeinsamen lib/store.js (wie bei settings.json/familyplan.json).
"use strict";

const path = require("path");
const settingsLib = require("./settings");
const { createJsonStore } = require("./store");

const LUMIRA_HOME = settingsLib.LUMIRA_HOME;
const COMPLIMENTS_PATH = process.env.LUMIRA_COMPLIMENTS_PATH || path.join(LUMIRA_HOME, "compliments.json");
const BACKUP_DIR = path.join(LUMIRA_HOME, "backups");
const store = createJsonStore({ filePath: COMPLIMENTS_PATH, backupDir: BACKUP_DIR, backupPrefix: "compliments", maxBackups: 15 });

// Größenlimits (verhindert, dass ein verunglücktes Bulk-Paste Speicher/Anzeige sprengt)
const MAX_ENTRIES_PER_CATEGORY = 200;
const MAX_CHARS_PER_ENTRY = 300;

// Erlaubte flache Listen-Kategorien (Whitelist – keine beliebigen neuen Felder).
const LIST_CATEGORIES = [
	"morningMessages", "forenoonMessages", "afternoonMessages",
	"eveningMessages", "nightMessages",
	"familyMessages", "motivationMessages", "humorMessages",
	"afterDutyMessages"
];
const TEMPLATE_KEYS = ["birthdayText", "weddingText"];
const HOLIDAY_RE = /^\d{2}-\d{2}$/;

function emptyShape() {
	const categories = {};
	for (const key of LIST_CATEGORIES) categories[key] = [];
	const weekdayMessages = {};
	for (let d = 0; d <= 6; d++) weekdayMessages[String(d)] = [];
	return {
		version: 1,
		updatedAt: "",
		categories,
		weekdayMessages,
		holidayMessages: {},
		templates: { birthdayText: "", weddingText: "" }
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
			if (isStringArray(raw.categories[key])) out.categories[key] = raw.categories[key].slice();
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
	return out;
}

function checkList(field, list) {
	if (!isStringArray(list)) {
		throw new ValidationError(field, `${field} muss eine Liste aus Texten sein`);
	}
	if (list.length > MAX_ENTRIES_PER_CATEGORY) {
		throw new ValidationError(field, `${field}: höchstens ${MAX_ENTRIES_PER_CATEGORY} Einträge erlaubt`);
	}
	for (const entry of list) {
		if (entry.length > MAX_CHARS_PER_ENTRY) {
			throw new ValidationError(field, `${field}: ein Eintrag ist länger als ${MAX_CHARS_PER_ENTRY} Zeichen`);
		}
	}
}

function validate(data) {
	if (data.categories) {
		for (const key of Object.keys(data.categories)) {
			if (LIST_CATEGORIES.indexOf(key) === -1) {
				throw new ValidationError(`categories.${key}`, `Unbekannte Kategorie "${key}"`);
			}
			checkList(`categories.${key}`, data.categories[key]);
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
	return true;
}

function save(data) {
	validate(data);
	return store.write(Object.assign({}, data, { updatedAt: new Date().toISOString() }));
}

// Patch pro Kategorie: nur mitgeschickte Kategorien ersetzen, Rest bleibt.
function patch(partial) {
	validate(partial || {});
	const current = load();
	if (partial && partial.categories) {
		for (const key of Object.keys(partial.categories)) {
			current.categories[key] = partial.categories[key].slice();
		}
	}
	if (partial && partial.weekdayMessages) {
		for (const key of Object.keys(partial.weekdayMessages)) {
			current.weekdayMessages[key] = partial.weekdayMessages[key].slice();
		}
	}
	if (partial && partial.holidayMessages) {
		for (const key of Object.keys(partial.holidayMessages)) {
			current.holidayMessages[key] = partial.holidayMessages[key].slice();
		}
	}
	if (partial && partial.templates) {
		for (const key of Object.keys(partial.templates)) {
			current.templates[key] = partial.templates[key];
		}
	}
	return save(current);
}

module.exports = {
	COMPLIMENTS_PATH,
	LIST_CATEGORIES,
	load,
	save,
	patch,
	validate,
	ValidationError
};
