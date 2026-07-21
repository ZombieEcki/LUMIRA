// LUMIRA – Self-Service-Portal (Express), Port 8092.
//
// Läuft dauerhaft im Hintergrund, sowohl im Heimnetz (FAMILY, siehe
// concept/selfservice.md Abschnitt 4a) als auch während der Ersteinrichtung
// über den eigenen Access Point (SETUP, Abschnitt 3). Derselbe Server, der
// Modus kommt aus lib/mode.js.
"use strict";

const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");

const settingsLib = require("./lib/settings");
const complimentsLib = require("./lib/compliments");
const modeLib = require("./lib/mode");
const netLib = require("./lib/net");
const authLib = require("./lib/auth");
const systemLib = require("./lib/system");
const alarmSoundLib = require("./lib/alarm-sound");
const { generateConfig } = require("./lib/generate-config");
const { getEdition } = require("./lib/editions");

const PORT = Number(process.env.LUMIRA_PORTAL_PORT) || 8092;
const MM_CONFIG_PATH = process.env.LUMIRA_MM_CONFIG || path.join(os.homedir(), "MagicMirror", "config", "config.js");
const SESSION_COOKIE = "lumira_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

const app = express();
app.use(bodyParser.json({ limit: "256kb" }));
app.disable("x-powered-by");

// ---------------------------------------------------------------------------
// Sessions (in-memory, einfacher als eine zusätzliche Abhängigkeit für ein
// LAN-only-Tool mit einer Handvoll Nutzern pro Gerät)
// ---------------------------------------------------------------------------
const sessions = new Map(); // token -> expiresAt

function parseCookies(req) {
	const header = req.headers.cookie;
	const out = {};
	if (!header) return out;
	for (const part of header.split(";")) {
		const idx = part.indexOf("=");
		if (idx === -1) continue;
		out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
	}
	return out;
}

function createSession() {
	const token = crypto.randomBytes(24).toString("hex");
	sessions.set(token, Date.now() + SESSION_TTL_MS);
	return token;
}

function isAuthenticated(req) {
	const token = parseCookies(req)[SESSION_COOKIE];
	if (!token) return false;
	const expires = sessions.get(token);
	if (!expires || expires < Date.now()) {
		sessions.delete(token);
		return false;
	}
	return true;
}

// PIN-Schutz gilt erst, sobald einer gesetzt ist (Ersteinrichtung selbst
// braucht noch keinen), und nie im SETUP-Modus (dort ist der eigene Access
// Point bereits die Sicherheitsgrenze, siehe Abschnitt 6).
function requireAuth(req, res, next) {
	const settings = settingsLib.load();
	const pinSet = !!(settings.portal && settings.portal.pinHash);
	if (!pinSet) return next();
	if (modeLib.get().mode === modeLib.MODES.SETUP) return next();
	if (isAuthenticated(req)) return next();
	res.status(401).json({ error: "Nicht angemeldet" });
}

// ---------------------------------------------------------------------------
// Auth-API
// ---------------------------------------------------------------------------
app.get("/api/auth/status", (req, res) => {
	const settings = settingsLib.load();
	const pinSet = !!(settings.portal && settings.portal.pinHash);
	res.json({ pinSet, authenticated: !pinSet || isAuthenticated(req) });
});

app.post("/api/auth/set-pin", (req, res) => {
	const settings = settingsLib.load();
	const pinSet = !!(settings.portal && settings.portal.pinHash);
	if (pinSet && !isAuthenticated(req)) {
		return res.status(401).json({ error: "Bitte zuerst mit dem aktuellen PIN anmelden" });
	}
	const pin = String((req.body && req.body.pin) || "");
	if (!/^\d{4,8}$/.test(pin)) {
		return res.status(400).json({ error: "PIN muss 4-8 Ziffern haben" });
	}
	const salt = authLib.generateSalt();
	const hash = authLib.hashPin(pin, salt);
	settingsLib.patch({ portal: { pinHash: hash, pinSalt: salt } });
	res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
	const settings = settingsLib.load();
	const pin = String((req.body && req.body.pin) || "");
	if (!authLib.verifyPin(pin, settings.portal.pinHash, settings.portal.pinSalt)) {
		return res.status(401).json({ error: "Falscher PIN" });
	}
	const token = createSession();
	res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`);
	res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
	const token = parseCookies(req)[SESSION_COOKIE];
	if (token) sessions.delete(token);
	res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
	res.json({ ok: true });
});

app.post("/api/auth/remove-pin", requireAuth, (req, res) => {
	settingsLib.patch({ portal: { pinHash: "", pinSalt: "" } });
	const token = parseCookies(req)[SESSION_COOKIE];
	if (token) sessions.delete(token);
	res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
	res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Status (immer ohne Login lesbar – wird u.a. von MMM-LumiraStatus gepollt)
// ---------------------------------------------------------------------------
app.get("/api/status", async (req, res) => {
	const settings = settingsLib.load();
	const mode = modeLib.get();
	const edition = getEdition(settings.edition);
	let connectivity = { online: null, state: "unknown" };
	let ssid = null;
	try {
		[connectivity, ssid] = await Promise.all([netLib.checkConnectivity(), netLib.getActiveSsid()]);
	} catch (err) {
		// nmcli evtl. nicht verfügbar (z.B. lokale Entwicklung außerhalb des Pi)
	}
	res.json({
		mode: mode.mode,
		since: mode.since,
		reason: mode.reason,
		hostname: settings.hostname,
		portalUrl: `http://${settings.hostname}.local:${PORT}`,
		edition: { id: settings.edition, name: edition.name, personLabel: edition.personLabel, flags: {
			hasAlarm: edition.hasAlarm, hasFamily: edition.hasFamily, hasCal: edition.hasCal, hasRain: edition.hasRain
		} },
		network: { ssid, online: connectivity.online, connectivity: connectivity.state },
		// psk wird bewusst mitgeschickt (nur während SETUP-Modus, kein PIN-Schutz
		// auf dieser Route) - MMM-LumiraStatus braucht es für den WLAN-QR-Code auf
		// dem Spiegel (siehe modules/MMM-LumiraStatus/node_helper.js). War bisher
		// vergessen, wodurch der QR-Code nie ein funktionierendes Passwort enthielt.
		ap: mode.mode === modeLib.MODES.SETUP ? { ssid: mode.apSsid, psk: mode.apPsk } : undefined
	});
});

// ---------------------------------------------------------------------------
// Settings-API
// ---------------------------------------------------------------------------
app.get("/api/settings", requireAuth, (req, res) => {
	const settings = settingsLib.load();
	// PIN-Hash/-Salt nie ans Frontend ausliefern.
	const { portal, ...safe } = settings;
	res.json(Object.assign({}, safe, { portal: { pinSet: !!(portal && portal.pinHash) } }));
});

// Ort/Stadt -> Koordinaten (Open-Meteo Geocoding, kostenlos, kein Schlüssel).
// Ersetzt die frühere geocode()-Funktion aus install.sh's Assistenten -
// die Standortsuche gehört jetzt zum Portal (siehe concept/selfservice.md).
app.get("/api/geocode", requireAuth, (req, res) => {
	const query = String(req.query.q || "").trim();
	if (!query) return res.status(400).json({ error: "Suchbegriff fehlt" });
	const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=de&format=json`;
	https.get(url, { timeout: 6000 }, (up) => {
		let body = "";
		up.on("data", (chunk) => (body += chunk));
		up.on("end", () => {
			try {
				const data = JSON.parse(body);
				const results = (data.results || []).map((r) => ({
					name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
					lat: r.latitude,
					lon: r.longitude
				}));
				res.json({ results });
			} catch (err) {
				res.status(502).json({ error: "Antwort der Geocoding-API konnte nicht gelesen werden" });
			}
		});
	}).on("error", (err) => {
		res.status(502).json({ error: `Geocoding nicht erreichbar (kein Internet?): ${err.message}` });
	}).on("timeout", function () { this.destroy(new Error("Zeitüberschreitung")); });
});

app.post("/api/settings", requireAuth, async (req, res) => {
	try {
		const saved = settingsLib.patch(req.body || {});
		regenerateAndRestart(saved);

		const { portal, ...safe } = saved;
		res.json(Object.assign({}, safe, { portal: { pinSet: !!(portal && portal.pinHash) }, restarted: true }));
	} catch (err) {
		const status = err instanceof settingsLib.ValidationError ? 400 : 500;
		res.status(status).json({ error: err.message, field: err.field });
	}
});

// Schreibt config.js aus dem aktuellen settings.json neu, synchronisiert einen
// evtl. hochgeladenen eigenen Alarmton in den Modulordner (der Ton lebt
// dauerhaft in ~/.lumira/sounds/, siehe lib/alarm-sound.js) und startet
// MagicMirror neu. Wird sowohl von POST /api/settings als auch von den
// Alarmton-Upload-/Reset-Routen genutzt.
function regenerateAndRestart(saved) {
	const rendered = generateConfig(saved);
	fs.mkdirSync(path.dirname(MM_CONFIG_PATH), { recursive: true });
	fs.writeFileSync(MM_CONFIG_PATH, rendered, "utf8");
	const mmRoot = path.dirname(path.dirname(MM_CONFIG_PATH));
	alarmSoundLib.syncAlarmSound(mmRoot, saved);
	restartMagicMirror();
}

function restartMagicMirror() {
	const { execFile } = require("child_process");
	execFile("pm2", ["restart", "MagicMirror"], (err) => {
		if (err) console.warn("[lumira-portal] pm2 restart MagicMirror fehlgeschlagen (läuft pm2?):", err.message);
	});
}

// ---------------------------------------------------------------------------
// Eigener Alarmton (Upload/Zurücksetzen) – siehe lib/alarm-sound.js.
// ---------------------------------------------------------------------------
const soundUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post("/api/alarm/sound", requireAuth, soundUpload.single("sound"), (req, res) => {
	const ext = req.file && alarmSoundLib.ALLOWED_MIME[req.file.mimetype];
	if (!req.file || !ext) {
		return res.status(400).json({ error: "Nur mp3/wav/ogg-Dateien bis 5MB erlaubt" });
	}
	try {
		const filename = alarmSoundLib.saveUpload(req.file.buffer, req.file.mimetype);
		const saved = settingsLib.patch({ alarm: { soundFile: filename } });
		regenerateAndRestart(saved);
		res.json({ ok: true, soundFile: filename });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.delete("/api/alarm/sound", requireAuth, (req, res) => {
	try {
		alarmSoundLib.removeCustom();
		const saved = settingsLib.patch({ alarm: { soundFile: "" } });
		regenerateAndRestart(saved);
		res.json({ ok: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// ---------------------------------------------------------------------------
// Systemsteuerung (Punkt "Pi neu starten" auf der Steuerung-Seite).
// ---------------------------------------------------------------------------
app.post("/api/system/reboot", requireAuth, (req, res) => {
	res.json({ ok: true });
	systemLib.reboot().catch((err) => {
		console.warn("[lumira-portal] Neustart fehlgeschlagen:", err.message);
	});
});

// ---------------------------------------------------------------------------
// Sprüche (compliments.json) – MMM-SmartCompliments-Textbausteine.
// Bewusst KEIN pm2-Neustart: das Modul lädt compliments.json selbst per
// fs.watch live nach (siehe modules/MMM-SmartCompliments/node_helper.js).
// ---------------------------------------------------------------------------
app.get("/api/compliments", requireAuth, (req, res) => {
	res.json(complimentsLib.load());
});

app.post("/api/compliments", requireAuth, (req, res) => {
	try {
		res.json(complimentsLib.patch(req.body || {}));
	} catch (err) {
		const status = err instanceof complimentsLib.ValidationError ? 400 : 500;
		res.status(status).json({ error: err.message, field: err.field });
	}
});

// ---------------------------------------------------------------------------
// WLAN (Phase 2/3)
// ---------------------------------------------------------------------------
app.get("/api/wifi/scan", requireAuth, async (req, res) => {
	try {
		const networks = await netLib.scanWifi();
		res.json({ networks });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.post("/api/wifi/connect", requireAuth, async (req, res) => {
	const { ssid, psk } = req.body || {};
	if (!ssid) return res.status(400).json({ error: "SSID fehlt" });
	try {
		const result = await netLib.connectWifi(ssid, psk);
		if (!result.ok) return res.status(502).json({ error: "Verbindung hergestellt, aber SSID stimmt nicht überein" });
		settingsLib.patch({ network: { homeSsid: ssid, homePsk: psk || "", mode: "family" } });
		modeLib.set(modeLib.MODES.FAMILY, { reason: "wifi-connected" });
		await netLib.stopHotspot().catch(() => {});
		res.json({ ok: true, ssid: result.ssid });
	} catch (err) {
		res.status(502).json({ error: err.message });
	}
});

app.post("/api/setup-mode", requireAuth, async (req, res) => {
	try {
		const settings = settingsLib.load();
		let apSsid = settings.network.apSsid || "LUMIRA-Setup";
		let apPsk = settings.network.apPsk;
		if (!apPsk) {
			apPsk = netLib.generatePassword(12);
			settingsLib.patch({ network: { apSsid, apPsk } });
		}
		await netLib.startHotspot(apSsid, apPsk);
		modeLib.set(modeLib.MODES.SETUP, { reason: "manual", apSsid, apPsk });
		res.json({ ok: true, apSsid });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.post("/api/setup-mode/exit", async (req, res) => {
	// Absichtlich ohne requireAuth: relevant genau dann, wenn man sich noch
	// IM Setup-Modus befindet (siehe Abschnitt 6 – dort gibt es keinen PIN-
	// Schutz, der AP selbst ist die Grenze).
	if (modeLib.get().mode !== modeLib.MODES.SETUP) {
		return res.status(409).json({ error: "Nicht im Setup-Modus" });
	}
	try {
		await netLib.stopHotspot();
		modeLib.set(modeLib.MODES.FAMILY, { reason: "manual-exit" });
		res.json({ ok: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// ---------------------------------------------------------------------------
// Proxy zu den bestehenden Webhook-Servern (Steuerung-Seite) – bewusst eine
// feste Whitelist statt eines offenen Proxys (SSRF-Vermeidung).
// ---------------------------------------------------------------------------
const PROXY_ROUTES = {
	"alarm/home": { port: 8090, path: "/home" },
	"alarm/clear": { port: 8090, path: "/clear" },
	"alarm/test": { port: 8090, path: "/alarm?keyword=Testalarm&unit=Portal-Test" },
	"alarm/health": { port: 8090, path: "/apager/health" },
	"compliments/on": { port: 8091, path: "/compliments/on" },
	"compliments/off": { port: 8091, path: "/compliments/off" },
	"compliments/toggle": { port: 8091, path: "/compliments/toggle" },
	"compliments/status": { port: 8091, path: "/compliments/status" }
};

app.post("/api/proxy/:group/:action", requireAuth, (req, res) => {
	forwardProxy(req, res);
});
app.get("/api/proxy/:group/:action", requireAuth, (req, res) => {
	forwardProxy(req, res);
});

function forwardProxy(req, res) {
	const key = `${req.params.group}/${req.params.action}`;
	const route = PROXY_ROUTES[key];
	if (!route) return res.status(404).json({ error: "Unbekannte Aktion" });
	const upstream = http.get({ host: "127.0.0.1", port: route.port, path: route.path, timeout: 5000 }, (up) => {
		let body = "";
		up.on("data", (chunk) => (body += chunk));
		up.on("end", () => res.status(up.statusCode || 200).type(up.headers["content-type"] || "application/json").send(body));
	});
	upstream.on("timeout", () => upstream.destroy(new Error("Zeitüberschreitung")));
	upstream.on("error", (err) => res.status(502).json({ error: `Modul auf Port ${route.port} nicht erreichbar: ${err.message}` }));
}

// ---------------------------------------------------------------------------
// Statische Portal-Oberfläche + Captive-Portal-Catch-all (Abschnitt 3: iOS/
// Android fragen beim Verbinden mit dem Setup-WLAN verschiedene bekannte
// Pfade ab, z.B. /generate_204, /hotspot-detect.html – die sollen alle auf
// die Portal-Seite landen statt auf einen 404).
// ---------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

app.use((req, res, next) => {
	if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
	if (modeLib.get().mode === modeLib.MODES.SETUP) {
		return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
	}
	next();
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	console.error("[lumira-portal]", err);
	res.status(500).json({ error: "Interner Fehler" });
});

if (require.main === module) {
	app.listen(PORT, "0.0.0.0", () => {
		console.log(`[lumira-portal] läuft auf Port ${PORT} (Modus: ${modeLib.get().mode})`);
	});
}

module.exports = app;
