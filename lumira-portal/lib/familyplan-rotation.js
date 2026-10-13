// LUMIRA – Familienplan: Rotationslogik (siehe concept/familienplan.md 6.2).
//
// Reine Funktionen ohne Dateizugriff, ohne Date.now() und ohne Math.random():
// gleiche Eingabe ergibt immer den gleichen Plan, auch nach einem Neustart.
// Dazu ein paar Kalender-Helfer, die mit lokalen Kalenderdaten ("YYYY-MM-DD")
// statt mit "+7 × 24 h" rechnen, damit die Sommerzeit nichts verschiebt.
"use strict";

// ---------------------------------------------------------------------------
// Kalender
// ---------------------------------------------------------------------------
function pad(n) {
	return (n < 10 ? "0" : "") + n;
}

function toKey(date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromKey(key) {
	const [y, m, d] = key.split("-").map(Number);
	return new Date(y, m - 1, d);
}

function addDays(key, days) {
	const d = fromKey(key);
	d.setDate(d.getDate() + days);
	return toKey(d);
}

// Letzter Rotationstag (0 = Sonntag … 6 = Samstag) am oder vor "date".
function weekStartFor(date, rotationWeekday) {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const diff = (d.getDay() - rotationWeekday + 7) % 7;
	d.setDate(d.getDate() - diff);
	return toKey(d);
}

// Erster Rotationstag nach "startKey" (die Woche endet am Tag davor).
function nextBoundary(startKey, rotationWeekday) {
	const d = fromKey(startKey);
	do { d.setDate(d.getDate() + 1); } while (d.getDay() !== rotationWeekday);
	return toKey(d);
}

function isoWeek(key) {
	const d = fromKey(key);
	const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	const day = t.getUTCDay() || 7;
	t.setUTCDate(t.getUTCDate() + 4 - day);
	const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
	return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------
const COST_IN_CYCLE = 1000;   // Dienst im laufenden Zyklus schon gehabt
const COST_LAST_WEEK = 500;   // Dienst letzte Woche gehabt
const COST_SAME_PAIR = 50;    // gleiche Kombination wie im vorigen Zyklus
const COST_PER_RECENT = 10;   // je Mal in den letzten RECENT_WEEKS Wochen
const COST_OVER_QUOTA = 5000; // Notlösung: mehr Dienste als Kontingent
const RECENT_WEEKS = 12;
const NODE_BUDGET = 300000;   // Schutz für große Konstellationen (8 × 16)

function fnv1a(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h;
}

function allowed(member, duty) {
	return !Array.isArray(duty.roles) || duty.roles.indexOf(member.role) !== -1;
}

// Dienste zu Einheiten zusammenfassen: feste Paare rotieren gemeinsam,
// alle anderen Dienste einzeln. Nur Paare, deren beide Dienste aktiv sind.
function buildUnits(duties, pairMode, fixedPairs) {
	const ids = duties.map((d) => d.id);
	const units = [];
	const used = {};
	if (pairMode === "fixed" && Array.isArray(fixedPairs)) {
		for (const pair of fixedPairs) {
			const [a, b] = pair;
			if (a !== b && ids.indexOf(a) !== -1 && ids.indexOf(b) !== -1 && !used[a] && !used[b]) {
				units.push([a, b]);
				used[a] = used[b] = true;
			}
		}
	}
	for (const id of ids) if (!used[id]) units.push([id]);
	return units;
}

/**
 * Berechnet die Verteilung einer Woche.
 *
 * @param {object}   input
 * @param {Array}    input.members   aktive Mitglieder in Anzeige-Reihenfolge, [{ id, role }]
 * @param {Array}    input.duties    aktive Dienste, [{ id, roles }]
 * @param {Array}    input.history   frühere Wochen, chronologisch, je { memberId: [dutyId] }
 * @param {number}   input.cyclePos  wievielte Woche im laufenden Zyklus (0 = erste)
 * @param {string}   input.key       Wochen-Schlüssel (Startdatum), nur für den Tie-Break
 * @param {string}   [input.pairMode] "varying" (Standard) oder "fixed"
 * @param {Array}    [input.fixedPairs] [[dutyId, dutyId], …]
 * @param {object}   [input.preassigned] schon feststehend { dutyId: memberId } (feste
 *                   Zuweisung, Rhythmus/monatlich noch nicht fällig) – zählt beim
 *                   Kontingent mit, der Rest wird darum herum fair verteilt
 * @param {string[]} [input.order]  Reihenfolge aller Dienste (für die Sortierung)
 * @param {object}   [input.extraLoad] zusätzliche Last je Person (z. B. feste Tage später in der Woche)
 * @param {number}   [input.maxPer] harte Obergrenze je Person (inkl. vorab vergebener), 0 = keine
 * @returns {{ assign: object, unassigned: string[], overQuota: boolean }}
 */
function computeWeek(input) {
	const members = input.members || [];
	const duties = input.duties || [];
	const history = input.history || [];
	const varying = input.pairMode !== "fixed";
	const out = { assign: {}, unassigned: [], overQuota: false };
	for (const p of members) out.assign[p.id] = [];
	const preCount = {};
	const pre = input.preassigned || {};
	for (const did of Object.keys(pre)) {
		const pid = pre[did];
		if (!out.assign[pid]) { out.unassigned.push(did); continue; }
		out.assign[pid].push(did);
		preCount[pid] = (preCount[pid] || 0) + 1;
	}
	const order = {};
	(input.order || duties.map((d) => d.id).concat(Object.keys(pre))).forEach((id, i) => { if (order[id] === undefined) order[id] = i; });
	const sortAll = () => { for (const pid of Object.keys(out.assign)) out.assign[pid].sort((a, b) => (order[a] || 0) - (order[b] || 0)); };
	if (!members.length || !duties.length) {
		out.unassigned = out.unassigned.concat(duties.map((d) => d.id));
		sortAll();
		return out;
	}

	const dutyById = {};
	for (const d of duties) dutyById[d.id] = d;
	const unitAllowed = (p, unit) => unit.every((id) => allowed(p, dutyById[id]));

	// Einheiten, die niemand übernehmen darf, bleiben frei (Warnung im Portal).
	const units = [];
	for (const unit of buildUnits(duties, input.pairMode, input.fixedPairs)) {
		if (members.some((p) => unitAllowed(p, unit))) units.push(unit);
		else out.unassigned.push(...unit);
	}
	const total = units.reduce((s, u) => s + u.length, 0);
	if (!total) { sortAll(); return out; }

	// Schritt 1: Kontingent. Den Rest bekommt, wer zuletzt am wenigsten hatte.
	const recent = history.slice(-RECENT_WEEKS);
	const n = members.length;
	// Vorab vergebene Dienste zählen mit: Wer schon feste hat, bekommt weniger dazu
	const preTotal = Object.keys(preCount).reduce((s, k) => s + preCount[k], 0);
	const base = Math.floor((total + preTotal) / n);
	const rest = (total + preTotal) % n;
	const load = members.map((p, i) => ({
		id: p.id, i,
		t: recent.reduce((s, wk) => s + ((wk[p.id] || []).length), 0) + ((input.extraLoad && input.extraLoad[p.id]) || 0)
	}));
	load.sort((a, b) => a.t - b.t || a.i - b.i);
	const quota = {};
	const maxPer = Number(input.maxPer) > 0 ? Number(input.maxPer) : 0;
	const room = (id) => (maxPer ? Math.max(0, maxPer - (preCount[id] || 0)) : Infinity);
	load.forEach((x, k) => { quota[x.id] = Math.min(room(x.id), Math.max(0, base + (k < rest ? 1 : 0) - (preCount[x.id] || 0))); });
	// Sprengen feste Zuweisungen das Kontingent, fehlen Plätze für den Rest:
	// die bekommt, wer insgesamt am wenigsten hat
	let free = members.reduce((s, p) => s + quota[p.id], 0);
	while (free < total) {
		let pick = null;
		for (const x of load) {
			if (quota[x.id] >= room(x.id)) continue; // Obergrenze erreicht
			const v = (preCount[x.id] || 0) + quota[x.id];
			if (!pick || v < pick.v) pick = { id: x.id, v };
		}
		if (!pick) break;
		quota[pick.id]++;
		free++;
	}

	// Schritt 2: Kosten aus der Historie.
	const pos = Math.max(0, Math.min(input.cyclePos || 0, history.length));
	const cycleWeeks = pos ? history.slice(-pos) : [];
	const lastWeek = history[history.length - 1] || {};
	const prevCycle = varying && pos === 0 ? history.slice(-n) : [];
	const has = (wk, pid, did) => !!(wk && wk[pid] && wk[pid].indexOf(did) !== -1);

	function cost(p, did) {
		let c = 0;
		if (cycleWeeks.some((wk) => has(wk, p.id, did))) c += COST_IN_CYCLE;
		if (has(lastWeek, p.id, did)) c += COST_LAST_WEEK;
		c += COST_PER_RECENT * recent.filter((wk) => has(wk, p.id, did)).length;
		return c + (fnv1a(`${input.key}|${p.id}|${did}`) % 1000) / 1e6;
	}
	const unitCost = units.map((unit) => {
		const row = {};
		for (const p of members) {
			row[p.id] = unitAllowed(p, unit) ? unit.reduce((s, did) => s + cost(p, did), 0) : Infinity;
		}
		return row;
	});
	function pairPenalty(pid, set) {
		if (!prevCycle.length || set.length < 2) return 0;
		const key = set.slice().sort().join(",");
		return prevCycle.some((wk) => (wk[pid] || []).slice().sort().join(",") === key) ? COST_SAME_PAIR : 0;
	}

	// Schritt 3+4: exakte Suche mit Branch & Bound (+ Knoten-Budget).
	function search(slack) {
		let best = null;
		let bestCost = Infinity;
		let nodes = 0;
		const cur = {};
		for (const p of members) cur[p.id] = [];
		(function dfs(k, acc) {
			if (acc >= bestCost || nodes++ > NODE_BUDGET) return;
			if (k === units.length) {
				let sum = acc;
				for (const p of members) sum += pairPenalty(p.id, cur[p.id]);
				if (sum < bestCost) {
					bestCost = sum;
					best = {};
					for (const p of members) best[p.id] = cur[p.id].slice();
				}
				return;
			}
			const unit = units[k];
			for (const p of members) {
				const c = unitCost[k][p.id];
				if (c === Infinity) continue;
				const before = cur[p.id].length;
				const after = before + unit.length;
				if (after > quota[p.id] + slack || after > room(p.id)) continue;
				const extra = Math.max(0, after - quota[p.id]) - Math.max(0, before - quota[p.id]);
				cur[p.id].push(...unit);
				dfs(k + 1, acc + c + extra * COST_OVER_QUOTA);
				cur[p.id].length = before;
			}
		})(0, 0);
		return best;
	}

	let best = search(0);
	if (!best) {
		// Kontingent nicht einhaltbar (z. B. wegen Rollen oder fester Paare):
		// lieber jemand bekommt einen Dienst mehr, als dass einer liegen bleibt.
		best = search(2);
		out.overQuota = !!best;
	}
	if (best) {
		// Zu den vorab vergebenen dazu, je Person in der Reihenfolge der Dienstliste
		for (const pid of Object.keys(best)) out.assign[pid] = out.assign[pid].concat(best[pid]);
		sortAll();
	} else {
		out.unassigned = out.unassigned.concat(duties.map((d) => d.id));
		sortAll();
	}
	return out;
}

// ---------------------------------------------------------------------------
// Rhythmus: wann wechselt ein wöchentlicher/monatlicher Dienst?
// ---------------------------------------------------------------------------
const EPOCH = "2024-01-01"; // fester Bezugstag (Montag), damit „alle 2 Wochen“ stabil bleibt

function utcDays(key) {
	const [y, m, d] = key.split("-").map(Number);
	return Date.UTC(y, m - 1, d) / 864e5;
}

function daysBetween(a, b) {
	return Math.round(utcDays(b) - utcDays(a));
}

// Abschnitt, in dem eine Woche liegt: wechselt der Abschnitt, wechselt der Dienst.
// Monatlich zählt der Monat des Wochenbeginns (= erster Wechseltag im neuen Monat).
function periodOf(rotation, every, weekStart) {
	const n = Math.max(1, every || 1);
	if (rotation === "monthly") {
		const [y, m] = weekStart.split("-").map(Number);
		return Math.floor((y * 12 + m - 1) / n);
	}
	return Math.floor(Math.floor(daysBetween(EPOCH, weekStart) / 7) / n);
}

function changeDue(rotation, every, prevStart, weekStart) {
	return !prevStart || periodOf(rotation, every, prevStart) !== periodOf(rotation, every, weekStart);
}

// Wievielter Einsatztag des Dienstes seit EPOCH (für „alle N Tage“)
function activeIndex(days, dateKey) {
	const list = Array.isArray(days) && days.length ? days : [0, 1, 2, 3, 4, 5, 6];
	const n = Math.max(0, daysBetween(EPOCH, dateKey));
	const full = Math.floor(n / 7);
	let count = full * list.length;
	for (let r = 0; r < n % 7; r++) if (list.indexOf((1 + r) % 7) !== -1) count++;
	return count;
}

const ALL = "*"; // feste Zuweisung an die ganze Familie

// Ist jemand an diesem Tag befreit („nicht zu Hause“)? Regelmäßig an
// Wochentagen (awayDays) oder in Zeiträumen (awayDates: [{ from, to }])
function isAway(member, dateKey) {
	if (!member) return false;
	if (Array.isArray(member.awayDays) && member.awayDays.indexOf(fromKey(dateKey).getDay()) !== -1) return true;
	return Array.isArray(member.awayDates) && member.awayDates.some((r) => r && r.from <= dateKey && dateKey <= r.to);
}

/**
 * Tagesplan einer Woche für Dienste, die nicht die ganze Woche bei einer
 * Person liegen: täglich rotierende Dienste und feste Zuweisungen an
 * einzelnen Wochentagen (die haben Vorrang, auch „ganze Familie“).
 *
 * Täglich rotierende Dienste werden Tag für Tag GEMEINSAM verteilt – mit
 * derselben Logik wie die Wochen (computeWeek): gleich viele Dienste je
 * Person und Tag, im Zyklus (so viele Tage wie Personen) jeder jeden Dienst
 * einmal, nicht zweimal hintereinander. Feste Tage einzelner Personen
 * zählen dabei mit (Wochendienste nicht – die wiegen weniger als ein Dienst
 * an jedem Tag).
 *
 * Wer an einem Tag befreit ist (nicht zu Hause), bekommt an dem Tag nichts;
 * sein fester Dienst wird an dem Tag unter den Anwesenden fair verteilt.
 * maxPerDay begrenzt die Tagesdienste je Person und Tag; was darüber
 * hinausgeht, bleibt frei (Hinweis).
 *
 * @param {object} input
 * @param {string} input.start     erster Tag der Woche ("YYYY-MM-DD")
 * @param {string} input.end       erster Tag der nächsten Woche (exklusiv)
 * @param {Array}  input.members   aktive Mitglieder [{ id, role, awayDays?, awayDates? }]
 * @param {Array}  input.duties    aktive Dienste [{ id, roles, rotation, every, days, fixed }]
 * @param {object} [input.weekAssign] Wochenverteilung (nur zur Information)
 * @param {Array}  input.history   Tagespläne früherer Wochen, chronologisch
 * @param {number} [input.maxPerDay] höchstens so viele Tagesdienste je Person und Tag (0 = frei)
 * @param {string} [input.pairMode] wie bei den Wochen (feste Paare)
 * @param {Array}  [input.fixedPairs]
 * @returns {{ days: object, gaps: Array }} days: { dutyId: { datum: memberId | "*" | null } }
 */
function computeDays(input) {
	const allMembers = input.members || [];
	const memberById = {};
	allMembers.forEach((m) => { memberById[m.id] = m; });
	const ids = new Set(allMembers.map((m) => m.id));
	const out = { days: {}, gaps: [] };
	const dates = [];
	for (let k = input.start; k < input.end; k = addDays(k, 1)) dates.push(k);
	const duties = input.duties || [];
	const maxPerDay = Number(input.maxPerDay) > 0 ? Number(input.maxPerDay) : 0;
	const order = {};
	duties.forEach((d, i) => { order[d.id] = i; });

	// Wer hatte wann welchen Tagesdienst (Historie + diese Woche)
	const owner = {};    // dutyId → { datum → memberId | "*" | null }
	const byDate = {};   // datum → { memberId: [dutyId] }
	const setOwner = (did, date, pid) => {
		(owner[did] = owner[did] || {})[date] = pid;
		if (!pid) return;
		const day = (byDate[date] = byDate[date] || {});
		(pid === ALL ? allMembers.filter((m) => !isAway(m, date)).map((m) => m.id) : [pid]).forEach((p) => { (day[p] = day[p] || []).push(did); });
	};
	const since = addDays(input.start, -28);
	for (const map of input.history || []) {
		for (const did of Object.keys(map || {})) {
			for (const date of Object.keys(map[did] || {})) {
				if (date >= since && date < input.start) setOwner(did, date, map[did][date]);
			}
		}
	}
	const put = (did, date, pid) => {
		(out.days[did] = out.days[did] || {})[date] = pid;
		setOwner(did, date, pid);
	};
	const activeOn = (d, dow) => !(Array.isArray(d.days) && d.days.length && d.days.indexOf(dow) === -1);
	const fixedOf = (d) => (Array.isArray(d.fixed) ? d.fixed : []);

	// 1) Feste Tage zuerst (Vorrang); „jeden Tag“ an die ganze Familie gilt
	//    an allen Tagen des Dienstes. Ist die feste Person an dem Tag nicht
	//    da, wird der Dienst an dem Tag ganz normal verteilt (reassign).
	const fixedDay = {}; // dutyId → { dow → memberId }
	const reassign = {}; // datum → [dutyId]
	for (const d of duties) {
		const fx = fixedOf(d);
		const all = fx.find((f) => f.day === -1);
		const map = {};
		if (all) {
			if (all.memberId !== ALL) continue; // eine Person die ganze Woche → Wochenverteilung
			[0, 1, 2, 3, 4, 5, 6].forEach((n) => { if (activeOn(d, n)) map[n] = ALL; });
		}
		fx.forEach((f) => { if (f.day >= 0 && map[f.day] === undefined) map[f.day] = f.memberId; });
		if (!Object.keys(map).length) continue;
		fixedDay[d.id] = map;
		for (const date of dates) {
			const dow = fromKey(date).getDay();
			if (map[dow] === undefined) continue;
			const pid = map[dow];
			if (pid === ALL) { put(d.id, date, ALL); continue; }
			if (!ids.has(pid)) {
				put(d.id, date, null);
				out.gaps.push({ dutyId: d.id, date, reason: "paused", memberId: pid });
				continue;
			}
			if (isAway(memberById[pid], date)) {
				(reassign[date] = reassign[date] || []).push(d.id);
				out.gaps.push({ dutyId: d.id, date, reason: "away", memberId: pid });
				continue;
			}
			put(d.id, date, pid);
		}
	}

	// 2) Je Tag gemeinsam verteilen: täglich rotierende Dienste und feste
	//    Dienste, deren Person an dem Tag nicht da ist
	const daily = duties.filter((d) => d.rotation === "daily" && !fixedOf(d).some((f) => f.day === -1));
	const dutyById = {};
	duties.forEach((d) => { dutyById[d.id] = d; });
	for (const date of dates) {
		const dow = fromKey(date).getDay();
		const todayDuties = daily.filter((d) => activeOn(d, dow) && !(fixedDay[d.id] && fixedDay[d.id][dow] !== undefined))
			.concat((reassign[date] || []).map((did) => dutyById[did]))
			.sort((a, b) => order[a.id] - order[b.id]);
		if (!todayDuties.length) continue;
		const present = allMembers.filter((m) => !isAway(m, date));
		const presentIds = new Set(present.map((m) => m.id));
		if (!present.length) {
			todayDuties.forEach((d) => { put(d.id, date, null); out.gaps.push({ dutyId: d.id, date, reason: "nobody" }); });
			continue;
		}

		// Schon feststehend und zählt beim Kontingent mit: Rhythmus „alle N Tage“
		// (gleicher Block wie der vorige Einsatztag), feste Tage einzelner Personen
		const preassigned = {};
		const carried = {};
		for (const d of todayDuties) {
			const every = Math.max(1, d.every || 1);
			if (every < 2 || d.rotation !== "daily") continue;
			const block = Math.floor(activeIndex(d.days, date) / every);
			for (let back = 1; back <= 7 * every + 7; back++) {
				const pd = addDays(date, -back);
				const pdow = fromKey(pd).getDay();
				if (!activeOn(d, pdow) || (fixedDay[d.id] && fixedDay[d.id][pdow] !== undefined)) continue;
				const po = owner[d.id] && owner[d.id][pd];
				if (po && po !== ALL && presentIds.has(po) && Math.floor(activeIndex(d.days, pd) / every) === block
					&& allowed(memberById[po], d)) carried[d.id] = po;
				break;
			}
		}
		Object.assign(preassigned, carried);
		for (const did of Object.keys(fixedDay)) {
			const pid = fixedDay[did][dow];
			if (pid && pid !== ALL && presentIds.has(pid)) preassigned["fix:" + did] = pid;
		}

		// Obergrenze je Person und Tag: passt nicht alles hinein, bleiben die
		// letzten Dienste der Liste frei
		let rotating = todayDuties.filter((d) => !carried[d.id]);
		if (maxPerDay) {
			const pre = {};
			Object.keys(preassigned).forEach((k) => { pre[preassigned[k]] = (pre[preassigned[k]] || 0) + 1; });
			const capacity = present.reduce((s, m) => s + Math.max(0, maxPerDay - (pre[m.id] || 0)), 0);
			if (rotating.length > capacity) {
				rotating.slice(capacity).forEach((d) => { put(d.id, date, null); out.gaps.push({ dutyId: d.id, date, reason: "limit" }); });
				rotating = rotating.slice(0, capacity);
			}
		}

		// Feste Tage später in dieser Woche zählen schon mit (sonst käme, wer am
		// Sonntag fest dran ist, unter der Woche genauso oft wie alle anderen)
		const extraLoad = {};
		for (const later of dates) {
			if (later <= date) continue;
			const ldow = fromKey(later).getDay();
			for (const did of Object.keys(fixedDay)) {
				const pid = fixedDay[did][ldow];
				if (pid && pid !== ALL && ids.has(pid) && daily.some((d) => d.id === did)) extraLoad[pid] = (extraLoad[pid] || 0) + 1;
			}
		}

		// Verlauf: die letzten Tage lückenlos (für Zyklus, „gestern“, Häufigkeit)
		const history = [];
		for (let back = RECENT_WEEKS; back >= 1; back--) {
			const map = byDate[addDays(date, -back)] || {};
			const clean = {};
			Object.keys(map).forEach((p) => { clean[p] = map[p].slice(); });
			history.push(clean);
		}
		const dayNo = Math.max(0, daysBetween(EPOCH, date));
		const res = computeWeek({
			members: present,
			duties: rotating.map((d) => ({ id: d.id, roles: d.roles })),
			preassigned,
			order: duties.map((d) => d.id),
			history,
			cyclePos: dayNo % present.length,
			extraLoad,
			maxPer: maxPerDay,
			key: date,
			pairMode: input.pairMode,
			fixedPairs: input.fixedPairs
		});
		for (const d of todayDuties) {
			if (out.days[d.id] && out.days[d.id][date] === null && out.gaps.some((g) => g.dutyId === d.id && g.date === date && g.reason === "limit")) continue;
			let pid = carried[d.id] || null;
			if (!pid) pid = Object.keys(res.assign).find((p) => res.assign[p].indexOf(d.id) !== -1) || null;
			put(d.id, date, pid);
			if (!pid) out.gaps.push({ dutyId: d.id, date, reason: maxPerDay ? "limit" : "nobody" });
		}
	}
	return out;
}

module.exports = {
	ALL,
	isAway,
	computeWeek,
	computeDays,
	periodOf,
	changeDue,
	activeIndex,
	daysBetween,
	buildUnits,
	allowed,
	fnv1a,
	toKey,
	fromKey,
	addDays,
	weekStartFor,
	nextBoundary,
	isoWeek,
	RECENT_WEEKS
};
