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

const BUILTINS = [{ id: "campfire", name: "Lagerfeuer", type: "builtin" }];
const MODES = ["fullscreen", "background"];
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
	const s = String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
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
			st.media = Array.isArray(raw.media) ? raw.media.filter((m) => m && MEDIA_ID_RE.test(m.id) && /^[a-z0-9_.]+$/.test(m.file)) : [];
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
			until: enabled ? st.until : null,
			limits: { maxMedia: MAX_MEDIA, maxBytes: MAX_BYTES },
			media: BUILTINS.map((b) => Object.assign({}, b))
				.concat(st.media.map((m) => ({ id: m.id, name: m.name, type: m.type, size: m.size, addedAt: m.addedAt })))
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
		try { fs.unlinkSync(path.join(mediaDir, entry.file)); } catch (e) { /* schon weg */ }
		return view();
	}

	function mediaFile(id) {
		if (!MEDIA_ID_RE.test(String(id))) return null;
		const entry = load().media.find((m) => m.id === id);
		return entry ? { path: path.join(mediaDir, entry.file), mime: entry.mime } : null;
	}

	return { load, view, setState, expire, addMedia, removeMedia, mediaFile, mediaDir, statePath };
}

module.exports = { createAmbient, sniff, AmbientError, BUILTINS, MAX_BYTES, MAX_MEDIA, MEDIA_ID_RE };
