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
const { createJsonStore } = require("./store");
const familyDates = require("./family-dates");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const SETTINGS_PATH = process.env.LUMIRA_SETTINGS_PATH || path.join(LUMIRA_HOME, "settings.json");
const BACKUP_DIR = path.join(LUMIRA_HOME, "backups");
// Muss INNERHALB von lumira-portal/ liegen (nicht im Repo-Root): install.sh
// kopiert nur den lumira-portal/-Unterordner auf den Pi (nach ~/lumira-portal),
// "../.." vom Repo-Root aus würde dort ins Leere zeigen (siehe CHECKLIST.md-
// Vorfall: lumira-portal.service ENOENT auf .../home/<user>/settings.default.json).
const DEFAULTS_PATH = path.join(__dirname, "..", "settings.default.json");
const store = createJsonStore({ filePath: SETTINGS_PATH, backupDir: BACKUP_DIR, backupPrefix: "settings", maxBackups: 15 });

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

function load() {
	const defaults = readDefaults();
	if (!store.exists()) return defaults;
	try {
		const raw = store.readRaw();
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

// MagicMirror-Regionen, in die ein Modul (z. B. der Familienplan) darf.
const MM_REGIONS = ["top_left", "top_center", "top_right", "upper_third", "middle_center",
	"lower_third", "bottom_left", "bottom_center", "bottom_right"];

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
	if (settings.family && settings.family.countdowns !== undefined && !Array.isArray(settings.family.countdowns)) {
		throw new ValidationError("family.countdowns", "countdowns muss eine Liste sein");
	}
	if (settings.compliments && settings.compliments.moods) {
		const m = settings.compliments.moods;
		if (!m.herzlich && !m.motivierend && !m.humorvoll) {
			throw new ValidationError("compliments.moods", "Mindestens eine Stimmung muss aktiv bleiben");
		}
	}
	if (settings.familyPlan) {
		const fp = settings.familyPlan;
		if (MM_REGIONS.indexOf(fp.position) === -1) {
			throw new ValidationError("familyPlan.position", `Unbekannte Spiegel-Position "${fp.position}"`);
		}
		if (!/^\d{2,4}px$/.test(String(fp.maxWidth))) {
			throw new ValidationError("familyPlan.maxWidth", "Maximalbreite als Pixelwert angeben, z. B. 300px");
		}
		if (["stacked", "inline"].indexOf(fp.layout) === -1) {
			throw new ValidationError("familyPlan.layout", "Darstellung muss \"stacked\" oder \"inline\" sein");
		}
	}
	return true;
}

// Speichern: Validierung, dann Backup + atomarer Schreibvorgang (lib/store.js).
function save(settings) {
	validate(settings);
	const toWrite = Object.assign({}, settings, {
		meta: Object.assign({}, settings.meta, { updatedAt: new Date().toISOString() })
	});
	return store.write(toWrite);
}

// „Wichtige Termine“ aus dem Portal (deutsches Datumsformat) prüfen und in das
// Format von MMM-SmartCompliments umrechnen. Nur für neu gespeicherte
// Termine – alte Einträge in settings.json blockieren so nie das Speichern
// anderer Seiten (generate-config.js rechnet sie zur Sicherheit auch um).
const MEMBER_ID_RE = /^m_[a-z0-9]{4,12}$/;

function normalizeFamily(family) {
	const out = Object.assign({}, family);
	if (family.birthdays !== undefined) {
		if (!Array.isArray(family.birthdays)) throw new ValidationError("family.birthdays", "birthdays muss eine Liste sein");
		if (family.birthdays.length > 30) throw new ValidationError("family.birthdays", "Höchstens 30 Geburtstage");
		out.birthdays = family.birthdays.map((b, i) => {
			const name = String((b && b.name) || "").trim();
			if (!name || name.length > 40) throw new ValidationError(`family.birthdays.${i}`, "Jeder Geburtstag braucht einen Namen (bis 40 Zeichen)");
			const date = familyDates.toMMDD(b.date);
			if (!date) throw new ValidationError(`family.birthdays.${i}`, `Geburtstag von ${name}: Datum als TT.MM. angeben, z. B. 24.12.`);
			const entry = { name, date };
			if (b.memberId && MEMBER_ID_RE.test(b.memberId)) entry.memberId = b.memberId;
			return entry;
		});
	}
	if (family.weddingDate !== undefined) {
		const wd = familyDates.toFullDate(family.weddingDate);
		if (wd === null) throw new ValidationError("family.weddingDate", "Hochzeitstag als TT.MM.JJJJ angeben, z. B. 20.06.2010");
		out.weddingDate = wd;
	}
	if (family.countdowns !== undefined) {
		if (!Array.isArray(family.countdowns)) throw new ValidationError("family.countdowns", "countdowns muss eine Liste sein");
		if (family.countdowns.length > 20) throw new ValidationError("family.countdowns", "Höchstens 20 Countdowns");
		out.countdowns = family.countdowns.map((c, i) => {
			const label = String((c && c.label) || "").trim();
			if (!label || label.length > 40) throw new ValidationError(`family.countdowns.${i}`, "Jeder Termin braucht eine Bezeichnung (bis 40 Zeichen)");
			const date = familyDates.toMMDD(c.date);
			if (!date) throw new ValidationError(`family.countdowns.${i}`, `${label}: Datum als TT.MM. angeben`);
			return { label, date };
		});
	}
	return out;
}

function patch(partial) {
	const current = load();
	if (partial && isPlainObject(partial.family)) {
		partial = Object.assign({}, partial, { family: normalizeFamily(partial.family) });
	}
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
