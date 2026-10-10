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
//    simuliert. Gespeichert werden nur manuelle Änderungen daran
//    (plannedOverrides), die beim Wochenwechsel übernommen werden.
//  - Änderungen an Personen/Diensten/Paar-Modus beginnen ab der nächsten
//    Woche einen neuen Zyklus (settings.cycleStart).
//  - Springt die Uhr zurück (Pi 3 ohne Echtzeituhr), wird keine Woche angelegt.
"use strict";

const fs = require("fs");
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
		weeks: [],
		// Manuelle Änderungen an zukünftigen Wochen (Phase 4). Werden beim
		// Wochenwechsel als "manual" in die neue Woche übernommen.
		plannedOverrides: {}
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
		})) : [],
		plannedOverrides: {}
	};
	out.weeks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
	if (raw.plannedOverrides && typeof raw.plannedOverrides === "object") {
		for (const key of Object.keys(raw.plannedOverrides)) {
			if (/^\d{4}-\d{2}-\d{2}$/.test(key)) out.plannedOverrides[key] = cleanAssign(raw.plannedOverrides[key]);
		}
	}
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

// Eine manuelle Änderung passt nur zur berechneten Verteilung, wenn dieselben
// Personen jeweils gleich viele Dienste haben und insgesamt dieselben
// Dienste vergeben sind (= es wurde nur getauscht). Ändert sich danach die
// Familie oder die Dienstliste, verfällt sie und die Automatik gilt wieder.
function sameDistribution(override, auto) {
	if (!override || !auto) return false;
	const keys = Object.keys(auto).sort();
	if (JSON.stringify(Object.keys(override).sort()) !== JSON.stringify(keys)) return false;
	if (keys.some((k) => !Array.isArray(override[k]) || override[k].length !== auto[k].length)) return false;
	const all = (a) => keys.flatMap((k) => a[k]).sort().join(",");
	return all(override) === all(auto);
}

function firstFutureStart(data, now) {
	const idx = currentWeekIndex(data, rot.toKey(now));
	return idx >= 0 ? rot.nextBoundary(data.weeks[idx].start, data.settings.rotationWeekday) : rot.weekStartFor(now, data.settings.rotationWeekday);
}

// Simuliert die kommenden Wochen (Vorschau), inkl. gültiger geplanter
// Änderungen. Jede simulierte Woche geht in die Berechnung der nächsten ein.
function simulateFuture(data, now, count) {
	const out = [];
	if (!activeMembers(data).length || !activeDuties(data).length) return out;
	let start = firstFutureStart(data, now);
	const simulated = [];
	for (let i = 0; i < count; i++) {
		const res = computeFor(data, start, simulated);
		const planned = data.plannedOverrides[start];
		const manual = sameDistribution(planned, res.assign) ? planned : null;
		const assign = manual || res.assign;
		out.push({ start, auto: res.assign, manual, assign, unassigned: res.unassigned, history: simulated.slice() });
		simulated.push({ start, assign });
		start = rot.nextBoundary(start, data.settings.rotationWeekday);
	}
	return out;
}

// Kurze Begründung je Zuordnung („Warum hat Maja den Tischdienst?“).
function explain(data, historyList, week) {
	const out = {};
	const dutyById = {};
	data.duties.forEach((d) => { dutyById[d.id] = d; });
	const pairOf = {};
	if (data.settings.pairMode === "fixed") {
		data.settings.fixedPairs.forEach(([a, b]) => { pairOf[a] = b; pairOf[b] = a; });
	}
	const recent = historyList.slice(-rot.RECENT_WEEKS);
	for (const pid of Object.keys(week.assign)) {
		out[pid] = {};
		for (const did of week.assign[pid]) {
			const parts = [];
			const auto = (week.auto && week.auto[pid]) || [];
			if (week.manual && auto.indexOf(did) === -1) {
				parts.push("Manuell festgelegt.");
			} else {
				let ago = -1;
				for (let i = recent.length - 1; i >= 0; i--) {
					if ((recent[i].assign[pid] || []).indexOf(did) !== -1) { ago = recent.length - i; break; }
				}
				if (ago < 0) parts.push(`In den letzten ${rot.RECENT_WEEKS} Wochen noch nicht gehabt.`);
				else parts.push(`Zuletzt vor ${ago} ${ago === 1 ? "Woche" : "Wochen"} (KW ${rot.isoWeek(recent[recent.length - ago].start)}).`);
			}
			const d = dutyById[did];
			if (d && d.roles.length === 1) parts.push(d.roles[0] === "adult" ? "Nur für Erwachsene." : "Nur für Kinder.");
			if (pairOf[did] && dutyById[pairOf[did]]) parts.push(`Festes Paar mit ${dutyById[pairOf[did]].name}.`);
			out[pid][did] = parts.join(" ");
		}
	}
	return out;
}

// Wer hatte welchen Dienst wie oft in den letzten Wochen (inkl. laufender)?
function fairness(data, uptoIdx) {
	const weeks = uptoIdx >= 0 ? data.weeks.slice(0, uptoIdx + 1).slice(-rot.RECENT_WEEKS) : [];
	const counts = {};
	const members = data.members.filter((m) => !m.deleted);
	members.forEach((m) => { counts[m.id] = {}; });
	for (const w of weeks) {
		const a = shown(w);
		for (const pid of Object.keys(a)) {
			if (!counts[pid]) continue;
			for (const did of a[pid]) counts[pid][did] = (counts[pid][did] || 0) + 1;
		}
	}
	return { weeks: weeks.length, counts };
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
	// Vorab geplante Änderung für diese Woche übernehmen, sofern sie noch passt
	const planned = data.plannedOverrides[start];
	data.weeks.push({
		start,
		auto: res.assign,
		manual: sameDistribution(planned, res.assign) && JSON.stringify(planned) !== JSON.stringify(res.assign) ? planned : null,
		unassigned: res.unassigned,
		createdAt: now.toISOString(),
		createdBy: "scheduler"
	});
	// Geplante Änderungen für diese und frühere Wochen sind erledigt
	for (const key of Object.keys(data.plannedOverrides)) {
		if (key <= start) delete data.plannedOverrides[key];
	}
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
	const stored = data.weeks.map((w) => ({ start: w.start, assign: shown(w) }));
	if (current) current.reasons = explain(data, stored.slice(0, idx), current);

	const preview = simulateFuture(data, now, data.settings.previewWeeks).map((p) => {
		const entry = {
			start: p.start,
			end: rot.addDays(rot.nextBoundary(p.start, data.settings.rotationWeekday), -1),
			kw: rot.isoWeek(p.start),
			assign: p.assign,
			auto: p.auto,
			manual: p.manual,
			unassigned: p.unassigned
		};
		entry.reasons = explain(data, stored.slice(0, idx + 1).concat(p.history), entry);
		return entry;
	});

	const warnings = [];
	if (corrupt) warnings.push("familyplan.json ist beschädigt. Bitte unter „Einstellungen → Datensicherung“ ein Backup wiederherstellen.");
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
		fairness: fairness(data, idx),
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

// Dienst in einem Slot setzen; wer ihn bisher hatte, bekommt im Tausch den
// alten Dienst. Liefert die neue Verteilung (oder null, wenn unverändert).
function swapIn(base, data, memberId, slot, dutyId) {
	const next = JSON.parse(JSON.stringify(base));
	if (!next[memberId] || typeof next[memberId][slot] !== "string") throw new ValidationError("slot", "Unbekannte Zuordnung");
	const duty = data.duties.find((d) => d.id === dutyId && !d.deleted);
	if (!duty) throw new ValidationError("dutyId", "Unbekannter Dienst");
	const old = next[memberId][slot];
	if (old === dutyId) return null;
	if (!Object.keys(next).some((pid) => next[pid].indexOf(dutyId) !== -1)) {
		throw new ValidationError("dutyId", "Dieser Dienst ist in der Woche nicht vergeben");
	}
	for (const pid of Object.keys(next)) {
		const i = next[pid].indexOf(dutyId);
		if (i !== -1) next[pid][i] = old;
	}
	next[memberId][slot] = dutyId;
	return next;
}

// Vorschau-Woche finden (bis 8 Wochen voraus), sonst Fehler.
function futureWeek(data, now, weekStart) {
	const list = simulateFuture(data, now, 8);
	const found = list.find((p) => p.start === weekStart);
	if (!found) throw new ValidationError("week", "Nur die laufende Woche oder eine Woche aus der Vorschau kann geändert werden");
	return found;
}

// Manuelle Änderung: in der laufenden Woche direkt ("manual"), in einer
// Vorschau-Woche als geplante Änderung (plannedOverrides), die beim
// Wochenwechsel übernommen wird.
function assign(revision, weekStart, memberId, slot, dutyId, now) {
	now = now || new Date();
	return mutate(revision, (data) => {
		const idx = currentWeekIndex(data, rot.toKey(now));
		if (idx >= 0 && data.weeks[idx].start === weekStart) {
			const week = data.weeks[idx];
			const next = swapIn(shown(week), data, memberId, slot, dutyId);
			if (!next) return;
			week.manual = JSON.stringify(next) === JSON.stringify(week.auto) ? null : next;
			return;
		}
		if (idx >= 0 && weekStart <= data.weeks[idx].start) {
			throw new ValidationError("week", "Vergangene Wochen können nicht mehr geändert werden");
		}
		const fw = futureWeek(data, now, weekStart);
		const next = swapIn(fw.assign, data, memberId, slot, dutyId);
		if (!next) return;
		if (JSON.stringify(next) === JSON.stringify(fw.auto)) delete data.plannedOverrides[weekStart];
		else data.plannedOverrides[weekStart] = next;
	}, now);
}

// „Automatische Verteilung wiederherstellen“ – laufende oder geplante Woche.
function resetWeek(revision, weekStart, now) {
	return mutate(revision, (data) => {
		const week = data.weeks.find((w) => w.start === weekStart);
		if (week) { week.manual = null; return; }
		if (data.plannedOverrides[weekStart]) { delete data.plannedOverrides[weekStart]; return; }
		throw new ValidationError("week", "Woche nicht gefunden");
	}, now);
}

// „Rotationsplan neu generieren“ für die Zukunft: alle geplanten Änderungen
// verwerfen, die laufende Woche bleibt.
function regenerateFuture(revision, now) {
	return mutate(revision, (data) => {
		data.plannedOverrides = {};
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

// ---------------------------------------------------------------------------
// Datensicherung (Phase 5): Export, Import, Backups
// ---------------------------------------------------------------------------
const EXPORT_TYPE = "lumira-familyplan-export";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// Prüft die Datei-Signatur, damit nur echte Bilder abgelegt werden.
function looksLikeImage(buf, ext) {
	if (ext === "png") return buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
	if (ext === "jpg") return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
	if (ext === "webp") return buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
	return false;
}

// Eine einzige JSON-Datei: der komplette Plan plus hochgeladene Fotos als
// Data-URL. Damit lässt sich alles sichern, auf ein anderes Gerät umziehen
// oder nach einer Neuinstallation zurückholen.
function exportData(now) {
	const { data, corrupt } = loadState();
	if (corrupt) throw new ValidationError("file", "familyplan.json ist beschädigt. Bitte zuerst ein Backup wiederherstellen.");
	const avatars = {};
	for (const m of data.members) {
		if (!m.avatar || m.avatar.type !== "upload") continue;
		const file = path.join(AVATAR_UPLOAD_DIR, m.avatar.file);
		if (!fs.existsSync(file)) continue;
		const ext = m.avatar.file.split(".").pop();
		const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
		avatars[m.avatar.file] = `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
	}
	return { type: EXPORT_TYPE, version: 1, exportedAt: (now || new Date()).toISOString(), data, avatars };
}

function importData(payload, now) {
	if (!payload || payload.type !== EXPORT_TYPE || !payload.data || typeof payload.data !== "object") {
		throw new ValidationError("file", "Das ist keine Familienplan-Sicherung von LUMIRA");
	}
	if (Number(payload.version) > 1) {
		throw new ValidationError("file", "Die Sicherung stammt aus einer neueren LUMIRA-Version. Bitte zuerst LUMIRA aktualisieren.");
	}
	const data = normalize(payload.data);
	validate(data);
	// Fotos prüfen, bevor irgendetwas geschrieben wird
	const files = [];
	const avatars = payload.avatars && typeof payload.avatars === "object" ? payload.avatars : {};
	for (const m of data.members) {
		if (!m.avatar || m.avatar.type !== "upload") continue;
		const url = avatars[m.avatar.file];
		const match = typeof url === "string" && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
		const ext = match && AVATAR_MIME[match[1]];
		const buf = match ? Buffer.from(match[2], "base64") : null;
		if (!ext || !buf || buf.length > MAX_AVATAR_BYTES || !looksLikeImage(buf, ext) || !m.avatar.file.endsWith(`.${ext}`)) {
			m.avatar = { type: "initials" }; // Foto fehlt oder ist kaputt: Initialen statt Fehler
			continue;
		}
		files.push({ file: m.avatar.file, buf });
	}
	const current = loadState();
	data.revision = current.corrupt ? data.revision : current.data.revision;
	fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
	for (const f of files) fs.writeFileSync(path.join(AVATAR_UPLOAD_DIR, f.file), f.buf);
	return save(data, now); // legt vorher ein Backup des bisherigen Stands an
}

// Automatische Backups (neueste zuerst) mit ein paar Eckdaten.
function listBackups() {
	return store.listBackups().reverse().map((name) => {
		const m = /^familyplan\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(name);
		const entry = { name, savedAt: m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z` : "" };
		try {
			const raw = store.readBackup(name);
			entry.members = Array.isArray(raw.members) ? raw.members.filter((x) => x && !x.deleted).map((x) => x.name) : [];
			entry.weeks = Array.isArray(raw.weeks) ? raw.weeks.length : 0;
		} catch (err) {
			entry.broken = true;
		}
		return entry;
	});
}

// Backup zurückholen. Funktioniert auch, wenn die aktuelle Datei beschädigt ist.
function restoreBackup(name, now) {
	let raw;
	try {
		raw = store.readBackup(String(name || ""));
	} catch (err) {
		throw new ValidationError("backup", "Dieses Backup ist beschädigt");
	}
	if (!raw) throw new ValidationError("backup", "Backup nicht gefunden");
	const data = normalize(raw);
	validate(data);
	const current = loadState();
	data.revision = current.corrupt ? data.revision : current.data.revision;
	return save(data, now);
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
	regenerateFuture,
	setUploadedAvatar,
	clearAvatar,
	memberExists,
	looksLikeImage,
	exportData,
	importData,
	listBackups,
	restoreBackup,
	ValidationError,
	ConflictError
};
