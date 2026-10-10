"use strict";
// Live-Bild des Spiegels (modules/MMM-LumiraStatus/screenshot.js)
const test = require("node:test");
const assert = require("node:assert");
const { createCapturer, isLoopback, LONG_SIDE } = require("../../modules/MMM-LumiraStatus/screenshot");

function fakeElectron({ width = 1920, height = 1080, windows = 1, empty = false } = {}) {
	const calls = { capture: 0, resize: [] };
	const image = {
		isEmpty: () => empty,
		getSize: () => ({ width, height }),
		resize(opts) { calls.resize.push(opts); return image; },
		toJPEG: (q) => Buffer.from("jpeg-" + q)
	};
	const win = { isDestroyed: () => false, webContents: { capturePage: async () => { calls.capture++; return image; } } };
	return { calls, electron: { BrowserWindow: { getAllWindows: () => Array.from({ length: windows }, () => win) } } };
}

test("Electron: Fenster abfotografieren, lange Seite verkleinern", async () => {
	const { electron, calls } = fakeElectron({ width: 1080, height: 1920 });
	const cap = createCapturer({ electron, execFile: () => assert.fail("grim nicht nötig") });
	const shot = await cap.capture();
	assert.equal(shot.method, "electron");
	assert.equal(shot.buffer.toString(), "jpeg-70");
	assert.deepEqual(calls.resize[0], { height: LONG_SIDE, quality: "good" }); // Hochformat-Spiegel
});

test("Zwischenspeicher und gemeinsame Aufnahme bei gleichzeitigen Anfragen", async () => {
	let t = 0;
	const { electron, calls } = fakeElectron();
	const cap = createCapturer({ electron, now: () => t, cacheMs: 1500 });
	await Promise.all([cap.capture(), cap.capture(), cap.capture()]);
	assert.equal(calls.capture, 1);
	t = 1000;
	await cap.capture();
	assert.equal(calls.capture, 1);
	t = 2000;
	await cap.capture();
	assert.equal(calls.capture, 2);
});

test("ohne Fenster bzw. ohne Electron: grim als Ersatz", async () => {
	const grim = (cmd, args, opts, cb) => { assert.equal(cmd, "grim"); assert.ok(args.includes("-")); cb(null, Buffer.from("grim-jpeg")); };
	const noWin = createCapturer({ electron: fakeElectron({ windows: 0 }).electron, execFile: grim });
	assert.equal((await noWin.capture()).method, "grim");
	const serverOnly = createCapturer({ electron: null, execFile: grim });
	assert.equal((await serverOnly.capture()).buffer.toString(), "grim-jpeg");
});

test("Fehler werden verständlich gemeldet", async () => {
	const missing = (cmd, args, opts, cb) => { const e = new Error("spawn grim ENOENT"); e.code = "ENOENT"; cb(e); };
	await assert.rejects(createCapturer({ electron: null, execFile: missing }).capture(), /grim nicht installiert/);
	// Electron-Fehler hat Vorrang, wenn grim auch nicht geht
	await assert.rejects(createCapturer({ electron: fakeElectron({ empty: true }).electron, execFile: missing }).capture(), /leeres Bild/);
	// nach einem Fehler wird beim nächsten Mal neu versucht
	let ok = false;
	const flaky = (cmd, args, opts, cb) => (ok ? cb(null, Buffer.from("x")) : missing(cmd, args, opts, cb));
	const cap = createCapturer({ electron: null, execFile: flaky });
	await assert.rejects(cap.capture());
	ok = true;
	assert.equal((await cap.capture()).buffer.toString(), "x");
});

test("nur Anfragen vom eigenen Gerät", () => {
	for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) assert.equal(isLoopback(a), true);
	for (const a of ["192.168.2.20", "::ffff:192.168.2.20", "", undefined]) assert.equal(isLoopback(a), false);
});
