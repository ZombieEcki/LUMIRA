// Tests für modules/MMM-FamilyPlan/payload.js (Aufbereitung für den Spiegel).
// Liegt hier, weil nur lumira-portal einen Test-Runner hat.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPayload, textOn } = require("../../modules/MMM-FamilyPlan/payload");

const RAW = {
	settings: { title: "Unser Familienplan", rotationWeekday: 1 },
	members: [
		{ id: "m_aaaa1111", name: "Marcel", color: "#4ade80", avatar: { type: "preset", value: "adult-04" } },
		{ id: "m_bbbb2222", name: "Maja", color: "#a78bfa", avatar: { type: "upload", file: "m_bbbb2222.jpg", v: 5 } },
		{ id: "m_cccc3333", name: "Alt", color: "#f472b6", deleted: true }
	],
	duties: [
		{ id: "d_garten", name: "Gartendienst", color: "#4ade80", icon: "seedling" },
		{ id: "d_tisch", name: "Tischdienst", color: "#22d3ee", icon: "utensils\" onclick=\"x" }
	],
	weeks: [
		{ start: "2026-07-06", auto: { m_aaaa1111: ["d_garten"], m_bbbb2222: ["d_tisch"] }, manual: null },
		{ start: "2026-07-13", auto: { m_aaaa1111: ["d_tisch"], m_bbbb2222: ["d_garten"] }, manual: { m_aaaa1111: ["d_garten"], m_bbbb2222: ["d_tisch"] } }
	]
};

test("laufende Woche mit aufgelösten Namen, Farben, Avataren", () => {
	const p = buildPayload(RAW, new Date(2026, 6, 8, 12));
	assert.equal(p.state, "ok");
	assert.equal(p.week.kw, 28);
	assert.equal(p.week.range, "06.07. – 12.07.2026");
	assert.equal(p.stale, false);
	assert.deepEqual(p.members.map((m) => m.name), ["Marcel", "Maja"]);
	assert.equal(p.members[0].avatar, "modules/MMM-FamilyPlan/avatars/adult-04.jpg");
	assert.equal(p.members[1].avatar, "/MMM-FamilyPlan/uploads/m_bbbb2222.jpg?v=5");
	assert.equal(p.members[0].duties[0].name, "Gartendienst");
});

test("manuelle Änderung hat Vorrang vor der automatischen Verteilung", () => {
	const p = buildPayload(RAW, new Date(2026, 6, 14));
	assert.equal(p.week.start, "2026-07-13");
	assert.equal(p.members[0].duties[0].name, "Gartendienst");
});

test("abgelaufene Woche wird als Vorwoche markiert", () => {
	const p = buildPayload(RAW, new Date(2026, 6, 25));
	assert.equal(p.week.start, "2026-07-13");
	assert.equal(p.stale, true);
});

test("unsicheres Symbol wird ersetzt, nie ungeprüft durchgereicht", () => {
	const p = buildPayload(RAW, new Date(2026, 6, 8));
	assert.equal(p.members[1].duties[0].icon, "house");
});

test("vor der ersten Woche: Leer-Zustand", () => {
	assert.equal(buildPayload(RAW, new Date(2026, 5, 1)).state, "empty");
	assert.equal(buildPayload({}, new Date()).state, "empty");
});

test("Textfarbe: dunkel auf hellen, hell auf dunklen Farben", () => {
	assert.equal(textOn("#facc15"), "#14161a");
	assert.equal(textOn("#1e3a8a"), "#ffffff");
});
