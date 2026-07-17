// LUMIRA – PIN-Hashing für den Portal-Zugriffsschutz (Phase 6, siehe
// concept/selfservice.md Abschnitt 6). scrypt statt Klartext-Vergleich, PIN
// wird nirgends unverschlüsselt gespeichert.
"use strict";

const crypto = require("crypto");

function generateSalt() {
	return crypto.randomBytes(16).toString("hex");
}

function hashPin(pin, salt) {
	return crypto.scryptSync(String(pin), salt, 32).toString("hex");
}

function verifyPin(pin, hash, salt) {
	if (!hash || !salt) return false;
	const candidate = Buffer.from(hashPin(pin, salt), "hex");
	const expected = Buffer.from(hash, "hex");
	return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

module.exports = { generateSalt, hashPin, verifyPin };
