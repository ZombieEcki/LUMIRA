// LUMIRA – To-do-Liste (Extras → To-do), Modul MMM-LumiraTodo.
//
// ~/.lumira/todo.json: Listen, Kategorien, Aufgaben und die Anzeige auf dem
// Bildschirm. Nur das Portal schreibt – atomar, vorher höchstens stündlich
// ein Backup (~/.lumira/backups/todo-*.json, die letzten 15) –, der
// node_helper liest per fs.watch. Gelöscht wird nur auf ausdrücklichen
// Wunsch; eine beschädigte Datei wird nie überschrieben.
//
// Wiederholung: Beim Abhaken einer wiederkehrenden Aufgabe bleibt die
// erledigte Instanz (gespeichert in derselben Schreibaktion) und eine neue
// mit dem nächsten Fälligkeitstag entsteht. Wieder aufhaken nimmt die neue
// zurück, solange sie unberührt ist.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createJsonStore } = require("./store");
const view = require("../public/todo-view");

class TodoError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

const MAX = { lists: 30, categories: 40, tasks: 2000, sub: 30 };
const HEX = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIOS = view.PRIORITIES.map((p) => p[0]);
const ICON_IDS = view.ICONS.map((i) => i[0]);
const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"];
const BACKUP_EVERY_MS = 3600000;

const DEFAULT_CATEGORIES = [
	["Haushalt", "#f5b942", "house"], ["Einkaufen", "#3d9cff", "cart-shopping"], ["Garten", "#2ecc71", "leaf"],
	["Arbeit", "#a66bff", "briefcase"], ["Termine", "#26c6da", "calendar-days"], ["Gesundheit / Erledigungen", "#ef5350", "heart-pulse"],
	["Freizeit", "#ff8a3d", "gamepad"], ["Sonstiges", "#ff7eb6", "heart"]
];

const newId = (p) => p + crypto.randomBytes(5).toString("hex");
const str = (v, max) => String(v === undefined || v === null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

function validDate(s) {
	if (!DATE.test(s)) return false;
	const [y, m, d] = s.split("-").map(Number);
	const t = new Date(Date.UTC(y, m - 1, d));
	return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// ------------------------------------------------------------------ Wiederholung
function addDaysKey(k, n) {
	const [y, m, d] = k.split("-").map(Number);
	const t = new Date(Date.UTC(y, m - 1, d + n));
	return t.toISOString().slice(0, 10);
}
function addMonthsKey(k, n) {
	const [y, m, d] = k.split("-").map(Number);
	const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
	return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}
function wdOf(k) { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

// Nächster Fälligkeitstag nach „from“ – mindestens heute, damit eine verspätet
// erledigte Aufgabe nicht gleich wieder überfällig ist. Der Rhythmus bleibt.
function nextDue(repeat, from, today) {
	const every = Math.max(1, repeat.every || 1);
	const step = (k) => {
		switch (repeat.type) {
			case "daily": return addDaysKey(k, every);
			case "weekly": return addDaysKey(k, 7 * every);
			case "monthly": return addMonthsKey(k, every);
			case "yearly": return addMonthsKey(k, 12 * every);
			case "weekdays": {
				const days = repeat.days && repeat.days.length ? repeat.days : [wdOf(k)];
				let n = addDaysKey(k, 1);
				for (let i = 0; i < 7 && days.indexOf(wdOf(n)) === -1; i++) n = addDaysKey(n, 1);
				return n;
			}
			default: return null;
		}
	};
	let n = step(from);
	for (let i = 0; n && n < today && i < 5000; i++) n = step(n);
	return n;
}

// ------------------------------------------------------------------ Prüfen und bereinigen
function cleanRepeat(r) {
	r = r && typeof r === "object" ? r : {};
	const type = REPEATS.indexOf(r.type) === -1 ? "none" : r.type;
	return {
		type,
		every: Math.min(99, Math.max(1, Math.round(Number(r.every) || 1))),
		days: Array.isArray(r.days) ? Array.from(new Set(r.days.map(Number).filter((d) => d >= 0 && d <= 6))).sort() : []
	};
}

function checkTask(p, isNew) {
	if (!p || typeof p !== "object") throw new TodoError("Ungültige Aufgabe");
	if (isNew || p.title !== undefined) {
		if (typeof p.title !== "string" || !p.title.trim()) throw new TodoError("Bitte einen Titel eingeben");
		if (p.title.length > 200) throw new TodoError("Titel höchstens 200 Zeichen");
	}
	if (p.priority !== undefined && PRIOS.indexOf(p.priority) === -1) throw new TodoError("Priorität: niedrig, normal, hoch oder dringend");
	if (p.due !== undefined && p.due !== "" && !validDate(String(p.due))) throw new TodoError("Fälligkeit als Datum (JJJJ-MM-TT)");
	if (p.time !== undefined && p.time !== "" && !TIME.test(String(p.time))) throw new TodoError("Uhrzeit als HH:MM");
	if (p.icon !== undefined && p.icon !== "" && ICON_IDS.indexOf(p.icon) === -1) throw new TodoError("Unbekanntes Symbol");
	if (p.note !== undefined && String(p.note).length > 1000) throw new TodoError("Notiz höchstens 1000 Zeichen");
	if (p.repeat !== undefined && (typeof p.repeat !== "object" || (p.repeat && REPEATS.indexOf(p.repeat.type) === -1))) throw new TodoError("Unbekannte Wiederholung");
	if (p.sub !== undefined) {
		if (!Array.isArray(p.sub) || p.sub.length > MAX.sub) throw new TodoError("Höchstens " + MAX.sub + " Unteraufgaben");
		p.sub.forEach((s) => { if (!s || typeof s.title !== "string" || !s.title.trim() || s.title.length > 200) throw new TodoError("Unteraufgabe braucht einen Titel"); });
	}
	if (p.done !== undefined && typeof p.done !== "boolean") throw new TodoError("Ungültiger Status");
}

function cleanTask(t, ctx) {
	const repeat = cleanRepeat(t.repeat);
	return {
		id: String(t.id),
		list: ctx.lists[t.list] ? t.list : ctx.firstList,
		title: str(t.title, 200),
		category: t.category && ctx.categories[t.category] ? t.category : "",
		priority: PRIOS.indexOf(t.priority) === -1 ? "normal" : t.priority,
		due: t.due && validDate(String(t.due)) ? String(t.due) : "",
		time: t.time && TIME.test(String(t.time)) ? String(t.time) : "",
		note: str(t.note, 1000),
		icon: ICON_IDS.indexOf(t.icon) === -1 ? "" : t.icon,
		repeat,
		done: !!t.done,
		doneAt: t.done ? (t.doneAt || new Date().toISOString()) : null,
		next: t.next ? String(t.next) : "",
		sub: (Array.isArray(t.sub) ? t.sub : []).slice(0, MAX.sub).map((s) => ({ id: s.id ? String(s.id) : newId("s"), title: str(s.title, 200), done: !!s.done })).filter((s) => s.title),
		order: Number.isFinite(Number(t.order)) ? Number(t.order) : 0,
		createdAt: t.createdAt || new Date().toISOString()
	};
}

function createTodo({ home, now = () => new Date() } = {}) {
	home = path.resolve(home);
	const statePath = path.join(home, "todo.json");
	const store = createJsonStore({ filePath: statePath, backupDir: path.join(home, "backups"), backupPrefix: "todo", maxBackups: 15 });

	// Grundausstattung mit festen IDs: solange todo.json fehlt, liefert jedes
	// Lesen dieselben IDs (sonst passte die erste neue Aufgabe zu keiner Liste)
	function seed() {
		return {
			lists: [{ id: "l-privat", name: "Privat", enabled: true }],
			categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: "c-start" + i, name: c[0], color: c[1], icon: c[2], hidden: false })),
			tasks: [],
			display: view.clean(null)
		};
	}

	function normalize(raw) {
		const r = raw && typeof raw === "object" ? raw : {};
		const lists = (Array.isArray(r.lists) ? r.lists : []).filter((l) => l && l.id).slice(0, MAX.lists)
			.map((l) => ({ id: String(l.id), name: str(l.name, 40) || "Liste", enabled: l.enabled !== false }));
		const categories = (Array.isArray(r.categories) ? r.categories : []).filter((c) => c && c.id).slice(0, MAX.categories)
			.map((c) => ({ id: String(c.id), name: str(c.name, 40) || "Kategorie", color: HEX.test(String(c.color)) ? String(c.color).toLowerCase() : "#8a93a6", icon: ICON_IDS.indexOf(c.icon) === -1 ? "list-check" : c.icon, hidden: !!c.hidden }));
		const ctx = { lists: {}, categories: {}, firstList: lists[0] ? lists[0].id : "" };
		lists.forEach((l) => { ctx.lists[l.id] = true; });
		categories.forEach((c) => { ctx.categories[c.id] = true; });
		const tasks = (Array.isArray(r.tasks) ? r.tasks : []).filter((t) => t && t.id && t.title).slice(0, MAX.tasks).map((t) => cleanTask(t, ctx)).filter((t) => t.list);
		return { lists, categories, tasks, display: view.clean(r.display) };
	}

	// Lesen: ohne Datei die Grundausstattung; beschädigt → Fehler, nichts überschreiben
	function load() {
		if (!store.exists()) return seed();
		let raw;
		try { raw = store.readRaw(); } catch (e) { throw new TodoError("todo.json ist beschädigt – bitte unter „Datensicherung“ ein Backup wiederherstellen", 500); }
		const d = normalize(raw);
		if (!d.lists.length) d.lists.push({ id: newId("l"), name: "Privat", enabled: true });
		return d;
	}

	function save(d) {
		const backups = store.listBackups();
		const last = backups.length ? path.join(home, "backups", backups[backups.length - 1]) : "";
		const lastAt = last ? fs.statSync(last).mtimeMs : 0;
		if (!lastAt || now().getTime() - lastAt > BACKUP_EVERY_MS) store.backupExisting();
		fs.mkdirSync(home, { recursive: true });
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(Object.assign({ version: 1, updatedAt: now().toISOString() }, d), null, 2) + "\n");
		require("./atomic").renameRetry(tmp, statePath);
		return current(d);
	}

	function readReport() {
		try {
			const r = JSON.parse(fs.readFileSync(path.join(home, "todo-mirror.json"), "utf8"));
			return { at: String(r.at || ""), screen: r.screen || null, overlaps: Array.isArray(r.overlaps) ? r.overlaps.map(String) : [], offscreen: !!r.offscreen, dropped: Number(r.dropped) || 0 };
		} catch (e) { return null; }
	}

	function current(d) {
		d = d || load();
		return Object.assign({}, d, { report: readReport(), defaults: view.DEFAULTS });
	}

	function find(d, key, id) {
		const i = d[key].findIndex((x) => x.id === id);
		if (i === -1) throw new TodoError(key === "tasks" ? "Aufgabe nicht gefunden" : key === "lists" ? "Liste nicht gefunden" : "Kategorie nicht gefunden", 404);
		return i;
	}

	function ctxOf(d) {
		const c = { lists: {}, categories: {}, firstList: d.lists[0] ? d.lists[0].id : "" };
		d.lists.forEach((l) => { c.lists[l.id] = true; });
		d.categories.forEach((x) => { c.categories[x.id] = true; });
		return c;
	}

	// ---------------------------------------------------------------- Aufgaben
	function addTask(p) {
		checkTask(p, true);
		const d = load();
		if (d.tasks.length >= MAX.tasks) throw new TodoError("Höchstens " + MAX.tasks + " Aufgaben");
		const list = p.list && d.lists.some((l) => l.id === p.list) ? p.list : d.lists[0].id;
		const top = d.tasks.filter((t) => t.list === list).reduce((m, t) => Math.max(m, t.order), 0);
		d.tasks.push(cleanTask(Object.assign({}, p, { id: newId("t"), list, done: false, order: top + 1, createdAt: now().toISOString() }), ctxOf(d)));
		return save(d);
	}

	function updateTask(id, p) {
		checkTask(p, false);
		const d = load();
		const i = find(d, "tasks", id);
		const cur = d.tasks[i];
		const next = Object.assign({}, cur, p, { id, done: cur.done, doneAt: cur.doneAt });
		if (p.list !== undefined && !d.lists.some((l) => l.id === p.list)) throw new TodoError("Liste nicht gefunden", 404);
		if (p.category !== undefined && p.category !== "" && !d.categories.some((c) => c.id === p.category)) throw new TodoError("Kategorie nicht gefunden", 404);
		d.tasks[i] = cleanTask(next, ctxOf(d));
		return save(d);
	}

	// Abhaken / wieder öffnen – mit Wiederholung
	function toggleTask(id, done) {
		const d = load();
		const i = find(d, "tasks", id);
		const t = d.tasks[i];
		const want = done === undefined ? !t.done : !!done;
		if (want === t.done) return current(d);
		const today = view.dayKey(now().getTime());
		if (want) {
			t.done = true;
			t.doneAt = now().toISOString();
			if (t.repeat.type !== "none" && !t.next) {
				const due = nextDue(t.repeat, t.due || today, today);
				if (due) {
					const copy = cleanTask(Object.assign({}, t, { id: newId("t"), due, done: false, doneAt: null, next: "", createdAt: now().toISOString(),
						sub: t.sub.map((s) => ({ title: s.title, done: false })) }), ctxOf(d));
					t.next = copy.id;
					d.tasks.push(copy);
				}
			}
		} else {
			t.done = false;
			t.doneAt = null;
			// die gerade erzeugte nächste Instanz wieder wegnehmen, solange unberührt
			if (t.next) {
				const j = d.tasks.findIndex((x) => x.id === t.next);
				if (j !== -1 && !d.tasks[j].done) d.tasks.splice(j, 1);
				t.next = "";
			}
		}
		return save(d);
	}

	function toggleSub(id, subId) {
		const d = load();
		const t = d.tasks[find(d, "tasks", id)];
		const s = t.sub.find((x) => x.id === subId);
		if (!s) throw new TodoError("Unteraufgabe nicht gefunden", 404);
		s.done = !s.done;
		return save(d);
	}

	function removeTask(id) {
		const d = load();
		d.tasks.splice(find(d, "tasks", id), 1);
		return save(d);
	}

	// Erledigte einer Liste (oder aller) löschen – ausdrücklich gewollt
	function clearDone(listId) {
		const d = load();
		const n = d.tasks.length;
		d.tasks = d.tasks.filter((t) => !t.done || (listId && t.list !== listId));
		if (d.tasks.length === n) return current(d);
		return save(d);
	}

	function orderTasks(ids) {
		if (!Array.isArray(ids)) throw new TodoError("Ungültige Reihenfolge");
		const d = load();
		ids.forEach((id, k) => { const t = d.tasks.find((x) => x.id === id); if (t) t.order = k + 1; });
		return save(d);
	}

	// ---------------------------------------------------------------- Listen
	function checkName(n) {
		if (typeof n !== "string" || !n.trim() || n.length > 40) throw new TodoError("Name 1 bis 40 Zeichen");
	}

	function addList(p) {
		checkName(p && p.name);
		const d = load();
		if (d.lists.length >= MAX.lists) throw new TodoError("Höchstens " + MAX.lists + " Listen");
		d.lists.push({ id: newId("l"), name: str(p.name, 40), enabled: p.enabled !== false });
		return save(d);
	}

	function updateList(id, p) {
		if (!p || typeof p !== "object") throw new TodoError("Ungültige Liste");
		if (p.name !== undefined) checkName(p.name);
		if (p.enabled !== undefined && typeof p.enabled !== "boolean") throw new TodoError("Ungültiger Schalter");
		const d = load();
		const l = d.lists[find(d, "lists", id)];
		if (p.name !== undefined) l.name = str(p.name, 40);
		if (p.enabled !== undefined) l.enabled = p.enabled;
		return save(d);
	}

	// Liste löschen – samt ihrer Aufgaben (das Portal fragt vorher nach)
	function removeList(id) {
		const d = load();
		const i = find(d, "lists", id);
		if (d.lists.length === 1) throw new TodoError("Die letzte Liste kann nicht gelöscht werden");
		d.lists.splice(i, 1);
		d.tasks = d.tasks.filter((t) => t.list !== id);
		d.display.lists = d.display.lists.filter((x) => x !== id);
		return save(d);
	}

	function orderLists(ids) {
		if (!Array.isArray(ids)) throw new TodoError("Ungültige Reihenfolge");
		const d = load();
		const by = {};
		d.lists.forEach((l) => { by[l.id] = l; });
		const out = ids.map((id) => by[id]).filter(Boolean);
		d.lists.forEach((l) => { if (out.indexOf(l) === -1) out.push(l); });
		d.lists = out;
		return save(d);
	}

	// ---------------------------------------------------------------- Kategorien
	function checkCat(p, isNew) {
		if (!p || typeof p !== "object") throw new TodoError("Ungültige Kategorie");
		if (isNew || p.name !== undefined) checkName(p.name);
		if (p.color !== undefined && !HEX.test(String(p.color))) throw new TodoError("Farbe als #RRGGBB");
		if (p.icon !== undefined && ICON_IDS.indexOf(p.icon) === -1) throw new TodoError("Unbekanntes Symbol");
		if (p.hidden !== undefined && typeof p.hidden !== "boolean") throw new TodoError("Ungültiger Schalter");
	}

	function addCategory(p) {
		checkCat(p, true);
		const d = load();
		if (d.categories.length >= MAX.categories) throw new TodoError("Höchstens " + MAX.categories + " Kategorien");
		d.categories.push({ id: newId("c"), name: str(p.name, 40), color: p.color ? String(p.color).toLowerCase() : "#8a93a6", icon: p.icon || "list-check", hidden: !!p.hidden });
		return save(d);
	}

	function updateCategory(id, p) {
		checkCat(p, false);
		const d = load();
		const c = d.categories[find(d, "categories", id)];
		["name", "color", "icon", "hidden"].forEach((k) => { if (p[k] !== undefined) c[k] = k === "name" ? str(p[k], 40) : k === "color" ? String(p[k]).toLowerCase() : p[k]; });
		return save(d);
	}

	// Kategorie löschen: Aufgaben bleiben, nur ohne Kategorie
	function removeCategory(id) {
		const d = load();
		d.categories.splice(find(d, "categories", id), 1);
		d.tasks.forEach((t) => { if (t.category === id) t.category = ""; });
		return save(d);
	}

	// ---------------------------------------------------------------- Anzeige
	const LIMITS = {
		max: [1, 100, "Höchstens angezeigte Aufgaben"], doneHours: [0, 720, "Erledigte zeigen (Stunden)"], range: [0, 365, "Fällig in den nächsten Tagen"],
		x: [-3000, 3000, "Abstand waagerecht"], y: [-3000, 3000, "Abstand senkrecht"], width: [160, 1600, "Breite"], height: [100, 1600, "Höhe"],
		fontScale: [40, 300, "Schriftgröße"], gap: [0, 40, "Abstand zwischen Aufgaben"], padding: [0, 60, "Innenabstand"], opacity: [0, 100, "Deckkraft"], line: [0, 6, "Linienstärke"]
	};

	function setDisplay(p) {
		if (!p || typeof p !== "object" || Array.isArray(p)) throw new TodoError("Ungültige Einstellungen");
		if (p.design !== undefined && !view.DESIGNS.some((x) => x.id === p.design)) throw new TodoError("To-do: unbekanntes Design");
		if (p.anchor !== undefined && view.ANCHORS.indexOf(p.anchor) === -1) throw new TodoError("To-do: unbekannte Position");
		if (p.unit !== undefined && ["px", "pct"].indexOf(p.unit) === -1) throw new TodoError("To-do: Abstände in px oder %");
		if (p.done !== undefined && view.DONE_MODES.indexOf(p.done) === -1) throw new TodoError("To-do: Erledigte durchstreichen, unten oder ausblenden");
		if (p.lists !== undefined && (!Array.isArray(p.lists) || p.lists.some((x) => typeof x !== "string"))) throw new TodoError("To-do: ungültige Listenauswahl");
		if (p.accent !== undefined && p.accent !== "" && !HEX.test(String(p.accent))) throw new TodoError("To-do: Farbe als #RRGGBB");
		["more", "progress", "count", "icons", "highlightDue", "glass"].forEach((k) => { if (p[k] !== undefined && typeof p[k] !== "boolean") throw new TodoError("To-do: ungültiger Schalter „" + k + "“"); });
		Object.keys(LIMITS).forEach((k) => {
			if (p[k] === undefined) return;
			const n = Number(p[k]);
			const [min, max, label] = LIMITS[k];
			if (p[k] === "" || p[k] === null || !Number.isFinite(n) || n < min || n > max) throw new TodoError(`To-do: ${label} ${min} bis ${max}`);
		});
		const d = load();
		d.display = view.clean(Object.assign({}, d.display, p));
		return save(d);
	}

	function view_() {
		return current();
	}

	return {
		load, view: view_, addTask, updateTask, toggleTask, toggleSub, removeTask, clearDone, orderTasks,
		addList, updateList, removeList, orderLists, addCategory, updateCategory, removeCategory, setDisplay,
		listBackups: () => store.listBackups().reverse(), statePath
	};
}

module.exports = { createTodo, TodoError, nextDue };
