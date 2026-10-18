// Atomares Ersetzen von Dateien (lib/atomic.js): unter Windows hält der
// Virenscanner frisch geschriebene Dateien manchmal kurz fest – dann erneut
// versuchen statt abzubrechen.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { renameRetry } = require("../lib/atomic");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-atomic-test-"));
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

// fs.renameSync scheitert die ersten n Male mit dem angegebenen Code
function flaky(n, code, fn) {
	const real = fs.renameSync;
	let calls = 0;
	fs.renameSync = (a, b) => {
		calls++;
		if (calls <= n) { const e = new Error(code + ": gesperrt"); e.code = code; throw e; }
		return real(a, b);
	};
	try { fn(); } finally { fs.renameSync = real; }
	return calls;
}

test("gesperrte Datei (EPERM/EBUSY/EACCES): kurz warten, erneut versuchen, dann klappt es", () => {
	for (const code of ["EPERM", "EBUSY", "EACCES"]) {
		const tmp = path.join(DIR, code + ".tmp");
		const dest = path.join(DIR, code + ".json");
		fs.writeFileSync(dest, "alt");
		fs.writeFileSync(tmp, "neu");
		const calls = flaky(3, code, () => renameRetry(tmp, dest));
		assert.equal(calls, 4);
		assert.equal(fs.readFileSync(dest, "utf8"), "neu");
		assert.ok(!fs.existsSync(tmp));
	}
});

test("bleibt gesperrt oder anderer Fehler: Fehler kommt durch (nichts wird verschluckt)", () => {
	const tmp = path.join(DIR, "x.tmp");
	fs.writeFileSync(tmp, "neu");
	assert.throws(() => flaky(100, "EPERM", () => renameRetry(tmp, path.join(DIR, "x.json"))), /EPERM/);
	assert.throws(() => flaky(1, "ENOENT", () => renameRetry(tmp, path.join(DIR, "y.json"))), /ENOENT/, "kein erneuter Versuch bei ENOENT");
	assert.throws(() => renameRetry(path.join(DIR, "gibtsnicht.tmp"), path.join(DIR, "z.json")), /ENOENT/);
});
