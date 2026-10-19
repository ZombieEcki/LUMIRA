// LUMIRA – Türklingel auf dem Spiegel (Bildschirm → Türklingel).
//
// Klingelt es (Ring, siehe lib/ring.js) oder wird im Portal getestet, legt
// diese Datei ein Ereignis an: erst eine kompakte Meldung in der Mitte, dann
// das Live-Video der Klingel, nach der eingestellten Zeit wieder weg.
//
// Einstellungen und das laufende Ereignis liegen in ~/.lumira/doorbell.json.
// Nur das Portal schreibt (atomar per .tmp + rename), MMM-Doorbell liest per
// fs.watch – kein MagicMirror-Neustart. Das Video schreibt ffmpeg als HLS in
// den Live-Ordner (auf dem Pi im Arbeitsspeicher, /dev/shm, schont die SD-Karte).
"use strict";

const fs = require("fs");
const { renameRetry } = require("./atomic");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const FFPROBE = process.env.LUMIRA_FFPROBE || "ffprobe";
// Bildübertragung: „copy“ reicht das Video der Klingel unverändert weiter
// (schnell, wenig Last), „transcode“ wandelt es in 640 px H.264 Baseline –
// das spielt jeder Player ab, falls das Bild sonst schwarz bleibt.
const VIDEO_MODES = ["copy", "transcode"];
// Rückmeldung des Spiegels (MMM-Doorbell schreibt sie, nur lesend genutzt)
const MIRROR_REPORT = "doorbell-mirror.json";

const VIDEO_SIZES = ["small", "medium", "large"];
const POWER_MODES = ["auto", "wired", "battery"];
const VIDEO_MIN = 10;
const VIDEO_MAX = 600;
const NOTIFY_MIN = 3;
const NOTIFY_MAX = 60;
// Ohne automatisches Schließen bleibt das Video höchstens so lange – Ring
// beendet Live-Video ohnehin nach etwa 10 Minuten
const MANUAL_CAP = 600;
const STREAM_TIMEOUT_MS = 25000;
const SNAPSHOT_EVERY_MS = 5000;
const MAX_TEXT = 60;
const DEFAULT_TEXT = "Es hat geklingelt!";
const SOUND_MIME = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg" };
const SOUND_MAX_BYTES = 5 * 1024 * 1024;
const EVENT_ID_RE = /^ev_[a-f0-9]{8}$/;

const DEFAULT_CONFIG = {
	notify: { enabled: true, text: DEFAULT_TEXT, glow: true, seconds: 8 },
	sound: { enabled: true, source: "gong", volume: 80, file: "", name: "" },
	video: { enabled: true, size: "medium", seconds: 60, autoClose: true, countdown: true, mode: "copy" },
	power: "auto",
	cameras: [] // Klingeln, die auslösen (Ring-IDs); leer = alle
};

class DoorbellError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

// Live-Ordner für das HLS-Video. MMM-Doorbell/payload.js hat dieselbe Regel
// (Portal und Spiegel laufen getrennt, test/doorbell.test.js prüft das).
function liveDirFor(home) {
	if (process.env.LUMIRA_DOORBELL_LIVE) return path.resolve(process.env.LUMIRA_DOORBELL_LIVE);
	if (process.platform === "linux" && fs.existsSync("/dev/shm")) return "/dev/shm/lumira-doorbell";
	return path.join(path.resolve(home), "doorbell", "live");
}

function clone(o) {
	return JSON.parse(JSON.stringify(o));
}

function clampInt(v, min, max, fallback) {
	const n = Number(v);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

function cleanText(s) {
	const t = String(s || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
	return t.slice(0, MAX_TEXT) || DEFAULT_TEXT;
}

// Gespeicherte Einstellungen auf gültige Werte bringen (fehlende → Standard)
function cleanConfig(raw) {
	const r = raw && typeof raw === "object" ? raw : {};
	const d = DEFAULT_CONFIG;
	const n = r.notify || {};
	const s = r.sound || {};
	const v = r.video || {};
	return {
		notify: {
			enabled: n.enabled === undefined ? d.notify.enabled : !!n.enabled,
			text: n.text === undefined ? d.notify.text : cleanText(n.text),
			glow: n.glow === undefined ? d.notify.glow : !!n.glow,
			seconds: clampInt(n.seconds, NOTIFY_MIN, NOTIFY_MAX, d.notify.seconds)
		},
		sound: {
			enabled: s.enabled === undefined ? d.sound.enabled : !!s.enabled,
			source: s.source === "custom" && /^sound\.(mp3|wav|ogg)$/.test(s.file || "") ? "custom" : "gong",
			volume: clampInt(s.volume, 0, 100, d.sound.volume),
			file: /^sound\.(mp3|wav|ogg)$/.test(s.file || "") ? s.file : "",
			name: String(s.name || "").slice(0, 80)
		},
		video: {
			enabled: v.enabled === undefined ? d.video.enabled : !!v.enabled,
			size: VIDEO_SIZES.indexOf(v.size) === -1 ? d.video.size : v.size,
			seconds: clampInt(v.seconds, VIDEO_MIN, VIDEO_MAX, d.video.seconds),
			autoClose: v.autoClose === undefined ? d.video.autoClose : !!v.autoClose,
			countdown: v.countdown === undefined ? d.video.countdown : !!v.countdown,
			mode: VIDEO_MODES.indexOf(v.mode) === -1 ? d.video.mode : v.mode
		},
		power: POWER_MODES.indexOf(r.power) === -1 ? "auto" : r.power,
		cameras: Array.isArray(r.cameras) ? r.cameras.map(String).filter((x, i, a) => /^[0-9]{1,20}$/.test(x) && a.indexOf(x) === i).slice(0, 20) : []
	};
}

// Prüft eine Änderung aus dem Portal und meldet Fehler verständlich
function checkPatch(p) {
	if (!p || typeof p !== "object") throw new DoorbellError("Ungültige Einstellungen");
	const num = (v, min, max, what) => {
		if (v === undefined) return;
		if (!Number.isInteger(Number(v)) || Number(v) < min || Number(v) > max) throw new DoorbellError(`${what}: ${min} bis ${max}`);
	};
	if (p.notify) num(p.notify.seconds, NOTIFY_MIN, NOTIFY_MAX, "Meldung anzeigen (Sekunden)");
	if (p.video) {
		num(p.video.seconds, VIDEO_MIN, VIDEO_MAX, "Video-Dauer (Sekunden)");
		if (p.video.size !== undefined && VIDEO_SIZES.indexOf(p.video.size) === -1) throw new DoorbellError("Größe: klein, mittel oder groß");
		if (p.video.mode !== undefined && VIDEO_MODES.indexOf(p.video.mode) === -1) throw new DoorbellError("Bildübertragung: direkt oder umwandeln");
	}
	if (p.sound) num(p.sound.volume, 0, 100, "Lautstärke");
	if (p.power !== undefined && POWER_MODES.indexOf(p.power) === -1) throw new DoorbellError("Stromversorgung: automatisch, Kabel oder Akku");
	if (p.cameras !== undefined && !Array.isArray(p.cameras)) throw new DoorbellError("Klingeln müssen eine Liste sein");
}

// ring: Adapter aus lib/ring.js (oder ein Test-Double) mit
//   connected(), devices(), startStream(id, dir) → { stop, onEnded(cb) },
//   snapshot(id, { dingId }) → Buffer
function createDoorbell({ home, liveDir, ring = null, now = () => new Date(), timers = { setTimeout, clearTimeout, setInterval, clearInterval }, log = console } = {}) {
	home = path.resolve(home);
	liveDir = liveDir ? path.resolve(liveDir) : liveDirFor(home);
	const statePath = path.join(home, "doorbell.json");
	const soundDir = path.join(home, "doorbell");

	// Laufzeit (nicht in der Datei): Stream, Timer
	let stream = null;      // { eventId, cameraId, handle }
	let closeTimer = null;
	let streamWait = null;
	let snapTimer = null;
	let snapCount = 0;

	function load() {
		try {
			const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
			return { version: 1, config: cleanConfig(raw.config), event: raw.event && EVENT_ID_RE.test(raw.event.id) ? raw.event : null };
		} catch (e) {
			return { version: 1, config: cleanConfig(null), event: null };
		}
	}

	function save(st) {
		fs.mkdirSync(home, { recursive: true });
		st.updatedAt = now().toISOString();
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
		renameRetry(tmp, statePath);
		return st;
	}

	// Ereignis ändern, aber nur, wenn es noch dasselbe ist (Stream-Rückmeldungen
	// kommen verzögert – ein inzwischen geschlossenes Ereignis bleibt zu)
	function updateEvent(eventId, fn) {
		const st = load();
		if (!st.event || st.event.id !== eventId) return null;
		fn(st.event);
		save(st);
		return st.event;
	}

	function devicesSafe() {
		try { return (ring && ring.devices && ring.devices()) || []; } catch (e) { return []; }
	}

	function ringConnected() {
		try { return !!(ring && ring.connected && ring.connected()); } catch (e) { return false; }
	}

	// Akku oder Kabel? Automatisch aus Ring, sonst die Auswahl im Portal
	function powerOf(cfg, cameraId) {
		if (cfg.power !== "auto") return cfg.power;
		const d = devicesSafe().find((x) => String(x.id) === String(cameraId));
		if (d && typeof d.battery === "boolean") return d.battery ? "battery" : "wired";
		return "wired";
	}

	function view() {
		const st = load();
		const devices = devicesSafe().map((d) => Object.assign({}, d, {
			power: d.battery === true ? "battery" : d.battery === false ? "wired" : "unknown",
			active: !st.config.cameras.length || st.config.cameras.indexOf(String(d.id)) !== -1
		}));
		return {
			config: st.config,
			event: st.event ? publicEvent(st.event) : null,
			devices,
			limits: { videoMin: VIDEO_MIN, videoMax: VIDEO_MAX, notifyMin: NOTIFY_MIN, notifyMax: NOTIFY_MAX, soundMaxBytes: SOUND_MAX_BYTES, maxText: MAX_TEXT }
		};
	}

	// Was der Spiegel zum laufenden Klingeln meldet (Video läuft / Fehler)
	function mirrorReport(eventId) {
		try {
			const m = JSON.parse(fs.readFileSync(path.join(home, MIRROR_REPORT), "utf8"));
			if (!m || m.eventId !== eventId) return null;
			return { state: String(m.state || ""), detail: String(m.detail || "").slice(0, 200), width: Number(m.width) || 0, height: Number(m.height) || 0, at: String(m.at || "") };
		} catch (e) {
			return null;
		}
	}

	function publicEvent(ev) {
		return {
			mirror: mirrorReport(ev.id),
			info: ev.video && ev.video.info ? ev.video.info : "",
			id: ev.id, at: ev.at, rings: ev.rings, notifyUntil: ev.notifyUntil, until: ev.until,
			camera: ev.camera, source: ev.source, power: ev.power,
			video: ev.video, snapshot: ev.snapshot || null,
			live: ev.video && ev.video.status === "live" ? "/api/doorbell/live/" + ev.id + "/stream.m3u8" : null,
			snapshotUrl: ev.snapshot ? "/api/doorbell/live/" + ev.id + "/" + path.basename(ev.snapshot) : null
		};
	}

	function setConfig(patch) {
		checkPatch(patch);
		const st = load();
		const p = patch;
		const c = st.config;
		const merged = {
			notify: Object.assign({}, c.notify, p.notify || {}),
			sound: Object.assign({}, c.sound, p.sound ? { enabled: p.sound.enabled, source: p.sound.source, volume: p.sound.volume } : {}),
			video: Object.assign({}, c.video, p.video || {}),
			power: p.power === undefined ? c.power : p.power,
			cameras: p.cameras === undefined ? c.cameras : p.cameras
		};
		// undefined-Werte nicht über gültige schreiben
		for (const k of ["notify", "sound", "video"]) {
			for (const key of Object.keys(merged[k])) if (merged[k][key] === undefined) merged[k][key] = c[k][key];
		}
		if (merged.sound.source === "custom" && !c.sound.file) throw new DoorbellError("Erst einen eigenen Ton hochladen");
		st.config = cleanConfig(merged);
		save(st);
		return view();
	}

	// ---------------------------------------------------------------- Ton
	function saveSound({ buffer, mimetype, originalName }) {
		const ext = SOUND_MIME[String(mimetype || "").toLowerCase()] || (/\.(mp3|wav|ogg)$/i.exec(originalName || "") || [])[1];
		if (!buffer || !ext) throw new DoorbellError("Nur MP3, WAV oder OGG");
		if (buffer.length > SOUND_MAX_BYTES) throw new DoorbellError("Ton zu groß (höchstens 5 MB)", 413);
		if (!looksLikeAudio(buffer)) throw new DoorbellError("Das ist keine Audiodatei (MP3, WAV oder OGG)");
		fs.mkdirSync(soundDir, { recursive: true });
		for (const f of fs.readdirSync(soundDir)) if (/^sound\./.test(f)) fs.unlinkSync(path.join(soundDir, f));
		const file = "sound." + ext.toLowerCase();
		fs.writeFileSync(path.join(soundDir, file), buffer);
		const st = load();
		st.config.sound = Object.assign({}, st.config.sound, {
			file, source: "custom", enabled: true,
			name: String(originalName || "Eigener Ton").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[\u0000-\u001f]/g, "").slice(0, 80)
		});
		st.config = cleanConfig(st.config);
		save(st);
		return view();
	}

	function removeSound() {
		const st = load();
		if (fs.existsSync(soundDir)) {
			for (const f of fs.readdirSync(soundDir)) if (/^sound\./.test(f)) fs.unlinkSync(path.join(soundDir, f));
		}
		st.config.sound = Object.assign({}, st.config.sound, { file: "", name: "", source: "gong" });
		save(st);
		return view();
	}

	function soundFile() {
		const f = load().config.sound.file;
		if (!f) return null;
		const p = path.join(soundDir, f);
		return fs.existsSync(p) ? { path: p, mime: f.endsWith(".mp3") ? "audio/mpeg" : f.endsWith(".wav") ? "audio/wav" : "audio/ogg" } : null;
	}

	// ---------------------------------------------------------------- Ablauf
	// cam: { id, name } der Klingel (Test: Ring-Klingel, falls verbunden)
	function trigger({ camera, source = "ring", dingId = "", e2ee = false } = {}) {
		const st = load();
		const cfg = st.config;
		const cam = camera && camera.id !== undefined ? { id: String(camera.id), name: String(camera.name || "Haustür").slice(0, 40) } : null;
		if (source === "ring" && cam && cfg.cameras.length && cfg.cameras.indexOf(cam.id) === -1) return null; // diese Klingel ist abgewählt
		const t = now();
		const notifySec = cfg.notify.enabled ? cfg.notify.seconds : 0;
		const videoSec = cfg.video.enabled ? (cfg.video.autoClose ? cfg.video.seconds : MANUAL_CAP) : 0;
		// Meldung und Video kommen zusammen (Meldung über dem Video) – es zählt
		// das längere von beiden. Nur Ton (beides aus): kurz „aktiv“ für den Ton.
		const total = Math.max(notifySec, videoSec, 4);

		// Klingelt dieselbe Klingel erneut, während noch alles läuft: Zeit
		// verlängern, Ton neu, Video weiterlaufen lassen
		const prev = st.event;
		const same = prev && cam && prev.camera && prev.camera.id === cam.id && Date.parse(prev.until) > t.getTime();
		const ev = same ? prev : {
			id: "ev_" + crypto.randomBytes(4).toString("hex"),
			rings: 0,
			camera: cam || { id: "", name: "Haustür" },
			source,
			video: { status: cfg.video.enabled ? "starting" : "off" },
			snapshot: null
		};
		ev.rings = (ev.rings || 0) + 1;
		ev.at = t.toISOString();
		ev.power = cam ? powerOf(cfg, cam.id) : "wired";
		ev.notifyUntil = new Date(t.getTime() + notifySec * 1000).toISOString();
		ev.until = new Date(t.getTime() + total * 1000).toISOString();
		ev.autoClose = !cfg.video.enabled || cfg.video.autoClose;

		if (!same) stopStream();
		st.event = ev;
		save(st);
		scheduleClose(ev);

		if (!same && cfg.video.enabled) {
			if (cam && ringConnected()) {
				if (e2ee) failVideo(ev.id, "Ende-zu-Ende-Verschlüsselung ist in der Ring-App an – dann gibt Ring kein Live-Video heraus.");
				else startStream(ev.id, cam.id);
				fetchSnapshot(ev.id, cam.id, dingId);
			} else if (source === "test") {
				// Ohne Ring-Verbindung: Testbild auf dem Spiegel
				updateEvent(ev.id, (e) => { e.video = { status: "demo" }; });
			} else {
				failVideo(ev.id, "Keine Verbindung zu Ring");
			}
		}
		return publicEvent(load().event);
	}

	function scheduleClose(ev) {
		timers.clearTimeout(closeTimer);
		const ms = Date.parse(ev.until) - now().getTime();
		closeTimer = timers.setTimeout(() => close(ev.id), Math.max(0, ms) + 200);
	}

	// Ereignis beenden (Zeit um, „Jetzt schließen“ im Portal, Neustart)
	function close(eventId) {
		const st = load();
		if (eventId && (!st.event || st.event.id !== eventId)) return false;
		timers.clearTimeout(closeTimer);
		closeTimer = null;
		stopStream();
		const had = !!st.event;
		st.event = null;
		save(st);
		cleanLive();
		return had;
	}

	function failVideo(eventId, message) {
		updateEvent(eventId, (e) => { e.video = { status: "error", message: String(message || "Video nicht verfügbar").slice(0, 200) }; });
		// Kabel-Klingel: statt Video alle paar Sekunden ein Standbild
		const st = load();
		if (st.event && st.event.id === eventId && st.event.power === "wired" && st.event.camera.id && ringConnected()) {
			timers.clearInterval(snapTimer);
			snapTimer = timers.setInterval(() => {
				const cur = load().event;
				if (!cur || cur.id !== eventId) { timers.clearInterval(snapTimer); snapTimer = null; return; }
				fetchSnapshot(eventId, cur.camera.id, "");
			}, SNAPSHOT_EVERY_MS);
		}
	}

	function startStream(eventId, cameraId) {
		const dir = path.join(liveDir, eventId);
		cleanLive();
		fs.mkdirSync(dir, { recursive: true });
		stream = { eventId, cameraId, handle: null };
		Promise.resolve()
			.then(() => ring.startStream(cameraId, dir, { mode: load().config.video.mode }))
			.then((h) => {
				if (!stream || stream.eventId !== eventId) { try { h.stop(); } catch (e) { /* schon zu */ } return; }
				stream.handle = h;
				if (h.onEnded) h.onEnded(() => {
					const cur = load().event;
					if (cur && cur.id === eventId && cur.video.status !== "error") failVideo(eventId, "Die Klingel hat das Video beendet");
				});
				waitForPlaylist(eventId, path.join(dir, "stream.m3u8"));
			})
			.catch((err) => {
				log.warn("[lumira-portal] Klingel-Video:", err && err.message);
				if (stream && stream.eventId === eventId) stream = null;
				failVideo(eventId, "Video konnte nicht starten: " + String((err && err.message) || err).slice(0, 120));
			});
	}

	// HLS ist abspielbar, sobald die Playlist ein erstes Stück enthält
	function waitForPlaylist(eventId, playlist) {
		const started = now().getTime();
		timers.clearInterval(streamWait);
		streamWait = timers.setInterval(() => {
			const cur = load().event;
			if (!cur || cur.id !== eventId) { timers.clearInterval(streamWait); streamWait = null; return; }
			let ready = false;
			try { ready = /#EXTINF/.test(fs.readFileSync(playlist, "utf8")); } catch (e) { ready = false; }
			if (ready) {
				timers.clearInterval(streamWait); streamWait = null;
				updateEvent(eventId, (e) => { e.video = { status: "live", url: "/MMM-Doorbell/live/" + eventId + "/stream.m3u8" }; });
				probeStream(path.dirname(playlist)).then((info) => {
					if (info) updateEvent(eventId, (e) => { if (e.video && e.video.status === "live") e.video.info = info; });
				});
			} else if (now().getTime() - started > STREAM_TIMEOUT_MS) {
				timers.clearInterval(streamWait); streamWait = null;
				stopStream();
				failVideo(eventId, "Die Klingel liefert kein Video (Zeitüberschreitung)");
			}
		}, 400);
	}

	// Erstes Video-Stück mit ffprobe ansehen: „h264 1920×1080, 15 fps“ –
	// hilft, wenn das Bild auf dem Spiegel schwarz bleibt
	function probeStream(dir) {
		return new Promise((resolve) => {
			let seg = "";
			try { seg = (fs.readdirSync(dir).filter((f) => /^seg\d+\.ts$/.test(f)).sort()[0]) || ""; } catch (e) { seg = ""; }
			if (!seg) return resolve("");
			execFile(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,width,height,avg_frame_rate", "-of", "json", path.join(dir, seg)],
				{ timeout: 8000, windowsHide: true }, (err, stdout) => {
					if (err) return resolve("");
					try {
						const st = (JSON.parse(stdout).streams || [])[0];
						if (!st) return resolve("kein Videobild im Stream");
						const fr = String(st.avg_frame_rate || "").split("/");
						const fps = fr.length === 2 && Number(fr[1]) ? Math.round(Number(fr[0]) / Number(fr[1])) : 0;
						resolve(`${st.codec_name || "?"}${st.profile ? " (" + st.profile + ")" : ""} ${st.width}×${st.height}${fps ? ", " + fps + " fps" : ""}`);
					} catch (e) { resolve(""); }
				});
		});
	}

	function stopStream() {
		timers.clearInterval(streamWait); streamWait = null;
		timers.clearInterval(snapTimer); snapTimer = null;
		if (stream && stream.handle) { try { stream.handle.stop(); } catch (e) { /* schon zu */ } }
		stream = null;
	}

	function fetchSnapshot(eventId, cameraId, dingId) {
		if (!ring || !ring.snapshot) return Promise.resolve(null);
		return Promise.resolve()
			.then(() => ring.snapshot(cameraId, { dingId }))
			.then((buf) => {
				if (!buf || !buf.length) return null;
				const cur = load().event;
				if (!cur || cur.id !== eventId) return null;
				const dir = path.join(liveDir, eventId);
				fs.mkdirSync(dir, { recursive: true });
				const name = "snap-" + (++snapCount) + ".jpg";
				fs.writeFileSync(path.join(dir, name), buf);
				const old = cur.snapshot;
				updateEvent(eventId, (e) => { e.snapshot = "/MMM-Doorbell/live/" + eventId + "/" + name; });
				if (old) { try { fs.unlinkSync(path.join(dir, path.basename(old))); } catch (e) { /* weg */ } }
				return name;
			})
			.catch((err) => { log.warn("[lumira-portal] Klingel-Standbild:", err && err.message); return null; });
	}

	function cleanLive() {
		try {
			if (!fs.existsSync(liveDir)) return;
			for (const f of fs.readdirSync(liveDir)) {
				if (stream && f === stream.eventId) continue;
				fs.rmSync(path.join(liveDir, f), { recursive: true, force: true });
			}
		} catch (e) { /* egal */ }
	}

	// Datei für die Portal-Vorschau (nur aus dem Ordner des laufenden Ereignisses)
	function liveFile(eventId, name) {
		if (!EVENT_ID_RE.test(String(eventId)) || !/^(stream\.m3u8|seg[0-9]{1,8}\.ts|snap-[0-9]{1,8}\.jpg)$/.test(String(name))) return null;
		const st = load();
		if (!st.event || st.event.id !== eventId) return null;
		const p = path.join(liveDir, eventId, name);
		return fs.existsSync(p) ? p : null;
	}

	// Portal-Start: ein liegengebliebenes Ereignis (Absturz, Neustart) beenden
	function reset() {
		const st = load();
		if (st.event) { st.event = null; save(st); }
		stopStream();
		cleanLive();
	}

	function shutdown() {
		timers.clearTimeout(closeTimer);
		stopStream();
	}

	// Ring-Adapter nachreichen (er braucht seinerseits trigger als Rückruf)
	function setRing(r) {
		ring = r;
	}

	return { load, view, setConfig, setRing, trigger, close, reset, shutdown, saveSound, removeSound, soundFile, liveFile, statePath, liveDir, soundDir, _stream: () => stream };
}

// Erste Bytes: MP3 (ID3 oder Frame-Sync), WAV (RIFF/WAVE), OGG
function looksLikeAudio(buf) {
	if (!buf || buf.length < 12) return false;
	const a = (x, y) => buf.toString("latin1", x, y);
	if (a(0, 3) === "ID3") return true;
	if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
	if (a(0, 4) === "RIFF" && a(8, 12) === "WAVE") return true;
	if (a(0, 4) === "OggS") return true;
	return false;
}

module.exports = { VIDEO_MODES, MIRROR_REPORT, createDoorbell, cleanConfig, liveDirFor, looksLikeAudio, DoorbellError, DEFAULT_CONFIG, VIDEO_SIZES, POWER_MODES, VIDEO_MIN, VIDEO_MAX, NOTIFY_MIN, NOTIFY_MAX, MANUAL_CAP, SOUND_MAX_BYTES, EVENT_ID_RE };
