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
 * @returns {{ assign: object, unassigned: string[], overQuota: boolean }}
 */
function computeWeek(input) {
	const members = input.members || [];
	const duties = input.duties || [];
	const history = input.history || [];
	const varying = input.pairMode !== "fixed";
	const out = { assign: {}, unassigned: [], overQuota: false };
	for (const p of members) out.assign[p.id] = [];
	if (!members.length || !duties.length) {
		out.unassigned = duties.map((d) => d.id);
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
	if (!total) return out;

	// Schritt 1: Kontingent. Den Rest bekommt, wer zuletzt am wenigsten hatte.
	const recent = history.slice(-RECENT_WEEKS);
	const n = members.length;
	const base = Math.floor(total / n);
	const rest = total % n;
	const load = members.map((p, i) => ({
		id: p.id, i,
		t: recent.reduce((s, wk) => s + ((wk[p.id] || []).length), 0)
	}));
	load.sort((a, b) => a.t - b.t || a.i - b.i);
	const quota = {};
	load.forEach((x, k) => { quota[x.id] = base + (k < rest ? 1 : 0); });

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
				if (after > quota[p.id] + slack) continue;
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
		// Innerhalb einer Person in der Reihenfolge der Dienstliste sortieren.
		const order = {};
		duties.forEach((d, i) => { order[d.id] = i; });
		for (const pid of Object.keys(best)) best[pid].sort((a, b) => order[a] - order[b]);
		out.assign = best;
	} else {
		out.unassigned = duties.map((d) => d.id);
	}
	return out;
}

module.exports = {
	computeWeek,
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
