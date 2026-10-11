// LUMIRA – Dauerschleife auf dem Spiegel („Bildschirm“ im Bereich Spiegel).
//
// Zustand und Mediathek liegen in ~/.lumira/ambient.json, die Dateien in
// ~/.lumira/media/. Nur das Portal schreibt (atomar per .tmp + rename),
// MMM-Ambient liest und reagiert per fs.watch sofort – kein Neustart von
// MagicMirror nötig. Eingebaut ist ein gezeichnetes Lagerfeuer (keine Datei).
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const BUILTINS = [{ id: "campfire", name: "Lagerfeuer", type: "builtin" }];
const MODES = ["fullscreen", "background"];
// YouTube-Auflösung: der Player läuft so groß und wird nur optisch
// hochskaliert – sonst liefert YouTube für Spiegelgröße 1440p/4K, und der Pi ruckelt
const YT_QUALITIES = ["360", "480", "720", "1080"];
const MAX_MEDIA = 20;
const MAX_BYTES = 300 * 1024 * 1024;
const MAX_MINUTES = 12 * 60;
const MEDIA_ID_RE = /^md_[a-f0-9]{8}$/;

const DEFAULT_STATE = {
	version: 1,
	enabled: false,
	mediaId: "campfire",
	mode: "fullscreen",
	sound: false,
	ytQuality: "480",
	until: null,
	media: []
};

class AmbientError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

// Dateityp an den ersten Bytes erkennen – die Endung allein reicht nicht.
function sniff(buf) {
	if (!buf || buf.length < 12) return null;
	const ascii = (a, b) => buf.toString("latin1", a, b);
	if (ascii(4, 8) === "ftyp") return { type: "video", ext: "mp4", mime: "video/mp4" };
	if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { type: "video", ext: "webm", mime: "video/webm" };
	if (ascii(0, 4) === "GIF8") return { type: "image", ext: "gif", mime: "image/gif" };
	if (buf[0] === 0x89 && ascii(1, 4) === "PNG") return { type: "image", ext: "png", mime: "image/png" };
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image", ext: "jpg", mime: "image/jpeg" };
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image", ext: "webp", mime: "image/webp" };
	return null;
}

// ---------------------------------------------------------------------------
// GIF → MP4: GIFs muss der Browser Bild für Bild auf dem Prozessor entpacken
// und hochrechnen – auf dem Raspberry Pi 3 ruckelt das. Als H.264-Video läuft
// dieselbe Animation flüssig und ist meist viel kleiner. Braucht ffmpeg.
// ---------------------------------------------------------------------------
const FFMPEG = process.env.LUMIRA_FFMPEG || "ffmpeg";
let ffmpegChecked = null;

function hasFfmpeg(bin = FFMPEG) {
	if (ffmpegChecked && bin === FFMPEG) return ffmpegChecked;
	const p = new Promise((resolve) => {
		execFile(bin, ["-version"], { timeout: 10000, windowsHide: true }, (err) => resolve(!err));
	});
	if (bin === FFMPEG) ffmpegChecked = p;
	return p;
}

function gifToMp4(input, output, bin = FFMPEG) {
	return new Promise((resolve, reject) => {
		execFile(bin, [
			"-y", "-hide_banner", "-loglevel", "error",
			"-i", input,
			// gerade Maße (H.264), höchstens 1280 px breit
			"-vf", "scale='trunc(min(1280,iw)/2)*2':-2:flags=lanczos",
			"-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
			"-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
			output
		], { timeout: 5 * 60 * 1000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) return reject(new Error(String(stderr || err.message).trim().split("\n").pop() || "ffmpeg fehlgeschlagen"));
			resolve(output);
		});
	});
}

// ---------------------------------------------------------------------------
// YouTube: Link → Video-ID (+ Startsekunde). Erlaubt watch?v=, youtu.be/,
// shorts/, live/, embed/ – auch mit youtube-nocookie.com und m.youtube.com.
// ---------------------------------------------------------------------------
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"];

function parseStart(t) {
	if (!t) return 0;
	const s = String(t);
	if (/^[0-9]+$/.test(s)) return Math.min(Number(s), 86400);
	const m = /^(?:([0-9]+)h)?(?:([0-9]+)m)?(?:([0-9]+)s)?$/.exec(s);
	if (!m) return 0;
	return Math.min((Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0), 86400);
}

function parseYouTube(input) {
	let u;
	try { u = new URL(String(input || "").trim()); } catch (e) { return null; }
	if (["http:", "https:"].indexOf(u.protocol) === -1 || YT_HOSTS.indexOf(u.hostname.toLowerCase()) === -1) return null;
	let id = "";
	const parts = u.pathname.split("/").filter(Boolean);
	if (u.hostname.toLowerCase() === "youtu.be") id = parts[0] || "";
	else if (parts[0] === "watch") id = u.searchParams.get("v") || "";
	else if (["shorts", "live", "embed", "v"].indexOf(parts[0]) !== -1) id = parts[1] || "";
	if (!YT_ID_RE.test(id)) return null;
	return { id, start: parseStart(u.searchParams.get("t") || u.searchParams.get("start")) };
}

// Gültiger Mediathek-Eintrag: Datei mit sicherem Namen oder YouTube-Video
function validEntry(m) {
	if (!m || !MEDIA_ID_RE.test(m.id)) return false;
	if (m.type === "youtube") return YT_ID_RE.test(m.youtubeId);
	return /^[a-z0-9_.]+$/.test(m.file || "");
}

function readHead(file, n) {
	const fd = fs.openSync(file, "r");
	try {
		const buf = Buffer.alloc(n);
		const read = fs.readSync(fd, buf, 0, n, 0);
		return buf.subarray(0, read);
	} finally {
		fs.closeSync(fd);
	}
}

function cleanName(name, fallback) {
	let s = String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
	if (s.length > 40) {
		// am Wortende kürzen statt mitten im Wort („… (Official Video)“)
		const cut = s.slice(0, 39);
		const space = cut.lastIndexOf(" ");
		s = (space > 20 ? cut.slice(0, space) : cut).replace(/[\s\-–(]+$/, "") + "…";
	}
	return s || fallback;
}

function createAmbient({ home, now = () => new Date() } = {}) {
	home = path.resolve(home); // absolut, sonst lehnt res.sendFile ab
	const statePath = path.join(home, "ambient.json");
	const mediaDir = path.join(home, "media");

	function load() {
		try {
			const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
			const st = Object.assign({}, DEFAULT_STATE, raw);
			st.media = Array.isArray(raw.media) ? raw.media.filter(validEntry) : [];
			if (MODES.indexOf(st.mode) === -1) st.mode = "fullscreen";
			if (!findMedia(st, st.mediaId)) st.mediaId = "campfire";
			return st;
		} catch (e) {
			return JSON.parse(JSON.stringify(DEFAULT_STATE));
		}
	}

	function save(st) {
		fs.mkdirSync(home, { recursive: true });
		st.updatedAt = now().toISOString();
		const tmp = statePath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
		fs.renameSync(tmp, statePath);
		return st;
	}

	function findMedia(st, id) {
		return BUILTINS.find((b) => b.id === id) || st.media.find((m) => m.id === id) || null;
	}

	// Abgelaufener Timer zählt als aus
	function isExpired(st, t) {
		return !!(st.until && Date.parse(st.until) <= t.getTime());
	}

	function view() {
		const st = load();
		const t = now();
		const enabled = st.enabled && !isExpired(st, t);
		return {
			enabled,
			mediaId: st.mediaId,
			mode: st.mode,
			sound: !!st.sound,
			ytQuality: YT_QUALITIES.indexOf(String(st.ytQuality)) === -1 ? "480" : String(st.ytQuality),
			until: enabled ? st.until : null,
			limits: { maxMedia: MAX_MEDIA, maxBytes: MAX_BYTES },
			media: BUILTINS.map((b) => Object.assign({}, b))
				.concat(st.media.map((m) => ({ id: m.id, name: m.name, type: m.type, size: m.size, addedAt: m.addedAt, youtubeId: m.youtubeId, start: m.start })))
		};
	}

	// patch: { enabled?, mediaId?, mode?, sound?, minutes? } – minutes 0/null = kein Timer
	function setState(patch) {
		const st = load();
		const p = patch || {};
		if (p.mediaId !== undefined) {
			if (!findMedia(st, p.mediaId)) throw new AmbientError("Unbekanntes Medium");
			st.mediaId = p.mediaId;
		}
		if (p.mode !== undefined) {
			if (MODES.indexOf(p.mode) === -1) throw new AmbientError("Darstellung muss Vollbild oder Hintergrund sein");
			st.mode = p.mode;
		}
		if (p.sound !== undefined) st.sound = !!p.sound;
		if (p.ytQuality !== undefined) {
			if (YT_QUALITIES.indexOf(String(p.ytQuality)) === -1) throw new AmbientError("YouTube-Qualität: 360, 480, 720 oder 1080");
			st.ytQuality = String(p.ytQuality);
		}
		if (p.enabled !== undefined) st.enabled = !!p.enabled;
		if (p.minutes !== undefined) {
			const m = p.minutes === null ? 0 : Number(p.minutes);
			if (!Number.isInteger(m) || m < 0 || m > MAX_MINUTES) throw new AmbientError("Timer zwischen 0 und 12 Stunden");
			st.until = m ? new Date(now().getTime() + m * 60000).toISOString() : null;
		}
		if (!st.enabled) st.until = null;
		save(st);
		return view();
	}

	// Vom Portal-Takt jede Minute: abgelaufenen Timer wirklich ausschalten
	function expire() {
		const st = load();
		if (st.enabled && isExpired(st, now())) {
			st.enabled = false;
			st.until = null;
			save(st);
			return true;
		}
		return false;
	}

	// tmpPath: von multer abgelegte Datei. Wird geprüft und verschoben oder gelöscht.
	function addMedia({ tmpPath, originalName, name, size }) {
		const st = load();
		try {
			if (st.media.length >= MAX_MEDIA) throw new AmbientError(`Höchstens ${MAX_MEDIA} eigene Medien – bitte erst eines löschen`);
			if (size > MAX_BYTES) throw new AmbientError("Datei zu groß (höchstens 300 MB)", 413);
			const kind = sniff(readHead(tmpPath, 16));
			if (!kind) throw new AmbientError("Nur Videos (MP4, WebM) und Bilder (JPG, PNG, GIF, WebP)");
			const id = "md_" + crypto.randomBytes(4).toString("hex");
			const file = id + "." + kind.ext;
			fs.mkdirSync(mediaDir, { recursive: true });
			fs.renameSync(tmpPath, path.join(mediaDir, file));
			const entry = {
				id, file, type: kind.type, mime: kind.mime,
				name: cleanName(name || originalName, kind.type === "video" ? "Video" : "Bild"),
				size: Number(size) || fs.statSync(path.join(mediaDir, file)).size,
				addedAt: now().toISOString()
			};
			st.media.push(entry);
			save(st);
			return entry;
		} catch (err) {
			try { fs.unlinkSync(tmpPath); } catch (e) { /* schon weg */ }
			throw err;
		}
	}

	function removeMedia(id) {
		const st = load();
		const entry = st.media.find((m) => m.id === id);
		if (!entry) throw new AmbientError("Medium nicht gefunden", 404);
		st.media = st.media.filter((m) => m.id !== id);
		if (st.mediaId === id) {
			// Lief gerade: zurück aufs Lagerfeuer, ausgeschaltet
			st.mediaId = "campfire";
			st.enabled = false;
			st.until = null;
		}
		save(st);
		if (entry.file) { try { fs.unlinkSync(path.join(mediaDir, entry.file)); } catch (e) { /* schon weg */ } }
		return view();
	}

	// YouTube-Video als Medium (kein Upload, läuft auf dem Spiegel per Einbettung)
	function addYouTube({ url, name }) {
		const st = load();
		if (st.media.length >= MAX_MEDIA) throw new AmbientError(`Höchstens ${MAX_MEDIA} eigene Medien – bitte erst eines löschen`);
		const yt = parseYouTube(url);
		if (!yt) throw new AmbientError("Das ist kein YouTube-Link (z. B. https://www.youtube.com/watch?v=… oder https://youtu.be/…)");
		const entry = {
			id: "md_" + crypto.randomBytes(4).toString("hex"),
			type: "youtube",
			youtubeId: yt.id,
			start: yt.start || 0,
			name: cleanName(name, "YouTube-Video"),
			addedAt: now().toISOString()
		};
		st.media.push(entry);
		save(st);
		return entry;
	}

	function mediaFile(id) {
		if (!MEDIA_ID_RE.test(String(id))) return null;
		const entry = load().media.find((m) => m.id === id);
		return entry && entry.file ? { path: path.join(mediaDir, entry.file), mime: entry.mime } : null;
	}

	return { load, view, setState, expire, addMedia, addYouTube, removeMedia, mediaFile, mediaDir, statePath };
}

// Hochgeladene Datei vorbereiten: GIF nach Möglichkeit in MP4 umwandeln.
// Liefert { tmpPath, originalName, size, converted, note }.
async function prepareUpload({ tmpPath, originalName, size }, opts = {}) {
	const bin = opts.ffmpeg || FFMPEG;
	let kind = null;
	try { kind = sniff(readHead(tmpPath, 16)); } catch (e) { kind = null; }
	if (!kind || kind.ext !== "gif") return { tmpPath, originalName, size, converted: false };
	if (!(await hasFfmpeg(bin))) {
		return { tmpPath, originalName, size, converted: false, note: "GIFs laufen auf dem Raspberry Pi oft ruckelig. Für flüssige Wiedergabe als MP4 hochladen (oder ffmpeg installieren: sudo apt install ffmpeg)." };
	}
	const out = tmpPath + ".mp4";
	try {
		await gifToMp4(tmpPath, out, bin);
		try { fs.unlinkSync(tmpPath); } catch (e) { /* egal */ }
		return { tmpPath: out, originalName: String(originalName || "Animation").replace(/\.gif$/i, "") + ".mp4", size: fs.statSync(out).size, converted: true };
	} catch (err) {
		try { fs.unlinkSync(out); } catch (e) { /* nichts angelegt */ }
		return { tmpPath, originalName, size, converted: false, note: "Umwandeln in ein Video hat nicht geklappt (" + err.message.slice(0, 120) + ") – das GIF wird direkt verwendet und kann ruckeln." };
	}
}

module.exports = { YT_QUALITIES, createAmbient, sniff, parseYouTube, prepareUpload, hasFfmpeg, gifToMp4, AmbientError, BUILTINS, MAX_BYTES, MAX_MEDIA, MEDIA_ID_RE };
