// To-do: Wiederholung, Aufgaben/Listen/Kategorien (lib/todo.js), Anzeige-
// Auswahl (todo-view.js), Datensicherheit, Einbindung in die config.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-todo-test-"));
process.env.LUMIRA_HOME = HOME;
const todoLib = require("../lib/todo");
const view = require("../public/todo-view");
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");
const MOD = path.join(__dirname, "..", "..", "modules", "MMM-LumiraTodo");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const clock = (iso) => { let t = new Date(iso); return { now: () => t, set: (x) => { t = new Date(x); } }; };

test("Portal und Bildschirm nutzen dieselbe Anzeige; 12 Designs mit Aufbau", () => {
	assert.equal(read(path.join(__dirname, "..", "public", "todo-view.js")), read(path.join(MOD, "todo-view.js")));
	assert.equal(read(path.join(__dirname, "..", "public", "todo-view.css")), read(path.join(MOD, "todo-view.css")));
	assert.equal(view.DESIGNS.length, 12);
	const src = read(path.join(MOD, "todo-view.js"));
	for (const d of view.DESIGNS) assert.ok(new RegExp("\\n\\t\\t" + d.id + ": function").test(src), d.id);
	assert.deepEqual(view.DESIGNS.filter((d) => d.plain).map((d) => d.id), ["classic", "compact", "minimal"], "die drei schlichten");
});

test("Wiederholung: nächster Fälligkeitstag, Rhythmus bleibt, nie in der Vergangenheit", () => {
	const n = todoLib.nextDue;
	assert.equal(n({ type: "daily", every: 1 }, "2026-11-02", "2026-11-02"), "2026-11-03");
	assert.equal(n({ type: "daily", every: 3 }, "2026-11-02", "2026-11-02"), "2026-11-05");
	assert.equal(n({ type: "weekly", every: 2 }, "2026-11-02", "2026-11-02"), "2026-11-16");
	assert.equal(n({ type: "monthly", every: 1 }, "2026-01-31", "2026-01-31"), "2026-02-28", "31. → Monatsende");
	assert.equal(n({ type: "yearly", every: 1 }, "2028-02-29", "2028-02-29"), "2029-02-28");
	// Mo + Do: nach Montag kommt Donnerstag, nach Donnerstag Montag
	assert.equal(n({ type: "weekdays", days: [1, 4] }, "2026-11-02", "2026-11-02"), "2026-11-05");
	assert.equal(n({ type: "weekdays", days: [1, 4] }, "2026-11-05", "2026-11-05"), "2026-11-09");
	// verspätet erledigt: weiter im Rhythmus, aber ab heute
	assert.equal(n({ type: "weekly", every: 1 }, "2026-10-01", "2026-11-02"), "2026-11-05");
	assert.equal(n({ type: "none" }, "2026-11-02", "2026-11-02"), null);
});

test("Aufgaben: anlegen, prüfen, abhaken mit Wiederholung, wieder öffnen, Unteraufgaben", () => {
	const c = clock("2026-11-02T10:00:00");
	const t = todoLib.createTodo({ home: path.join(HOME, "a"), now: c.now });
	let v = t.view();
	assert.equal(v.lists.length, 1, "Grundausstattung: eine Liste");
	assert.equal(v.lists[0].name, "Privat");
	assert.ok(v.categories.length >= 6);
	const list = v.lists[0].id;
	assert.throws(() => t.addTask({ title: "  " }), /Titel/);
	assert.throws(() => t.addTask({ title: "x", due: "2026-02-30" }), /Datum/);
	assert.throws(() => t.addTask({ title: "x", time: "25:00" }), /HH:MM/);
	assert.throws(() => t.addTask({ title: "x", priority: "sofort" }), /Priorität/);
	assert.throws(() => t.addTask({ title: "x", sub: [{ title: "" }] }), /Unteraufgabe/);
	v = t.addTask({ title: "Müll rausbringen", list, due: "2026-11-02", repeat: { type: "weekly", every: 1 }, priority: "high", sub: [{ title: "Gelber Sack" }] });
	v = t.addTask({ title: "<b>Einkaufen</b>", list });
	assert.equal(v.tasks[1].title, "<b>Einkaufen</b>", "Text bleibt Text (Anzeige nur per textContent)");
	const muell = v.tasks[0];
	assert.equal(muell.order < v.tasks[1].order, true);
	// Abhaken: erledigte Instanz bleibt, neue für nächste Woche entsteht
	v = t.toggleTask(muell.id, true);
	const done = v.tasks.find((x) => x.id === muell.id);
	assert.equal(done.done, true);
	assert.ok(done.doneAt);
	const next = v.tasks.find((x) => x.id === done.next);
	assert.equal(next.due, "2026-11-09");
	assert.equal(next.done, false);
	assert.equal(next.sub[0].done, false, "Unteraufgaben neu");
	assert.equal(next.title, "Müll rausbringen");
	// zweimal abhaken erzeugt keine zweite Kopie
	v = t.toggleTask(muell.id, true);
	assert.equal(v.tasks.filter((x) => x.title === "Müll rausbringen").length, 2);
	// wieder öffnen nimmt die unberührte nächste Instanz zurück
	v = t.toggleTask(muell.id, false);
	assert.equal(v.tasks.filter((x) => x.title === "Müll rausbringen").length, 1);
	assert.equal(v.tasks.find((x) => x.id === muell.id).done, false);
	// Unteraufgabe abhaken
	const sid = v.tasks.find((x) => x.id === muell.id).sub[0].id;
	v = t.toggleSub(muell.id, sid);
	assert.equal(v.tasks.find((x) => x.id === muell.id).sub[0].done, true);
	// bearbeiten, verschieben, Reihenfolge, löschen
	v = t.updateTask(muell.id, { title: "Restmüll", note: "Tonne an die Straße" });
	assert.equal(v.tasks.find((x) => x.id === muell.id).title, "Restmüll");
	assert.throws(() => t.updateTask(muell.id, { list: "gibtsnicht" }), /Liste nicht gefunden/);
	v = t.orderTasks([v.tasks[1].id, muell.id]);
	assert.ok(v.tasks.find((x) => x.id === muell.id).order > v.tasks.find((x) => x.id !== muell.id).order);
	v = t.removeTask(muell.id);
	assert.equal(v.tasks.length, 1);
});

test("Listen und Kategorien: Löschen nur ausdrücklich, letzte Liste bleibt, Aufgaben behalten Daten", () => {
	const t = todoLib.createTodo({ home: path.join(HOME, "b") });
	let v = t.view();
	const privat = v.lists[0].id;
	v = t.addList({ name: "Einkaufen" });
	const eink = v.lists[1].id;
	v = t.addTask({ title: "Milch", list: eink, category: v.categories[1].id });
	v = t.addTask({ title: "Steuer", list: privat });
	assert.throws(() => t.addList({ name: "" }), /Name/);
	v = t.updateList(eink, { enabled: false, name: "Einkauf" });
	assert.equal(v.lists[1].name, "Einkauf");
	v = t.orderLists([eink, privat]);
	assert.equal(v.lists[0].id, eink);
	// Kategorie löschen: Aufgabe bleibt, nur ohne Kategorie
	const cat = v.tasks.find((x) => x.title === "Milch").category;
	v = t.removeCategory(cat);
	assert.equal(v.tasks.find((x) => x.title === "Milch").category, "");
	v = t.addCategory({ name: "Tiere", color: "#FF7EB6", icon: "paw" });
	assert.equal(v.categories[v.categories.length - 1].color, "#ff7eb6");
	assert.throws(() => t.addCategory({ name: "X", icon: "drache" }), /Symbol/);
	// Liste löschen: ihre Aufgaben mit; die letzte Liste nie
	v = t.removeList(eink);
	assert.ok(!v.tasks.some((x) => x.title === "Milch"));
	assert.throws(() => t.removeList(privat), /letzte Liste/);
	// erledigte löschen nur gezielt
	v = t.toggleTask(v.tasks[0].id, true);
	v = t.clearDone(privat);
	assert.equal(v.tasks.length, 0);
});

test("Daten sicher: kaputte Datei wird nicht überschrieben, Backups höchstens stündlich", () => {
	const c = clock("2026-11-02T10:00:00");
	const home = path.join(HOME, "c");
	const t = todoLib.createTodo({ home, now: c.now });
	t.addTask({ title: "A" });
	t.addTask({ title: "B" });
	t.addTask({ title: "C" });
	assert.ok(t.listBackups().length <= 1, "nicht bei jedem Speichern ein Backup");
	fs.writeFileSync(t.statePath, "{kaputt");
	assert.throws(() => t.addTask({ title: "D" }), /beschädigt/);
	assert.equal(fs.readFileSync(t.statePath, "utf8"), "{kaputt", "nichts überschrieben");
});

test("Anzeige: Listen-Auswahl, Erledigte (durchgestrichen/unten/aus, Zeitraum), Fälligkeit", () => {
	const now = new Date(2026, 10, 2, 12, 0).getTime();
	const h = (n) => new Date(now - n * 3600000).toISOString();
	const data = {
		lists: [{ id: "l1", name: "Privat", enabled: true }, { id: "l2", name: "Arbeit", enabled: false }],
		categories: [],
		tasks: [
			{ id: "1", list: "l1", title: "offen", order: 1 },
			{ id: "2", list: "l1", title: "eben erledigt", done: true, doneAt: h(1), order: 2 },
			{ id: "3", list: "l1", title: "lange erledigt", done: true, doneAt: h(50), order: 3 },
			{ id: "4", list: "l1", title: "fällig weit weg", due: "2026-12-24", order: 4 },
			{ id: "5", list: "l2", title: "Arbeit", order: 1 }
		]
	};
	const g = (cfg) => view.select(data, view.clean(cfg), now);
	assert.deepEqual(g({}).map((x) => x.list.id), ["l1"], "nur Listen „auf dem Bildschirm“");
	assert.deepEqual(g({ lists: ["l2"] }).map((x) => x.list.id), ["l2"], "oder gezielt gewählte");
	assert.deepEqual(g({}).find(Boolean).shown.map((t) => t.id), ["1", "2", "4"], "durchgestrichen am Platz, älter als 24 h weg");
	assert.deepEqual(g({ done: "below" })[0].shown.map((t) => t.id), ["1", "4", "2"]);
	assert.deepEqual(g({ done: "hide" })[0].shown.map((t) => t.id), ["1", "4"]);
	assert.deepEqual(g({ doneHours: 0 })[0].shown.map((t) => t.id), ["1", "2", "3", "4"], "0 = immer");
	assert.deepEqual(g({ range: 7 })[0].shown.map((t) => t.id), ["1", "2"], "Fällige nur bis in 7 Tagen, ohne Datum immer");
	assert.equal(view.dueText({ due: "2026-11-02", time: "17:00" }, now), "heute 17:00");
	assert.equal(view.dueText({ due: "2026-11-01" }, now), "überfällig");
});

test("config.js: To-do standardmäßig aus, eingeschaltet als MMM-LumiraTodo", () => {
	const s = settingsLib.load();
	assert.equal(s.modules.todo, false);
	assert.ok(!buildModules(s).some((m) => m.module === "MMM-LumiraTodo"));
	s.modules = Object.assign({}, s.modules, { todo: true });
	assert.ok(buildModules(s).some((m) => m.module === "MMM-LumiraTodo"));
	assert.throws(() => settingsLib.patch({ modules: { todo: "ja" } }), settingsLib.ValidationError);
});
