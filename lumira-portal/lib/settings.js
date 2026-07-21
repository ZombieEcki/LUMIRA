// LUMIRA – settings.json laden/speichern/validieren.
//
// settings.json ist die einzige Wahrheit (siehe concept/selfservice.md
// Abschnitt 7). Liegt standardmäßig unter ~/.lumira/settings.json, damit sie
// unabhängig vom MagicMirror-Ordner (~/MagicMirror) existiert und bei einem
// MagicMirror-Reinstall erhalten bleibt.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { isValidEdition, DEFAULT_EDITION } = require("./editions");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const SETTINGS_PATH = process.env.LUMIRA_SETTINGS_PATH || path.join(LUMIRA_HOME, "settings.json");
const BACKUP_DIR = path.join(LUMIRA_HOME, "backups");
// Muss INNERHALB von lumira-portal/ liegen (nicht im Repo-Root): install.sh
// kopiert nur den lumira-portal/-Unterordner auf den Pi (nach ~/lumira-portal),
// "../.." vom Repo-Root aus würde dort ins Leere zeigen (siehe CHECKLIST.md-
// Vorfall: lumira-portal.service ENOENT auf .../home/<user>/settings.default.json).
const DEFAULTS_PATH = path.join(__dirname, "..", "settings.default.json");
const MAX_BACKUPS = 15;

function readDefaults() {
	return JSON.parse(fs.readFileSync(DEFAULTS_PATH, "utf8"));
}

function isPlainObject(v) {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Deep-Merge von "patch" in "base", nur für bereits im Default-Schema
// bekannte Schlüssel (verhindert, dass fremde/unerwartete Felder aus der
// API in settings.json landen).
function mergeKnown(base, patch) {
	const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
	if (!isPlainObject(patch)) return out;
	for (const key of Object.keys(patch)) {
		if (!Object.prototype.hasOwnProperty.call(base, key)) continue; // unbekanntes Feld ignorieren
		const baseVal = base[key];
		const patchVal = patch[key];
		if (isPlainObject(baseVal) && isPlainObject(patchVal)) {
			out[key] = mergeKnown(baseVal, patchVal);
		} else {
			out[key] = patchVal;
		}
	}
	return out;
}

function ensureHome() {
	fs.mkdirSync(LUMIRA_HOME, { recursive: true });
	fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function load() {
	const defaults = readDefaults();
	if (!fs.existsSync(SETTINGS_PATH)) return defaults;
	try {
		const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
		return mergeKnown(defaults, raw);
	} catch (err) {
		console.error("[lumira-portal] settings.json ist beschädigt, nutze Defaults:", err.message);
		return defaults;
	}
}

class ValidationError extends Error {
	constructor(field, message) {
		super(message);
		this.name = "ValidationError";
		this.field = field;
	}
}

function isValidUrlOrEmpty(v) {
	if (v === "" || v === undefined || v === null) return true;
	try {
		const u = new URL(v);
		return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "webcal:";
	} catch (err) {
		return false;
	}
}

// RFC1123-Label: 1-63 Zeichen, a-z 0-9 und Bindestrich, nicht mit
// Bindestrich beginnend/endend.
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

function validate(settings) {
	if (!isValidEdition(settings.edition)) {
		throw new ValidationError("edition", `Unbekannte Edition "${settings.edition}"`);
	}
	if (typeof settings.hostname !== "string" || !HOSTNAME_RE.test(settings.hostname)) {
		throw new ValidationError("hostname", "Hostname darf nur a-z, 0-9 und Bindestrich enthalten (nicht am Rand)");
	}
	const lat = Number(settings.location && settings.location.lat);
	const lon = Number(settings.location && settings.location.lon);
	if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
		throw new ValidationError("location.lat", "Breitengrad muss zwischen -90 und 90 liegen");
	}
	if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
		throw new ValidationError("location.lon", "Längengrad muss zwischen -180 und 180 liegen");
	}
	if (!settings.calendar || !Array.isArray(settings.calendar.urls)) {
		throw new ValidationError("calendar.urls", "urls muss eine Liste sein");
	}
	if (settings.calendar.urls.length > 3) {
		throw new ValidationError("calendar.urls", "Höchstens 3 Kalender-URLs erlaubt");
	}
	for (const u of settings.calendar.urls) {
		if (typeof u !== "string" || !u || !isValidUrlOrEmpty(u)) {
			throw new ValidationError("calendar.urls", `Kalender-URL ungültig: "${u}"`);
		}
	}
	if (!isValidUrlOrEmpty(settings.news && settings.news.url)) {
		throw new ValidationError("news.url", "News-URL ist ungültig");
	}
	if (!isValidUrlOrEmpty(settings.alarm && settings.alarm.haWebhookUrl)) {
		throw new ValidationError("alarm.haWebhookUrl", "Home-Assistant-Webhook-URL ist ungültig");
	}
	const durations = ["alarmDuration", "infoDuration", "returnDuration"];
	for (const key of durations) {
		const v = Number(settings.alarm && settings.alarm[key]);
		if (!Number.isFinite(v) || v < 0 || v > 1440) {
			throw new ValidationError(`alarm.${key}`, `${key} muss zwischen 0 und 1440 (Minuten) liegen`);
		}
	}
	if (settings.family && !Array.isArray(settings.family.birthdays)) {
		throw new ValidationError("family.birthdays", "birthdays muss eine Liste sein");
	}
	if (settings.compliments && settings.compliments.moods) {
		const m = settings.compliments.moods;
		if (!m.herzlich && !m.motivierend && !m.humorvoll) {
			throw new ValidationError("compliments.moods", "Mindestens eine Stimmung muss aktiv bleiben");
		}
	}
	return true;
}

// Sichert die aktuelle settings.json (falls vorhanden) vor dem Überschreiben
// und behält nur die letzten MAX_BACKUPS Stände.
function backupExisting() {
	if (!fs.existsSync(SETTINGS_PATH)) return null;
	ensureHome();
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const dest = path.join(BACKUP_DIR, `settings.${stamp}.json`);
	fs.copyFileSync(SETTINGS_PATH, dest);
	const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("settings.")).sort();
	while (files.length > MAX_BACKUPS) {
		fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
	}
	return dest;
}

function save(settings) {
	validate(settings);
	ensureHome();
	backupExisting();
	const toWrite = Object.assign({}, settings, {
		meta: Object.assign({}, settings.meta, { updatedAt: new Date().toISOString() })
	});
	const tmp = `${SETTINGS_PATH}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(toWrite, null, 2) + "\n", "utf8");
	fs.renameSync(tmp, SETTINGS_PATH);
	return toWrite;
}

function patch(partial) {
	const current = load();
	const merged = mergeKnown(current, partial);
	return save(merged);
}

module.exports = {
	SETTINGS_PATH,
	LUMIRA_HOME,
	DEFAULT_EDITION,
	load,
	save,
	patch,
	validate,
	mergeKnown,
	ValidationError
};
