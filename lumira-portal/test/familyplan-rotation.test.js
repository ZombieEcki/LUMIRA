// Tests für lib/familyplan-rotation.js (node --test, keine Abhängigkeiten).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const rot = require("../lib/familyplan-rotation");

const MEMBERS = [
	{ id: "marcel", role: "adult" },
	{ id: "franzi", role: "adult" },
	{ id: "maja", role: "child" },
	{ id: "marie", role: "child" }
];
const DUTY_IDS = ["garten", "tisch", "bad", "muell", "kochen", "kueche", "putzen", "boden"];
const ALL = ["adult", "child"];
const DUTIES = DUTY_IDS.map((id) => ({ id, roles: ALL }));
const START = { marcel: ["garten", "muell"], franzi: ["kochen", "kueche"], maja: ["tisch", "boden"], marie: ["bad", "putzen"] };

// Simuliert n Wochen; Woche 0 = Startverteilung (zählt als erste Zykluswoche).
function simulate(n, opts) {
	opts = opts || {};
	const members = opts.members || MEMBERS;
	const duties = opts.duties || DUTIES;
	const history = [opts.start || START];
	const results = [];
	for (let w = 1; w < n; w++) {
		const res = rot.computeWeek({
			members, duties, history,
			cyclePos: (w - (opts.cycleStart || 0)) % members.length,
			key: `w${w}`,
			pairMode: opts.pairMode,
			fixedPairs: opts.fixedPairs
		});
		results.push(res);
		history.push(res.assign);
	}
	return { history, results };
}

test("4 × 8: in jedem 4-Wochen-Block hat jede Person jeden Dienst genau einmal", () => {
	const { history } = simulate(16);
	for (let c = 0; c < 4; c++) {
		for (const p of MEMBERS) {
			const set = new Set();
			for (let w = c * 4; w < c * 4 + 4; w++) history[w][p.id].forEach((d) => set.add(d));
			assert.equal(set.size, 8, `Zyklus ${c + 1}, ${p.id}`);
		}
	}
});

test("jede Woche: jeder hat genau 2 Dienste, alle 8 vergeben", () => {
	const { history } = simulate(12);
	for (const wk of history) {
		const all = [];
		for (const p of MEMBERS) {
			assert.equal(wk[p.id].length, 2);
			all.push(...wk[p.id]);
		}
		assert.deepEqual(all.slice().sort(), DUTY_IDS.slice().sort());
	}
});

test("nie derselbe Dienst zwei Wochen hintereinander, auch über die Zyklusgrenze", () => {
	const { history } = simulate(16);
	for (let w = 1; w < history.length; w++) {
		for (const p of MEMBERS) {
			for (const d of history[w][p.id]) {
				assert.ok(!history[w - 1][p.id].includes(d), `Woche ${w}: ${p.id} hat ${d} erneut`);
			}
		}
	}
});

test("Paare wechseln zwischen den Zyklen", () => {
	const { history } = simulate(8);
	const pairs = (w, pid) => history[w][pid].slice().sort().join("+");
	const changed = MEMBERS.some((p) => [0, 1, 2, 3].some((i) => pairs(i, p.id) !== pairs(i + 4, p.id)));
	assert.ok(changed, "der zweite Zyklus wiederholt den ersten nicht starr");
});

test("deterministisch: gleiche Eingabe ergibt immer dasselbe", () => {
	const a = JSON.stringify(simulate(10).history);
	for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(simulate(10).history), a);
});

test("3 Personen / 8 Dienste: Kontingent 3-3-2, der Zusatzdienst wandert", () => {
	const members = MEMBERS.slice(0, 3);
	const { history } = simulate(10, { members, cycleStart: 1 });
	const totals = { marcel: 0, franzi: 0, maja: 0 };
	for (let w = 1; w < history.length; w++) {
		const counts = members.map((p) => history[w][p.id].length).sort();
		assert.deepEqual(counts, [2, 3, 3]);
		members.forEach((p) => { totals[p.id] += history[w][p.id].length; });
	}
	const vals = Object.values(totals);
	assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, `Gesamtlast fair verteilt: ${JSON.stringify(totals)}`);
});

test("Rollen: Kochdienst nur für Erwachsene", () => {
	const duties = DUTIES.map((d) => (d.id === "kochen" ? { id: d.id, roles: ["adult"] } : d));
	const { history } = simulate(12, { duties, cycleStart: 1 });
	for (let w = 1; w < history.length; w++) {
		assert.ok(history[w].maja.indexOf("kochen") === -1 && history[w].marie.indexOf("kochen") === -1, `Woche ${w}`);
		assert.ok(!(history[w].marcel.includes("kochen") && history[w - 1].marcel.includes("kochen")));
		assert.ok(!(history[w].franzi.includes("kochen") && history[w - 1].franzi.includes("kochen")));
	}
});

test("Rollen: Dienst ohne erlaubte Person bleibt frei", () => {
	const members = MEMBERS.filter((m) => m.role === "child");
	const duties = DUTIES.map((d) => (d.id === "kochen" ? { id: d.id, roles: ["adult"] } : d));
	const res = rot.computeWeek({ members, duties, history: [], cyclePos: 0, key: "x" });
	assert.deepEqual(res.unassigned, ["kochen"]);
	assert.equal(res.assign.maja.length + res.assign.marie.length, 7);
});

test("feste Paare rotieren gemeinsam", () => {
	const fixedPairs = [["kochen", "kueche"], ["bad", "putzen"]];
	const { history } = simulate(9, { pairMode: "fixed", fixedPairs, cycleStart: 1 });
	for (let w = 1; w < history.length; w++) {
		for (const p of MEMBERS) {
			const list = history[w][p.id];
			assert.equal(list.includes("kochen"), list.includes("kueche"), `Woche ${w} ${p.id}`);
			assert.equal(list.includes("bad"), list.includes("putzen"), `Woche ${w} ${p.id}`);
		}
	}
});

test("Kontingent mit festen Paaren nicht einhaltbar: Notlösung statt Abbruch", () => {
	// 3 Personen, 2 Paare + 1 Einzeldienst = 5 Dienste → Kontingent 2-2-1, Paare passen nur zu zweit
	const members = MEMBERS.slice(0, 3);
	const duties = ["kochen", "kueche", "bad", "putzen", "tisch"].map((id) => ({ id, roles: ALL }));
	const res = rot.computeWeek({ members, duties, history: [], cyclePos: 0, key: "x", pairMode: "fixed", fixedPairs: [["kochen", "kueche"], ["bad", "putzen"]] });
	const all = members.flatMap((p) => res.assign[p.id]);
	assert.equal(all.length, 5);
	assert.deepEqual(res.unassigned, []);
});

test("Kalender: Wochenstart, nächste Grenze, Sommerzeit, KW", () => {
	assert.equal(rot.weekStartFor(new Date(2026, 6, 8, 15, 58), 1), "2026-07-06");
	assert.equal(rot.weekStartFor(new Date(2026, 6, 6, 0, 0), 1), "2026-07-06");
	assert.equal(rot.weekStartFor(new Date(2026, 6, 5, 23, 59), 1), "2026-06-29");
	assert.equal(rot.weekStartFor(new Date(2026, 6, 8), 6), "2026-07-04");
	assert.equal(rot.nextBoundary("2026-07-06", 1), "2026-07-13");
	assert.equal(rot.nextBoundary("2026-07-06", 3), "2026-07-08");
	// Umstellung auf Winterzeit am 25.10.2026
	assert.equal(rot.addDays("2026-10-19", 7), "2026-10-26");
	assert.equal(rot.nextBoundary("2026-10-19", 1), "2026-10-26");
	assert.equal(rot.isoWeek("2026-07-06"), 28);
	assert.equal(rot.isoWeek("2026-12-28"), 53);
	assert.equal(rot.isoWeek("2027-01-04"), 1);
});
