// LUMIRA-Portal – Kalender-Abos (ICS/iCalendar) lesen: Kopie von
// modules/MMM-LumiraCalendar/ics.js (ab Zeile 3 gleich, der Test prüft das).
//
//  parse(text)                    → { events: [...], name } (Rohdaten je VEVENT)
//  expand(events, from, to, opts) → Termine im Zeitraum [{ uid, title, location,
//                                   start, end (ms), allDay }], Wiederholungen
//                                   (RRULE), Ausnahmen (EXDATE) und geänderte
//                                   Einzeltermine (RECURRENCE-ID) aufgelöst
//  fetchIcs(url, opts)            → Text des Abos (webcal:// → https://)
//
// Zeitzonen: TZID mit IANA-Namen (iCloud, Google) über Intl, die gängigen
// Windows-Namen (Outlook) über eine Tabelle; ohne Zeitzone gilt die Ortszeit
// des Geräts. Ganztägige Termine liegen auf Mitternacht Ortszeit.
// Nicht unterstützt (selten): BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR/BYMINUTE.
"use strict";

const WINDOWS_TZ = {
	"W. Europe Standard Time": "Europe/Berlin", "Central Europe Standard Time": "Europe/Budapest",
	"Central European Standard Time": "Europe/Warsaw", "Romance Standard Time": "Europe/Paris",
	"GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik",
	"E. Europe Standard Time": "Europe/Chisinau", "FLE Standard Time": "Europe/Kiev", "GTB Standard Time": "Europe/Bucharest",
	"Russian Standard Time": "Europe/Moscow", "Turkey Standard Time": "Europe/Istanbul",
	"Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago",
	"Mountain Standard Time": "America/Denver", "Pacific Standard Time": "America/Los_Angeles",
	"UTC": "UTC", "Coordinated Universal Time": "UTC"
};
const DAY = 86400000;
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const MAX_STEPS = 50000;

// ------------------------------------------------------------------ Einlesen
function unescapeText(v) {
	return String(v || "").replace(/\\([\\;,nN])/g, (m, c) => (c === "n" || c === "N" ? "\n" : c));
}

// Zeile „NAME;PARAM=WERT;X="a:b":WERT“ → { name, params, value }
function parseLine(line) {
	let i = 0;
	let inQ = false;
	for (; i < line.length; i++) {
		const c = line[i];
		if (c === "\"") inQ = !inQ;
		else if (c === ":" && !inQ) break;
	}
	const head = line.slice(0, i);
	const value = line.slice(i + 1);
	const parts = head.split(";");
	const params = {};
	parts.slice(1).forEach((p) => {
		const eq = p.indexOf("=");
		if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
	});
	return { name: parts[0].toUpperCase(), params, value };
}

function tzName(tzid) {
	if (!tzid) return null;
	const t = String(tzid).replace(/^\//, "").replace(/^"|"$/g, "");
	if (WINDOWS_TZ[t]) return WINDOWS_TZ[t];
	try { new Intl.DateTimeFormat("en-US", { timeZone: t }); return t; } catch (e) { return null; }
}

// Datumswert → { y, m, d, h, mi, s, allDay, utc, tz }
function parseDateValue(value, params) {
	const v = String(value || "").trim();
	const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
	if (!m) return null;
	const allDay = !m[4] || (params && params.VALUE === "DATE");
	return {
		y: +m[1], m: +m[2], d: +m[3],
		h: allDay ? 0 : +m[4], mi: allDay ? 0 : +m[5], s: allDay ? 0 : +(m[6] || 0),
		allDay, utc: !!m[7], tz: m[7] ? "UTC" : tzName(params && params.TZID)
	};
}

function parse(text) {
	const raw = String(text || "").replace(/\r\n?/g, "\n").split("\n");
	const lines = [];
	raw.forEach((l) => {
		if ((l[0] === " " || l[0] === "\t") && lines.length) lines[lines.length - 1] += l.slice(1);
		else if (l) lines.push(l);
	});
	const events = [];
	let name = "";
	let cur = null;
	let depth = 0; // VALARM u. ä. innerhalb eines Termins überspringen
	for (const line of lines) {
		const p = parseLine(line);
		if (p.name === "BEGIN") {
			if (p.value.toUpperCase() === "VEVENT" && !cur) { cur = { exdates: [] }; depth = 0; } else if (cur) depth++;
			continue;
		}
		if (p.name === "END") {
			if (cur && depth > 0) { depth--; continue; }
			if (p.value.toUpperCase() === "VEVENT" && cur) {
				if (cur.start) events.push(cur);
				cur = null;
			}
			continue;
		}
		if (!cur) {
			if (p.name === "X-WR-CALNAME") name = unescapeText(p.value).slice(0, 80);
			continue;
		}
		if (depth > 0) continue;
		switch (p.name) {
			case "UID": cur.uid = p.value; break;
			case "SUMMARY": cur.title = unescapeText(p.value); break;
			case "LOCATION": cur.location = unescapeText(p.value); break;
			case "STATUS": cur.status = p.value.toUpperCase(); break;
			case "DTSTART": cur.start = parseDateValue(p.value, p.params); break;
			case "DTEND": cur.end = parseDateValue(p.value, p.params); break;
			case "DURATION": cur.duration = parseDuration(p.value); break;
			case "RRULE": cur.rrule = parseRule(p.value); break;
			case "RECURRENCE-ID": cur.recurrenceId = parseDateValue(p.value, p.params); break;
			case "EXDATE":
				p.value.split(",").forEach((x) => { const d = parseDateValue(x, p.params); if (d) cur.exdates.push(d); });
				break;
			default: break;
		}
	}
	return { events, name };
}

function parseDuration(v) {
	const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || "").trim());
	if (!m) return null;
	const ms = ((+(m[2] || 0) * 7 + +(m[3] || 0)) * DAY) + (+(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000;
	return m[1] === "-" ? -ms : ms;
}

function parseRule(v) {
	const r = {};
	String(v || "").split(";").forEach((kv) => {
		const eq = kv.indexOf("=");
		if (eq > 0) r[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
	});
	const ints = (s) => (s ? s.split(",").map(Number).filter((n) => Number.isFinite(n) && n !== 0) : []);
	return {
		freq: String(r.FREQ || "").toUpperCase(),
		interval: Math.max(1, parseInt(r.INTERVAL, 10) || 1),
		count: r.COUNT ? Math.max(0, parseInt(r.COUNT, 10) || 0) : null,
		until: r.UNTIL ? parseDateValue(r.UNTIL, {}) : null,
		byday: r.BYDAY ? r.BYDAY.split(",").map((s) => {
			const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(s.trim().toUpperCase());
			return m ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: WD[m[2]] } : null;
		}).filter(Boolean) : [],
		bymonthday: ints(r.BYMONTHDAY),
		bymonth: ints(r.BYMONTH)
	};
}

// ------------------------------------------------------------------ Zeitzonen
const fmtCache = {};
function offsetAt(ms, tz) {
	const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat("en-US", {
		timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
	}));
	const p = {};
	f.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
	const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
	return asUtc - Math.floor(ms / 1000) * 1000;
}

// Wanduhrzeit in einer Zone → ms (UTC). Ohne Zone: Ortszeit des Geräts.
function toMs(y, m, d, h, mi, s, tz) {
	if (!tz) return new Date(y, m - 1, d, h, mi, s).getTime();
	if (tz === "UTC") return Date.UTC(y, m - 1, d, h, mi, s);
	const guess = Date.UTC(y, m - 1, d, h, mi, s);
	let t = guess - offsetAt(guess, tz);
	const o2 = offsetAt(t, tz);
	if (guess - o2 !== t) t = guess - o2;
	return t;
}

function valueMs(v) {
	if (v.allDay) return new Date(v.y, v.m - 1, v.d).getTime();
	return toMs(v.y, v.m, v.d, v.h, v.mi, v.s, v.tz);
}

// ------------------------------------------------------------------ Wiederholungen
function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function wdOf(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function addDays(y, m, d, n) {
	const t = new Date(Date.UTC(y, m - 1, d + n));
	return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// Tage eines Monats nach BYMONTHDAY/BYDAY (mit Ordnungszahl, z. B. -1FR)
function monthDays(y, m, rule, fallbackDay) {
	const n = daysIn(y, m);
	let days = [];
	if (rule.bymonthday.length) {
		days = rule.bymonthday.map((x) => (x > 0 ? x : n + 1 + x)).filter((x) => x >= 1 && x <= n);
	}
	if (rule.byday.length) {
		const fromWd = [];
		rule.byday.forEach((b) => {
			const all = [];
			for (let d = 1; d <= n; d++) if (wdOf(y, m, d) === b.wd) all.push(d);
			if (!b.n) fromWd.push(...all);
			else { const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]; if (pick) fromWd.push(pick); }
		});
		days = rule.bymonthday.length ? days.filter((d) => fromWd.indexOf(d) !== -1) : fromWd;
	}
	if (!rule.bymonthday.length && !rule.byday.length) days = fallbackDay <= n ? [fallbackDay] : [];
	return Array.from(new Set(days)).sort((a, b) => a - b);
}

// Startzeitpunkte (Wanduhr-Datum) eines wiederholten Termins bis „to“
function occurrences(ev, to) {
	const s = ev.start;
	const r = ev.rrule;
	const out = [];
	const untilMs = r.until ? (r.until.allDay ? valueMs(r.until) + DAY - 1 : valueMs(r.until)) : Infinity;
	const startMs = valueMs(s);
	let count = 0;
	let steps = 0;
	const push = (c) => {
		const ms = s.allDay ? new Date(c.y, c.m - 1, c.d).getTime() : toMs(c.y, c.m, c.d, s.h, s.mi, s.s, s.tz);
		if (ms < startMs) return true;
		if (ms > untilMs || ms > to || (r.count !== null && count >= r.count)) return false;
		count++;
		out.push({ ms, y: c.y, m: c.m, d: c.d });
		return true;
	};
	const monthOk = (m) => !r.bymonth.length || r.bymonth.indexOf(m) !== -1;
	if (r.freq === "DAILY") {
		for (let k = 0; steps++ < MAX_STEPS; k += r.interval) {
			const c = addDays(s.y, s.m, s.d, k);
			if (!monthOk(c.m)) continue;
			if (r.bymonthday.length && r.bymonthday.indexOf(c.d) === -1) continue;
			if (r.byday.length && !r.byday.some((b) => b.wd === wdOf(c.y, c.m, c.d))) continue;
			if (!push(c)) break;
		}
	} else if (r.freq === "WEEKLY") {
		const wd0 = wdOf(s.y, s.m, s.d);
		const monday = addDays(s.y, s.m, s.d, -((wd0 + 6) % 7));
		const wds = (r.byday.length ? r.byday.map((b) => b.wd) : [wd0]).map((w) => (w + 6) % 7).sort((a, b) => a - b);
		outer: for (let k = 0; steps++ < MAX_STEPS; k += r.interval) {
			for (const w of wds) {
				const c = addDays(monday.y, monday.m, monday.d, k * 7 + w);
				if (!monthOk(c.m)) continue;
				if (!push(c)) break outer;
			}
		}
	} else if (r.freq === "MONTHLY" || r.freq === "YEARLY") {
		outer: for (let k = 0; steps++ < MAX_STEPS; k += r.interval) {
			const months = [];
			if (r.freq === "MONTHLY") {
				const t = new Date(Date.UTC(s.y, s.m - 1 + k, 1));
				if (monthOk(t.getUTCMonth() + 1)) months.push({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 });
			} else {
				(r.bymonth.length ? r.bymonth.slice().sort((a, b) => a - b) : [s.m]).forEach((m) => months.push({ y: s.y + k, m }));
			}
			for (const mo of months) {
				for (const d of monthDays(mo.y, mo.m, r, s.d)) {
					if (!push({ y: mo.y, m: mo.m, d })) break outer;
				}
			}
			if (new Date(Date.UTC(s.y + (r.freq === "YEARLY" ? k : 0), s.m - 1 + (r.freq === "MONTHLY" ? k : 0), 1)).getTime() > to + 31 * DAY) break;
		}
	} else {
		push({ y: s.y, m: s.m, d: s.d });
	}
	return out;
}

function sameDay(a, b) { return a.y === b.y && a.m === b.m && a.d === b.d; }

// Rohdaten → Termine im Zeitraum [from, to] (ms), sortiert
function expand(events, from, to, opts) {
	opts = opts || {};
	const max = opts.max || 2000;
	const out = [];
	// geänderte Einzeltermine: UID → Liste der ursprünglichen Startzeiten
	const overrides = {};
	events.forEach((e) => {
		if (e.recurrenceId && e.uid) (overrides[e.uid] = overrides[e.uid] || []).push(valueMs(e.recurrenceId));
	});
	const add = (e, startMs) => {
		let dur;
		if (e.end) dur = valueMs(e.end) - valueMs(e.start);
		else if (e.duration !== null && e.duration !== undefined) dur = e.duration;
		else dur = e.start.allDay ? DAY : 0;
		if (!(dur >= 0)) dur = 0;
		let endMs = startMs + dur;
		// ganztägig über die Sommerzeit-Grenze: auf Mitternacht runden
		if (e.start.allDay) { const t = new Date(endMs + 2 * 3600000); endMs = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); }
		if (endMs <= from && !(endMs === startMs && startMs >= from)) return;
		if (startMs > to) return;
		out.push({
			uid: e.uid || "", title: (e.title || "").trim() || "(ohne Titel)", location: (e.location || "").trim(),
			start: startMs, end: Math.max(endMs, startMs), allDay: !!e.start.allDay
		});
	};
	for (const e of events) {
		if (out.length >= max) break;
		if (e.status === "CANCELLED") continue;
		if (e.recurrenceId) { add(e, valueMs(e.start)); continue; }
		if (!e.rrule || !e.rrule.freq) { add(e, valueMs(e.start)); continue; }
		const ex = e.exdates || [];
		const ov = overrides[e.uid] || [];
		for (const o of occurrences(e, to)) {
			if (ex.some((x) => (e.start.allDay || x.allDay ? sameDay(x, o) : valueMs(x) === o.ms))) continue;
			if (ov.indexOf(o.ms) !== -1) continue;
			if (out.length >= max) break;
			add(e, o.ms);
		}
	}
	out.sort((a, b) => a.start - b.start || (b.allDay - a.allDay) || a.title.localeCompare(b.title));
	return out;
}

// ------------------------------------------------------------------ Abruf
function normalizeUrl(u) {
	const s = String(u || "").trim();
	if (/^webcals?:\/\//i.test(s)) return "https://" + s.replace(/^webcals?:\/\//i, "");
	return s;
}

function validUrl(u) {
	try {
		const p = new URL(normalizeUrl(u));
		return (p.protocol === "https:" || p.protocol === "http:") && !!p.hostname;
	} catch (e) { return false; }
}

// Für Anzeige und Logs: nie den ganzen (geheimen) Link
function maskUrl(u) {
	try { return new URL(normalizeUrl(u)).hostname + "/…"; } catch (e) { return "…"; }
}

class IcsError extends Error {}

async function fetchIcs(url, opts) {
	opts = opts || {};
	const doFetch = opts.fetchImpl || ((...a) => fetch(...a));
	const get = (u) => doFetch(u, {
		signal: AbortSignal.timeout(opts.timeout || 20000),
		headers: { "User-Agent": "LUMIRA-Kalender/1.0", Accept: "text/calendar, */*" },
		redirect: "follow"
	});
	let res;
	try {
		res = await get(normalizeUrl(url));
	} catch (err) {
		// webcal:// meint meist https, manche Anbieter können nur http
		if (/^webcal:\/\//i.test(String(url).trim())) {
			try { res = await get("http://" + String(url).trim().replace(/^webcal:\/\//i, "")); } catch (e2) { err = e2; }
		}
		if (!res) throw new IcsError(err && err.name === "TimeoutError" ? "Zeitüberschreitung – Kalender antwortet nicht" : "nicht erreichbar – Internetverbindung prüfen");
	}
	if (res.status === 401 || res.status === 403) throw new IcsError("Zugriff verweigert (" + res.status + ") – ist der Kalender freigegeben?");
	if (res.status === 404 || res.status === 410) throw new IcsError("Kalender nicht gefunden (" + res.status + ") – Link prüfen");
	if (!res.ok) throw new IcsError("Fehler beim Abruf (HTTP " + res.status + ")");
	const text = await res.text();
	if (text.length > (opts.maxBytes || 8 * 1024 * 1024)) throw new IcsError("Kalender ist zu groß");
	if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new IcsError("Das ist kein Kalender-Abo (ICS) – Link prüfen");
	return text;
}

module.exports = { parse, expand, fetchIcs, normalizeUrl, validUrl, maskUrl, toMs, parseDuration, IcsError };
