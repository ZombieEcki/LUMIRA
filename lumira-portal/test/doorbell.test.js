// Türklingel: Ablauf (lib/doorbell.js), Ring-Anbindung (lib/ring.js mit
// nachgebauter ring-client-api), Spiegel-Zustand (MMM-Doorbell/payload.js)
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-doorbell-test-"));
process.env.LUMIRA_HOME = HOME;
process.env.LUMIRA_DOORBELL_LIVE = path.join(HOME, "live");

const doorbellLib = require("../lib/doorbell");
const ringLib = require("../lib/ring");
const settingsLib = require("../lib/settings");
const { buildModules } = require("../lib/generate-config");
const payloadLib = require("../../modules/MMM-Doorbell/payload");

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const quiet = { warn() {}, error() {}, log() {} };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fresh(name, opts = {}) {
	const home = path.join(HOME, name);
	return doorbellLib.createDoorbell(Object.assign({ home, liveDir: path.join(home, "live"), log: quiet }, opts));
}

// Ring-Adapter zum Testen: Stream schreibt nach kurzer Zeit eine Playlist
function fakeRing({ connected = true, failStream = false, battery = false, writePlaylist = true } = {}) {
	const calls = { start: [], stop: 0, snap: [] };
	let ended = null;
	return {
		calls,
		end: () => ended && ended(),
		connected: () => connected,
		devices: () => [{ id: "111", name: "Haustür", model: "Video Doorbell Pro", battery, batteryLevel: battery ? 80 : null, offline: false }],
		startStream: async (id, dir) => {
			calls.start.push({ id, dir });
			if (failStream) throw new Error("kaputt");
			if (writePlaylist) {
				setTimeout(() => {
					try { fs.writeFileSync(path.join(dir, "stream.m3u8"), "#EXTM3U\n#EXTINF:1.0,\nseg00000.ts\n"); } catch (e) { /* Ereignis schon zu */ }
				}, 50);
			}
			return { stop: () => { calls.stop++; }, onEnded: (cb) => { ended = cb; } };
		},
		snapshot: async (id, o) => { calls.snap.push(Object.assign({ id }, o)); return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]); }
	};
}

test("Einstellungen: Standard, Grenzen, verständliche Fehler", () => {
	const db = fresh("cfg");
	const v = db.view();
	assert.equal(v.config.notify.text, "Es hat geklingelt!");
	assert.equal(v.config.video.size, "medium");
	assert.equal(v.config.sound.source, "gong");
	const s = db.setConfig({ notify: { text: "  Jemand ist an der Tür  ", seconds: 10 }, video: { seconds: 120, size: "large" }, sound: { volume: 40 } });
	assert.equal(s.config.notify.text, "Jemand ist an der Tür");
	assert.equal(s.config.video.seconds, 120);
	assert.equal(s.config.sound.volume, 40);
	assert.equal(s.config.notify.glow, true, "nicht genannte Werte bleiben");
	assert.throws(() => db.setConfig({ video: { seconds: 5 } }), /10 bis 600/);
	assert.throws(() => db.setConfig({ video: { size: "riesig" } }), /klein, mittel oder groß/);
	assert.throws(() => db.setConfig({ sound: { source: "custom" } }), /eigenen Ton hochladen/);
	assert.throws(() => db.setConfig({ power: "solar" }), doorbellLib.DoorbellError);
	assert.equal(db.setConfig({ notify: { text: "" } }).config.notify.text, "Es hat geklingelt!", "leer → Standardtext");
});

test("Test ohne Ring: Meldung, dann Testbild, Zeiten stimmen", () => {
	let t = new Date("2026-10-12T18:00:00Z");
	const db = fresh("demo", { now: () => t });
	db.setConfig({ notify: { seconds: 8 }, video: { seconds: 60 } });
	const ev = db.trigger({ source: "test" });
	assert.equal(ev.video.status, "demo");
	assert.equal(ev.notifyUntil, "2026-10-12T18:00:08.000Z");
	assert.equal(ev.until, "2026-10-12T18:01:00.000Z", "Meldung und Video gleichzeitig – es zählt das längere");
	const p = payloadLib.toPayload(JSON.parse(fs.readFileSync(db.statePath, "utf8")), new Date("2026-10-12T18:00:30Z"));
	assert.equal(p.active, true);
	assert.equal(p.test, true);
	assert.equal(p.video.status, "demo");
	assert.equal(payloadLib.toPayload(JSON.parse(fs.readFileSync(db.statePath, "utf8")), new Date("2026-10-12T18:01:01Z")).active, false, "nach Ablauf aus");
	assert.equal(db.close(), true);
	assert.equal(db.view().event, null);
	db.shutdown();
});

test("Nur Ton: ohne Meldung und Video kurz aktiv, damit der Spiegel klingelt", () => {
	const t = new Date("2026-10-12T18:00:00Z");
	const db = fresh("soundonly", { now: () => t });
	db.setConfig({ notify: { enabled: false }, video: { enabled: false } });
	const ev = db.trigger({ source: "test" });
	assert.equal(ev.video.status, "off");
	assert.equal(Date.parse(ev.until) - t.getTime(), 4000);
	db.shutdown();
});

test("Ohne automatisches Schließen: höchstens 10 Minuten", () => {
	const t = new Date("2026-10-12T18:00:00Z");
	const db = fresh("manual", { now: () => t });
	db.setConfig({ notify: { seconds: 5 }, video: { autoClose: false } });
	const ev = db.trigger({ source: "test" });
	assert.equal(Date.parse(ev.until) - t.getTime(), doorbellLib.MANUAL_CAP * 1000);
	db.shutdown();
});

test("Ring-Klingeln: Stream startet, Playlist da → live, Standbild, Schließen stoppt", async () => {
	const ring = fakeRing();
	const db = fresh("live", { ring });
	const ev = db.trigger({ camera: { id: "111", name: "Haustür" }, source: "ring", dingId: "d1" });
	assert.equal(ev.video.status, "starting");
	assert.equal(ev.power, "wired");
	await wait(700);
	const cur = db.view().event;
	assert.equal(cur.video.status, "live");
	assert.match(cur.live, /^\/api\/doorbell\/live\/ev_[a-f0-9]{8}\/stream\.m3u8$/);
	assert.equal(ring.calls.start[0].id, "111");
	assert.deepEqual(ring.calls.snap[0], { id: "111", dingId: "d1" });
	assert.match(cur.snapshot, /^\/MMM-Doorbell\/live\/ev_[a-f0-9]{8}\/snap-[0-9]+\.jpg$/);
	assert.ok(db.liveFile(cur.id, "stream.m3u8"), "Portal-Vorschau findet die Playlist");
	assert.equal(db.liveFile(cur.id, "../doorbell.json"), null, "nur erlaubte Dateinamen");
	const p = payloadLib.toPayload(JSON.parse(fs.readFileSync(db.statePath, "utf8")), new Date());
	assert.match(p.video.url, /^\/MMM-Doorbell\/live\/ev_[a-f0-9]{8}\/stream\.m3u8$/);
	db.close();
	assert.equal(ring.calls.stop, 1);
	assert.equal(fs.existsSync(path.join(db.liveDir, cur.id)), false, "Live-Ordner aufgeräumt");
	db.shutdown();
});

test("Erneut klingeln: dasselbe Ereignis, Ton noch einmal, Video läuft weiter", async () => {
	const ring = fakeRing();
	const db = fresh("again", { ring });
	const a = db.trigger({ camera: { id: "111", name: "Haustür" } });
	await wait(100);
	const b = db.trigger({ camera: { id: "111", name: "Haustür" } });
	assert.equal(b.id, a.id);
	assert.equal(b.rings, 2);
	assert.equal(ring.calls.start.length, 1, "kein zweiter Stream");
	db.close();
	db.shutdown();
});

test("Bildübertragung „umwandeln“ geht an den Stream, Rückmeldung des Spiegels erscheint im Portal", async () => {
	const ring = fakeRing();
	const db = fresh("mode", { ring });
	assert.equal(db.view().config.video.mode, "copy", "Standard: direkt");
	assert.throws(() => db.setConfig({ video: { mode: "magie" } }), /direkt oder umwandeln/);
	db.setConfig({ video: { mode: "transcode" } });
	const orig = ring.startStream;
	let opts = null;
	ring.startStream = (id, dir, o) => { opts = o; return orig(id, dir, o); };
	const ev = db.trigger({ camera: { id: "111", name: "Haustür" } });
	await wait(100);
	assert.deepEqual(opts, { mode: "transcode" });
	// MMM-Doorbell meldet zurück (eigene Datei neben doorbell.json)
	fs.writeFileSync(path.join(path.dirname(db.statePath), doorbellLib.MIRROR_REPORT),
		JSON.stringify({ eventId: ev.id, state: "timeout", detail: "networkError/fragLoadError 404", width: 0, height: 0 }));
	const m = db.view().event.mirror;
	assert.equal(m.state, "timeout");
	assert.match(m.detail, /404/);
	db.close();
	db.shutdown();
});

test("Video klappt nicht: Meldung bleibt, Fehlertext, Kabel → Standbilder", async () => {
	const ring = fakeRing({ failStream: true });
	const db = fresh("fail", { ring });
	db.trigger({ camera: { id: "111", name: "Haustür" } });
	await wait(100);
	const ev = db.view().event;
	assert.ok(ev, "Ereignis bleibt");
	assert.equal(ev.video.status, "error");
	assert.match(ev.video.message, /kaputt/);
	db.close();
	db.shutdown();
});

test("Ende-zu-Ende-Verschlüsselung: verständlicher Hinweis statt Video", async () => {
	const ring = fakeRing();
	const db = fresh("e2ee", { ring });
	db.trigger({ camera: { id: "111", name: "Haustür" }, e2ee: true });
	assert.match(db.view().event.video.message, /Ende-zu-Ende/);
	assert.equal(ring.calls.start.length, 0);
	db.close();
	db.shutdown();
});

test("Akku-Klingel automatisch erkannt, Auswahl im Portal geht vor", () => {
	const db = fresh("power", { ring: fakeRing({ battery: true }) });
	assert.equal(db.view().devices[0].power, "battery");
	assert.equal(db.trigger({ camera: { id: "111", name: "Haustür" } }).power, "battery");
	db.close();
	db.setConfig({ power: "wired" });
	assert.equal(db.trigger({ camera: { id: "111", name: "Haustür" } }).power, "wired");
	db.close();
	db.shutdown();
});

test("Abgewählte Klingel löst nicht aus", () => {
	const db = fresh("filter", { ring: fakeRing() });
	db.setConfig({ cameras: ["222"] });
	assert.equal(db.trigger({ camera: { id: "111", name: "Haustür" }, source: "ring" }), null);
	assert.equal(db.view().event, null);
	db.shutdown();
});

test("Neustart des Portals räumt ein liegengebliebenes Ereignis weg", () => {
	const db = fresh("reset");
	db.trigger({ source: "test" });
	db.shutdown();
	const db2 = fresh("reset");
	db2.reset();
	assert.equal(db2.view().event, null);
});

test("Eigener Ton: nur echte Audiodateien, Löschen → wieder Ding-Dong", () => {
	const db = fresh("sound");
	assert.throws(() => db.saveSound({ buffer: Buffer.from("<html>kein ton</html>"), mimetype: "audio/mpeg", originalName: "x.mp3" }), /keine Audiodatei/);
	assert.throws(() => db.saveSound({ buffer: Buffer.from("abc"), mimetype: "image/png", originalName: "x.png" }), /MP3, WAV oder OGG/);
	const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(64)]);
	const v = db.saveSound({ buffer: mp3, mimetype: "audio/mpeg", originalName: "Westminster.mp3" });
	assert.equal(v.config.sound.source, "custom");
	assert.equal(v.config.sound.file, "sound.mp3");
	assert.equal(v.config.sound.name, "Westminster");
	assert.ok(db.soundFile());
	const p = payloadLib.toPayload({ config: v.config, event: { id: "ev_00000000", at: new Date().toISOString(), until: new Date(Date.now() + 9000).toISOString() } }, new Date());
	assert.equal(p.sound.url, "/MMM-Doorbell/sound/sound.mp3");
	const w = db.removeSound();
	assert.equal(w.config.sound.source, "gong");
	assert.equal(db.soundFile(), null);
});

test("Spiegel-Zustand: nur erlaubte Adressen, kaputte Datei → nichts", () => {
	const now = new Date();
	const ev = { id: "ev_12345678", at: now.toISOString(), notifyUntil: now.toISOString(), until: new Date(now.getTime() + 60000).toISOString(),
		video: { status: "live", url: "https://evil.example/x.m3u8" }, snapshot: "/etc/passwd" };
	const p = payloadLib.toPayload({ config: {}, event: ev }, now);
	assert.equal(p.video.url, null);
	assert.equal(p.snapshot, null);
	assert.equal(payloadLib.toPayload(null, now).active, false);
	assert.equal(payloadLib.toPayload({ event: { id: "../x" } }, now).active, false);
});

test("Portal und Spiegel nutzen denselben Live-Ordner und denselben Gong", () => {
	assert.equal(doorbellLib.liveDirFor(HOME), payloadLib.liveDirFor(HOME));
	const a = fs.readFileSync(path.join(__dirname, "..", "public", "doorbell-gong.js"), "utf8").replace(/\r\n/g, "\n");
	const b = fs.readFileSync(path.join(__dirname, "..", "..", "modules", "MMM-Doorbell", "gong.js"), "utf8").replace(/\r\n/g, "\n");
	assert.equal(a, b);
});

test("config.js: Türklingel standardmäßig aus, eingeschaltet als MMM-Doorbell", () => {
	const s = Object.assign(settingsLib.load(), { edition: "fire" });
	assert.equal(s.modules.doorbell, false);
	assert.ok(!buildModules(s).some((m) => m.module === "MMM-Doorbell"));
	const on = settingsLib.patch({ edition: "fire", modules: { doorbell: true } });
	const mod = buildModules(on).find((m) => m.module === "MMM-Doorbell");
	assert.ok(mod);
	assert.deepEqual(mod.config.hideOnAlarmPhases, [1], "Alarm geht vor");
	assert.equal(mod.position, undefined, "hängt selbst am body");
});

// ---------------------------------------------------------------- Ring
function subject() {
	const fns = [];
	return { next: (v) => fns.forEach((f) => f(v)), subscribe: (f) => { fns.push(f); return { unsubscribe() { fns.splice(fns.indexOf(f), 1); } }; } };
}

const okProbe = async () => ({ ok: true, code: "ok", address: "203.0.113.5", message: "Push-Kanal erreichbar" });

function fakeLib() {
	const st = { bell: null, api: null, codes: [] };
	class RingRestClient {
		constructor(o) { this.o = o; }
		async getCurrentAuth() {
			if (this.o.password !== "richtig") throw new Error("Failed to fetch oauth token from Ring. Verify that your email and password are correct. (error: invalid)");
			this.promptFor2fa = "Please enter the code sent to ***42 via sms";
			throw new Error("Your Ring account is configured to use 2-factor authentication (2fa).");
		}
		async getAuth(code) {
			st.codes.push(code);
			if (code !== "123456") throw new Error("Verification Code is invalid or expired");
			return { refresh_token: "TOKEN-1" };
		}
	}
	class RingApi {
		constructor(o) {
			this.o = o;
			this.onRefreshTokenUpdated = subject();
			st.api = this;
		}
		async getCameras() {
			if (this.o.refreshToken === "ABGELAUFEN") throw new Error("Failed to fetch oauth token from Ring. Verify that your refresh token is correct.");
			st.bell = { id: 111, name: "Haustür", model: "Video Doorbell Pro", isDoorbot: true, operatingOnBattery: false, batteryLevel: null, isOffline: false,
				onDoorbellPressed: subject(), onNewNotification: subject(), onData: subject() };
			const cam = { id: 5, name: "Garten", isDoorbot: false, onDoorbellPressed: subject(), onData: subject() };
			return [st.bell, cam];
		}
		async getProfile() { return { email: "familie@example.com" }; }
		disconnect() { this.gone = true; }
	}
	const logger = { fn: null, debug: false };
	return { st, logger, lib: { RingRestClient, RingApi, useLogger: (l) => { logger.fn = l; }, enableDebug: () => { logger.debug = true; } } };
}

test("Ring-Anmeldung: Passwort, Code, nur Token gespeichert (0600), nie herausgegeben", async () => {
	const home = path.join(HOME, "ring-login");
	const { st, lib } = fakeLib();
	const dings = [];
	const ring = ringLib.createRing({ home, loadLib: async () => lib, onDing: (d) => dings.push(d), log: quiet, pushProbe: okProbe });
	await ring.setEnabled(true);
	assert.equal(ring.view().status, "needs-login");

	await assert.rejects(ring.loginStart("familie@example.com", "falsch"), /E-Mail oder Passwort stimmt nicht/);
	const step = await ring.loginStart("familie@example.com", "richtig");
	assert.equal(step.needsCode, true);
	assert.match(step.prompt, /per SMS an \*\*\*42/);
	assert.equal(ring.view().awaitingCode, true);

	await assert.rejects(ring.loginCode("999999"), /Code stimmt nicht/);
	const done = await ring.loginCode("123 456");
	assert.equal(done.done, true);
	assert.deepEqual(st.codes, ["999999", "123456"]);

	const saved = JSON.parse(fs.readFileSync(path.join(home, "ring-auth.json"), "utf8"));
	assert.equal(saved.refreshToken, "TOKEN-1");
	assert.ok(!JSON.stringify(saved).includes("richtig"), "Passwort nie gespeichert");
	assert.ok(!JSON.stringify(saved).includes("familie@"), "E-Mail nicht gespeichert");
	if (process.platform !== "win32") assert.equal(fs.statSync(path.join(home, "ring-auth.json")).mode & 0o777, 0o600);

	const v = ring.view();
	assert.equal(v.status, "connected");
	assert.equal(v.account, "f•••@example.com");
	assert.deepEqual(v.devices.map((d) => d.name), ["Haustür"], "nur Türklingeln");
	assert.equal(v.devices[0].battery, false);
	assert.ok(!JSON.stringify(v).includes("TOKEN"), "Token nie in der Antwort");
	const apiBefore = st.api;
	await ring.setEnabled(true);
	assert.equal(st.api, apiBefore, "Speichern anderer Einstellungen verbindet nicht neu");
	assert.equal(st.api.o.ffmpegPath, process.env.LUMIRA_FFMPEG || "ffmpeg", "System-ffmpeg");
	assert.equal(st.api.o.controlCenterDisplayName, "LUMIRA Spiegel");

	// Ring tauscht den Token → sofort gespeichert
	st.api.onRefreshTokenUpdated.next({ newRefreshToken: "TOKEN-2" });
	assert.equal(JSON.parse(fs.readFileSync(path.join(home, "ring-auth.json"), "utf8")).refreshToken, "TOKEN-2");

	// Klingeln
	st.bell.onDoorbellPressed.next({ data: { device: { e2ee_enabled: false }, event: { ding: { id: "ding-7" } } } });
	assert.deepEqual(dings, [{ camera: { id: "111", name: "Haustür" }, dingId: "ding-7", e2ee: false }]);
	assert.ok(ring.view().lastDing);

	ring.logout();
	assert.equal(fs.existsSync(path.join(home, "ring-auth.json")), false);
	assert.equal(ring.view().status, "needs-login");
	await ring.setEnabled(false);
	assert.equal(ring.view().status, "off");
});

test("Ring: abgelaufener Token → neu anmelden; fehlende Bibliothek → Hinweis", async () => {
	const home = path.join(HOME, "ring-expired");
	fs.mkdirSync(home, { recursive: true });
	fs.writeFileSync(path.join(home, "ring-auth.json"), JSON.stringify({ refreshToken: "ABGELAUFEN" }));
	const { lib } = fakeLib();
	const ring = ringLib.createRing({ home, loadLib: async () => lib, log: quiet, pushProbe: okProbe });
	await ring.setEnabled(true);
	assert.equal(ring.view().status, "needs-login");
	assert.match(ring.view().message, /abgelaufen/);
	ring.disconnect();

	const missing = ringLib.createRing({ home, loadLib: async () => { throw new Error("Cannot find package"); }, log: quiet, pushProbe: okProbe });
	await missing.setEnabled(true);
	assert.equal(missing.view().status, "error");
	assert.match(missing.view().message, /aktualisieren/);
	await assert.rejects(missing.loginStart("a@b.de", "x"), /aktualisieren/);
});

test("Ring-Meldungen auf Deutsch", () => {
	assert.match(ringLib.friendlyError(new Error("You have requested too many 2fa codes")), /10 in 10 Minuten/);
	assert.match(ringLib.friendlyError(new Error("getaddrinfo ENOTFOUND oauth.ring.com")), /nicht erreichbar/);
	assert.match(ringLib.friendlyPrompt("Please enter the code from your authenticator app"), /Authenticator/);
	assert.match(ringLib.friendlyPrompt("Please enter the code sent to your text/email"), /SMS oder E-Mail/);
	assert.equal(ringLib.maskEmail("max@web.de"), "m•••@web.de");
});

test("Diagnose: Push-Kanal, Nachrichten von Ring, Fehler der Bibliothek sichtbar", async () => {
	const home = path.join(HOME, "ring-diag");
	fs.mkdirSync(home, { recursive: true });
	fs.writeFileSync(path.join(home, "ring-auth.json"), JSON.stringify({ refreshToken: "T" }));
	const { st, logger, lib } = fakeLib();
	const blocked = async () => ({ ok: false, code: "blocked", address: "0.0.0.0", message: "mtalk.google.com wird auf 0.0.0.0 umgeleitet – ein Werbeblocker blockiert" });
	const ring = ringLib.createRing({ home, loadLib: async () => lib, log: quiet, pushProbe: blocked });
	await ring.setEnabled(true);
	await new Promise((r) => setTimeout(r, 20));
	let v = ring.view();
	assert.equal(v.status, "connected");
	assert.equal(v.diag.push.ok, false);
	assert.match(v.diag.push.message, /Werbeblocker/);
	assert.ok(v.diag.errors.some((e) => /Werbeblocker/.test(e.text)), "auch im Protokoll");
	// Bibliotheks-Logger ist eingehängt, Fehler landen in der Diagnose
	assert.ok(logger.fn && logger.debug);
	logger.fn.logError("Failed to connect push notification receiver");
	assert.equal(ring.view().diag.errors[0].text, "Failed to connect push notification receiver");
	// Bewegung kommt an, Klingeln nicht → sichtbar
	st.bell.onNewNotification.next({ android_config: { category: "com.ring.pn.live-event.motion" } });
	v = ring.view();
	assert.equal(v.diag.notifications, 1);
	assert.equal(v.diag.lastNotification.kind, "motion");
	assert.equal(v.lastDing, null);
	st.bell.onNewNotification.next({ android_config: { category: "com.ring.pn.live-event.ding" } });
	assert.equal(ring.view().diag.lastNotification.kind, "ding");
	ring.disconnect();
});

test("Push-Prüfung: nicht auflösbarer Name und gesperrter Port verständlich", async () => {
	const dnsFail = await ringLib.probePush("gibt-es-nicht.invalid", 5228, 500);
	assert.equal(dnsFail.ok, false);
	assert.match(dnsFail.message, /nicht auflösen/);
	const closed = await ringLib.probePush("127.0.0.2", 1, 500);
	assert.equal(closed.ok, false);
});
