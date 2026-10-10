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

// ---------------------------------------------------------------------------
// Phase 4: kommende Wochen, Begründungen, Fairness
// ---------------------------------------------------------------------------
test("Vorschau-Woche ändern: wird als geplante Änderung gespeichert und beim Wochenwechsel übernommen", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	let v = fp.view(WED);
	const next = v.preview[0];
	const [a, b] = v.members;
	const target = next.assign[b.id][0];
	fp.assign(v.revision, next.start, a.id, 0, target, WED);
	v = fp.view(WED);
	assert.equal(v.preview[0].assign[a.id][0], target);
	assert.ok(v.preview[0].manual, "als manuell markiert");
	assert.ok(v.preview[0].reasons[a.id][target].includes("Manuell"));
	const planned = v.preview[0].assign;
	fp.ensureCurrentWeek(NEXT_MON);
	v = fp.view(NEXT_MON);
	assert.deepEqual(v.currentWeek.assign, planned);
	assert.ok(v.currentWeek.manual);
	assert.deepEqual(fp.load().plannedOverrides, {}, "erledigte Planung ist entfernt");
});

test("Vorschau-Woche zurücksetzen und „Zukunft neu generieren“", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	let v = fp.view(WED);
	const [a, b] = v.members;
	fp.assign(v.revision, v.preview[0].start, a.id, 0, v.preview[0].assign[b.id][0], WED);
	v = fp.view(WED);
	fp.resetWeek(v.revision, v.preview[0].start, WED);
	v = fp.view(WED);
	assert.equal(v.preview[0].manual, null);
	fp.assign(v.revision, v.preview[1].start, a.id, 0, v.preview[1].assign[b.id][0], WED);
	v = fp.view(WED);
	assert.ok(v.preview[1].manual);
	fp.regenerateFuture(v.revision, WED);
	v = fp.view(WED);
	assert.ok(v.preview.every((p) => !p.manual));
});

test("geplante Änderung verfällt, wenn sich die Familie ändert", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	let v = fp.view(WED);
	const [a, b] = v.members;
	fp.assign(v.revision, v.preview[0].start, a.id, 0, v.preview[0].assign[b.id][0], WED);
	v = fp.view(WED);
	fp.setMembers(v.revision, v.members.map((m) => (m.name === "Marie" ? Object.assign({}, m, { active: false }) : m)), WED);
	v = fp.view(WED);
	assert.equal(v.preview[0].manual, null, "Automatik gilt wieder");
});

test("vergangene Wochen sind gesperrt", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	fp.ensureCurrentWeek(NEXT_MON);
	const v = fp.view(NEXT_MON);
	const [a, b] = v.members;
	assert.throws(() => fp.assign(v.revision, "2026-07-06", a.id, 0, "d_garten", NEXT_MON), /Vergangene Wochen/);
	assert.ok(b);
});

test("Begründungen und Fairness-Zählung", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	fp.ensureCurrentWeek(NEXT_MON);
	const v = fp.view(NEXT_MON);
	const pid = v.members[0].id;
	const did = v.currentWeek.assign[pid][0];
	assert.match(v.currentWeek.reasons[pid][did], /noch nicht gehabt|Zuletzt vor/);
	assert.equal(v.fairness.weeks, 2);
	const total = Object.values(v.fairness.counts).reduce((s, c) => s + Object.values(c).reduce((x, y) => x + y, 0), 0);
	assert.equal(total, 16, "2 Wochen × 8 Dienste");
});

// ---------------------------------------------------------------------------
// Phase 5: Export, Import, Backups
// ---------------------------------------------------------------------------
test("Export → Import auf leerem Gerät stellt alles wieder her (inkl. Foto)", () => {
	reset();
	family(0);
	fp.ensureCurrentWeek(WED);
	const marcel = fp.view(WED).members[0];
	fs.mkdirSync(fp.AVATAR_UPLOAD_DIR, { recursive: true });
	const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
	fs.writeFileSync(path.join(fp.AVATAR_UPLOAD_DIR, `${marcel.id}.jpg`), jpg);
	fp.setUploadedAvatar(marcel.id, `${marcel.id}.jpg`);
	const exported = JSON.parse(JSON.stringify(fp.exportData(WED)));
	assert.equal(exported.type, "lumira-familyplan-export");
	assert.ok(exported.avatars[`${marcel.id}.jpg`].startsWith("data:image/jpeg;base64,"));

	reset();
	fp.importData(exported, WED);
	const v = fp.view(WED);
	assert.deepEqual(v.members.map((m) => m.name), ["Marcel", "Franzi", "Maja", "Marie"]);
	assert.equal(v.currentWeek.start, "2026-07-06");
	assert.deepEqual(fs.readFileSync(path.join(fp.AVATAR_UPLOAD_DIR, `${marcel.id}.jpg`)), jpg);
});

test("Import lehnt fremde Dateien ab und ersetzt kaputte Fotos durch Initialen", () => {
	reset();
	family(0);
	assert.throws(() => fp.importData({ hallo: "welt" }, WED), /keine Familienplan-Sicherung/);
	const exported = JSON.parse(JSON.stringify(fp.exportData(WED)));
	exported.data.members[0].avatar = { type: "upload", file: `${exported.data.members[0].id}.png`, v: 1 };
	exported.avatars = { [`${exported.data.members[0].id}.png`]: "data:image/png;base64,AAAA" };
	fp.importData(exported, WED);
	assert.equal(fp.view(WED).members[0].avatar.type, "initials");
});

test("Backups auflisten und wiederherstellen, auch bei beschädigter Datei", () => {
	reset();
	const s1 = family(0);
	fp.setSettings(s1.revision, { title: "Version A" }, WED);
	const s2 = fp.load();
	fp.setSettings(s2.revision, { title: "Version B" }, WED);
	const backups = fp.listBackups();
	assert.ok(backups.length >= 2);
	const withA = backups.find((b) => fp.load() && JSON.parse(fs.readFileSync(path.join(HOME, "backups", b.name), "utf8")).settings.title === "Version A");
	assert.ok(withA, "Backup mit Version A vorhanden");
	fs.writeFileSync(fp.FAMILYPLAN_PATH, "{ kaputt", "utf8");
	fp.restoreBackup(withA.name, WED);
	assert.equal(fp.view(WED).settings.title, "Version A");
	assert.throws(() => fp.restoreBackup("../settings.json", WED), /nicht gefunden/);
});
