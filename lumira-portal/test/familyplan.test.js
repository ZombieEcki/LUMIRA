// Tests für lib/familyplan.js (Speicher, Wochenwechsel, Schutzregeln).
// Läuft gegen ein temporäres LUMIRA_HOME, nie gegen ~/.lumira.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-fp-test-"));
process.env.LUMIRA_HOME = HOME;
const fp = require("../lib/familyplan");

const MON = new Date(2026, 6, 6, 8, 0);   // Montag KW 28
const WED = new Date(2026, 6, 8, 15, 58); // Mittwoch KW 28
const NEXT_MON = new Date(2026, 6, 13, 0, 1);

function reset() {
	fs.rmSync(HOME, { recursive: true, force: true });
	fs.mkdirSync(HOME, { recursive: true });
}

function family(rev) {
	return fp.setMembers(rev, [
		{ name: "Marcel", role: "adult", color: "#4ade80" },
		{ name: "Franzi", role: "adult", color: "#facc15" },
		{ name: "Maja", role: "child", color: "#a78bfa" },
		{ name: "Marie", role: "child", color: "#f472b6" }
	], MON);
}

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

test("ohne Mitglieder wird keine Woche angelegt", () => {
	reset();
	assert.equal(fp.ensureCurrentWeek(WED), null);
	assert.equal(fs.existsSync(fp.FAMILYPLAN_PATH), false);
	const v = fp.view(WED);
	assert.equal(v.currentWeek, null);
	assert.equal(v.duties.length, 8);
	assert.ok(v.warnings.some((w) => w.includes("Noch keine Mitglieder")));
});

test("Mitglieder anlegen, dann entsteht die laufende Woche mit 4 × 2 Diensten", () => {
	reset();
	family(0);
	const saved = fp.ensureCurrentWeek(WED);
	assert.ok(saved);
	const v = fp.view(WED);
	assert.equal(v.currentWeek.start, "2026-07-06");
	assert.equal(v.currentWeek.end, "2026-07-12");
	assert.equal(v.currentWeek.kw, 28);
	const counts = Object.values(v.currentWeek.assign).map((l) => l.length);
	assert.deepEqual(counts, [2, 2, 2, 2]);
	assert.equal(v.preview.length, 4);
	assert.equal(v.preview[0].start, "2026-07-13");
	// zweiter Aufruf in derselben Woche ändert nichts
	assert.equal(fp.ensureCurrentWeek(WED), null);
});

test("Wochenwechsel am Montag legt genau eine neue Woche an, wie in der Vorschau", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	const expected = fp.view(WED).preview[0].assign;
	fp.ensureCurrentWeek(NEXT_MON);
	const v = fp.view(NEXT_MON);
	assert.equal(v.currentWeek.start, "2026-07-13");
	assert.deepEqual(v.currentWeek.assign, expected);
	assert.equal(fp.load().weeks.length, 2);
});

test("Uhr springt zurück: keine neue Woche", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(NEXT_MON);
	assert.equal(fp.ensureCurrentWeek(WED), null);
	assert.equal(fp.load().weeks.length, 1);
});

test("Uhr liegt vor der letzten Änderung: keine Woche, Hinweis im Portal", () => {
	reset();
	family(0); // updatedAt = MON (06.07.2026)
	const past = new Date(2020, 0, 6, 8, 0);
	assert.equal(fp.ensureCurrentWeek(past), null);
	assert.ok(fp.view(past).warnings.some((w) => w.includes("Uhrzeit")));
});

test("Revisionskonflikt: veraltete Revision wird abgelehnt", () => {
	reset();
	const saved = family(0);
	assert.throws(() => fp.setSettings(saved.revision - 1, { title: "Neu" }, WED), fp.ConflictError);
	assert.doesNotThrow(() => fp.setSettings(saved.revision, { title: "Neu" }, WED));
});

test("manueller Tausch, dann automatische Verteilung wiederherstellen", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	let v = fp.view(WED);
	const [a, b] = v.members;
	const target = v.currentWeek.assign[b.id][0];
	const old = v.currentWeek.assign[a.id][0];
	fp.assign(v.revision, v.currentWeek.start, a.id, 0, target, WED);
	v = fp.view(WED);
	assert.equal(v.currentWeek.assign[a.id][0], target);
	assert.ok(v.currentWeek.assign[b.id].includes(old), "der andere bekommt den alten Dienst");
	assert.ok(v.currentWeek.manual);
	fp.resetWeek(v.revision, v.currentWeek.start, WED);
	v = fp.view(WED);
	assert.equal(v.currentWeek.manual, null);
	assert.deepEqual(v.currentWeek.assign, v.currentWeek.auto);
});

test("Personen ändern: laufende Woche bleibt, neuer Zyklus ab nächster Woche", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	let v = fp.view(WED);
	const before = JSON.stringify(v.currentWeek.assign);
	const members = v.members.map((m) => (m.name === "Marie" ? Object.assign({}, m, { active: false }) : m));
	fp.setMembers(v.revision, members, WED);
	v = fp.view(WED);
	assert.equal(JSON.stringify(v.currentWeek.assign), before, "laufende Woche unverändert");
	assert.equal(v.settings.cycleStart, "2026-07-13");
	const marie = v.members.find((m) => m.name === "Marie");
	assert.equal(v.preview[0].assign[marie.id], undefined, "Marie pausiert ab nächster Woche");
	const counts = Object.values(v.preview[0].assign).map((l) => l.length).sort();
	assert.deepEqual(counts, [2, 3, 3]);
});

test("Entfernen ist ein Soft-Delete, vergangene Namen bleiben", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	let v = fp.view(WED);
	fp.setMembers(v.revision, v.members.filter((m) => m.name !== "Maja"), WED);
	v = fp.view(WED);
	assert.equal(v.members.length, 3);
	assert.ok(v.allMembers.some((m) => m.name === "Maja" && m.deleted));
});

test("Validierung: unbekanntes Symbol, doppelte Namen, kaputtes Paar", () => {
	reset();
	const saved = family(0);
	const v = fp.view(WED);
	const bad = v.duties.map((d, i) => (i === 0 ? Object.assign({}, d, { icon: "bomb" }) : d));
	assert.throws(() => fp.setDuties(saved.revision, bad, WED), fp.ValidationError);
	assert.throws(() => fp.setMembers(saved.revision, [{ name: "Max" }, { name: "max" }], WED), fp.ValidationError);
	assert.throws(() => fp.setSettings(saved.revision, { fixedPairs: [["d_kochen", "d_kochen"]] }, WED), fp.ValidationError);
});

test("Backup vor jedem Schreiben", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	const backups = fs.readdirSync(path.join(HOME, "backups")).filter((f) => f.startsWith("familyplan."));
	assert.ok(backups.length >= 1);
});

test("beschädigte Datei: Ansicht mit Hinweis, Schreiben gesperrt", () => {
	reset();
	family(0);
	fs.writeFileSync(fp.FAMILYPLAN_PATH, "{ kaputt", "utf8");
	const v = fp.view(WED);
	assert.equal(v.corrupt, true);
	assert.equal(fp.ensureCurrentWeek(WED), null);
	assert.throws(() => fp.setSettings(undefined, { title: "x" }, WED), fp.ValidationError);
});
