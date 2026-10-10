/* MMM-FamilyPlan – reine Aufbereitung der Anzeige (ohne MagicMirror testbar).
 *
 * buildPayload(raw, now) macht aus familyplan.json die laufende Woche mit
 * aufgelösten Namen, Farben, Symbolen und Avatar-URLs. Keine Rotation – die
 * rechnet ausschließlich das LUMIRA-Portal.
 */
"use strict";

const HEX_RE = /^#[0-9a-f]{6}$/i;
const ICON_RE = /^[a-z0-9-]{1,40}$/;
const PRESET_RE = /^(adult|child)-\d{2}$/;
const UPLOAD_RE = /^m_[a-z0-9]{4,12}\.(png|jpg|webp)$/;

function pad(n) { return (n < 10 ? "0" : "") + n; }
function toKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function fromKey(k) { const p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function nextBoundary(startKey, weekday) {
	const d = fromKey(startKey);
	do { d.setDate(d.getDate() + 1); } while (d.getDay() !== weekday);
	return d;
}
function isoWeek(key) {
	const d = fromKey(key);
	const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	const day = t.getUTCDay() || 7;
	t.setUTCDate(t.getUTCDate() + 4 - day);
	const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
	return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}
function dm(d) { return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "."; }

// Dunkle oder helle Schrift je nach Helligkeit der Hintergrundfarbe (WCAG).
function textOn(hex) {
	const c = [1, 3, 5].map((i) => {
		const v = parseInt(hex.substr(i, 2), 16) / 255;
		return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.3 ? "#14161a" : "#ffffff";
}

function avatarUrl(a) {
	if (a && a.type === "preset" && PRESET_RE.test(a.value)) return "modules/MMM-FamilyPlan/avatars/" + a.value + ".jpg";
	if (a && a.type === "upload" && UPLOAD_RE.test(a.file)) return "/MMM-FamilyPlan/uploads/" + a.file + "?v=" + (Number(a.v) || 0);
	return null;
}

// Baut aus familyplan.json die Anzeige der laufenden Woche.
function buildPayload(raw, now) {
	const settings = (raw && raw.settings) || {};
	const title = typeof settings.title === "string" && settings.title ? settings.title : "Unser Familienplan";
	const weekday = Number.isInteger(settings.rotationWeekday) ? settings.rotationWeekday : 1;
	const weeks = Array.isArray(raw && raw.weeks) ? raw.weeks.filter((w) => w && /^\d{4}-\d{2}-\d{2}$/.test(w.start)) : [];
	weeks.sort((a, b) => (a.start < b.start ? -1 : 1));
	const todayKey = toKey(now);
	let week = null;
	for (let i = weeks.length - 1; i >= 0; i--) {
		if (weeks[i].start <= todayKey) { week = weeks[i]; break; }
	}
	if (!week) return { state: "empty", title };

	const assign = (week.manual && typeof week.manual === "object" ? week.manual : week.auto) || {};
	const members = Array.isArray(raw.members) ? raw.members : [];
	const duties = {};
	(Array.isArray(raw.duties) ? raw.duties : []).forEach((d) => { if (d && d.id) duties[d.id] = d; });
	// Reihenfolge der Mitgliederliste, gelöschte (falls noch in dieser Woche) am Ende
	const ordered = members.filter((m) => m && !m.deleted).concat(members.filter((m) => m && m.deleted));

	const start = fromKey(week.start);
	const endExclusive = nextBoundary(week.start, weekday);
	const end = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1);

	return {
		state: "ok",
		title,
		week: {
			start: week.start,
			kw: isoWeek(week.start),
			range: dm(start) + " – " + dm(end) + end.getFullYear()
		},
		stale: toKey(end) < todayKey,
		members: ordered.filter((m) => Array.isArray(assign[m.id])).map((m) => {
			const color = HEX_RE.test(m.color) ? m.color : "#9ca3af";
			return {
				name: String(m.name || "").slice(0, 30),
				initial: String(m.name || "?").trim().charAt(0).toUpperCase(),
				color,
				textColor: textOn(color),
				avatar: avatarUrl(m.avatar),
				duties: assign[m.id].filter((id) => duties[id]).map((id) => {
					const d = duties[id];
					const dc = HEX_RE.test(d.color) ? d.color : "#9ca3af";
					return {
						name: String(d.name || "").slice(0, 30),
						color: dc,
						textColor: textOn(dc),
						icon: ICON_RE.test(d.icon) ? d.icon : "house"
					};
				})
			};
		})
	};
}

module.exports = { buildPayload, textOn, isoWeek };
