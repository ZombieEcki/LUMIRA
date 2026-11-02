// MMM-LumiraNews – Nachrichten-Feeds (RSS 2.0, RSS 1.0/RDF, Atom) lesen, ohne Bibliothek.
// Auch im Portal: lumira-portal/lib/news-rss.js (ab Zeile 3 gleich, Test).
//
//  PRESETS                 geprüfte Feeds nach Region/Thema (abgerufen am 2.11.2026)
//  parse(text)             → { title, items: [{ title, link, date (ms|null), image }] }
//  fetchFeed(url, opts)    → Text des Feeds, verständliche Fehler (NewsError)
//  merge(lists)            → alle Meldungen, Doppelte raus (Link bzw. Titel), neueste zuerst
//
// Inhalte aus Feeds sind fremd: Titel werden zu reinem Text (Tags und
// Entities aufgelöst), Links und Bilder nur mit http(s). Angezeigt wird
// ausschließlich per textContent – nichts davon wird je ausgeführt.
"use strict";

const PRESETS = [
	{ id: "merkur-freising", category: "Regional", name: "Merkur – Landkreis Freising", url: "https://www.merkur.de/lokales/freising/rssfeed.rdf" },
	{ id: "merkur-bayern", category: "Bayern", name: "Merkur – Bayern", url: "https://www.merkur.de/bayern/rssfeed.rdf" },
	{ id: "sz-bayern", category: "Bayern", name: "Süddeutsche – Bayern", url: "https://rss.sueddeutsche.de/rss/Bayern" },
	{ id: "tagesschau", category: "Deutschland", name: "Tagesschau – alle Meldungen", url: "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml" },
	{ id: "tagesschau-inland", category: "Deutschland", name: "Tagesschau – Inland", url: "https://www.tagesschau.de/inland/index~rss2.xml" },
	{ id: "spiegel", category: "Deutschland", name: "Spiegel – Schlagzeilen", url: "https://www.spiegel.de/schlagzeilen/index.rss" },
	{ id: "zeit", category: "Deutschland", name: "Zeit Online", url: "https://newsfeed.zeit.de/index" },
	{ id: "dlf", category: "Deutschland", name: "Deutschlandfunk – Nachrichten", url: "https://www.deutschlandfunk.de/nachrichten-100.rss" },
	{ id: "sz-top", category: "Deutschland", name: "Süddeutsche – Topthemen", url: "https://rss.sueddeutsche.de/rss/Topthemen" },
	{ id: "tagesschau-ausland", category: "Welt", name: "Tagesschau – Ausland", url: "https://www.tagesschau.de/ausland/index~rss2.xml" },
	{ id: "dw", category: "Welt", name: "Deutsche Welle", url: "https://rss.dw.com/xml/rss-de-all" },
	{ id: "sportschau", category: "Sport", name: "Sportschau", url: "https://www.sportschau.de/index~rss2.xml" },
	{ id: "kicker", category: "Sport", name: "kicker", url: "https://newsfeed.kicker.de/news/aktuell" },
	{ id: "heise", category: "Technik", name: "heise online", url: "https://www.heise.de/rss/heise-atom.xml" },
	{ id: "golem", category: "Technik", name: "Golem", url: "https://rss.golem.de/rss.php?feed=RSS2.0" },
	{ id: "t3n", category: "Technik", name: "t3n", url: "https://t3n.de/rss.xml" }
];
const CATEGORIES = ["Regional", "Bayern", "Deutschland", "Welt", "Sport", "Technik", "Eigene"];

// ------------------------------------------------------------------ Text
const NAMED = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sbquo: "‚", laquo: "«", raquo: "»", euro: "€", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß" };

function decode(s) {
	return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
		if (e[0] === "#") {
			const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
		}
		return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
	});
}

// CDATA auspacken, Tags entfernen, Entities auflösen (zweimal: manche Feeds
// kodieren doppelt), Leerraum zusammenfassen
function text(raw) {
	let s = String(raw || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
	s = decode(s.replace(/<[^>]*>/g, " "));
	s = decode(s.replace(/<[^>]*>/g, " "));
	return s.replace(/\s+/g, " ").trim();
}

function safeUrl(u) {
	const s = decode(String(u || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
	return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
}

// ------------------------------------------------------------------ Einlesen
function tag(block, names) {
	for (const n of names) {
		const m = new RegExp("<" + n + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + n + ">", "i").exec(block);
		if (m) return m[1];
	}
	return "";
}

function attr(el, name) {
	const m = new RegExp("\\s" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i").exec(el);
	return m ? (m[2] !== undefined ? m[2] : m[3]) : "";
}

function linkOf(block) {
	const rss = safeUrl(tag(block, ["link"]));
	if (rss) return rss;
	// Atom: <link href="…" rel="alternate"/> (ohne rel gilt alternate)
	const links = block.match(/<link\b[^>]*>/gi) || [];
	const alt = links.find((l) => !/\srel\s*=/i.test(l) || /rel\s*=\s*["']alternate["']/i.test(l)) || links[0];
	return alt ? safeUrl(attr(alt, "href")) : safeUrl(tag(block, ["guid"]));
}

function imageOf(block) {
	const els = block.match(/<(?:media:thumbnail|media:content|enclosure)\b[^>]*>/gi) || [];
	for (const el of els) {
		const type = attr(el, "type");
		const medium = attr(el, "medium");
		if (/^enclosure/i.test(el.slice(1)) && type && !/^image\//i.test(type)) continue;
		if (/^media:content/i.test(el.slice(1)) && ((type && !/^image\//i.test(type)) || (medium && medium !== "image"))) continue;
		const u = safeUrl(attr(el, "url"));
		if (u) return u;
	}
	// sonst das erste Bild in der Beschreibung
	for (const n of ["content:encoded", "description", "summary", "content"]) {
		const html = decode(tag(block, [n]).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
		const img = /<img\b[^>]*>/i.exec(html);
		const u = img ? safeUrl(attr(img[0], "src")) : "";
		if (u) return u;
	}
	return "";
}

function dateOf(block) {
	const raw = text(tag(block, ["pubDate", "dc:date", "published", "updated", "a10:updated"]));
	const t = raw ? Date.parse(raw) : NaN;
	return Number.isFinite(t) ? t : null;
}

function parse(xml) {
	const s = String(xml || "");
	const blocks = s.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
	const head = s.slice(0, Math.max(0, s.search(/<(item|entry)\b/i)) || s.length);
	const items = blocks.map((b) => ({
		title: text(tag(b, ["title"])).slice(0, 300),
		link: linkOf(b),
		date: dateOf(b),
		image: imageOf(b)
	})).filter((it) => it.title);
	return { title: text(tag(head, ["title"])).slice(0, 80), items };
}

// ------------------------------------------------------------------ Doppelte, Sortierung
function keyOf(it) {
	if (it.link) {
		return "l:" + it.link.replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
	}
	return "t:" + it.title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");
}

// lists: [{ src, items }] in der Reihenfolge der Quellen – bei Doppelten
// gewinnt die obere Quelle. Gleiche Schlagzeile in zwei Feeds zählt auch doppelt.
function merge(lists, max) {
	const seen = {};
	const out = [];
	lists.forEach((l) => (l.items || []).forEach((it) => {
		const k1 = keyOf(it);
		const k2 = "t:" + it.title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");
		if (seen[k1] || seen[k2]) return;
		seen[k1] = seen[k2] = true;
		out.push(Object.assign({}, it, { src: l.src }));
	}));
	out.sort((a, b) => (b.date || 0) - (a.date || 0));
	return out.slice(0, max || 300);
}

// ------------------------------------------------------------------ Abruf
function validUrl(u) {
	try {
		const p = new URL(String(u || "").trim());
		return (p.protocol === "https:" || p.protocol === "http:") && !!p.hostname;
	} catch (e) { return false; }
}

class NewsError extends Error {}

async function fetchFeed(url, opts) {
	opts = opts || {};
	const doFetch = opts.fetchImpl || ((...a) => fetch(...a));
	let res;
	try {
		res = await doFetch(String(url).trim(), {
			signal: AbortSignal.timeout(opts.timeout || 15000),
			headers: { "User-Agent": "LUMIRA-Nachrichten/1.0", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
			redirect: "follow"
		});
	} catch (err) {
		throw new NewsError(err && err.name === "TimeoutError" ? "Zeitüberschreitung – Feed antwortet nicht" : "nicht erreichbar – Internetverbindung prüfen");
	}
	if (res.status === 401 || res.status === 403) throw new NewsError("Zugriff verweigert (" + res.status + ")");
	if (res.status === 404 || res.status === 410) throw new NewsError("Feed nicht gefunden (" + res.status + ") – Adresse prüfen");
	if (!res.ok) throw new NewsError("Fehler beim Abruf (HTTP " + res.status + ")");
	const body = await res.text();
	if (body.length > (opts.maxBytes || 5 * 1024 * 1024)) throw new NewsError("Feed ist zu groß");
	if (!/<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 4000))) throw new NewsError("Das ist kein RSS- oder Atom-Feed – Adresse prüfen");
	return body;
}

module.exports = { PRESETS, CATEGORIES, parse, merge, fetchFeed, validUrl, text, NewsError };
