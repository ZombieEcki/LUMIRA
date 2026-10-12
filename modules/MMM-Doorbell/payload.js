// MMM-Doorbell – doorbell.json (vom LUMIRA-Portal) → Anzeige-Zustand.
// Eigene Datei, damit der Portal-Test sie ohne MagicMirror prüfen kann.
"use strict";

const fs = require("fs");
const path = require("path");

const EVENT_ID_RE = /^ev_[a-f0-9]{8}$/;
const LIVE_RE = /^\/MMM-Doorbell\/live\/ev_[a-f0-9]{8}\/stream\.m3u8$/;
const SNAP_RE = /^\/MMM-Doorbell\/live\/ev_[a-f0-9]{8}\/snap-[0-9]{1,8}\.jpg$/;
const SIZES = ["small", "medium", "large"];
const STATUSES = ["starting", "live", "error", "demo", "off"];

// Live-Ordner für das HLS-Video – dieselbe Regel wie im Portal
// (lumira-portal/lib/doorbell.js liveDirFor, der Test prüft die Gleichheit)
function liveDirFor(home) {
	if (process.env.LUMIRA_DOORBELL_LIVE) return path.resolve(process.env.LUMIRA_DOORBELL_LIVE);
	if (process.platform === "linux" && fs.existsSync("/dev/shm")) return "/dev/shm/lumira-doorbell";
	return path.join(path.resolve(home), "doorbell", "live");
}

function toPayload(raw, now) {
	const off = { active: false };
	if (!raw || !raw.event || !EVENT_ID_RE.test(raw.event.id)) return off;
	const ev = raw.event;
	const until = Date.parse(ev.until);
	if (!(until > now.getTime())) return off;
	const cfg = raw.config || {};
	const n = cfg.notify || {};
	const s = cfg.sound || {};
	const v = cfg.video || {};
	const vid = ev.video || {};
	const status = STATUSES.indexOf(vid.status) === -1 ? "error" : vid.status;
	const custom = s.source === "custom" && /^sound\.(mp3|wav|ogg)$/.test(s.file || "");
	return {
		active: true,
		id: ev.id,
		rings: Number(ev.rings) || 1,
		at: ev.at,
		notifyUntil: ev.notifyUntil || ev.at,
		until: ev.until,
		autoClose: ev.autoClose !== false,
		camera: String((ev.camera && ev.camera.name) || "Haustür").slice(0, 40),
		test: ev.source === "test",
		notify: { enabled: n.enabled !== false, text: String(n.text || "Es hat geklingelt!").slice(0, 60), glow: n.glow !== false },
		sound: {
			enabled: s.enabled !== false,
			volume: Math.min(100, Math.max(0, Number(s.volume) >= 0 ? Number(s.volume) : 80)),
			url: custom ? "/MMM-Doorbell/sound/" + s.file : null
		},
		video: {
			enabled: v.enabled !== false && status !== "off",
			size: SIZES.indexOf(v.size) === -1 ? "medium" : v.size,
			countdown: v.countdown !== false,
			status,
			url: status === "live" && LIVE_RE.test(vid.url || "") ? vid.url : null,
			message: status === "error" ? String(vid.message || "Video nicht verfügbar").slice(0, 200) : ""
		},
		snapshot: SNAP_RE.test(ev.snapshot || "") ? ev.snapshot : null
	};
}

module.exports = { toPayload, liveDirFor };
