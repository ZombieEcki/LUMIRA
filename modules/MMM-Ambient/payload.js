// MMM-Ambient – ambient.json (vom LUMIRA-Portal) → Anzeige-Zustand.
// Eigene Datei, damit der Portal-Test sie ohne MagicMirror prüfen kann.
"use strict";

const FILE_RE = /^md_[a-f0-9]{8}\.(mp4|webm|gif|png|jpg|webp)$/;
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

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
		if (!entry) return off;
		if (entry.type === "youtube") {
			if (!YT_ID_RE.test(entry.youtubeId)) return off;
			media = { kind: "youtube", videoId: entry.youtubeId, start: Math.max(0, Math.floor(Number(entry.start) || 0)) };
		} else {
			if (!FILE_RE.test(entry.file)) return off;
			media = { kind: entry.type === "video" ? "video" : "image", url: "/MMM-Ambient/media/" + entry.file };
		}
	}
	return { enabled: true, mode, sound: !!raw.sound, until: raw.until || null, media };
}

// Einbett-Adresse für YouTube: stumm (außer Ton an), Endlosschleife, ohne
// Bedienelemente, datensparsame Domain youtube-nocookie.com
function youtubeEmbedUrl(media, sound) {
	const p = new URLSearchParams({
		autoplay: "1",
		mute: sound ? "0" : "1",
		loop: "1",
		playlist: media.videoId, // nötig, damit "loop" bei einem einzelnen Video greift
		controls: "0",
		disablekb: "1",
		fs: "0",
		iv_load_policy: "3",
		modestbranding: "1",
		playsinline: "1",
		rel: "0"
	});
	if (media.start) p.set("start", String(media.start));
	return "https://www.youtube-nocookie.com/embed/" + media.videoId + "?" + p.toString();
}

module.exports = { toPayload, youtubeEmbedUrl };
