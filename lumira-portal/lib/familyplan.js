// LUMIRA – familyplan.json laden/speichern/validieren + Wochenwechsel.
//
// ~/.lumira/familyplan.json ist die einzige Wahrheit für den Familienplan
// (siehe concept/familienplan.md). Nur das Portal schreibt sie, das Modul
// MMM-FamilyPlan liest sie nur (fs.watch). Alle Operationen hier sind
// synchron (lesen → ändern → schreiben in einem Rutsch). Node führt sie
// damit nie verschachtelt aus, ein zusätzlicher Mutex ist nicht nötig.
//
// Schutzregeln (Konzept 6.3):
//  - Eine einmal angelegte Woche ändert sich nie automatisch, nur über
//    assign()/resetWeek()/regenerateCurrent().
//  - Zukünftige Wochen werden nicht gespeichert, sondern für die Vorschau
//    simuliert.
//  - Änderungen an Personen/Diensten/Paar-Modus beginnen ab der nächsten
//    Woche einen neuen Zyklus (settings.cycleStart).
//  - Springt die Uhr zurück (Pi 3 ohne Echtzeituhr), wird keine Woche angelegt.
"use strict";

const path = require("path");
const crypto = require("crypto");
const settingsLib = require("./settings");
const { createJsonStore } = require("./store");
const rot = require("./familyplan-rotation");

const LUMIRA_HOME = settingsLib.LUMIRA_HOME;
const FAMILYPLAN_PATH = process.env.LUMIRA_FAMILYPLAN_PATH || path.join(LUMIRA_HOME, "familyplan.json");
const AVATAR_UPLOAD_DIR = path.join(path.dirname(FAMILYPLAN_PATH), "familyplan", "avatars");
const store = createJsonStore({
	filePath: FAMILYPLAN_PATH,
	backupDir: path.join(LUMIRA_HOME, "backups"),
	backupPrefix: "familyplan",
	maxBackups: 15
});

const MAX_MEMBERS = 8;
const MAX_DUTIES = 16;
const MAX_NAME = 30;
const ROLES = ["adult", "child"];
const HEX_RE = /^#[0-9a-f]{6}$/i;
const PRESET_RE = /^(adult|child)-\d{2}$/;
const UPLOAD_RE = /^m_[a-z0-9]{4,12}\.(png|jpg|webp)$/;
const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

const MEMBER_COLORS = ["#4ade80", "#facc15", "#a78bfa", "#f472b6", "#38bdf8", "#fb923c", "#2dd4bf", "#e879f9"];

// Font-Awesome-Free-Symbole (bringt MagicMirror mit). Nur Namen aus dieser
// Liste landen in der Datei – kein Weg, beliebige Klassen einzuschleusen.
const ICONS = [
	"seedling", "leaf", "tree", "utensils", "bowl-food", "mug-hot", "fire-burner", "kitchen-set",
	"sink", "bath", "shower", "toilet", "soap", "spray-can-sparkles", "broom", "jug-detergent",
	"shirt", "socks", "bed", "couch", "trash-can", "recycle", "dumpster", "cart-shopping",
	"basket-shopping", "box", "envelope", "dog", "cat", "fish", "paw", "car", "bicycle",
	"snowflake", "house", "wrench"
];

const DEFAULT_DUTIES = [
	{ id: "d_garten", name: "Gartendienst", color: "#4ade80", icon: "seedling" },
	{ id: "d_tisch", name: "Tischdienst", color: "#22d3ee", icon: "utensils" },
	{ id: "d_bad", name: "Baddienst", color: "#fda4af", icon: "bath" },
	{ id: "d_muell", name: "Mülldienst", color: "#60a5fa", icon: "trash-can" },
	{ id: "d_kochen", name: "Kochdienst", color: "#facc15", icon: "fire-burner" },
	{ id: "d_kueche", name: "Küchendienst", color: "#f472b6", icon: "sink" },
	{ id: "d_putzen", name: "Putzdienst", color: "#f0abfc", icon: "spray-can-sparkles" },
	{ id: "d_boden", name: "Bodendienst", color: "#c084fc", icon: "broom" }
];

function defaults() {
	return {
		version: 1,
		revision: 0,
		updatedAt: "",
		settings: {
			title: "Unser Familienplan",
			rotationWeekday: 1,
			autoRotate: true,
			previewWeeks: 4,
			historyWeeks: 26,
			cycleStart: "",
			pairMode: "varying",
			fixedPairs: []
		},
		members: [],
		duties: DEFAULT_DUTIES.map((d) => Object.assign({}, d, { roles: ROLES.slice(), active: true })),
		weeks: []
	};
}

class ValidationError extends Error {
	constructor(field, message) {
		super(message);
		this.name = "ValidationError";
		this.field = field;
	}
}

class ConflictError extends Error {
	constructor() {
		super("Der Plan wurde inzwischen auf einem anderen Gerät geändert. Bitte neu laden.");
		this.name = "ConflictError";
	}
}

function newId(prefix) {
	return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Laden (mit Bereinigung auf das bekannte Schema)
// ---------------------------------------------------------------------------
function cleanAvatar(a) {
	if (a && a.type === "preset" && PRESET_RE.test(a.value)) return { type: "preset", value: a.value };
	if (a && a.type === "upload" && UPLOAD_RE.test(a.file)) return { type: "upload", file: a.file, v: Number(a.v) || 0 };
	return { type: "initials" };
}

function cleanMember(m) {
	return {
		id: String(m.id),
		name: String(m.name || "").slice(0, MAX_NAME),
		role: ROLES.indexOf(m.role) !== -1 ? m.role : "adult",
		color: HEX_RE.test(m.color) ? m.color : MEMBER_COLORS[0],
		avatar: cleanAvatar(m.avatar),
		active: m.active !== false,
		deleted: m.deleted === true
	};
}

function cleanDuty(d) {
	const roles = Array.isArray(d.roles) ? d.roles.filter((r) => ROLES.indexOf(r) !== -1) : ROLES.slice();
	return {
		id: String(d.id),
		name: String(d.name || "").slice(0, MAX_NAME),
		color: HEX_RE.test(d.color) ? d.color : "#9ca3af",
		icon: ICONS.indexOf(d.icon) !== -1 ? d.icon : "house",
		roles: roles.length ? roles : ROLES.slice(),
		active: d.active !== false,
		deleted: d.deleted === true
	};
}

function cleanAssign(a) {
	const out = {};
	if (!a || typeof a !== "object") return out;
	for (const k of Object.keys(a)) {
		if (Array.isArray(a[k])) out[k] = a[k].filter((x) => typeof x === "string");
	}
	return out;
}

function normalize(raw) {
	const base = defaults();
	if (!raw || typeof raw !== "object") return base;
	const s = Object.assign({}, base.settings, raw.settings || {});
	const out = {
		version: 1,
		revision: Number(raw.revision) || 0,
		updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
		settings: {
			title: String(s.title || base.settings.title).slice(0, 40),
			rotationWeekday: Number.isInteger(s.rotationWeekday) && s.rotationWeekday >= 0 && s.rotationWeekday <= 6 ? s.rotationWeekday : 1,
			autoRotate: s.autoRotate !== false,
			previewWeeks: Math.min(8, Math.max(1, Number(s.previewWeeks) || 4)),
			historyWeeks: Math.min(104, Math.max(8, Number(s.historyWeeks) || 26)),
			cycleStart: typeof s.cycleStart === "string" ? s.cycleStart : "",
			pairMode: s.pairMode === "fixed" ? "fixed" : "varying",
			fixedPairs: Array.isArray(s.fixedPairs) ? s.fixedPairs.filter((p) => Array.isArray(p) && p.length === 2).map((p) => [String(p[0]), String(p[1])]) : []
		},
		members: Array.isArray(raw.members) ? raw.members.map(cleanMember) : [],
		duties: Array.isArray(raw.duties) ? raw.duties.map(cleanDuty) : base.duties,
		weeks: Array.isArray(raw.weeks) ? raw.weeks.filter((w) => w && /^\d{4}-\d{2}-\d{2}$/.test(w.start)).map((w) => ({
			start: w.start,
			auto: cleanAssign(w.auto),
			manual: w.manual ? cleanAssign(w.manual) : null,
			unassigned: Array.isArray(w.unassigned) ? w.unassigned.filter((x) => typeof x === "string") : [],
			createdAt: typeof w.createdAt === "string" ? w.createdAt : "",
			createdBy: typeof w.createdBy === "string" ? w.createdBy : ""
		})) : []
	};
	out.weeks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
	return out;
}

// { data, corrupt } – bei kaputter Datei Defaults + Hinweis (Portal bietet
// dann die Backups an), statt das Portal abstürzen zu lassen.
function loadState() {
	try {
		return { data: normalize(store.readRaw()), corrupt: false };
	} catch (err) {
		console.error("[lumira-portal] familyplan.json ist beschädigt:", err.message);
		return { data: defaults(), corrupt: true };
	}
}

function load() {
	return loadState().data;
}

// ---------------------------------------------------------------------------
// Speichern
// ---------------------------------------------------------------------------
function validate(data) {
	const members = data.members.filter((m) => !m.deleted);
	const duties = data.duties.filter((d) => !d.deleted);
	if (members.length > MAX_MEMBERS) throw new ValidationError("members", `Höchstens ${MAX_MEMBERS} Mitglieder möglich`);
	if (duties.length > MAX_DUTIES) throw new ValidationError("duties", `Höchstens ${MAX_DUTIES} Dienste möglich`);
	if (!duties.length) throw new ValidationError("duties", "Mindestens ein Dienst muss bleiben");
	for (const m of members) {
		if (!m.name.trim()) throw new ValidationError("members", "Jedes Mitglied braucht einen Namen");
	}
	for (const d of duties) {
		if (!d.name.trim()) throw new ValidationError("duties", "Jeder Dienst braucht einen Namen");
	}
	const lower = (s) => s.trim().toLowerCase();
	if (new Set(members.map((m) => lower(m.name))).size !== members.length) {
		throw new ValidationError("members", "Zwei Mitglieder haben denselben Namen");
	}
	if (new Set(duties.map((d) => lower(d.name))).size !== duties.length) {
		throw new ValidationError("duties", "Zwei Dienste haben denselben Namen");
	}
	const dutyIds = duties.map((d) => d.id);
	const seen = {};
	for (const [a, b] of data.settings.fixedPairs) {
		if (a === b || dutyIds.indexOf(a) === -1 || dutyIds.indexOf(b) === -1) {
			throw new ValidationError("settings.fixedPairs", "Ein festes Paar braucht zwei verschiedene, vorhandene Dienste");
		}
		if (seen[a] || seen[b]) throw new ValidationError("settings.fixedPairs", "Ein Dienst kann nur in einem festen Paar sein");
		seen[a] = seen[b] = true;
	}
}

function save(data, now) {
	validate(data);
	data.revision = (Number(data.revision) || 0) + 1;
	data.updatedAt = (now || new Date()).toISOString();
	if (data.weeks.length > data.settings.historyWeeks) {
		data.weeks = data.weeks.slice(-data.settings.historyWeeks);
	}
	return store.write(data);
}

// Lesen → Revision prüfen → ändern → speichern.
function mutate(expectedRevision, fn, now) {
	const { data, corrupt } = loadState();
	if (corrupt) throw new ValidationError("file", "familyplan.json ist beschädigt. Bitte zuerst ein Backup wiederherstellen.");
	if (expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== data.revision) {
		throw new ConflictError();
	}
	fn(data);
	return save(data, now);
}

// ---------------------------------------------------------------------------
// Hilfen für die Rotation
// ---------------------------------------------------------------------------
function activeMembers(data) {
	return data.members.filter((m) => !m.deleted && m.active);
}

function activeDuties(data) {
	return data.duties.filter((d) => !d.deleted && d.active);
}

function shown(week) {
	return week.manual || week.auto;
}

// Alles, was die Rotation beeinflusst. Ändert sich das, beginnt ein neuer Zyklus.
function fingerprint(data) {
	return JSON.stringify({
		m: activeMembers(data).map((m) => [m.id, m.role]),
		d: activeDuties(data).map((d) => [d.id, d.roles.slice().sort()]),
		p: data.settings.pairMode,
		f: data.settings.pairMode === "fixed" ? data.settings.fixedPairs : []
	});
}

function currentWeekIndex(data, todayKey) {
	for (let i = data.weeks.length - 1; i >= 0; i--) {
		if (data.weeks[i].start <= todayKey) return i;
	}
	return -1;
}

// Berechnet eine Woche aus der gespeicherten Historie vor weekStart plus
// optional bereits simulierten Wochen (für die Vorschau).
function computeFor(data, weekStart, simulated) {
	const members = activeMembers(data);
	const before = data.weeks.filter((w) => w.start < weekStart);
	const history = before.map(shown).concat((simulated || []).map((s) => s.assign));
	const starts = before.map((w) => w.start).concat((simulated || []).map((s) => s.start));
	const cycleStart = data.settings.cycleStart || "";
	const inCycle = starts.filter((s) => s >= cycleStart).length;
	return rot.computeWeek({
		members: members.map((m) => ({ id: m.id, role: m.role })),
		duties: activeDuties(data).map((d) => ({ id: d.id, roles: d.roles })),
		history,
		cyclePos: members.length ? inCycle % members.length : 0,
		key: weekStart,
		pairMode: data.settings.pairMode,
		fixedPairs: data.settings.fixedPairs
	});
}

// Neuer Zyklus ab der nächsten Wochengrenze (die laufende Woche bleibt).
function restartCycle(data, now) {
	const idx = currentWeekIndex(data, rot.toKey(now));
	const base = idx >= 0 ? data.weeks[idx].start : rot.weekStartFor(now, data.settings.rotationWeekday);
	data.settings.cycleStart = idx >= 0 ? rot.nextBoundary(base, data.settings.rotationWeekday) : base;
}

function clockPlausible(data, now) {
	return !data.updatedAt || now.getTime() >= new Date(data.updatedAt).getTime() - CLOCK_TOLERANCE_MS;
}

// ---------------------------------------------------------------------------
// Wochenwechsel (vom Scheduler in server.js jede Minute aufgerufen)
// ---------------------------------------------------------------------------
function ensureCurrentWeek(now) {
	now = now || new Date();
	const { data, corrupt } = loadState();
	if (corrupt || !data.settings.autoRotate) return null;
	if (!activeMembers(data).length || !activeDuties(data).length) return null;
	if (!clockPlausible(data, now)) return null;
	const start = rot.weekStartFor(now, data.settings.rotationWeekday);
	const latest = data.weeks.length ? data.weeks[data.weeks.length - 1].start : "";
	if (latest && start <= latest) return null; // gibt es schon, oder Uhr zurückgesprungen
	if (!data.settings.cycleStart || data.settings.cycleStart > start) data.settings.cycleStart = start;
	const res = computeFor(data, start);
	data.weeks.push({
		start,
		auto: res.assign,
		manual: null,
		unassigned: res.unassigned,
		createdAt: now.toISOString(),
		createdBy: "scheduler"
	});
	return save(data, now);
}

// ---------------------------------------------------------------------------
// Ansicht für Portal (berechnet: aktuelle Woche, Vorschau, Hinweise)
// ---------------------------------------------------------------------------
function weekView(data, week, todayKey) {
	const end = rot.addDays(rot.nextBoundary(week.start, data.settings.rotationWeekday), -1);
	return {
		start: week.start,
		end,
		kw: rot.isoWeek(week.start),
		assign: shown(week),
		auto: week.auto,
		manual: week.manual,
		unassigned: week.unassigned || [],
		stale: end < todayKey
	};
}

function view(now) {
	now = now || new Date();
	const { data, corrupt } = loadState();
	const todayKey = rot.toKey(now);
	const idx = currentWeekIndex(data, todayKey);
	const current = idx >= 0 ? weekView(data, data.weeks[idx], todayKey) : null;

	const preview = [];
	if (activeMembers(data).length && activeDuties(data).length) {
		let start = current ? rot.nextBoundary(current.start, data.settings.rotationWeekday) : rot.weekStartFor(now, data.settings.rotationWeekday);
		const simulated = [];
		for (let i = 0; i < data.settings.previewWeeks; i++) {
			const res = computeFor(data, start, simulated);
			simulated.push({ start, assign: res.assign });
			preview.push({ start, kw: rot.isoWeek(start), assign: res.assign, unassigned: res.unassigned });
			start = rot.nextBoundary(start, data.settings.rotationWeekday);
		}
	}

	const warnings = [];
	if (corrupt) warnings.push("familyplan.json ist beschädigt. Bitte ein Backup wiederherstellen.");
	if (!activeMembers(data).length) warnings.push("Noch keine Mitglieder. Lege unter „Familienmitglieder“ die Familie an.");
	if (!clockPlausible(data, now)) warnings.push("Die Uhrzeit des Pi wirkt falsch (liegt vor der letzten Änderung). Neue Wochen werden erst angelegt, wenn die Uhr wieder stimmt.");
	if (!data.settings.autoRotate) warnings.push("Die automatische Rotation ist pausiert. Der Plan bleibt stehen.");
	if (current && current.unassigned.length) {
		const names = current.unassigned.map((id) => (data.duties.find((d) => d.id === id) || { name: id }).name);
		warnings.push(`Diese Woche nicht vergeben, weil niemand Passendes mitmacht: ${names.join(", ")}`);
	}

	return {
		revision: data.revision,
		updatedAt: data.updatedAt,
		settings: data.settings,
		members: data.members.filter((m) => !m.deleted),
		duties: data.duties.filter((d) => !d.deleted),
		allMembers: data.members,
		allDuties: data.duties,
		currentWeek: current,
		preview,
		history: data.weeks.slice(0, Math.max(0, idx)).slice(-8).reverse().map((w) => weekView(data, w, todayKey)),
		icons: ICONS,
		warnings,
		corrupt
	};
}

// ---------------------------------------------------------------------------
// Änderungen aus dem Portal
// ---------------------------------------------------------------------------
function checkName(field, name) {
	const n = String(name == null ? "" : name).trim();
	if (!n) throw new ValidationError(field, "Name fehlt");
	if (n.length > MAX_NAME) throw new ValidationError(field, `Name höchstens ${MAX_NAME} Zeichen`);
	return n;
}

function checkColor(field, color) {
	if (!HEX_RE.test(String(color))) throw new ValidationError(field, "Farbe als #RRGGBB angeben");
	return String(color).toLowerCase();
}

// Ersetzt die Mitgliederliste (Reihenfolge = Array). Fehlende werden
// soft-gelöscht, damit vergangene Wochen ihre Namen behalten.
function setMembers(revision, list, now) {
	if (!Array.isArray(list)) throw new ValidationError("members", "members muss eine Liste sein");
	return mutate(revision, (data) => {
		const before = fingerprint(data);
		const byId = {};
		data.members.forEach((m) => { byId[m.id] = m; });
		const next = [];
		list.forEach((item, i) => {
			const field = `members.${i}`;
			const existing = item && item.id && byId[item.id] && !byId[item.id].deleted ? byId[item.id] : null;
			const role = ROLES.indexOf(item.role) !== -1 ? item.role : "adult";
			let avatar = existing ? existing.avatar : { type: "initials" };
			if (item.avatar && item.avatar.type === "preset") {
				if (!PRESET_RE.test(item.avatar.value)) throw new ValidationError(field, "Unbekannter Avatar");
				avatar = { type: "preset", value: item.avatar.value };
			} else if (item.avatar && item.avatar.type === "initials") {
				avatar = { type: "initials" };
			} // "upload" nur über die Upload-Route setzbar
			next.push({
				id: existing ? existing.id : newId("m"),
				name: checkName(field, item.name),
				role,
				color: checkColor(field, item.color || MEMBER_COLORS[i % MEMBER_COLORS.length]),
				avatar,
				active: item.active !== false,
				deleted: false
			});
		});
		const keep = new Set(next.map((m) => m.id));
		const removed = data.members.filter((m) => !keep.has(m.id)).map((m) => Object.assign({}, m, { deleted: true }));
		data.members = next.concat(removed);
		if (fingerprint(data) !== before) restartCycle(data, now || new Date());
	}, now);
}

function setDuties(revision, list, now) {
	if (!Array.isArray(list)) throw new ValidationError("duties", "duties muss eine Liste sein");
	return mutate(revision, (data) => {
		const before = fingerprint(data);
		const byId = {};
		data.duties.forEach((d) => { byId[d.id] = d; });
		const next = list.map((item, i) => {
			const field = `duties.${i}`;
			const existing = item && item.id && byId[item.id] && !byId[item.id].deleted ? byId[item.id] : null;
			if (ICONS.indexOf(item.icon) === -1) throw new ValidationError(field, "Unbekanntes Symbol");
			const roles = Array.isArray(item.roles) ? item.roles.filter((r) => ROLES.indexOf(r) !== -1) : ROLES.slice();
			if (!roles.length) throw new ValidationError(field, "Ein Dienst muss für mindestens eine Rolle gelten");
			return {
				id: existing ? existing.id : newId("d"),
				name: checkName(field, item.name),
				color: checkColor(field, item.color),
				icon: item.icon,
				roles: ROLES.filter((r) => roles.indexOf(r) !== -1),
				active: item.active !== false,
				deleted: false
			};
		});
		const keep = new Set(next.map((d) => d.id));
		const removed = data.duties.filter((d) => !keep.has(d.id)).map((d) => Object.assign({}, d, { deleted: true }));
		data.duties = next.concat(removed);
		// Feste Paare mit gelöschten Diensten fallen weg
		data.settings.fixedPairs = data.settings.fixedPairs.filter(([a, b]) => keep.has(a) && keep.has(b));
		if (fingerprint(data) !== before) restartCycle(data, now || new Date());
	}, now);
}

function setSettings(revision, patch, now) {
	patch = patch || {};
	return mutate(revision, (data) => {
		const before = fingerprint(data);
		const s = data.settings;
		if (patch.title !== undefined) {
			const t = String(patch.title).trim();
			if (!t || t.length > 40) throw new ValidationError("settings.title", "Titel muss 1–40 Zeichen haben");
			s.title = t;
		}
		if (patch.rotationWeekday !== undefined) {
			const d = Number(patch.rotationWeekday);
			if (!Number.isInteger(d) || d < 0 || d > 6) throw new ValidationError("settings.rotationWeekday", "Rotationstag muss 0–6 sein");
			s.rotationWeekday = d;
		}
		if (patch.autoRotate !== undefined) s.autoRotate = !!patch.autoRotate;
		if (patch.previewWeeks !== undefined) {
			const w = Number(patch.previewWeeks);
			if (!Number.isInteger(w) || w < 1 || w > 8) throw new ValidationError("settings.previewWeeks", "Vorschau: 1–8 Wochen");
			s.previewWeeks = w;
		}
		if (patch.pairMode !== undefined) {
			if (["varying", "fixed"].indexOf(patch.pairMode) === -1) throw new ValidationError("settings.pairMode", "Unbekannter Paar-Modus");
			s.pairMode = patch.pairMode;
		}
		if (patch.fixedPairs !== undefined) {
			if (!Array.isArray(patch.fixedPairs) || !patch.fixedPairs.every((p) => Array.isArray(p) && p.length === 2)) {
				throw new ValidationError("settings.fixedPairs", "fixedPairs muss eine Liste aus Paaren sein");
			}
			s.fixedPairs = patch.fixedPairs.map((p) => [String(p[0]), String(p[1])]);
		}
		if (fingerprint(data) !== before) restartCycle(data, now || new Date());
	}, now);
}

// Manuelle Änderung der laufenden Woche: Dienst in einem Slot setzen, wer
// ihn bisher hatte, bekommt im Tausch den alten Dienst.
function assign(revision, weekStart, memberId, slot, dutyId, now) {
	return mutate(revision, (data) => {
		const idx = currentWeekIndex(data, rot.toKey(now || new Date()));
		if (idx < 0 || data.weeks[idx].start !== weekStart) {
			throw new ValidationError("week", "Nur die laufende Woche kann geändert werden");
		}
		const week = data.weeks[idx];
		const next = JSON.parse(JSON.stringify(shown(week)));
		if (!next[memberId] || typeof next[memberId][slot] !== "string") throw new ValidationError("slot", "Unbekannte Zuordnung");
		const duty = data.duties.find((d) => d.id === dutyId && !d.deleted);
		if (!duty) throw new ValidationError("dutyId", "Unbekannter Dienst");
		const old = next[memberId][slot];
		if (old === dutyId) return;
		for (const pid of Object.keys(next)) {
			const i = next[pid].indexOf(dutyId);
			if (i !== -1) next[pid][i] = old;
		}
		next[memberId][slot] = dutyId;
		const same = JSON.stringify(next) === JSON.stringify(week.auto);
		week.manual = same ? null : next;
	}, now);
}

function resetWeek(revision, weekStart, now) {
	return mutate(revision, (data) => {
		const week = data.weeks.find((w) => w.start === weekStart);
		if (!week) throw new ValidationError("week", "Woche nicht gefunden");
		week.manual = null;
	}, now);
}

// "Aktuelle Woche neu verteilen" – nur auf ausdrücklichen Wunsch (Portal
// fragt vorher nach).
function regenerateCurrent(revision, now) {
	now = now || new Date();
	return mutate(revision, (data) => {
		const idx = currentWeekIndex(data, rot.toKey(now));
		if (idx < 0) throw new ValidationError("week", "Es gibt noch keine laufende Woche");
		const week = data.weeks[idx];
		const res = computeFor(data, week.start);
		week.auto = res.assign;
		week.unassigned = res.unassigned;
		week.manual = null;
		week.createdBy = "regenerate";
	}, now);
}

// Avatar nach einem Upload setzen (Datei liegt schon in AVATAR_UPLOAD_DIR).
function setUploadedAvatar(memberId, file) {
	return mutate(undefined, (data) => {
		const m = data.members.find((x) => x.id === memberId && !x.deleted);
		if (!m) throw new ValidationError("memberId", "Mitglied nicht gefunden");
		m.avatar = { type: "upload", file, v: Date.now() };
	});
}

function clearAvatar(memberId) {
	return mutate(undefined, (data) => {
		const m = data.members.find((x) => x.id === memberId && !x.deleted);
		if (!m) throw new ValidationError("memberId", "Mitglied nicht gefunden");
		m.avatar = { type: "initials" };
	});
}

function memberExists(memberId) {
	return load().members.some((m) => m.id === memberId && !m.deleted);
}

module.exports = {
	FAMILYPLAN_PATH,
	AVATAR_UPLOAD_DIR,
	ICONS,
	ROLES,
	MAX_MEMBERS,
	MAX_DUTIES,
	defaults,
	normalize,
	load,
	loadState,
	view,
	ensureCurrentWeek,
	setMembers,
	setDuties,
	setSettings,
	assign,
	resetWeek,
	regenerateCurrent,
	setUploadedAvatar,
	clearAvatar,
	memberExists,
	ValidationError,
	ConflictError
};
