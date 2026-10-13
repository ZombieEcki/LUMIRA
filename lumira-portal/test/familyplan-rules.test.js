// Familienplan v1.1: Verteilung je Dienst (täglich, wöchentlich mit Rhythmus,
// monatlich, fest) und feste Zuweisungen nach Person und Wochentag.
// Läuft gegen ein temporäres LUMIRA_HOME, nie gegen ~/.lumira.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-fp-rules-"));
process.env.LUMIRA_HOME = HOME;
const fp = require("../lib/familyplan");
const rot = require("../lib/familyplan-rotation");
const { buildPayload } = require("../../modules/MMM-FamilyPlan/payload");

const MON = new Date(2026, 6, 6, 8, 0);       // Montag KW 28
const WED = new Date(2026, 6, 8, 15, 58);     // Mittwoch KW 28
const week = (n) => new Date(2026, 6, 6 + 7 * n, 9, 0); // Montag n Wochen später (nach MON)

function reset() {
	fs.rmSync(HOME, { recursive: true, force: true });
	fs.mkdirSync(HOME, { recursive: true });
}

function family() {
	const v = fp.setMembers(0, [
		{ name: "Marcel", role: "adult", color: "#4ade80" },
		{ name: "Franzi", role: "adult", color: "#facc15" },
		{ name: "Maja", role: "child", color: "#a78bfa" },
		{ name: "Marie", role: "child", color: "#f472b6" }
	], MON);
	const plan = fp.view(MON);
	const id = (name) => plan.members.find((m) => m.name === name).id;
	return { rev: v.revision, id };
}

// Dienste mit Änderungen speichern: patch je Dienstname
function setRules(patch, now) {
	const v = fp.view(now || MON);
	const list = v.duties.map((d) => Object.assign({}, d, patch[d.name] || {}));
	return fp.setDuties(v.revision, list, now || MON);
}

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

test("Kochdienst fest: Mo Franzi, Di Marcel, Mi Franzi – nur an diesen Tagen, bei diesen Personen", () => {
	reset();
	const { id } = family();
	setRules({ Kochdienst: { rotation: "fixed", fixed: [{ day: 1, memberId: id("Franzi") }, { day: 2, memberId: id("Marcel") }, { day: 3, memberId: id("Franzi") }] } });
	fp.ensureCurrentWeek(WED);
	const v = fp.view(WED);
	const d = v.duties.find((x) => x.name === "Kochdienst");
	assert.deepEqual(d.days, [1, 2, 3], "Tage ergeben sich aus den Zuweisungen");
	const cw = v.currentWeek;
	assert.deepEqual(cw.days[d.id], { "2026-07-06": id("Franzi"), "2026-07-07": id("Marcel"), "2026-07-08": id("Franzi") });
	assert.ok(!Object.values(cw.assign).some((l) => l.includes(d.id)), "kein Wochendienst");
	// die übrigen 7 Dienste werden fair verteilt (2-2-2-1)
	const counts = Object.values(cw.assign).map((l) => l.length).sort();
	assert.deepEqual(counts, [1, 2, 2, 2]);
	// heute (Mittwoch) hat Franzi Kochdienst
	assert.ok(cw.today[id("Franzi")].some((x) => x.dutyId === d.id && x.day));
	assert.ok(!(cw.today[id("Marcel")] || []).some((x) => x.dutyId === d.id));
});

test("Spiegel zeigt Tagesdienste nur am Tag selbst, mit „heute“", () => {
	reset();
	const { id } = family();
	setRules({ Kochdienst: { rotation: "fixed", fixed: [{ day: 1, memberId: id("Franzi") }, { day: 2, memberId: id("Marcel") }] } });
	fp.ensureCurrentWeek(MON);
	const raw = JSON.parse(fs.readFileSync(fp.FAMILYPLAN_PATH, "utf8"));
	const tue = buildPayload(raw, new Date(2026, 6, 7, 9));
	const marcel = tue.members.find((m) => m.name === "Marcel");
	const koch = marcel.duties.find((x) => x.name === "Kochdienst");
	assert.ok(koch && koch.today, "Dienstag: Marcel kocht, als „heute“");
	assert.ok(!tue.members.find((m) => m.name === "Franzi").duties.some((x) => x.name === "Kochdienst"));
	const thu = buildPayload(raw, new Date(2026, 6, 9, 9));
	assert.ok(!thu.members.some((m) => m.duties.some((x) => x.name === "Kochdienst")), "Donnerstag: niemand");
});

test("Täglich rotierend: jeden Tag jemand, fair über die Woche, feste Tage gehen vor", () => {
	reset();
	const { id } = family();
	setRules({ Tischdienst: { rotation: "daily", every: 1, fixed: [{ day: 0, memberId: id("Marcel") }] } });
	fp.ensureCurrentWeek(MON);
	let v = fp.view(MON);
	const did = v.duties.find((x) => x.name === "Tischdienst").id;
	const days = v.currentWeek.days[did];
	assert.equal(Object.keys(days).length, 7);
	assert.equal(days["2026-07-12"], id("Marcel"), "Sonntag fest bei Marcel");
	const per = {};
	Object.values(days).forEach((p) => { per[p] = (per[p] || 0) + 1; });
	assert.ok(Object.keys(per).length === 4, "alle vier kommen dran");
	assert.ok(Math.max(...Object.values(per)) <= 2, "niemand öfter als zweimal");
	// über vier Wochen ausgeglichen
	for (let n = 1; n <= 3; n++) fp.ensureCurrentWeek(week(n));
	v = fp.view(week(3));
	const total = v.fairness.counts;
	const tisch = ["Marcel", "Franzi", "Maja", "Marie"].map((n) => total[id(n)][did] || 0);
	assert.equal(tisch.reduce((a, b) => a + b, 0), 28);
	assert.ok(Math.max(...tisch) - Math.min(...tisch) <= 4, "über 4 Wochen ungefähr gleich: " + tisch);
});

test("Täglich alle 2 Tage, nur Mo–Fr: Blöcke zu zwei Tagen, Wochenende frei", () => {
	reset();
	family();
	setRules({ Mülldienst: { rotation: "daily", every: 2, days: [1, 2, 3, 4, 5] } });
	fp.ensureCurrentWeek(MON);
	const v = fp.view(MON);
	const did = v.duties.find((x) => x.name === "Mülldienst").id;
	const days = v.currentWeek.days[did];
	assert.deepEqual(Object.keys(days).sort(), ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"]);
	const seq = Object.keys(days).sort().map((k) => days[k]);
	// zusammenhängende Paare gleicher Personen (Blockgrenzen liegen fest)
	const idx = Object.keys(days).sort().map((k) => Math.floor(rot.activeIndex([1, 2, 3, 4, 5], k) / 2));
	for (let i = 1; i < seq.length; i++) {
		if (idx[i] === idx[i - 1]) assert.equal(seq[i], seq[i - 1], "im selben Block dieselbe Person");
	}
});

test("Wöchentlich alle 2 Wochen: Person behält den Dienst zwei Wochen", () => {
	reset();
	family();
	setRules({ Gartendienst: { rotation: "weekly", every: 2 } });
	const holders = [];
	let did;
	for (let n = 0; n < 6; n++) {
		fp.ensureCurrentWeek(week(n));
		const v = fp.view(week(n));
		did = v.duties.find((x) => x.name === "Gartendienst").id;
		holders.push(Object.keys(v.currentWeek.assign).find((p) => v.currentWeek.assign[p].includes(did)));
	}
	// Abschnitte zu je 2 Wochen (am festen Bezugstag ausgerichtet)
	const per = [0, 1, 2, 3, 4, 5].map((n) => rot.periodOf("weekly", 2, rot.toKey(week(n))));
	for (let n = 1; n < 6; n++) {
		if (per[n] === per[n - 1]) assert.equal(holders[n], holders[n - 1], `Woche ${n} behält`);
		else assert.notEqual(holders[n], holders[n - 1], `Woche ${n} wechselt`);
	}
	const v = fp.view(week(5));
	assert.ok(Object.values(v.currentWeek.assign).every((l) => l.length === 2), "trotzdem je zwei Dienste");
});

test("Monatlich: wechselt erst am ersten Wechseltag im neuen Monat", () => {
	reset();
	family();
	setRules({ Baddienst: { rotation: "monthly", every: 1 } });
	const starts = [];
	const holders = [];
	for (let n = 0; n < 6; n++) { // 06.07. … 10.08.
		fp.ensureCurrentWeek(week(n));
		const v = fp.view(week(n));
		const did = v.duties.find((x) => x.name === "Baddienst").id;
		starts.push(v.currentWeek.start);
		holders.push(Object.keys(v.currentWeek.assign).find((p) => v.currentWeek.assign[p].includes(did)));
	}
	assert.deepEqual(starts, ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"]);
	assert.equal(new Set(holders.slice(0, 4)).size, 1, "den ganzen Juli dieselbe Person");
	assert.notEqual(holders[4], holders[3], "am 03.08. (erster Montag im August) Wechsel");
	assert.equal(holders[5], holders[4]);
});

test("Fest „jeden Tag“: ganze Woche bei einer Person, zählt bei der fairen Verteilung mit", () => {
	reset();
	const { id } = family();
	setRules({
		Gartendienst: { rotation: "fixed", fixed: [{ day: -1, memberId: id("Marcel") }] },
		Mülldienst: { rotation: "fixed", fixed: [{ day: -1, memberId: id("Marcel") }] },
		Bodendienst: { rotation: "fixed", fixed: [{ day: -1, memberId: id("Marcel") }] }
	});
	fp.ensureCurrentWeek(MON);
	const v = fp.view(MON);
	const a = v.currentWeek.assign;
	assert.equal(a[id("Marcel")].length, 3, "Marcel hat seine drei festen");
	["Franzi", "Maja", "Marie"].forEach((n) => assert.ok(a[id(n)].length >= 1));
	assert.equal(Object.values(a).reduce((s, l) => s + l.length, 0), 8, "alle 8 vergeben");
	assert.ok(v.warnings.some((w) => w.includes("ungleich verteilt")), "Hinweis auf ungleiche Verteilung");
	const g = v.duties.find((x) => x.name === "Gartendienst").id;
	assert.equal(v.currentWeek.reasons[id("Marcel")][g], "Fest zugewiesen.");
});

test("Feste Person pausiert: Dienst bleibt an dem Tag frei, verständlicher Hinweis", () => {
	reset();
	const { id } = family();
	setRules({ Kochdienst: { rotation: "fixed", fixed: [{ day: 1, memberId: id("Franzi") }] } });
	const v0 = fp.view(MON);
	fp.setMembers(v0.revision, v0.members.map((m) => Object.assign({}, m, { active: m.name !== "Franzi" })), MON);
	fp.ensureCurrentWeek(MON);
	const v = fp.view(MON);
	const did = v.duties.find((x) => x.name === "Kochdienst").id;
	assert.equal(v.currentWeek.days[did]["2026-07-06"], null);
	assert.ok(v.warnings.some((w) => w.includes("Franzi ist pausiert") && w.includes("Montag")));
});

test("Regeländerungen ändern die laufende Woche nicht, erst die nächste", () => {
	reset();
	const { id } = family();
	fp.ensureCurrentWeek(MON);
	const before = JSON.stringify(fp.view(WED).currentWeek.assign);
	setRules({ Kochdienst: { rotation: "fixed", fixed: [{ day: 3, memberId: id("Maja") }] } }, WED);
	const v = fp.view(WED);
	assert.equal(JSON.stringify(v.currentWeek.assign), before, "laufende Woche unverändert");
	const did = v.duties.find((x) => x.name === "Kochdienst").id;
	assert.equal(v.preview[0].days[did]["2026-07-15"], id("Maja"), "Vorschau zeigt die neue Regel");
	// ausdrücklich neu verteilen übernimmt sie sofort
	fp.regenerateCurrent(v.revision, WED);
	assert.equal(fp.view(WED).currentWeek.days[did]["2026-07-08"], id("Maja"));
});

test("Einzelnen Tag ändern und zurück zur Automatik", () => {
	reset();
	const { id } = family();
	setRules({ Tischdienst: { rotation: "daily" } });
	fp.ensureCurrentWeek(MON);
	let v = fp.view(WED);
	const did = v.duties.find((x) => x.name === "Tischdienst").id;
	const auto = v.currentWeek.days[did]["2026-07-09"];
	const other = [id("Marcel"), id("Franzi"), id("Maja"), id("Marie")].find((p) => p !== auto);
	fp.assignDay(v.revision, "2026-07-06", did, "2026-07-09", other, WED);
	v = fp.view(WED);
	assert.equal(v.currentWeek.days[did]["2026-07-09"], other);
	assert.ok(v.currentWeek.manualDays);
	assert.throws(() => fp.assignDay(v.revision, "2026-07-06", did, "2026-07-20", other, WED), /nicht in dieser Woche/);
	fp.resetWeek(v.revision, "2026-07-06", WED);
	v = fp.view(WED);
	assert.equal(v.currentWeek.days[did]["2026-07-09"], auto);
	assert.equal(v.currentWeek.manualDays, null);
});

test("Prüfungen: verständliche Fehler beim Speichern", () => {
	reset();
	const { id } = family();
	assert.throws(() => setRules({ Kochdienst: { rotation: "fixed", fixed: [] } }), /mindestens eine Person/);
	assert.throws(() => setRules({ Kochdienst: { fixed: [{ day: 1, memberId: id("Maja") }, { day: 1, memberId: id("Marie") }] } }), /Montag ist doppelt/);
	assert.throws(() => setRules({ Kochdienst: { fixed: [{ day: -1, memberId: id("Maja") }, { day: 2, memberId: id("Marie") }] } }), /nicht mit einzelnen Tagen/);
	assert.throws(() => setRules({ Kochdienst: { rotation: "weekly", every: 9 } }), /Rhythmus 1 bis 4 Wochen/);
	assert.throws(() => setRules({ Kochdienst: { fixed: [{ day: 1, memberId: "m_gibtsnicht" }] } }), /eine Person wählen/);
	// Ältere Portal-Seite ohne neue Felder: Einstellung bleibt
	setRules({ Kochdienst: { rotation: "daily", every: 3 } });
	const v = fp.view(MON);
	const list = v.duties.map((d) => { const c = Object.assign({}, d); delete c.rotation; delete c.every; delete c.fixed; return c; });
	fp.setDuties(v.revision, list, MON);
	const k = fp.view(MON).duties.find((x) => x.name === "Kochdienst");
	assert.equal(k.rotation, "daily");
	assert.equal(k.every, 3);
});

test("Person entfernt: ihre festen Zuweisungen fallen weg", () => {
	reset();
	const { id } = family();
	setRules({ Kochdienst: { rotation: "fixed", fixed: [{ day: 1, memberId: id("Franzi") }] } });
	const v = fp.view(MON);
	fp.setMembers(v.revision, v.members.filter((m) => m.name !== "Franzi"), MON);
	const k = fp.view(MON).duties.find((x) => x.name === "Kochdienst");
	assert.deepEqual(k.fixed, []);
	assert.equal(k.rotation, "weekly", "fester Dienst ohne Person rotiert wieder");
});

test("Alte Datei ohne neue Felder: alles wöchentlich wie bisher", () => {
	reset();
	family();
	fp.ensureCurrentWeek(MON);
	const raw = JSON.parse(fs.readFileSync(fp.FAMILYPLAN_PATH, "utf8"));
	raw.duties.forEach((d) => { delete d.rotation; delete d.every; delete d.fixed; });
	raw.weeks.forEach((w) => { delete w.days; delete w.manualDays; delete w.gaps; });
	fs.writeFileSync(fp.FAMILYPLAN_PATH, JSON.stringify(raw));
	const v = fp.view(WED);
	assert.ok(v.duties.every((d) => d.rotation === "weekly" && d.every === 1 && d.fixed.length === 0));
	assert.deepEqual(v.currentWeek.days, {});
	const p = buildPayload(raw, WED);
	assert.ok(p.members.every((m) => m.duties.length === 2));
});
