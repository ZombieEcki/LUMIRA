// LUMIRA – Anmelde-Sitzungen des Portals.
//
// Kurze Sitzungen (12 h) wie bisher, dazu „Auf diesem Gerät angemeldet
// bleiben“ (90 Tage) für das Portal als App auf dem Startbildschirm.
// Damit ein Neustart des Portals niemanden abmeldet, liegen die Sitzungen in
// ~/.lumira/sessions.json – nur als SHA-256-Hash, das Cookie selbst steht
// nirgends auf der Platte.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SHORT_TTL_MS = 12 * 60 * 60 * 1000;
const REMEMBER_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 50;

function hashToken(token) {
	return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createSessionStore({ filePath, now = () => Date.now() } = {}) {
	let sessions = new Map(); // hash -> { expires, remember, created }

	function load() {
		if (!filePath) return;
		try {
			const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
			for (const s of Array.isArray(raw.sessions) ? raw.sessions : []) {
				if (s && typeof s.hash === "string" && /^[0-9a-f]{64}$/.test(s.hash) && Number.isFinite(s.expires)) {
					sessions.set(s.hash, { expires: s.expires, remember: !!s.remember, created: Number(s.created) || 0 });
				}
			}
		} catch (e) {
			// Datei fehlt oder ist kaputt → alle müssen sich einmal neu anmelden
		}
		prune();
	}

	function save() {
		if (!filePath) return;
		const list = [...sessions].map(([hash, s]) => ({ hash, ...s }));
		try {
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			const tmp = filePath + ".tmp";
			fs.writeFileSync(tmp, JSON.stringify({ sessions: list }, null, 2), { mode: 0o600 });
			fs.renameSync(tmp, filePath);
		} catch (e) {
			console.error("[LUMIRA Portal] Sitzungen konnten nicht gespeichert werden:", e.message);
		}
	}

	function prune() {
		const t = now();
		for (const [hash, s] of sessions) if (s.expires < t) sessions.delete(hash);
		// Obergrenze: die ältesten fliegen zuerst raus
		if (sessions.size > MAX_SESSIONS) {
			const sorted = [...sessions].sort((a, b) => a[1].created - b[1].created);
			for (const [hash] of sorted.slice(0, sessions.size - MAX_SESSIONS)) sessions.delete(hash);
		}
	}

	function create(remember) {
		const token = crypto.randomBytes(24).toString("hex");
		const ttl = remember ? REMEMBER_TTL_MS : SHORT_TTL_MS;
		sessions.set(hashToken(token), { expires: now() + ttl, remember: !!remember, created: now() });
		prune();
		save();
		return { token, maxAgeSec: Math.floor(ttl / 1000) };
	}

	function check(token) {
		if (!token) return false;
		const hash = hashToken(token);
		const s = sessions.get(hash);
		if (!s) return false;
		if (s.expires < now()) {
			sessions.delete(hash);
			save();
			return false;
		}
		return true;
	}

	function remove(token) {
		if (token && sessions.delete(hashToken(token))) save();
	}

	// Alle abmelden, optional bis auf die aktuelle Sitzung (PIN geändert)
	function clear(exceptToken) {
		const keep = exceptToken ? hashToken(exceptToken) : null;
		for (const hash of [...sessions.keys()]) if (hash !== keep) sessions.delete(hash);
		save();
	}

	function count() {
		prune();
		return sessions.size;
	}

	load();
	return { create, check, remove, clear, count };
}

module.exports = { createSessionStore, SHORT_TTL_MS, REMEMBER_TTL_MS, MAX_SESSIONS };
