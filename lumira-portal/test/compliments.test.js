// Sprüche: Katalog (Kategorien, eingebaute Sprüche), Auswahl-Logik
// (MMM-SmartCompliments/logic.js) und compliments.json (lib/compliments.js)
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-compliments-test-"));
process.env.LUMIRA_HOME = HOME;
process.env.LUMIRA_COMPLIMENTS_PATH = path.join(HOME, "compliments.json");
const lib = require("../lib/compliments");
const MOD = path.join(__dirname, "..", "..", "modules", "MMM-SmartCompliments");
const Catalog = require(path.join(MOD, "catalog"));
const L = require(path.join(MOD, "logic"));

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const cat = (k) => Catalog.byKey(k);
const MONDAY = new Date(2026, 9, 19, 9, 0); // Montag, 19.10.2026
const SATURDAY = new Date(2026, 9, 24, 9, 0);

test("Portal und Spiegel nutzen denselben Katalog, dieselbe Logik und dasselbe Aussehen", () => {
	for (const f of ["catalog.js", "logic.js", "view.css"]) {
		assert.equal(read(path.join(__dirname, "..", "public", "spruch", f)), read(path.join(MOD, f)), "public/spruch/" + f);
	}
});

test("Katalog: 20 neue Kategorien mit je 12 Sprüchen, eindeutige Schlüssel, Sonderfälle", () => {
	const keys = Catalog.CATEGORIES.map((c) => c.key);
	assert.equal(new Set(keys).size, keys.length, "Schlüssel eindeutig");
	const lists = Catalog.CATEGORIES.map((c) => c.list);
	assert.equal(new Set(lists).size, lists.length, "Listen eindeutig");
	const neu = ["familienwahnsinn", "freche", "liebe", "kinder", "mutmacher", "sarkasmus", "sofa", "feuerwehr", "gluecksmomente", "orakel",
		"wissen", "raetsel", "wortspiele", "montag", "wochenende", "challenges", "komplimente", "nerd", "chaos", "zitate"];
	const labels = ["Familienwahnsinn", "Freche Sprüche", "Liebe & Partnerschaft", "Kinderweisheiten", "Mutmacher", "Sarkasmus", "Sofa-Philosophie",
		"Feuerwehr & Kameradschaft", "Glücksmomente", "Lumiras Tagesorakel", "Wissen mit Witz", "Denk mal nach", "Wortspiele", "Montagsmotivation",
		"Wochenendmodus", "Kleine Challenges", "Komplimente", "Nerd-Ecke", "Chaos-Prognose", "Zitate mit Twist"];
	neu.forEach((k, i) => {
		assert.ok(cat(k), k);
		assert.equal(cat(k).label, labels[i]);
		assert.equal(cat(k).items.length, 12, k);
		assert.equal(cat(k).group, "general");
	});
	// bisherige Kategorien behalten ihre Listen-Namen
	assert.equal(cat("herzlich").list, "familyMessages");
	assert.equal(cat("morning").list, "morningMessages");
	assert.equal(cat("afterDuty").list, "afterDutyMessages");
	// Übergabe 13.10.2026, 1:1 übernommen; Versaut ab Werk aus
	assert.equal(cat("versaut").items.length, 40);
	assert.equal(cat("versaut").on, false);
	assert.equal(cat("flachwitze").items.length, 50);
	assert.equal(cat("flachwitze").on, true);
	const added = { morning: 22, forenoon: 13, afternoon: 19, evening: 16, night: 12, herzlich: 23, motivierend: 26, humorvoll: 19, afterDuty: 17 };
	Object.keys(added).forEach((k) => assert.equal(cat(k).items.length, added[k], k + ": bisherige + neue Sprüche"));
	assert.ok(cat("morning").items.includes("Erst Kaffee, dann Welt retten ☕🚒"), "bisherige bleiben");
	assert.ok(cat("morning").items.includes("Erst Kaffee, dann Weltrettung. Wir wollen schließlich professionell bleiben."));
	assert.ok(cat("flachwitze").items.includes("Was sagt die Null zur Acht? Schicker Gürtel!"));
	assert.equal(cat("afterDuty").on, false, "„Nach dem Einsatz“ im normalen Mix: ab Werk aus");
	// nur Mo / Wochenende, Feuerwehr nur in der Feuerwehr-Ausgabe
	assert.deepEqual(cat("montag").days, [1]);
	assert.deepEqual(cat("wochenende").days, [6, 0]);
	assert.equal(cat("feuerwehr").need, "alarm");
	assert.ok(cat("raetsel").items.every((x) => x.q && x.a), "Rätsel und Lösung getrennt");
	// keine Dubletten unter den allgemeinen Sprüchen; bereinigte Doppelungen
	const general = [];
	Catalog.CATEGORIES.filter((c) => c.group === "general").forEach((c) => c.items.forEach((it) => general.push(L.itemKey(it))));
	assert.equal(new Set(general).size, general.length, "keine doppelten Sprüche");
	assert.ok(!cat("komplimente").items.includes("Es ist schön, dass es dich gibt."));
	assert.ok(!cat("komplimente").items.includes("Du darfst stolz auf dich sein."));
	assert.ok(Catalog.CATEGORIES.every((c) => c.items.every((it) => L.itemKey(it).length <= 300)));
});

function state(extra) {
	return Object.assign({
		now: MONDAY, settings: L.cleanSettings({}), lists: {}, flags: { alarm: false }, history: [],
		extra: [{ key: "morning", items: ["Guten Morgen ☀️"] }], random: Math.random
	}, extra);
}

function catsSeen(st, n) {
	const seen = new Set();
	for (let i = 0; i < (n || 3000); i++) { const m = L.choose(st); if (m) seen.add(m.cat); }
	return seen;
}

test("Auswahl: ausgeschaltet heißt nie – auch nicht als Ersatz; Wochentag und Ausgabe zählen", () => {
	let seen = catsSeen(state());
	assert.ok(seen.has("montag"), "Montag: Montagsmotivation");
	assert.ok(!seen.has("wochenende"));
	assert.ok(!seen.has("feuerwehr"), "ohne Feuerwehr-Ausgabe");
	assert.ok(!seen.has("versaut"));
	assert.ok(seen.has("morning"), "Tageszeit bleibt dabei");
	seen = catsSeen(state({ now: SATURDAY, flags: { alarm: true } }));
	assert.ok(seen.has("wochenende") && seen.has("feuerwehr") && !seen.has("montag"));
	// alles Allgemeine aus → nur noch Tageszeit
	const enabled = {};
	Catalog.CATEGORIES.forEach((c) => { enabled[c.key] = false; });
	seen = catsSeen(state({ settings: L.cleanSettings({ enabled }) }), 300);
	assert.deepEqual([...seen], ["morning"]);
	// „Nach dem Einsatz“ im Mix nur, wenn eingeschaltet – und nur in der Feuerwehr-Ausgabe
	assert.ok(!catsSeen(state({ flags: { alarm: true } })).has("afterDuty"));
	assert.ok(catsSeen(state({ flags: { alarm: true }, settings: L.cleanSettings({ enabled: { afterDuty: true } }) })).has("afterDuty"));
	assert.ok(!catsSeen(state({ settings: L.cleanSettings({ enabled: { afterDuty: true } }) })).has("afterDuty"));
	// alte Stimmungs-Schalter gelten, bis im Portal geschaltet wurde
	seen = catsSeen(state({ legacy: { humorvoll: false } }));
	assert.ok(!seen.has("humorvoll"));
	seen = catsSeen(state({ legacy: { humorvoll: false }, settings: L.cleanSettings({ enabled: { humorvoll: true } }) }));
	assert.ok(seen.has("humorvoll"));
});

test("Auswahl: einzelne Sprüche aus, eigene Listen, eigene Kategorien, keine Wiederholung", () => {
	const only = {};
	Catalog.CATEGORIES.forEach((c) => { only[c.key] = c.key === "humorvoll"; });
	const s = L.cleanSettings({ enabled: only, off: { humorvoll: ["Kalorien zählen heute nicht 🍕😂"] } });
	const st = state({ settings: s, extra: [] });
	const texts = new Set();
	for (let i = 0; i < 500; i++) texts.add(L.choose(st).text);
	assert.ok(!texts.has("Kalorien zählen heute nicht 🍕😂"));
	assert.equal(texts.size, cat("humorvoll").items.length - 1);
	// eigene Liste ersetzt die eingebauten
	const own = L.choose(state({ settings: s, extra: [], lists: { humorMessages: ["Nur dieser"] } }));
	assert.equal(own.text, "Nur dieser");
	// eigene Kategorie
	const s2 = L.cleanSettings({ enabled: Object.assign({}, only, { humorvoll: false }), own: [{ key: "own_oma1", label: "Oma", items: ["Hallo Oma"] }] });
	assert.equal(L.choose(state({ settings: s2, extra: [] })).text, "Hallo Oma");
	// zuletzt gezeigte meiden
	const hist = cat("humorvoll").items.slice(1);
	assert.equal(L.choose(state({ settings: L.cleanSettings({ enabled: only }), extra: [], history: hist })).text, cat("humorvoll").items[0]);
});

test("Anlässe: Warnung, Kalender, Wetter in Reihenfolge und Anteil; veraltete Daten zählen nicht", () => {
	const t = MONDAY.getTime();
	const base = {
		weather: { code: 61, isDay: true, temp: 12, windKmh: 10, at: t },
		warnings: { at: t, list: [{ event: "Sturmböen" }] },
		events: [{ title: "Fußball Training", startDate: String(t), endDate: String(t + 3600000) }]
	};
	const always = (b) => L.cleanSettings({ behavior: Object.assign({ share: 100 }, b || {}) });
	let m = L.choose(state(Object.assign({}, base, { settings: always() })));
	assert.equal(m.context, "warning");
	assert.match(m.text, /Sturmböen|Ungemütliches Wetter/);
	m = L.choose(state(Object.assign({}, base, { settings: always({ order: ["calendar", "warning", "weather"] }) })));
	assert.equal(m.cat, "kal_sport");
	assert.doesNotMatch(m.text, /\{title\}/);
	m = L.choose(state(Object.assign({}, base, { settings: always({ order: ["weather", "warning", "calendar"] }) })));
	assert.equal(m.cat, "wetter_regen");
	// Anlass aus → nächster
	m = L.choose(state(Object.assign({}, base, { settings: always({ warnings: false }) })));
	assert.equal(m.context, "calendar");
	// Anteil 0 → nie
	assert.ok(!catsSeen(state(Object.assign({}, base, { settings: L.cleanSettings({ behavior: { share: 0 } }) })), 500).has("warnung"));
	// veraltet: Warnung älter als 90 min, Wetter älter als 3 h
	const old = { weather: { code: 61, at: t - 4 * 3600000 }, warnings: { at: t - 2 * 3600000, list: [{ event: "Frost" }] }, events: [] };
	m = L.choose(state(Object.assign({}, old, { settings: always() })));
	assert.equal(m.context, undefined, "veraltet → allgemeiner Mix");
	// abgelaufene Warnung
	assert.deepEqual(L.activeWarnings({ at: t, list: [{ event: "Glätte", expires: new Date(t - 1000).toISOString() }] }, MONDAY), []);
});

test("Wetterlage aus beiden Quellen, Kalender-Stichwörter einstellbar", () => {
	const now = MONDAY;
	const at = now.getTime();
	assert.deepEqual(L.weatherTriggers({ code: 0, isDay: true, at }, {}, now), ["sonne"]);
	assert.deepEqual(L.weatherTriggers({ code: 0, isDay: false, at }, {}, now), [], "nachts keine Sonne");
	assert.deepEqual(L.weatherTriggers({ code: 95, at }, {}, now), ["gewitter"]);
	assert.deepEqual(L.weatherTriggers({ code: 73, temp: -3, at }, {}, now), ["schnee", "frost"]);
	assert.deepEqual(L.weatherTriggers({ type: "day-sunny", temp: 31, at }, {}, now), ["sonne", "hitze"]);
	assert.deepEqual(L.weatherTriggers({ type: "showers", windKmh: 60, at }, { stormWindKmh: 50 }, now), ["regen", "wind"]);
	assert.deepEqual(L.weatherTriggers({ type: "night-clear", at }, {}, now), []);
	const cats = L.allCategories(L.cleanSettings({}));
	const ev = [{ title: "Schwimmkurs Mia", startDate: String(at), endDate: String(at + 3600000) },
		{ title: "Geburtstag Oma", startDate: String(at + 86400000), endDate: String(at + 2 * 86400000) }];
	assert.deepEqual(L.calendarHits(ev, cats, L.cleanSettings({}), now), [], "Schwimmkurs ≠ Schwimmen, Geburtstag ist morgen");
	assert.deepEqual(L.calendarHits(ev, cats, L.cleanSettings({ words: { kal_sport: "Schwimm" } }), now), [{ key: "kal_sport", title: "Schwimmkurs Mia" }]);
});

test("Darstellung: Symbole lösen, Rätsel mit Lösung, Platzhalter", () => {
	assert.deepEqual(L.splitEmoji("Erst Kaffee, dann Welt retten ☕🚒"), { text: "Erst Kaffee, dann Welt retten", icons: ["☕", "🚒"] });
	assert.deepEqual(L.splitEmoji("👨‍🚒 Danke für deinen Einsatz heute."), { text: "Danke für deinen Einsatz heute.", icons: ["👨‍🚒"] });
	assert.equal(L.splitEmoji("Heute wird es heiß.\nViel trinken. 💧").text, "Heute wird es heiß.\nViel trinken.");
	const only = {};
	Catalog.CATEGORIES.forEach((c) => { only[c.key] = c.key === "raetsel"; });
	const m = L.choose(state({ settings: L.cleanSettings({ enabled: only }), extra: [] }));
	assert.ok(m.text && m.answer, "Rätsel bringt die Lösung getrennt mit");
	assert.equal(L.fill("Warnung: {event}, {title}", { event: "Frost" }), "Warnung: Frost, ");
});

test("compliments.json: Schalter, eigene Kategorien, Darstellung, verständliche Fehler", () => {
	let v = lib.load();
	assert.equal(v.version, 2);
	assert.equal(v.display.anchor, "auto", "ab Werk wie bisher");
	assert.equal(v.behavior.share, 50);
	v = lib.patch({ enabled: { versaut: true, herzlich: false }, display: { anchor: "bottom_center", y: 40 }, behavior: { interval: 60 } });
	assert.deepEqual(v.enabled, { versaut: true, herzlich: false });
	assert.equal(v.display.anchor, "bottom_center");
	assert.equal(v.display.icon, "below", "andere Werte bleiben");
	v = lib.patch({ enabled: { herzlich: true } });
	assert.deepEqual(v.enabled, { versaut: true, herzlich: true }, "Schalter werden zusammengeführt");
	v = lib.patch({ own: [{ key: "own_test1", label: "Oma & Opa", items: ["Hallo Oma"] }], enabled: { own_test1: false }, off: { own_test1: ["Hallo Oma"] } });
	assert.equal(v.own[0].label, "Oma & Opa");
	assert.equal(v.enabled.own_test1, false);
	v = lib.patch({ own: [] });
	assert.equal(v.enabled.own_test1, undefined, "gelöschte eigene Kategorie: Schalter weg");
	assert.equal(v.off.own_test1, undefined);
	v = lib.patch({ categories: { raetsel: [{ q: "Was?", a: "Das." }], humorMessages: ["Eigener Witz"] }, words: { kal_sport: "Training, Schwimm" } });
	assert.deepEqual(v.categories.raetsel, [{ q: "Was?", a: "Das." }]);
	assert.equal(v.words.kal_sport, "Training, Schwimm");
	assert.throws(() => lib.patch({ enabled: { gibtsnicht: true } }), /Unbekannte Kategorie/);
	assert.throws(() => lib.patch({ categories: { raetsel: ["ohne Lösung"] } }), /Frage und Lösung/);
	assert.throws(() => lib.patch({ behavior: { interval: 5 } }), /10 bis 600/);
	assert.throws(() => lib.patch({ behavior: { order: ["weather"] } }), /unvollständig/);
	assert.throws(() => lib.patch({ display: { anchor: "irgendwo" } }), /Unbekannte Position/);
	assert.throws(() => lib.patch({ words: { herzlich: "x" } }), /nur für Kalender/);
	assert.throws(() => lib.patch({ own: [{ key: "böse", label: "x", items: [] }] }), /ungültiger Schlüssel/);
	// mindestens eine allgemeine Kategorie bleibt an
	const allOff = {};
	Catalog.CATEGORIES.filter((c) => c.group === "general").forEach((c) => { allOff[c.key] = false; });
	assert.throws(() => lib.patch({ enabled: allOff }), /Mindestens eine Kategorie/);
	v = lib.patch({ enabled: Object.assign({}, allOff, { flachwitze: true }) });
	assert.equal(v.enabled.flachwitze, true, "eine reicht");
	v = lib.patch({ enabled: { herzlich: true, motivierend: true, humorvoll: true, familienwahnsinn: true } });
});

test("compliments.json: alte Datei (Version 1) bleibt gültig, Sicherung einspielen ersetzt alles", () => {
	fs.writeFileSync(process.env.LUMIRA_COMPLIMENTS_PATH, JSON.stringify({ version: 1, categories: { familyMessages: ["Alt"] }, templates: { birthdayText: "🎂 {name}!" } }));
	let v = lib.load();
	assert.deepEqual(v.categories.familyMessages, ["Alt"]);
	assert.equal(v.templates.birthdayText, "🎂 {name}!");
	assert.equal(v.display.anchor, "auto");
	assert.deepEqual(v.enabled, {});
	v = lib.importAll({ categories: { humorMessages: ["Neu"], unbekannt: ["weg"] }, enabled: { versaut: true }, display: { anchor: "top_left" } });
	assert.deepEqual(v.categories.familyMessages, [], "alles ersetzt");
	assert.deepEqual(v.categories.humorMessages, ["Neu"]);
	assert.equal(v.categories.unbekannt, undefined);
	assert.equal(v.display.anchor, "top_left");
	assert.throws(() => lib.importAll([1, 2]), /keine Sprüche-Sicherung/);
	assert.throws(() => lib.importAll({ enabled: { foo: true } }), /Unbekannte Kategorie/);
});
