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
// Verteilung je Dienst (Konzept v1.1): wöchentlich/täglich/monatlich rotierend
// oder fest; „every“ = Rhythmus (alle N Tage/Wochen/Monate)
const ROTATIONS = ["weekly", "daily", "monthly", "fixed"];
const EVERY_MAX = { weekly: 4, daily: 7, monthly: 6, fixed: 1 };
const MAX_FIXED = 7;
const MAX_AWAY = 12;     // Zeiträume „nicht zu Hause“ je Person
const MAX_PER_DAY = 8;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
			fixedPairs: [],
			maxPerDay: 0
		},
		members: [],
		duties: DEFAULT_DUTIES.map((d) => cleanDuty(Object.assign({}, d, { roles: ROLES.slice(), active: true }))),
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

// „Nicht zu Hause“: Zeiträume [{ from, to }] (ISO-Daten, to ≥ from)
function cleanAway(list) {
	if (!Array.isArray(list)) return [];
	return list.filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(x.from) && /^\d{4}-\d{2}-\d{2}$/.test(x.to) && x.from <= x.to)
		.map((x) => ({ from: x.from, to: x.to }))
		.sort((a, b) => (a.from < b.from ? -1 : 1))
		.slice(0, MAX_AWAY);
}

function cleanMember(m) {
	return {
		id: String(m.id),
		name: String(m.name || "").slice(0, MAX_NAME),
		role: ROLES.indexOf(m.role) !== -1 ? m.role : "adult",
		color: HEX_RE.test(m.color) ? m.color : MEMBER_COLORS[0],
		avatar: cleanAvatar(m.avatar),
		awayDays: cleanDays(m.awayDays),
		awayDates: cleanAway(m.awayDates),
		active: m.active !== false,
		deleted: m.deleted === true
	};
}

// Wochentage eines Dienstes (0 = Sonntag … 6 = Samstag, wie Date#getDay).
// Leer = ganze Woche. Nur Anzeige/Hervorhebung – die Rotation bleibt wöchentlich.
function cleanDays(days) {
	if (!Array.isArray(days)) return [];
	const set = new Set(days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6));
	return [1, 2, 3, 4, 5, 6, 0].filter((n) => set.has(n));
}

// Feste Zuweisungen: [{ day: -1 (jeden Tag) | 0–6, memberId }], je Tag höchstens eine
function cleanFixed(list) {
	if (!Array.isArray(list)) return [];
	const out = [];
	const seen = {};
	for (const f of list) {
		if (!f || typeof f.memberId !== "string" || !f.memberId) continue;
		const day = Number(f.day);
		if (!Number.isInteger(day) || day < -1 || day > 6 || seen[day]) continue;
		seen[day] = true;
		out.push({ day, memberId: f.memberId });
	}
	if (out.some((f) => f.day === -1)) return out.filter((f) => f.day === -1).slice(0, 1);
	const order = [1, 2, 3, 4, 5, 6, 0];
	return out.sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day)).slice(0, MAX_FIXED);
}

function cleanEvery(rotation, every) {
	const n = Number(every);
	return Number.isInteger(n) && n >= 1 ? Math.min(n, EVERY_MAX[rotation] || 1) : 1;
}

function cleanDuty(d) {
	const roles = Array.isArray(d.roles) ? d.roles.filter((r) => ROLES.indexOf(r) !== -1) : ROLES.slice();
	const rotation = ROTATIONS.indexOf(d.rotation) !== -1 ? d.rotation : "weekly";
	const fixed = cleanFixed(d.fixed);
	return {
		id: String(d.id),
		name: String(d.name || "").slice(0, MAX_NAME),
		color: HEX_RE.test(d.color) ? d.color : "#9ca3af",
		icon: ICONS.indexOf(d.icon) !== -1 ? d.icon : "house",
		roles: roles.length ? roles : ROLES.slice(),
		// fest an einzelnen Tagen: die Tage ergeben sich aus den Zuweisungen
		days: rotation === "fixed" && fixed.length && fixed[0].day !== -1 ? cleanDays(fixed.map((f) => f.day)) : cleanDays(d.days),
		rotation,
		every: cleanEvery(rotation, d.every),
		fixed,
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

// Tagesplan einer Woche: { dutyId: { "YYYY-MM-DD": memberId | null } }
function cleanDayMap(m) {
	const out = {};
	if (!m || typeof m !== "object") return out;
	for (const did of Object.keys(m)) {
		if (!m[did] || typeof m[did] !== "object") continue;
		const row = {};
		for (const date of Object.keys(m[did])) {
			const v = m[did][date];
			if (DATE_RE.test(date) && (typeof v === "string" || v === null)) row[date] = v;
		}
		if (Object.keys(row).length) out[did] = row;
	}
	return out;
}

function cleanGaps(list) {
	return Array.isArray(list) ? list.filter((g) => g && typeof g.dutyId === "string" && DATE_RE.test(g.date)).map((g) => ({
		dutyId: g.dutyId, date: g.date, reason: ["paused", "away", "limit"].indexOf(g.reason) !== -1 ? g.reason : "nobody", memberId: typeof g.memberId === "string" ? g.memberId : undefined
	})) : [];
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
			fixedPairs: Array.isArray(s.fixedPairs) ? s.fixedPairs.filter((p) => Array.isArray(p) && p.length === 2).map((p) => [String(p[0]), String(p[1])]) : [],
			maxPerDay: Number.isInteger(s.maxPerDay) && s.maxPerDay >= 0 && s.maxPerDay <= MAX_PER_DAY ? s.maxPerDay : 0
		},
		members: Array.isArray(raw.members) ? raw.members.map(cleanMember) : [],
		duties: Array.isArray(raw.duties) ? raw.duties.map(cleanDuty) : base.duties,
		weeks: Array.isArray(raw.weeks) ? raw.weeks.filter((w) => w && /^\d{4}-\d{2}-\d{2}$/.test(w.start)).map((w) => ({
			start: w.start,
			auto: cleanAssign(w.auto),
			manual: w.manual ? cleanAssign(w.manual) : null,
			unassigned: Array.isArray(w.unassigned) ? w.unassigned.filter((x) => typeof x === "string") : [],
			days: cleanDayMap(w.days),
			manualDays: w.manualDays ? cleanDayMap(w.manualDays) : null,
			gaps: cleanGaps(w.gaps),
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
	const memberIds = members.map((m) => m.id);
	for (const d of duties) {
		if (d.rotation === "fixed" && !d.fixed.length) {
			throw new ValidationError("duties", `${d.name}: Für „fest zugewiesen“ mindestens eine Person eintragen`);
		}
		for (const f of d.fixed) {
			if (f.memberId !== rot.ALL && memberIds.indexOf(f.memberId) === -1) throw new ValidationError("duties", `${d.name}: Die fest eingetragene Person gibt es nicht mehr`);
		}
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
		d: activeDuties(data).map((d) => [d.id, d.roles.slice().sort(), d.rotation, d.every, d.fixed, d.rotation === "daily" ? d.days : []]),
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
// Tagesplan einer Woche inklusive manueller Änderungen
function effectiveDays(week) {
	const out = JSON.parse(JSON.stringify(week.days || {}));
	const man = week.manualDays || {};
	for (const did of Object.keys(man)) {
		out[did] = Object.assign(out[did] || {}, man[did]);
	}
	return out;
}

// Wochenverteilung (ganze Woche bei einer Person) und Tagesplan (tägliche
// Rotation, feste Tage). Feste Zuweisungen und Dienste, deren Rhythmus noch
// nicht wechselt, stehen vorab fest; der Rest wird fair darum herum verteilt.
function computeFor(data, weekStart, simulated) {
	const members = activeMembers(data);
	const before = data.weeks.filter((w) => w.start < weekStart);
	const prev = before.map((w) => ({ start: w.start, assign: shown(w), days: effectiveDays(w) }))
		.concat((simulated || []).map((s) => ({ start: s.start, assign: s.assign, days: s.days || {} })));
	const history = prev.map((w) => w.assign);
	const cycleStart = data.settings.cycleStart || "";
	const inCycle = prev.filter((w) => w.start >= cycleStart).length;
	const duties = activeDuties(data);
	const weekEnd = rot.nextBoundary(weekStart, data.settings.rotationWeekday);
	// Wer die ganze Woche nicht zu Hause ist, bekommt auch keinen Wochendienst
	const weekDates = [];
	for (let k = weekStart; k < weekEnd; k = rot.addDays(k, 1)) weekDates.push(k);
	const weekMembers = members.filter((m) => !weekDates.every((k) => rot.isAway(m, k)));
	const memberById = {};
	weekMembers.forEach((m) => { memberById[m.id] = m; });
	const last = prev[prev.length - 1];

	const preassigned = {};
	const blocked = [];
	const rotating = [];
	for (const d of duties) {
		const allWeek = d.fixed.find((f) => f.day === -1);
		if (allWeek && allWeek.memberId === rot.ALL) continue; // ganze Familie → Tagesplan
		if (allWeek) {
			if (memberById[allWeek.memberId]) preassigned[d.id] = allWeek.memberId;
			else blocked.push(d.id); // feste Person pausiert → Dienst bleibt frei (Hinweis)
			continue;
		}
		if (d.rotation === "daily" || d.rotation === "fixed") continue; // Tagesplan
		// Rhythmus/monatlich: bis zum nächsten Wechsel behält die Person den Dienst
		if (last && !rot.changeDue(d.rotation, d.every, last.start, weekStart)) {
			const holder = Object.keys(last.assign).find((pid) => (last.assign[pid] || []).indexOf(d.id) !== -1);
			if (holder && memberById[holder] && rot.allowed(memberById[holder], d)) { preassigned[d.id] = holder; continue; }
		}
		rotating.push(d);
	}
	const res = rot.computeWeek({
		members: weekMembers.map((m) => ({ id: m.id, role: m.role })),
		duties: rotating.map((d) => ({ id: d.id, roles: d.roles })),
		preassigned,
		order: duties.map((d) => d.id),
		history,
		cyclePos: members.length ? inCycle % members.length : 0,
		key: weekStart,
		pairMode: data.settings.pairMode,
		fixedPairs: data.settings.fixedPairs
	});
	const dayRes = rot.computeDays({
		start: weekStart,
		end: weekEnd,
		members: members.map((m) => ({ id: m.id, role: m.role, awayDays: m.awayDays, awayDates: m.awayDates })),
		maxPerDay: data.settings.maxPerDay,
		duties: duties.map((d) => ({ id: d.id, roles: d.roles, rotation: d.rotation, every: d.every, days: d.days, fixed: d.fixed })),
		weekAssign: res.assign,
		history: prev.map((w) => w.days),
		key: weekStart,
		pairMode: data.settings.pairMode,
		fixedPairs: data.settings.fixedPairs
	});
	const gaps = dayRes.gaps.slice();
	blocked.forEach((did) => {
		const f = duties.find((d) => d.id === did).fixed[0];
		const m = members.find((x) => x.id === f.memberId);
		gaps.push({ dutyId: did, date: weekStart, reason: m ? "away" : "paused", memberId: f.memberId });
	});
	return {
		assign: res.assign,
		unassigned: res.unassigned.concat(blocked),
		overQuota: res.overQuota,
		days: dayRes.days,
		gaps,
		preassigned
	};
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
		out.push({ start, auto: res.assign, manual, assign, unassigned: res.unassigned, days: res.days, gaps: res.gaps, history: simulated.slice() });
		simulated.push({ start, assign, days: res.days });
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
			const dd = dutyById[did];
			const prevWeek = recent[recent.length - 1];
			const kept = prevWeek && (prevWeek.assign[pid] || []).indexOf(did) !== -1;
			if (week.manual && auto.indexOf(did) === -1) {
				parts.push("Manuell festgelegt.");
			} else if (dd && dd.fixed && dd.fixed.some((f) => f.day === -1 && f.memberId === pid)) {
				parts.push("Fest zugewiesen.");
			} else if (dd && kept && dd.rotation === "monthly") {
				parts.push(dd.every > 1 ? `Wechselt nur alle ${dd.every} Monate (am ersten Wechseltag im Monat).` : "Monatlicher Dienst – wechselt am ersten Wechseltag im neuen Monat.");
			} else if (dd && kept && dd.rotation === "weekly" && dd.every > 1) {
				parts.push(`Wechselt nur alle ${dd.every} Wochen.`);
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
		// Tagesdienste (täglich/feste Tage) zählen je Tag
		const days = effectiveDays(w);
		for (const did of Object.keys(days)) {
			for (const date of Object.keys(days[did])) {
				const pid = days[did][date];
				const list = pid === rot.ALL ? members.filter((m) => !rot.isAway(m, date)).map((m) => m.id) : [pid];
				list.forEach((p) => { if (p && counts[p]) counts[p][did] = (counts[p][did] || 0) + 1; });
			}
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
		days: res.days,
		manualDays: null,
		gaps: res.gaps,
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
		days: effectiveDays(week),
		manualDays: week.manualDays || null,
		gaps: week.gaps || [],
		dates: datesOf(week.start, end),
		stale: end < todayKey
	};
}

function datesOf(start, end) {
	const out = [];
	for (let k = start; k <= end; k = rot.addDays(k, 1)) out.push(k);
	return out;
}

// Wer hat heute welchen Dienst? Wochendienste plus Tagesdienste des Tages –
// ein fester Tag oder eine Tagesänderung geht dem Wochen-Inhaber vor.
function todayOf(week, dateKey, members) {
	const assign = shown(week);
	const days = effectiveDays(week);
	const out = {};
	for (const pid of Object.keys(assign)) {
		out[pid] = assign[pid].filter((did) => !(days[did] && days[did][dateKey] !== undefined && days[did][dateKey] !== pid && days[did][dateKey] !== rot.ALL))
			.map((did) => ({ dutyId: did, day: !!(days[did] && days[did][dateKey] === pid) }));
	}
	for (const did of Object.keys(days)) {
		const pid = days[did][dateKey];
		if (!pid) continue;
		const list = pid === rot.ALL ? Object.keys(assign).filter((p) => !rot.isAway((members || []).find((m) => m.id === p), dateKey)) : [pid];
		for (const p of list) {
			out[p] = out[p] || [];
			if (!out[p].some((x) => x.dutyId === did)) out[p].push({ dutyId: did, day: true, all: pid === rot.ALL });
		}
	}
	return out;
}

function view(now) {
	now = now || new Date();
	const { data, corrupt } = loadState();
	const todayKey = rot.toKey(now);
	const idx = currentWeekIndex(data, todayKey);
	const current = idx >= 0 ? weekView(data, data.weeks[idx], todayKey) : null;
	const stored = data.weeks.map((w) => ({ start: w.start, assign: shown(w) }));
	if (current) {
		current.reasons = explain(data, stored.slice(0, idx), current);
		current.today = todayOf(data.weeks[idx], todayKey, data.members);
		current.away = data.members.filter((m) => !m.deleted && rot.isAway(m, todayKey)).map((m) => m.id);
		current.todayKey = todayKey;
	}

	const preview = simulateFuture(data, now, data.settings.previewWeeks).map((p) => {
		const entry = {
			start: p.start,
			end: rot.addDays(rot.nextBoundary(p.start, data.settings.rotationWeekday), -1),
			kw: rot.isoWeek(p.start),
			assign: p.assign,
			auto: p.auto,
			manual: p.manual,
			unassigned: p.unassigned,
			days: p.days,
			gaps: p.gaps
		};
		entry.dates = datesOf(entry.start, entry.end);
		entry.reasons = explain(data, stored.slice(0, idx + 1).concat(p.history), entry);
		return entry;
	});

	const warnings = [];
	if (corrupt) warnings.push("familyplan.json ist beschädigt. Bitte unter „Einstellungen → Datensicherung“ ein Backup wiederherstellen.");
	if (!activeMembers(data).length) warnings.push("Noch keine Mitglieder. Lege unter „Familienmitglieder“ die Familie an.");
	if (!clockPlausible(data, now)) warnings.push("Die Uhrzeit des Pi wirkt falsch (liegt vor der letzten Änderung). Neue Wochen werden erst angelegt, wenn die Uhr wieder stimmt.");
	if (!data.settings.autoRotate) warnings.push("Die automatische Rotation ist pausiert. Der Plan bleibt stehen.");
	const dutyName = (id) => (data.duties.find((d) => d.id === id) || { name: id }).name;
	if (current && current.unassigned.length) {
		const paused = new Set(current.gaps.filter((g) => g.reason === "paused").map((g) => g.dutyId));
		const names = current.unassigned.filter((id) => !paused.has(id)).map(dutyName);
		if (names.length) warnings.push(`Diese Woche nicht vergeben, weil niemand Passendes mitmacht: ${names.join(", ")}`);
	}
	warnings.push(...ruleWarnings(data));
	if (current) {
		const limit = current.gaps.filter((g) => g.reason === "limit" && g.date >= todayKey);
		if (limit.length) {
			const days = [...new Set(limit.map((g) => DAY_NAMES[rot.fromKey(g.date).getDay()].slice(0, 2)))].join(", ");
			warnings.push(`Höchstens ${data.settings.maxPerDay} Dienste pro Person und Tag: ${limit.length === 1 ? "1 Tagesdienst bleibt" : limit.length + " Tagesdienste bleiben"} diese Woche frei (${days}).`);
		}
		const nobody = [...new Set(current.gaps.filter((g) => g.reason === "nobody").map((g) => g.dutyId))].map(dutyName);
		if (nobody.length) warnings.push(`Tagesdienst ohne passende Person (Rolle): ${nobody.join(", ")}`);
		const uneven = unevenText(data, current.assign);
		if (uneven) warnings.push(uneven);
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

// Konflikte in den Regeln: feste Person pausiert, Rolle passt nicht
const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
function ruleWarnings(data) {
	const out = [];
	const byId = {};
	data.members.forEach((m) => { byId[m.id] = m; });
	for (const d of activeDuties(data)) {
		for (const f of d.fixed) {
			const m = byId[f.memberId];
			if (!m) continue;
			const when = f.day === -1 ? "die ganze Woche" : "am " + DAY_NAMES[f.day];
			if (!m.active) out.push(`${d.name}: ${m.name} ist pausiert – ${when} bleibt der Dienst frei.`);
			else if (!rot.allowed(m, d)) out.push(`${d.name}: ${m.name} ist fest eingetragen, obwohl der Dienst nur für ${d.roles[0] === "adult" ? "Erwachsene" : "Kinder"} gilt – die feste Zuweisung geht vor.`);
		}
	}
	return out;
}

// Ungleiche Verteilung der Wochendienste (meist wegen fester Zuweisungen)
function unevenText(data, assign) {
	const members = activeMembers(data).filter((m) => Array.isArray(assign[m.id]));
	if (members.length < 2) return "";
	const counts = members.map((m) => ({ name: m.name, n: assign[m.id].length }));
	const max = Math.max(...counts.map((c) => c.n));
	const min = Math.min(...counts.map((c) => c.n));
	if (max - min < 2) return "";
	return "Diese Woche ungleich verteilt: " + counts.map((c) => `${c.name} ${c.n}`).join(", ") + " Wochendienste – feste Zuweisungen haben Vorrang.";
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
				awayDays: cleanDays(item.awayDays !== undefined ? item.awayDays : existing && existing.awayDays),
				awayDates: checkAway(field, item.name, item.awayDates !== undefined ? item.awayDates : existing && existing.awayDates, now || new Date()),
				active: item.active !== false,
				deleted: false
			});
		});
		const awayBefore = JSON.stringify(data.members.filter((m) => !m.deleted).map((m) => [m.id, m.awayDays, m.awayDates]));
		const keep = new Set(next.map((m) => m.id));
		const removed = data.members.filter((m) => !keep.has(m.id)).map((m) => Object.assign({}, m, { deleted: true }));
		data.members = next.concat(removed);
		// Feste Zuweisungen an entfernte Personen fallen weg; ein „fester“ Dienst
		// ohne Person rotiert wieder wöchentlich
		for (const d of data.duties) {
			d.fixed = (d.fixed || []).filter((f) => f.memberId === rot.ALL || keep.has(f.memberId));
			if (d.rotation === "fixed" && !d.fixed.length) { d.rotation = "weekly"; d.every = 1; }
		}
		if (fingerprint(data) !== before) restartCycle(data, now || new Date());
		// „Nicht zu Hause“ wirkt sofort: Tagesplan der laufenden Woche ab heute neu
		const awayAfter = JSON.stringify(data.members.filter((m) => !m.deleted).map((m) => [m.id, m.awayDays, m.awayDates]));
		if (awayAfter !== awayBefore) refreshDaysFromToday(data, now || new Date());
	}, now);
}

// Zeiträume „nicht zu Hause“ prüfen; längst vergangene fallen weg
function checkAway(field, name, list, now) {
	if (list === undefined || list === null) return [];
	if (!Array.isArray(list)) throw new ValidationError(field, "Abwesenheiten müssen eine Liste sein");
	const who = String(name || "").trim() || "Mitglied";
	const old = rot.addDays(rot.toKey(now), -30);
	const out = [];
	for (const x of list) {
		if (!x || !DATE_RE.test(String(x.from)) || !DATE_RE.test(String(x.to))) throw new ValidationError(field, `${who}: Bitte bei „nicht zu Hause“ Von- und Bis-Datum angeben`);
		if (x.to < x.from) throw new ValidationError(field, `${who}: Das Bis-Datum liegt vor dem Von-Datum`);
		if (x.to < old) continue;
		out.push({ from: x.from, to: x.to });
	}
	if (out.length > MAX_AWAY) throw new ValidationError(field, `${who}: Höchstens ${MAX_AWAY} Zeiträume`);
	return cleanAway(out);
}

// Tagesplan der laufenden Woche ab heute neu berechnen (vergangene Tage
// bleiben) – wenn jemand „nicht zu Hause“ ist oder die Tagesobergrenze sich ändert
function refreshDaysFromToday(data, now) {
	const todayKey = rot.toKey(now);
	const idx = currentWeekIndex(data, todayKey);
	if (idx < 0) return;
	const week = data.weeks[idx];
	const res = computeFor(data, week.start);
	const next = {};
	const ids = new Set(Object.keys(week.days || {}).concat(Object.keys(res.days)));
	for (const did of ids) {
		const row = {};
		Object.keys((week.days || {})[did] || {}).forEach((k) => { if (k < todayKey) row[k] = week.days[did][k]; });
		Object.keys(res.days[did] || {}).forEach((k) => { if (k >= todayKey) row[k] = res.days[did][k]; });
		if (Object.keys(row).length) next[did] = row;
	}
	week.days = next;
	week.gaps = (week.gaps || []).filter((g) => g.date < todayKey).concat(res.gaps.filter((g) => g.date >= todayKey));
}

// Verteilung eines Dienstes aus dem Portal prüfen (verständliche Fehler)
const ROTATION_LABEL = { weekly: "Wochen", daily: "Tage", monthly: "Monate" };
function checkRotation(field, item, data, existing) {
	const name = String(item.name || "Dienst").trim() || "Dienst";
	const rotation = item.rotation === undefined ? (existing ? existing.rotation : "weekly") : item.rotation;
	if (ROTATIONS.indexOf(rotation) === -1) throw new ValidationError(field, `${name}: Unbekannte Verteilung`);
	const every = item.every === undefined ? (existing && existing.rotation === rotation ? existing.every : 1) : Number(item.every);
	if (rotation !== "fixed" && (!Number.isInteger(every) || every < 1 || every > EVERY_MAX[rotation])) {
		throw new ValidationError(field, `${name}: Rhythmus 1 bis ${EVERY_MAX[rotation]} ${ROTATION_LABEL[rotation]}`);
	}
	const list = item.fixed === undefined ? (existing ? existing.fixed : []) : item.fixed;
	if (!Array.isArray(list)) throw new ValidationError(field, `${name}: Feste Zuweisungen müssen eine Liste sein`);
	const members = data.members.filter((m) => !m.deleted).map((m) => m.id);
	const seen = {};
	for (const f of list) {
		const day = Number(f && f.day);
		if (!Number.isInteger(day) || day < -1 || day > 6) throw new ValidationError(field, `${name}: Unbekannter Wochentag`);
		if (f.memberId !== rot.ALL && members.indexOf(f.memberId) === -1) throw new ValidationError(field, `${name}: Bitte für jede feste Zuweisung eine Person wählen`);
		if (seen[day]) throw new ValidationError(field, `${name}: ${day === -1 ? "„Jeden Tag“" : DAY_NAMES[day]} ist doppelt fest vergeben`);
		seen[day] = true;
	}
	if (seen[-1] && list.length > 1) throw new ValidationError(field, `${name}: „Jeden Tag“ lässt sich nicht mit einzelnen Tagen mischen`);
	if (list.length > MAX_FIXED) throw new ValidationError(field, `${name}: Höchstens ${MAX_FIXED} feste Zuweisungen`);
	if (rotation === "fixed" && !list.length) throw new ValidationError(field, `${name}: Für „fest zugewiesen“ mindestens eine Person eintragen`);
	return { rotation, every: rotation === "fixed" ? 1 : every, fixed: cleanFixed(list) };
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
				days: cleanDays(item.days),
				...checkRotation(field, item, data, existing),
				active: item.active !== false,
				deleted: false
			};
		}).map((d) => Object.assign(d, { days: cleanDuty(d).days }));
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
		if (patch.maxPerDay !== undefined) {
			const n = Number(patch.maxPerDay);
			if (!Number.isInteger(n) || n < 0 || n > MAX_PER_DAY) throw new ValidationError("settings.maxPerDay", `Höchstens 0 (unbegrenzt) bis ${MAX_PER_DAY} Dienste pro Tag`);
			if (s.maxPerDay !== n) { s.maxPerDay = n; refreshDaysFromToday(data, now || new Date()); }
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
		if (week) { week.manual = null; week.manualDays = null; return; }
		if (data.plannedOverrides[weekStart]) { delete data.plannedOverrides[weekStart]; return; }
		throw new ValidationError("week", "Woche nicht gefunden");
	}, now);
}

// Tagesdienst an einem Tag der laufenden Woche jemand anderem geben (oder
// zurück zur Automatik: memberId = Wert aus dem Tagesplan).
function assignDay(revision, weekStart, dutyId, date, memberId, now) {
	now = now || new Date();
	return mutate(revision, (data) => {
		const idx = currentWeekIndex(data, rot.toKey(now));
		if (idx < 0 || data.weeks[idx].start !== weekStart) throw new ValidationError("week", "Einzelne Tage lassen sich nur in der laufenden Woche ändern");
		const week = data.weeks[idx];
		const end = rot.addDays(rot.nextBoundary(week.start, data.settings.rotationWeekday), -1);
		if (!DATE_RE.test(String(date)) || date < week.start || date > end) throw new ValidationError("date", "Der Tag liegt nicht in dieser Woche");
		if (!data.duties.some((d) => d.id === dutyId && !d.deleted)) throw new ValidationError("dutyId", "Unbekannter Dienst");
		if (!(week.days[dutyId] && Object.prototype.hasOwnProperty.call(week.days[dutyId], date))) {
			throw new ValidationError("date", "An diesem Tag gibt es den Dienst nicht");
		}
		if (memberId !== rot.ALL && !activeMembers(data).some((m) => m.id === memberId)) throw new ValidationError("memberId", "Bitte eine (aktive) Person wählen");
		const md = week.manualDays || {};
		if (week.days[dutyId][date] === memberId) {
			if (md[dutyId]) { delete md[dutyId][date]; if (!Object.keys(md[dutyId]).length) delete md[dutyId]; }
		} else {
			(md[dutyId] = md[dutyId] || {})[date] = memberId;
		}
		week.manualDays = Object.keys(md).length ? md : null;
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
		week.days = res.days;
		week.gaps = res.gaps;
		week.manual = null;
		week.manualDays = null;
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
	ROTATIONS,
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
	assignDay,
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
