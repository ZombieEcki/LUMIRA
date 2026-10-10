// LUMIRA – Datumsformate für „Wichtige Termine“ (Geburtstage, Hochzeitstag,
// Countdowns).
//
// Im Portal tippt man deutsch ("24.12." bzw. "20.06.2010"), MMM-SmartCompliments
// erwartet "MM-TT" bzw. "JJJJ-MM-TT". Gespeichert wird in settings.json immer
// das Modul-Format. Ältere Einträge, die noch als "TT.MM." in settings.json
// stehen (frühere Personen-Seite), werden beim Erzeugen der config.js
// ebenfalls umgerechnet.
"use strict";

function pad(n) {
	return (n < 10 ? "0" : "") + n;
}

function validDay(month, day, year) {
	if (!(month >= 1 && month <= 12 && day >= 1)) return false;
	// Ohne Jahr ist der 29.02. erlaubt (Geburtstag im Schaltjahr)
	const y = year || 2024;
	return day <= new Date(y, month, 0).getDate();
}

// "24.12." / "24.12" / "24.12.2010" / "12-24" / "2010-12-24" → "12-24", sonst null
function toMMDD(input) {
	const s = String(input == null ? "" : input).trim();
	let m;
	if ((m = /^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/.exec(s))) {
		const day = Number(m[1]), month = Number(m[2]), year = m[3] ? Number(m[3]) : null;
		return validDay(month, day, year) ? `${pad(month)}-${pad(day)}` : null;
	}
	if ((m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(s))) {
		const year = m[1] ? Number(m[1]) : null, month = Number(m[2]), day = Number(m[3]);
		return validDay(month, day, year) ? `${m[2]}-${m[3]}` : null;
	}
	return null;
}

// "20.06.2010" / "2010-06-20" → "2010-06-20", "" bleibt "", sonst null
function toFullDate(input) {
	const s = String(input == null ? "" : input).trim();
	if (!s) return "";
	let m;
	if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) {
		const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
		return validDay(month, day, year) ? `${year}-${pad(month)}-${pad(day)}` : null;
	}
	if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
		return validDay(Number(m[2]), Number(m[3]), Number(m[1])) ? s : null;
	}
	return null;
}

// Gemeinsame Jahrestage (Karte „Jahrestage“ im Portal). "other" = eigener Name.
const ANNIVERSARY_TYPES = {
	wedding: "Hochzeitstag",
	together: "Jahrestag",
	engaged: "Verlobungstag",
	met: "Kennenlerntag",
	moved: "Einzugstag",
	other: ""
};

// Jahrestage aus settings.family im Format { type, label, date: "JJJJ-MM-TT" }.
// Ältere Einstellungen kennen nur weddingDate – das zählt dann als Hochzeitstag.
function anniversariesOf(family) {
	const f = family || {};
	const list = Array.isArray(f.anniversaries) && f.anniversaries.length ? f.anniversaries
		: f.weddingDate ? [{ type: "wedding", date: f.weddingDate }] : [];
	return list.map((a) => {
		const type = Object.prototype.hasOwnProperty.call(ANNIVERSARY_TYPES, a && a.type) ? a.type : "other";
		const label = type === "other" ? String((a && a.label) || "").trim() : ANNIVERSARY_TYPES[type];
		return { type, label, date: toFullDate(a && a.date) };
	}).filter((a) => a.label && a.date);
}

module.exports = { toMMDD, toFullDate, ANNIVERSARY_TYPES, anniversariesOf };
