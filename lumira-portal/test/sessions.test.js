"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSessionStore, SHORT_TTL_MS, REMEMBER_TTL_MS, MAX_SESSIONS } = require("../lib/sessions");

function tmpFile() {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lumira-sess-")), "sessions.json");
}

test("Sitzung kurz vs. angemeldet bleiben", () => {
	let t = 1_000_000;
	const store = createSessionStore({ now: () => t });
	const short = store.create(false);
	const long = store.create(true);
	assert.equal(short.maxAgeSec, SHORT_TTL_MS / 1000);
	assert.equal(long.maxAgeSec, REMEMBER_TTL_MS / 1000);
	t += SHORT_TTL_MS + 1;
	assert.equal(store.check(short.token), false);
	assert.equal(store.check(long.token), true);
	t += REMEMBER_TTL_MS;
	assert.equal(store.check(long.token), false);
});

test("überlebt einen Neustart, Datei enthält nur Hashes", () => {
	const file = tmpFile();
	const a = createSessionStore({ filePath: file });
	const { token } = a.create(true);
	assert.ok(!fs.readFileSync(file, "utf8").includes(token));
	const b = createSessionStore({ filePath: file });
	assert.equal(b.check(token), true);
	b.remove(token);
	assert.equal(createSessionStore({ filePath: file }).check(token), false);
});

test("clear mit Ausnahme, unbekannte und leere Tokens", () => {
	const store = createSessionStore({});
	const a = store.create(true).token;
	const b = store.create(true).token;
	store.clear(a);
	assert.equal(store.check(a), true);
	assert.equal(store.check(b), false);
	assert.equal(store.check(""), false);
	assert.equal(store.check(undefined), false);
	store.clear();
	assert.equal(store.check(a), false);
});

test("kaputte Datei → leerer Start, Obergrenze greift", () => {
	const file = tmpFile();
	fs.writeFileSync(file, "{kaputt");
	let t = 1;
	const store = createSessionStore({ filePath: file, now: () => t++ });
	const first = store.create(false).token;
	for (let i = 0; i < MAX_SESSIONS; i++) store.create(false);
	assert.equal(store.count(), MAX_SESSIONS);
	assert.equal(store.check(first), false);
});
