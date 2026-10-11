"use strict";
// Dauerschleife auf dem Spiegel (lib/ambient.js, modules/MMM-Ambient)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAmbient, sniff, AmbientError } = require("../lib/ambient");
const { toPayload } = require("../../modules/MMM-Ambient/payload");

function setup() {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-amb-"));
	let t = new Date("2026-10-11T20:00:00Z");
	const amb = createAmbient({ home, now: () => t });
	return { home, amb, advance: (min) => { t = new Date(t.getTime() + min * 60000); } };
}

function tmpFile(home, bytes) {
	const p = path.join(home, "upload-" + Math.random().toString(16).slice(2));
	fs.writeFileSync(p, Buffer.concat([Buffer.from(bytes), Buffer.alloc(64)]));
	return p;
}

const MP4 = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]; // ....ftypisom
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

test("Grundzustand: aus, Lagerfeuer, Vollbild", () => {
	const { amb } = setup();
	const v = amb.view();
	assert.equal(v.enabled, false);
	assert.equal(v.mediaId, "campfire");
	assert.equal(v.mode, "fullscreen");
	assert.deepEqual(v.media.map((m) => m.id), ["campfire"]);
});

test("Einschalten mit Timer, Ablauf, expire", () => {
	const { amb, advance } = setup();
	let v = amb.setState({ enabled: true, mode: "background", minutes: 30 });
	assert.equal(v.enabled, true);
	assert.equal(v.until, "2026-10-11T20:30:00.000Z");
	advance(29);
	assert.equal(amb.view().enabled, true);
	advance(2);
	assert.equal(amb.view().enabled, false, "abgelaufen zählt als aus");
	assert.equal(amb.expire(), true);
	assert.equal(amb.load().enabled, false);
	assert.equal(amb.expire(), false);
	// Ausschalten löscht den Timer
	amb.setState({ enabled: true, minutes: 60 });
	assert.equal(amb.setState({ enabled: false }).until, null);
});

test("Ungültige Eingaben", () => {
	const { amb } = setup();
	assert.throws(() => amb.setState({ mode: "kino" }), AmbientError);
	assert.throws(() => amb.setState({ mediaId: "md_00000000" }), /Unbekanntes Medium/);
	assert.throws(() => amb.setState({ minutes: 9999 }), /Timer/);
	assert.throws(() => amb.setState({ minutes: 1.5 }), /Timer/);
});

test("Hochladen: Typ an den ersten Bytes, Name, Löschen", () => {
	const { home, amb } = setup();
	const video = amb.addMedia({ tmpPath: tmpFile(home, MP4), originalName: "Kaminfeuer.mp4", size: 1234 });
	assert.match(video.id, /^md_[a-f0-9]{8}$/);
	assert.equal(video.type, "video");
	assert.equal(video.name, "Kaminfeuer");
	assert.ok(fs.existsSync(path.join(amb.mediaDir, video.file)));
	const img = amb.addMedia({ tmpPath: tmpFile(home, PNG), originalName: "x.png", name: "Strand", size: 99 });
	assert.equal(img.type, "image");
	assert.equal(img.name, "Strand");
	assert.equal(amb.mediaFile(img.id).mime, "image/png");
	assert.equal(amb.mediaFile("../ambient.json"), null);

	// Gefälschte Datei (Endung passt, Inhalt nicht) → abgelehnt und gelöscht
	const fake = tmpFile(home, Buffer.from("<html>kein Video</html>"));
	assert.throws(() => amb.addMedia({ tmpPath: fake, originalName: "film.mp4", size: 50 }), /Nur Videos/);
	assert.equal(fs.existsSync(fake), false);

	// Laufendes Medium löschen → aus, zurück aufs Lagerfeuer, Datei weg
	amb.setState({ enabled: true, mediaId: video.id });
	const v = amb.removeMedia(video.id);
	assert.equal(v.enabled, false);
	assert.equal(v.mediaId, "campfire");
	assert.equal(fs.existsSync(path.join(amb.mediaDir, video.file)), false);
	assert.throws(() => amb.removeMedia(video.id), /nicht gefunden/);
});

test("sniff erkennt die erlaubten Formate", () => {
	const b = (arr) => Buffer.concat([Buffer.from(arr), Buffer.alloc(16)]);
	assert.equal(sniff(b(MP4)).ext, "mp4");
	assert.equal(sniff(b([0x1a, 0x45, 0xdf, 0xa3])).ext, "webm");
	assert.equal(sniff(b([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])).ext, "gif");
	assert.equal(sniff(b([0xff, 0xd8, 0xff, 0xe0])).ext, "jpg");
	assert.equal(sniff(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)])).ext, "webp");
	assert.equal(sniff(b([0x25, 0x50, 0x44, 0x46])), null); // PDF
});

test("Spiegel-Zustand (MMM-Ambient/payload.js)", () => {
	const now = new Date("2026-10-11T20:00:00Z");
	assert.deepEqual(toPayload(null, now), { enabled: false });
	assert.deepEqual(toPayload({ enabled: true, mediaId: "campfire", mode: "fullscreen" }, now),
		{ enabled: true, mode: "fullscreen", sound: false, until: null, media: { kind: "campfire" } });
	const raw = { enabled: true, mediaId: "md_0a1b2c3d", mode: "background", sound: true, media: [{ id: "md_0a1b2c3d", file: "md_0a1b2c3d.mp4", type: "video" }] };
	assert.deepEqual(toPayload(raw, now).media, { kind: "video", url: "/MMM-Ambient/media/md_0a1b2c3d.mp4" });
	assert.equal(toPayload(Object.assign({}, raw, { until: "2026-10-11T19:59:00Z" }), now).enabled, false);
	assert.equal(toPayload(Object.assign({}, raw, { media: [{ id: "md_0a1b2c3d", file: "../../etc/passwd", type: "video" }] }), now).enabled, false);
});

test("Lagerfeuer im Portal und im Modul sind dieselbe Datei", () => {
	const a = fs.readFileSync(path.join(__dirname, "..", "public", "ambient-fire.js"), "utf8");
	const b = fs.readFileSync(path.join(__dirname, "..", "..", "modules", "MMM-Ambient", "fire.js"), "utf8");
	assert.equal(a, b);
});

test("config.js lädt MMM-Ambient in jeder Edition", () => {
	const settingsLib = require("../lib/settings");
	const { buildModules } = require("../lib/generate-config");
	for (const edition of ["home", "fire"]) {
		const s = Object.assign(settingsLib.load(), { edition });
		const m = buildModules(s).find((x) => x.module === "MMM-Ambient");
		assert.ok(m, edition);
		assert.equal(m.position, undefined);
	}
});
