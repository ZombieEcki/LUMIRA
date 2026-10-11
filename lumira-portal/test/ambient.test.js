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

// GIF → MP4 beim Hochladen (prepareUpload, braucht ffmpeg – sonst übersprungen)
const { execFileSync } = require("child_process");
const { prepareUpload } = require("../lib/ambient");
let ffmpegOk = true;
try { execFileSync(process.env.LUMIRA_FFMPEG || "ffmpeg", ["-version"], { stdio: "ignore" }); } catch (e) { ffmpegOk = false; }

test("GIF wird in ein MP4 umgewandelt", { skip: !ffmpegOk }, async () => {
	const { home, amb } = setup();
	const gif = path.join(home, "upload-gif");
	// 2 Sekunden Testbild, 321 px breit (ungerade → muss auf gerade Maße kommen)
	execFileSync(process.env.LUMIRA_FFMPEG || "ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=321x181:rate=10:duration=2", "-f", "gif", gif]);
	const prepared = await prepareUpload({ tmpPath: gif, originalName: "Kamin.gif", size: fs.statSync(gif).size });
	assert.equal(prepared.converted, true);
	assert.equal(prepared.originalName, "Kamin.mp4");
	assert.equal(fs.existsSync(gif), false, "GIF wird nach dem Umwandeln gelöscht");
	const entry = amb.addMedia({ tmpPath: prepared.tmpPath, originalName: prepared.originalName, size: prepared.size });
	assert.equal(entry.type, "video");
	assert.equal(entry.name, "Kamin");
	assert.match(entry.file, /\.mp4$/);
});

test("Kein GIF → unverändert; GIF ohne ffmpeg → Hinweis", async () => {
	const { home } = setup();
	const png = tmpFile(home, PNG);
	assert.deepEqual(await prepareUpload({ tmpPath: png, originalName: "a.png", size: 1 }), { tmpPath: png, originalName: "a.png", size: 1, converted: false });
	const gif = tmpFile(home, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
	const r = await prepareUpload({ tmpPath: gif, originalName: "a.gif", size: 1 }, { ffmpeg: "gibt-es-nicht-ffmpeg" });
	assert.equal(r.converted, false);
	assert.equal(r.tmpPath, gif);
	assert.match(r.note, /ruckelig/);
});

// YouTube als Medium
const { parseYouTube } = require("../lib/ambient");
const { youtubeEmbedUrl } = require("../../modules/MMM-Ambient/payload");

test("YouTube-Links erkennen (inkl. Startzeit), fremde Adressen ablehnen", () => {
	assert.deepEqual(parseYouTube("https://www.youtube.com/watch?v=L_LUpnjgPso&t=90s"), { id: "L_LUpnjgPso", start: 90 });
	assert.deepEqual(parseYouTube("https://youtu.be/L_LUpnjgPso?t=1h2m3s"), { id: "L_LUpnjgPso", start: 3723 });
	assert.deepEqual(parseYouTube("https://m.youtube.com/shorts/L_LUpnjgPso"), { id: "L_LUpnjgPso", start: 0 });
	assert.deepEqual(parseYouTube("https://www.youtube.com/live/L_LUpnjgPso?si=abc"), { id: "L_LUpnjgPso", start: 0 });
	assert.equal(parseYouTube("https://evil.example/watch?v=L_LUpnjgPso"), null);
	assert.equal(parseYouTube("javascript:alert(1)"), null);
	assert.equal(parseYouTube("https://www.youtube.com/watch?v=zu-kurz"), null);
	assert.equal(parseYouTube(""), null);
});

test("YouTube in der Mediathek: anlegen, auswählen, Spiegel-Zustand, löschen", () => {
	const { amb } = setup();
	const e = amb.addYouTube({ url: "https://youtu.be/L_LUpnjgPso?t=30", name: "Kaminfeuer 10 Stunden" });
	assert.equal(e.type, "youtube");
	assert.equal(e.youtubeId, "L_LUpnjgPso");
	assert.equal(e.start, 30);
	assert.throws(() => amb.addYouTube({ url: "https://example.com/x" }), /kein YouTube-Link/);
	// bleibt beim Neuladen erhalten (keine Datei nötig)
	const v = amb.setState({ enabled: true, mediaId: e.id, sound: false });
	assert.equal(v.media.find((m) => m.id === e.id).youtubeId, "L_LUpnjgPso");
	assert.equal(amb.mediaFile(e.id), null);

	const p = toPayload(amb.load(), new Date("2026-10-11T20:00:00Z"));
	assert.deepEqual(p.media, { kind: "youtube", videoId: "L_LUpnjgPso", start: 30, quality: "480" });
	// Qualität wählbar (Player-Größe auf dem Spiegel), Unsinn wird abgelehnt
	assert.equal(amb.setState({ ytQuality: "720" }).ytQuality, "720");
	assert.equal(toPayload(amb.load(), new Date("2026-10-11T20:00:00Z")).media.quality, "720");
	assert.throws(() => amb.setState({ ytQuality: "4k" }), /YouTube-Qualität/);
	const url = new URL(youtubeEmbedUrl(p.media, false));
	assert.equal(url.hostname, "www.youtube-nocookie.com");
	assert.equal(url.pathname, "/embed/L_LUpnjgPso");
	assert.equal(url.searchParams.get("mute"), "1");
	assert.equal(url.searchParams.get("loop"), "1");
	assert.equal(url.searchParams.get("playlist"), "L_LUpnjgPso");
	assert.equal(url.searchParams.get("start"), "30");
	assert.equal(new URL(youtubeEmbedUrl(p.media, true)).searchParams.get("mute"), "0");

	const after = amb.removeMedia(e.id);
	assert.equal(after.enabled, false);
	assert.equal(after.mediaId, "campfire");
});

test("Kaputte YouTube-Einträge in ambient.json werden ignoriert", () => {
	const now = new Date("2026-10-11T20:00:00Z");
	const raw = { enabled: true, mediaId: "md_0a1b2c3d", media: [{ id: "md_0a1b2c3d", type: "youtube", youtubeId: "\"><script>" }] };
	assert.equal(toPayload(raw, now).enabled, false);
});
