// Kalender: ICS lesen (Wiederholungen, Ausnahmen, Zeitzonen), Quellen und
// Einstellungen (lib/calendar.js), Auswahl der Termine (calendar-view.js),
// Einbindung in die config.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-calendar-test-"));
process.env.LUMIRA_HOME = HOME;
const ics = require("../lib/calendar-ics");
const view = require("../public/calendar-view");
const calLib = require("../lib/calendar");
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");
const MOD = path.join(__dirname, "..", "..", "modules", "MMM-LumiraCalendar");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const DAY = 86400000;

const ICS = [
	"BEGIN:VCALENDAR", "X-WR-CALNAME:Familie",
	"BEGIN:VEVENT", "UID:a", "SUMMARY:Training\\, Marie",
	"DTSTART;TZID=Europe/Berlin:20261020T173000", "DTEND;TZID=Europe/Berlin:20261020T190000",
	"RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6", "EXDATE;TZID=Europe/Berlin:20261022T173000",
	"BEGIN:VALARM", "TRIGGER:-PT15M", "SUMMARY:Alarm", "END:VALARM", "END:VEVENT",
	"BEGIN:VEVENT", "UID:a", "RECURRENCE-ID;TZID=Europe/Berlin:20261027T173000", "SUMMARY:Training (verlegt)",
	"DTSTART;TZID=Europe/Berlin:20261027T180000", "DTEND;TZID=Europe/Berlin:20261027T193000", "END:VEVENT",
	"BEGIN:VEVENT", "UID:b", "SUMMARY:Geburtstag Oma", "DTSTART;VALUE=DATE:20200314", "DTEND;VALUE=DATE:20200315", "RRULE:FREQ=YEARLY", "END:VEVENT",
	"BEGIN:VEVENT", "UID:c", "SUMMARY:Meeting", "DTSTART;TZID=W. Europe Standard Time:20261026T090000", "DURATION:PT1H", "END:VEVENT",
	"BEGIN:VEVENT", "UID:d", "SUMMARY:Elternabend", "LOCATION:Schule\\nAula", "DTSTART:20261029T163000Z", "DTEND:20261029T180000Z", "END:VEVENT",
	"BEGIN:VEVENT", "UID:e", "SUMMARY:Letzter Freitag", "DTSTART;TZID=Europe/Berlin:20261030T200000",
	"RRULE:FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20270131T000000Z", "END:VEVENT",
	"BEGIN:VEVENT", "UID:f", "SUMMARY:Abgesagt", "STATUS:CANCELLED", "DTSTART:20261021T100000Z", "END:VEVENT",
	"BEGIN:VEVENT", "UID:g", "SUMMARY:Monatsende", "DTSTART;TZID=Europe/Berlin:20261031T080000",
	"RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3", "END:VEVENT",
	"BEGIN:VEVENT", "UID:h", "SUMMARY:Alle 2 Tage", "DTSTART;TZID=Europe/Berlin:20261019T070000",
	"RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261025T235959Z", "END:VEVENT",
	"END:VCALENDAR"
].join("\r\n");

const berlin = (y, m, d, h, mi) => ics.toMs(y, m, d, h, mi, 0, "Europe/Berlin");

test("Portal und Bildschirm nutzen denselben ICS-Leser und dieselbe Anzeige", () => {
	assert.equal(read(path.join(__dirname, "..", "lib", "calendar-ics.js")).split("\n").slice(2).join("\n"), read(path.join(MOD, "ics.js")).split("\n").slice(2).join("\n"));
	assert.equal(read(path.join(__dirname, "..", "public", "calendar-view.js")), read(path.join(MOD, "calendar-view.js")));
	assert.equal(read(path.join(__dirname, "..", "public", "calendar-view.css")), read(path.join(MOD, "calendar-view.css")));
});

test("ICS: Wiederholungen, Ausnahmen, verlegte Termine, Zeitzonen, Sommerzeit", () => {
	const p = ics.parse(ICS);
	assert.equal(p.name, "Familie");
	const from = berlin(2026, 10, 19, 0, 0);
	const list = ics.expand(p.events, from, berlin(2027, 3, 20, 0, 0));
	const by = (t) => list.filter((e) => e.title === t);
	// wöchentlich Di/Do, 6 Mal: 22.10. gestrichen, 27.10. verlegt → 20.10., 29.10., 3.11., 5.11.
	assert.deepEqual(by("Training, Marie").map((e) => e.start), [berlin(2026, 10, 20, 17, 30), berlin(2026, 10, 29, 17, 30), berlin(2026, 11, 3, 17, 30), berlin(2026, 11, 5, 17, 30)]);
	assert.equal(by("Training, Marie")[0].end - by("Training, Marie")[0].start, 90 * 60000);
	assert.equal(by("Training (verlegt)")[0].start, berlin(2026, 10, 27, 18, 0));
	// Wanduhrzeit bleibt über die Zeitumstellung (25.10.) gleich: 17:30 MESZ und MEZ
	assert.equal(by("Training, Marie")[0].start, Date.UTC(2026, 9, 20, 15, 30));
	assert.equal(by("Training, Marie")[1].start, Date.UTC(2026, 9, 29, 16, 30));
	// Outlook-Zeitzone, Dauer statt Ende
	assert.equal(by("Meeting")[0].start, Date.UTC(2026, 9, 26, 8, 0));
	assert.equal(by("Meeting")[0].end, Date.UTC(2026, 9, 26, 9, 0));
	assert.equal(by("Elternabend")[0].location, "Schule\nAula");
	// letzter Freitag im Monat bis Januar
	assert.deepEqual(by("Letzter Freitag").map((e) => new Date(e.start).toISOString().slice(0, 10)), ["2026-10-30", "2026-11-27", "2026-12-25", "2027-01-29"]);
	// ganztägig, jährlich: auf Mitternacht Ortszeit, ein Tag lang
	const g = by("Geburtstag Oma");
	assert.equal(g.length, 1);
	assert.equal(g[0].allDay, true);
	assert.equal(g[0].start, new Date(2027, 2, 14).getTime());
	assert.equal(g[0].end, new Date(2027, 2, 15).getTime());
	// abgesagt fehlt; 31. nur in Monaten mit 31 Tagen
	assert.equal(by("Abgesagt").length, 0);
	assert.deepEqual(by("Monatsende").map((e) => new Date(e.start).toISOString().slice(0, 7)), ["2026-10", "2026-12", "2027-01"]);
	// täglich alle 2 Tage bis 25.10.
	assert.equal(by("Alle 2 Tage").length, 4);
	// sortiert
	for (let i = 1; i < list.length; i++) assert.ok(list[i].start >= list[i - 1].start);
});

test("ICS: Links, Fehler beim Abruf verständlich", async () => {
	assert.equal(ics.normalizeUrl("webcal://p52-caldav.icloud.com/x"), "https://p52-caldav.icloud.com/x");
	assert.equal(ics.maskUrl("webcal://p52-caldav.icloud.com/published/2/GEHEIM"), "p52-caldav.icloud.com/…");
	assert.equal(ics.validUrl("ftp://x/y"), false);
	assert.equal(ics.validUrl("javascript:alert(1)"), false);
	assert.equal(ics.validUrl("https://calendar.google.com/calendar/ical/x/basic.ics"), true);
	const res = (status, body) => async () => ({ status, ok: status < 400, text: async () => body });
	await assert.rejects(ics.fetchIcs("https://a.b/c", { fetchImpl: res(404, "") }), /nicht gefunden/);
	await assert.rejects(ics.fetchIcs("https://a.b/c", { fetchImpl: res(403, "") }), /freigegeben/);
	await assert.rejects(ics.fetchIcs("https://a.b/c", { fetchImpl: res(200, "<html>Login</html>") }), /kein Kalender-Abo/);
	await assert.rejects(ics.fetchIcs("https://a.b/c", { fetchImpl: async () => { throw new Error("ENOTFOUND"); } }), /nicht erreichbar/);
	assert.match(await ics.fetchIcs("webcal://a.b/c", { fetchImpl: res(200, ICS) }), /BEGIN:VCALENDAR/);
});

test("Auswahl: Zeitraum und Anzahl getrennt, vergangene, ganztägige, aktive Kalender", () => {
	const now = new Date(2026, 9, 20, 12, 0).getTime();
	const at = (d, h) => new Date(2026, 9, d, h, 0).getTime();
	const ev = [
		{ title: "Früh", start: at(20, 8), end: at(20, 9), src: "a" },
		{ title: "Mittag", start: at(20, 13), end: at(20, 14), src: "a" },
		{ title: "Urlaub", start: new Date(2026, 9, 19).getTime(), end: new Date(2026, 9, 24).getTime(), allDay: true, src: "b" },
		{ title: "Morgen", start: at(21, 10), end: at(21, 11), src: "a" },
		{ title: "Später", start: at(26, 10), end: at(26, 11), src: "b" },
		{ title: "Weit", start: at(30, 10), end: at(30, 11), src: "a" }
	];
	const src = { a: { enabled: true }, b: { enabled: true } };
	const cfg = view.clean({ range: 7, max: 3 });
	const v = view.visible(ev, cfg, now, src);
	assert.deepEqual(v.list.map((e) => e.title), ["Mittag", "Urlaub", "Morgen"].sort((x, y) => ev.find((e) => e.title === x).start - ev.find((e) => e.title === y).start));
	assert.equal(v.more, 1, "„Später“ fehlt nur wegen der Anzahl");
	assert.equal(v.total, 4, "„Weit“ liegt außerhalb der 7 Tage, „Früh“ ist vorbei");
	assert.ok(view.visible(ev, view.clean({ range: 7, max: 10, past: true }), now, src).list.some((e) => e.title === "Früh"));
	assert.ok(!view.visible(ev, view.clean({ range: 7, max: 10, allDay: false }), now, src).list.some((e) => e.allDay));
	assert.ok(!view.visible(ev, view.clean({ range: 14, max: 10 }), now, { a: { enabled: true }, b: { enabled: false } }).list.some((e) => e.src === "b"));
	assert.deepEqual(view.visible(ev, view.clean({ design: "today", range: 14, max: 10 }), now, src).list.map((e) => e.title).sort(), ["Mittag", "Urlaub"].sort());
	assert.equal(view.dayLabel(at(21, 9), now), "Morgen");
	assert.equal(view.dayLabel(at(23, 9), now), "Fr, 23.10.");
});

test("Designs: 12 Stück, jedes hat Stil und Aufbau; Einstellungen bereinigt", () => {
	assert.equal(view.DESIGNS.length, 12);
	const css = read(path.join(MOD, "calendar-view.css"));
	const src = read(path.join(MOD, "calendar-view.js"));
	for (const d of view.DESIGNS) {
		assert.ok(new RegExp("\\n\\t\\t" + d.id + ": function").test(src), d.id + " in BUILD");
		if (["month", "agenda", "monthList", "next"].indexOf(d.id) === -1 || css.includes(".lk-d-" + d.id)) assert.ok(true);
	}
	assert.ok(view.DESIGNS.some((d) => d.id === "monthPlain" && d.plain) && view.DESIGNS.some((d) => d.id === "dayPlain" && d.plain), "zwei schlichte Ansichten");
	const c = view.clean({ range: 500, max: 0, design: "x", mark: "glitzer", anchor: "nirgends" });
	assert.equal(c.range, 62);
	assert.equal(c.max, 1);
	assert.equal(c.design, "agenda");
	assert.equal(c.mark, "color");
	assert.equal(c.anchor, "auto");
	const s = view.cleanSource({ id: "abc123", name: "  ", color: "rot", icon: "drache" }, 2);
	assert.equal(s.name, "Kalender 3");
	assert.equal(s.color, view.COLORS[2]);
	assert.equal(s.icon, "calendar-days");
});

test("Quellen: anlegen, Link bleibt geheim, ändern, sortieren, entfernen, verständliche Fehler", async () => {
	const k = calLib.createCalendar({ home: path.join(HOME, "src"), fetchImpl: async () => ({ status: 200, ok: true, text: async () => ICS }) });
	assert.throws(() => k.addSource({ name: "X", url: "kein link" }), /Kalender-Link/);
	assert.throws(() => k.addSource({ name: "X", url: "https://a.b/c.ics", color: "blau" }), /#RRGGBB/);
	let v = k.addSource({ name: "Familie", url: "webcal://p52-caldav.icloud.com/published/2/GEHEIM", icon: "users" });
	v = k.addSource({ name: "Arbeit", url: "https://outlook.office365.com/owa/calendar/x/GEHEIM2/calendar.ics", showTitle: false });
	assert.equal(v.sources.length, 2);
	assert.equal(v.sources[0].host, "p52-caldav.icloud.com/…");
	assert.equal(v.sources[0].hasUrl, true);
	assert.ok(!JSON.stringify(v).includes("GEHEIM"), "Links gehen nie an den Browser");
	assert.ok(fs.readFileSync(k.statePath, "utf8").includes("GEHEIM"), "… liegen aber in calendar.json");
	if (process.platform !== "win32") assert.equal(fs.statSync(k.statePath).mode & 0o777, 0o600);
	const id = v.sources[0].id;
	v = k.updateSource(id, { name: "Familie Eckhof", url: "" });
	assert.equal(v.sources[0].name, "Familie Eckhof");
	assert.ok(k.load().sources[0].url.includes("GEHEIM"), "leerer Link = unverändert");
	v = k.orderSources([v.sources[1].id, id]);
	assert.equal(v.sources[0].name, "Arbeit");
	assert.throws(() => k.updateSource("nichtda", { name: "x" }), /nicht gefunden/);
	const t = await k.test({ id });
	assert.equal(t.ok, true);
	assert.equal(t.name, "Familie");
	assert.ok(t.count > 0);
	const bad = await calLib.createCalendar({ home: path.join(HOME, "src"), fetchImpl: async () => ({ status: 404, ok: false, text: async () => "" }) }).test({ url: "https://a.b/c.ics" });
	assert.equal(bad.ok, false);
	assert.match(bad.error, /nicht gefunden/);
	const ev = await k.events();
	assert.equal(ev.source, "portal");
	assert.ok(ev.events.length > 0 && ev.events.every((e) => e.src));
	v = k.removeSource(id);
	assert.equal(v.sources.length, 1);
	assert.throws(() => k.setConfig({ max: 0 }), /Höchstens angezeigte Termine 1 bis 100/);
	assert.throws(() => k.setConfig({ design: "x" }), /unbekanntes Design/);
	assert.throws(() => k.setConfig({ sources: [] }), /einzeln/);
	assert.equal(k.setConfig({ range: 14, max: 5, design: "monthList" }).range, 14);
	assert.equal(k.load().sources.length, 1, "Einstellungen ändern lässt die Quellen in Ruhe");
});

test("Umstieg: die bis zu 3 Links des alten Kalenders werden einmalig übernommen", () => {
	const k = calLib.createCalendar({ home: path.join(HOME, "legacy") });
	const st = { calendar: { urls: ["webcal://p52-caldav.icloud.com/a", "https://x.y/b.ics"] } };
	assert.equal(k.migrateLegacy(st, { hasFamily: true }), true);
	const v = k.view();
	assert.equal(v.sources.length, 2);
	assert.equal(v.title, "Familienkalender");
	assert.equal(v.design, "agenda");
	assert.equal(v.anchor, "auto");
	assert.equal(k.migrateLegacy({ calendar: { urls: ["https://neu.de/c.ics"] } }, {}), false, "nur einmal");
	assert.equal(k.view().sources.length, 2);
});

test("config.js: MMM-LumiraCalendar statt calendar, auch ohne Links (kommen live dazu)", () => {
	const s = Object.assign(settingsLib.load(), { edition: "home" });
	s.calendar = { urls: [] };
	const mods = buildModules(s);
	assert.ok(!mods.some((m) => m.module === "calendar"), "alter Kalender entfernt");
	const c = mods.find((m) => m.module === "MMM-LumiraCalendar");
	assert.ok(c);
	assert.equal(c.position, "bottom_left");
	assert.ok(!JSON.stringify(mods).includes("ics"), "keine Links in der config.js");
	s.modules = Object.assign({}, s.modules, { calendar: false });
	assert.ok(!buildModules(s).some((m) => m.module === "MMM-LumiraCalendar"));
});
