// Tests für „Wichtige Termine“: Datumsformate, Speichern, config.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-dates-test-"));
process.env.LUMIRA_HOME = HOME;
const { toMMDD, toFullDate } = require("../lib/family-dates");
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

test("toMMDD: deutsche und Modul-Schreibweise", () => {
	assert.equal(toMMDD("24.12."), "12-24");
	assert.equal(toMMDD("4.7"), "07-04");
	assert.equal(toMMDD("29.02."), "02-29");
	assert.equal(toMMDD("20.06.2010"), "06-20");
	assert.equal(toMMDD("12-24"), "12-24");
	assert.equal(toMMDD("2010-06-20"), "06-20");
	assert.equal(toMMDD("31.04."), null);
	assert.equal(toMMDD("29.02.2023"), null);
	assert.equal(toMMDD("morgen"), null);
});

test("toFullDate: Hochzeitstag", () => {
	assert.equal(toFullDate("20.06.2010"), "2010-06-20");
	assert.equal(toFullDate("2010-06-20"), "2010-06-20");
	assert.equal(toFullDate(""), "");
	assert.equal(toFullDate("20.06."), null);
});

test("Speichern rechnet um und behält die Verknüpfung zum Familienmitglied", () => {
	const saved = settingsLib.patch({
		family: {
			birthdays: [{ name: "Maja", date: "14.03.", memberId: "m_ab12cd34" }, { name: "Oma Erika", date: "02.11." }],
			weddingDate: "20.06.2010",
			countdowns: [{ label: "Sommerurlaub", date: "01.08." }]
		}
	});
	assert.deepEqual(saved.family.birthdays, [
		{ name: "Maja", date: "03-14", memberId: "m_ab12cd34" },
		{ name: "Oma Erika", date: "11-02" }
	]);
	assert.equal(saved.family.weddingDate, "2010-06-20");
	assert.deepEqual(saved.family.countdowns, [{ label: "Sommerurlaub", date: "08-01" }]);
});

test("Speichern lehnt ungültige Termine mit verständlicher Meldung ab", () => {
	assert.throws(() => settingsLib.patch({ family: { birthdays: [{ name: "Max", date: "32.01." }] } }), /Geburtstag von Max/);
	assert.throws(() => settingsLib.patch({ family: { birthdays: [{ name: "", date: "01.01." }] } }), settingsLib.ValidationError);
	assert.throws(() => settingsLib.patch({ family: { weddingDate: "20.06." } }), /TT\.MM\.JJJJ/);
	assert.throws(() => settingsLib.patch({ family: { countdowns: [{ label: "Urlaub", date: "" }] } }), /Urlaub/);
});

test("config.js: Geburtstage im Modul-Format, auch alte TT.MM.-Einträge", () => {
	const s = settingsLib.load();
	s.edition = "home";
	s.family.birthdays = [{ name: "Alt", date: "24.12." }, { name: "Kaputt", date: "xx" }, { name: "Neu", date: "03-14", memberId: "m_ab12cd34" }];
	s.family.weddingDate = "2010-06-20";
	s.family.countdowns = [{ label: "Urlaub", date: "08-01" }];
	const sc = buildModules(s).find((m) => m.module === "MMM-SmartCompliments").config;
	assert.deepEqual(sc.birthdays, [{ name: "Alt", date: "12-24" }, { name: "Neu", date: "03-14" }]);
	assert.equal(sc.weddingDate, "2010-06-20");
	assert.deepEqual(sc.countdowns, [{ label: "Urlaub", date: "08-01" }]);
});
