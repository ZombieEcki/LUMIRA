// MMM-Ambient – ambient.json (vom LUMIRA-Portal) → Anzeige-Zustand.
// Eigene Datei, damit der Portal-Test sie ohne MagicMirror prüfen kann.
"use strict";

const FILE_RE = /^md_[a-f0-9]{8}\.(mp4|webm|gif|png|jpg|webp)$/;

function toPayload(raw, now) {
	const off = { enabled: false };
	if (!raw || !raw.enabled) return off;
	if (raw.until && Date.parse(raw.until) <= now.getTime()) return off;
	const mode = raw.mode === "background" ? "background" : "fullscreen";
	let media;
	if (!raw.mediaId || raw.mediaId === "campfire") {
		media = { kind: "campfire" };
	} else {
		const entry = (Array.isArray(raw.media) ? raw.media : []).find((m) => m && m.id === raw.mediaId);
		if (!entry || !FILE_RE.test(entry.file)) return off;
		media = { kind: entry.type === "video" ? "video" : "image", url: "/MMM-Ambient/media/" + entry.file };
	}
	return { enabled: true, mode, sound: !!raw.sound, until: raw.until || null, media };
}

module.exports = { toPayload };
