// Bildschirm-Layout: gemeinsamer Baustein der Module (lumira-layout.js),
// Profile/Modus/Rückgängig (lib/layout.js), Notfall-Befehl ohne Portal
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-layout-test-"));
process.env.LUMIRA_HOME = HOME;
const layoutLib = require("../lib/layout");
const MODS = path.join(__dirname, "..", "..", "modules");
const shared = require(path.join(MODS, "MMM-LumiraStatus", "lumira-layout.js"));
const clockView = require("../public/clock-view");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const ctx = {
	active: { clock: true, calendar: true, todo: false, weather: true, radar: false, warnings: false, compliments: true, familyPlan: true, statusHint: true, news: true },
	current: { clock: { w: 380, h: 400, font: 100 }, calendar: { w: 440, h: 520, font: 100 }, weather: { w: 400, h: 600, font: 100 } }
};

test("Alle Module nutzen denselben Layout-Baustein", () => {
	const ref = read(path.join(MODS, "MMM-LumiraStatus", "lumira-layout.js"));
	for (const m of ["MMM-LumiraClock", "MMM-LumiraCalendar", "MMM-LumiraTodo", "MMM-LumiraWeather", "MMM-SmartCompliments"]) {
		assert.equal(read(path.join(MODS, m, "lumira-layout.js")), ref, m);
	}
});

test("Baustein: nur im Free-Modus, kaputte Datei = Classic, Werte geprüft", () => {
	const home = path.join(HOME, "b");
	fs.mkdirSync(home, { recursive: true });
	const file = path.join(home, "layout.json");
	assert.equal(shared.read(home), null, "ohne Datei: Classic");
	fs.writeFileSync(file, JSON.stringify({ mode: "classic", active: "p-a", profiles: [{ id: "p-a", items: { clock: { x: 10, y: 20 } } }] }));
	assert.equal(shared.read(home), null, "Classic: nichts überlagern");
	fs.writeFileSync(file, "{kaputt");
	assert.equal(shared.read(home), null, "kaputt: Classic");
	fs.writeFileSync(file, JSON.stringify({ mode: "free", active: "p-a", profiles: [{ id: "p-a", items: { clock: { x: 12.345, y: 8, w: 500, h: 220, font: 140, z: 3, visible: false } } }] }));
	const items = shared.read(home);
	const cfg = shared.apply(clockView.clean({ design: "neon", anchor: "auto" }), items.clock);
	assert.equal(cfg.anchor, "top_left");
	assert.equal(cfg.unit, "pct");
	assert.equal(cfg.x, 12.35);
	assert.equal(cfg.width, 500);
	assert.equal(cfg.fontScale, 140);
	assert.equal(cfg.z, 3);
	assert.equal(cfg.hidden, true);
	assert.equal(cfg.design, "neon", "eigene Einstellungen bleiben");
	assert.equal(shared.apply(cfg, { x: "x", y: 1 }), cfg, "ungültige Position → unverändert");
	assert.equal(shared.apply({ anchor: "auto" }, { x: 1, y: 2, w: 300 }).width, undefined, "nur Felder, die das Modul kennt");
});

test("Profile: Standard leer und Classic, neues Profil vom aktuellen Bildschirm, prüfen", () => {
	const home = path.join(HOME, "p");
	const L = layoutLib.createLayout({ home });
	let v = L.view(ctx);
	assert.equal(v.mode, "classic");
	assert.equal(v.profiles.length, 1);
	assert.deepEqual(v.profiles[0].items, {});
	assert.ok(v.modules.find((m) => m.key === "news").level === "fixed");
	// gemeldete Positionen vom Bildschirm
	fs.mkdirSync(home, { recursive: true });
	fs.writeFileSync(path.join(home, "layout-mirror.json"), JSON.stringify({ at: "x", screen: { width: 1920, height: 1080 }, rects: { clock: { x: 1.5, y: 2, w: 300, h: 120 }, familyPlan: { x: 1.5, y: 20, w: 300, h: 260 } } }));
	L.addProfile({ name: "Abend", from: "current" }, ctx);
	v = L.view(ctx);
	const abend = v.profiles[1];
	assert.equal(abend.name, "Abend");
	assert.deepEqual(abend.items.clock, { x: 1.5, y: 2, z: 0, visible: true, w: 380, h: 400, font: 100 }, "Position gemeldet, Größe aus den Einstellungen");
	assert.equal(abend.items.familyPlan.w, undefined, "nur Position");
	assert.ok(!abend.items.todo, "ausgeschaltete Module nicht");
	assert.ok(!abend.items.news, "feste Module nicht");
	assert.throws(() => L.updateProfile(abend.id, { items: { news: { x: 1, y: 1 } } }), /festes Modul/);
	assert.throws(() => L.updateProfile(abend.id, { items: { clock: { x: 500, y: 1, w: 300, h: 100 } } }), /Position/);
	assert.throws(() => L.updateProfile(abend.id, { items: { clock: { x: 5, y: 1 } } }), /Breite/);
	L.updateProfile(abend.id, { name: "Abendruhe", items: { clock: { x: 40, y: 30, w: 760, h: 800, font: 200, z: 2, visible: true } } });
	assert.equal(L.load().profiles[1].name, "Abendruhe");
	L.addProfile({ name: "Kopie", from: abend.id }, ctx);
	assert.equal(L.load().profiles[2].items.clock.font, 200);
	assert.throws(() => L.addProfile({ name: "" }, ctx), /Name/);
});

test("Modus: Free aktiviert, Classic zurück – Profile bleiben; Rückgängig; letztes Profil bleibt", () => {
	const home = path.join(HOME, "m");
	const L = layoutLib.createLayout({ home });
	const id = L.addProfile({ name: "Familie", from: "current" }, ctx);
	L.updateProfile(id, { items: { clock: { x: 10, y: 10, w: 400, h: 300 } } });
	L.setMode("free", id);
	assert.equal(shared.read(home).clock.x, 10, "Module sehen das aktive Profil");
	L.setMode("classic");
	assert.equal(shared.read(home), null);
	assert.equal(L.load().profiles.find((p) => p.id === id).items.clock.x, 10, "Free-Layout bleibt gespeichert");
	L.undo();
	assert.equal(L.load().mode, "free", "Rückgängig holt den vorherigen Stand");
	assert.throws(() => L.setMode("bunt"), /Classic oder Free/);
	L.removeProfile(id);
	assert.throws(() => L.removeProfile(L.load().profiles[0].id), /letzte Layout/);
	assert.throws(() => L.setEditor({ grid: 7 }), /Raster/);
});

test("Notfall: kaputte layout.json → Classic, Befehl ohne Portal schaltet zurück", () => {
	const home = path.join(HOME, "n");
	fs.mkdirSync(home, { recursive: true });
	fs.writeFileSync(path.join(home, "layout.json"), "{kaputt");
	assert.equal(layoutLib.createLayout({ home }).load().mode, "classic");
	fs.writeFileSync(path.join(home, "layout.json"), JSON.stringify({ mode: "free", active: "p-a", profiles: [{ id: "p-a", name: "X", items: {} }] }));
	const r = spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "layout-cli.js"), "classic"], { env: Object.assign({}, process.env, { LUMIRA_HOME: home }), encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /Classic/);
	assert.equal(JSON.parse(fs.readFileSync(path.join(home, "layout.json"), "utf8")).mode, "classic");
	assert.equal(JSON.parse(fs.readFileSync(path.join(home, "layout.json"), "utf8")).profiles[0].name, "X", "Profile bleiben");
});
