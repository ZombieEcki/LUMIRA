// Nachrichten: Feeds lesen (RSS 2.0, RDF, Atom), Doppelte, Zeitregel,
// Feeds verwalten (lib/news.js), Übernahme, Einbindung in die config.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-news-test-"));
process.env.LUMIRA_HOME = HOME;
const rss = require("../lib/news-rss");
const view = require("../public/news-view");
const newsLib = require("../lib/news");
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");
const MOD = path.join(__dirname, "..", "..", "modules", "MMM-LumiraNews");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const RSS2 = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Tagesschau</title>
<item><title><![CDATA[Merz &amp; Steinmeier: <b>Treffen</b>]]></title><link>https://www.tagesschau.de/a.html?utm=x</link>
<pubDate>Mon, 02 Nov 2026 19:00:00 +0100</pubDate><enclosure url="https://img.example/a.jpg" type="image/jpeg"/></item>
<item><title>Ohne Datum</title><link>https://www.tagesschau.de/b.html</link></item>
<item><title>Böse &lt;script&gt;alert(1)&lt;/script&gt; Meldung</title><link>javascript:alert(1)</link><pubDate>Mon, 02 Nov 2026 18:00:00 +0100</pubDate>
<media:content url="https://img.example/v.mp4" type="video/mp4"/><description>&lt;img src="https://img.example/c.png"&gt;</description></item>
</channel></rss>`;
const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="x" xmlns="http://purl.org/rss/1.0/" xmlns:dc="d"><channel><title>Merkur</title></channel>
<item><title>Kranzberg plant Härtefallregelung</title><link>https://www.merkur.de/k.html</link><dc:date>2026-11-02T17:30:00+01:00</dc:date></item></rdf:RDF>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>heise online</title>
<entry><title type="html">SUSE streicht Stellen</title><link rel="alternate" href="https://www.heise.de/s.html"/><link rel="enclosure" href="https://x/y.mp3"/>
<published>2026-11-02T20:00:00+01:00</published><content type="html">&lt;p&gt;&lt;img src="https://www.heise.de/i.jpeg" /&gt;&lt;/p&gt;</content></entry>
<entry><title>Doppelt aus anderem Feed</title><link href="http://tagesschau.de/a.html"/><updated>2026-11-02T19:00:00+01:00</updated></entry></feed>`;

test("Portal und Bildschirm nutzen denselben Feed-Leser und dieselbe Anzeige", () => {
	assert.equal(read(path.join(__dirname, "..", "lib", "news-rss.js")).split("\n").slice(2).join("\n"), read(path.join(MOD, "rss.js")).split("\n").slice(2).join("\n"));
	assert.equal(read(path.join(__dirname, "..", "public", "news-view.js")), read(path.join(MOD, "news-view.js")));
	assert.equal(read(path.join(__dirname, "..", "public", "news-view.css")), read(path.join(MOD, "news-view.css")));
});

test("Feeds lesen: RSS 2.0, RDF, Atom – Titel als reiner Text, nur http(s)-Links und Bilder", () => {
	const a = rss.parse(RSS2);
	assert.equal(a.title, "Tagesschau");
	assert.equal(a.items.length, 3);
	assert.equal(a.items[0].title, "Merz & Steinmeier: Treffen");
	assert.equal(a.items[0].image, "https://img.example/a.jpg");
	assert.equal(a.items[0].date, Date.parse("2026-11-02T18:00:00Z"));
	assert.equal(a.items[1].date, null, "ohne Datum bleibt null");
	assert.ok(!/[<>]/.test(a.items[2].title), "keine Tags im Titel");
	assert.equal(a.items[2].link, "", "javascript:-Links fallen weg");
	assert.equal(a.items[2].image, "https://img.example/c.png", "Video übersprungen, Bild aus der Beschreibung");
	const r = rss.parse(RDF);
	assert.equal(r.title, "Merkur");
	assert.equal(r.items[0].date, Date.parse("2026-11-02T16:30:00Z"));
	const h = rss.parse(ATOM);
	assert.equal(h.items[0].link, "https://www.heise.de/s.html");
	assert.equal(h.items[0].image, "https://www.heise.de/i.jpeg");
	// Doppelte (gleicher Link ohne www/Parameter) – die obere Quelle gewinnt; neueste zuerst
	const m = rss.merge([{ src: "ts", items: a.items }, { src: "heise", items: h.items }]);
	assert.equal(m.filter((x) => /tagesschau\.de\/a\.html/.test(x.link)).length, 1);
	assert.equal(m.find((x) => /tagesschau\.de\/a\.html/.test(x.link)).src, "ts");
	assert.ok(m[0].date >= m[1].date);
});

test("Zeitregel: nur mit Zeitangabe im Zeitraum; ohne Zeit oder in der Zukunft raus", () => {
	const now = Date.parse("2026-11-02T20:00:00Z");
	const H = 3600000;
	const items = [
		{ title: "frisch", date: now - H, src: "a" }, { title: "alt", date: now - 30 * H, src: "a" },
		{ title: "ohne", date: null, src: "a" }, { title: "Zukunft", date: now + 5 * H, src: "a" },
		{ title: "etwas voraus", date: now + 10 * 60000, src: "a" }, { title: "aus", date: now - H, src: "b" }
	];
	const src = { a: { enabled: true }, b: { enabled: false } };
	assert.deepEqual(view.visible(items, view.clean({ hours: 24 }), now, src).map((x) => x.title), ["etwas voraus", "frisch"]);
	assert.deepEqual(view.visible(items, view.clean({ hours: 48 }), now, src).map((x) => x.title), ["etwas voraus", "frisch", "alt"]);
	assert.equal(view.clean({ hours: 5000 }).hours, 720);
	assert.equal(view.pages(9, view.clean({ variant: "cards", cards: 4 })), 3);
	assert.equal(view.pages(9, view.clean({ variant: "bar" })), 9);
	assert.equal(view.ago(now - 2 * H, now), "vor 2 Stunden");
	assert.equal(view.ago(now - 60000, now), "gerade eben");
});

test("Geprüfte Feeds: eindeutig, https, jede Kategorie bekannt", () => {
	const ids = rss.PRESETS.map((p) => p.id);
	assert.equal(new Set(ids).size, ids.length);
	for (const p of rss.PRESETS) {
		assert.ok(/^https:\/\//.test(p.url), p.id);
		assert.ok(rss.CATEGORIES.indexOf(p.category) !== -1, p.id);
	}
	for (const c of ["Regional", "Bayern", "Deutschland", "Welt", "Sport", "Technik"]) assert.ok(rss.PRESETS.some((p) => p.category === c), c);
});

test("Feeds verwalten: vordefinierte an/aus, eigene anlegen/testen/ändern/löschen, Reihenfolge", async () => {
	const fetchImpl = async (u) => /kaputt/.test(u) ? { status: 404, ok: false, text: async () => "" }
		: /html/.test(u) ? { status: 200, ok: true, text: async () => "<html><body>Login</body></html>" }
			: { status: 200, ok: true, text: async () => RSS2 };
	const n = newsLib.createNews({ home: path.join(HOME, "src"), fetchImpl });
	let v = n.setPreset("tagesschau", true);
	v = n.setPreset("heise", true);
	assert.deepEqual(v.sources.map((s) => s.preset), ["tagesschau", "heise"]);
	assert.throws(() => n.setPreset("gibtsnicht", true), /Unbekannt/);
	assert.throws(() => n.addSource({ name: "X", url: "ftp://a/b" }), /Feed-Adresse/);
	v = n.addSource({ name: "Gemeinde", url: "https://gemeinde.example/rss.xml", category: "Regional" });
	const own = v.sources[2];
	assert.equal(own.category, "Regional");
	assert.equal(own.preset, "");
	v = n.updateSource(v.sources[0].id, { url: "https://anders.example/x", name: "Tagesschau kurz" });
	assert.equal(v.sources[0].url, rss.PRESETS.find((p) => p.id === "tagesschau").url, "geprüfte Adresse bleibt");
	assert.equal(v.sources[0].name, "Tagesschau kurz");
	v = n.orderSources([own.id]);
	assert.equal(v.sources[0].id, own.id);
	v = n.setPreset("heise", false);
	assert.ok(!v.sources.some((s) => s.preset === "heise"));
	v = n.removeSource(own.id);
	assert.equal(v.sources.length, 1);
	const ok = await n.test({ url: "https://x.example/rss" });
	assert.equal(ok.ok, true);
	assert.equal(ok.count, 3);
	assert.equal(ok.undated, 1);
	assert.match((await n.test({ url: "https://x.example/kaputt" })).error, /nicht gefunden/);
	assert.match((await n.test({ url: "https://x.example/html" })).error, /kein RSS/);
	const it = await n.items();
	assert.equal(it.source, "portal");
	assert.ok(it.items.length > 0 && it.items.every((x) => x.src));
	assert.throws(() => n.setConfig({ variant: "laufschrift" }), /kompakt oder Karten/);
	assert.throws(() => n.setConfig({ hours: 0 }), /Zeitraum \(Stunden\) 1 bis 720/);
	assert.equal(n.setConfig({ variant: "cards", cards: 3, hours: 96 }).hours, 96);
	assert.equal(n.load().sources.length, 1, "Einstellungen lassen die Feeds in Ruhe");
});

test("Umstieg: bisheriger Feed wird einmalig übernommen", () => {
	const ts = rss.PRESETS.find((p) => p.id === "tagesschau");
	const a = newsLib.createNews({ home: path.join(HOME, "m1") });
	a.migrateLegacy({ news: { title: "Tagesschau", url: ts.url } });
	assert.deepEqual(a.view().sources.map((s) => s.preset), ["tagesschau"], "bekannte Adresse → vordefinierter Feed");
	assert.equal(a.view().variant, "bar", "Variante 1 wie bisher");
	const b = newsLib.createNews({ home: path.join(HOME, "m2") });
	assert.equal(b.migrateLegacy({ news: { title: "Lokal", url: "https://lokal.example/feed" } }), true);
	assert.equal(b.view().sources[0].name, "Lokal");
	assert.equal(b.view().sources[0].preset, "");
	assert.equal(b.migrateLegacy({ news: { url: "https://neu.example/x" } }), false, "nur einmal");
	const c = newsLib.createNews({ home: path.join(HOME, "m3") });
	c.migrateLegacy({ news: { url: "" } });
	assert.deepEqual(c.view().sources.map((s) => s.preset), ["tagesschau"], "ohne alten Feed: Tagesschau");
});

test("config.js: MMM-LumiraNews statt newsfeed, ganz unten", () => {
	const s = Object.assign(settingsLib.load(), { edition: "home" });
	const mods = buildModules(s);
	assert.ok(!mods.some((m) => m.module === "newsfeed"));
	assert.equal(mods.find((m) => m.module === "MMM-LumiraNews").position, "bottom_bar");
	s.modules = Object.assign({}, s.modules, { news: false });
	assert.ok(!buildModules(s).some((m) => m.module === "MMM-LumiraNews"));
});
