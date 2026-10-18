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
const fs = require("fs");
const multer = require("multer");

const settingsLib = require("./lib/settings");
const complimentsLib = require("./lib/compliments");
const familyplanLib = require("./lib/familyplan");
const modeLib = require("./lib/mode");
const netLib = require("./lib/net");
const authLib = require("./lib/auth");
const systemLib = require("./lib/system");
const alarmSoundLib = require("./lib/alarm-sound");
const { generateConfig } = require("./lib/generate-config");
const { getEdition } = require("./lib/editions");
const { createUpdater } = require("./lib/updates");
const { createSessionStore } = require("./lib/sessions");
const ambientLib = require("./lib/ambient");
const doorbellLib = require("./lib/doorbell");
const ringLib = require("./lib/ring");
const weatherLib = require("./lib/weather");

const PORT = Number(process.env.LUMIRA_PORTAL_PORT) || 8092;
const MM_CONFIG_PATH = process.env.LUMIRA_MM_CONFIG || path.join(os.homedir(), "MagicMirror", "config", "config.js");
const SESSION_COOKIE = "lumira_session";
const MM_PORT = Number(process.env.LUMIRA_MM_PORT) || 8080;

const app = express();
// 256 KB reichen überall – außer beim Import einer Familienplan-Sicherung
// (Fotos als Data-URL), die hat unten einen eigenen, größeren Parser.
const IMPORT_PATH = "/api/familyplan/import";
const jsonParser = bodyParser.json({ limit: "256kb" });
app.use((req, res, next) => (req.path === IMPORT_PATH ? next() : jsonParser(req, res, next)));
app.disable("x-powered-by");

// ---------------------------------------------------------------------------
// Sessions (lib/sessions.js, als Hash in ~/.lumira/sessions.json, damit ein
// Neustart des Portals die App auf dem Handy nicht abmeldet)
// ---------------------------------------------------------------------------
const sessions = createSessionStore({ filePath: path.join(settingsLib.LUMIRA_HOME, "sessions.json") });

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

function isAuthenticated(req) {
	return sessions.check(parseCookies(req)[SESSION_COOKIE]);
}

function clearSessionCookie(res) {
	res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
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
	// Neuer PIN → alle anderen Geräte müssen sich neu anmelden. Dieses Gerät
	// bekommt eine frische Sitzung (sonst stünde es nach dem ersten PIN
	// plötzlich ohne Anmeldung da).
	sessions.clear();
	const { token, maxAgeSec } = sessions.create(true);
	res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`);
	res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
	const settings = settingsLib.load();
	const pin = String((req.body && req.body.pin) || "");
	if (!authLib.verifyPin(pin, settings.portal.pinHash, settings.portal.pinSalt)) {
		return res.status(401).json({ error: "Falscher PIN" });
	}
	const { token, maxAgeSec } = sessions.create(!!(req.body && req.body.remember));
	res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`);
	res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
	sessions.remove(parseCookies(req)[SESSION_COOKIE]);
	clearSessionCookie(res);
	res.json({ ok: true });
});

// Angemeldete Geräte (Seite „Sicherheit“): Anzahl und „alle anderen abmelden“
app.get("/api/auth/sessions", requireAuth, (req, res) => {
	res.json({ count: sessions.count() });
});

app.post("/api/auth/logout-others", requireAuth, (req, res) => {
	sessions.clear(parseCookies(req)[SESSION_COOKIE]);
	res.json({ ok: true, count: sessions.count() });
});

app.post("/api/auth/remove-pin", requireAuth, (req, res) => {
	settingsLib.patch({ portal: { pinHash: "", pinSalt: "" } });
	sessions.clear();
	clearSessionCookie(res);
	res.json({ ok: true });
});

// IPv4-Adressen des Geräts (ohne Loopback), WLAN/LAN zuerst. Für die
// Info-Seite – viele Android-Handys lösen <name>.local nicht auf, die
// Portal-Adresse per IP funktioniert immer.
function localIpv4() {
	const out = [];
	const ifaces = os.networkInterfaces();
	for (const name of Object.keys(ifaces)) {
		for (const addr of ifaces[name] || []) {
			const v4 = addr.family === "IPv4" || addr.family === 4;
			// Virtuelle Adapter (Docker, VPN-Brücken, WSL …) interessieren hier nicht
			const virtual = /^(docker|veth|br-|virbr|vEthernet|vmnet|tailscale|zt)/i.test(name);
			if (v4 && !addr.internal && !virtual) out.push({ iface: name, address: addr.address });
		}
	}
	const rank = (n) => (/^wlan|^wl/i.test(n) ? 0 : /^eth|^en/i.test(n) ? 1 : 2);
	return out.sort((a, b) => rank(a.iface) - rank(b.iface));
}

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
		network: { ssid, online: connectivity.online, connectivity: connectivity.state, ipv4: localIpv4() },
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
		syncDoorbell(saved);
		weather.setLocation(saved.location);

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
function complimentsView() {
	return Object.assign(complimentsLib.load(), { report: complimentsLib.report() });
}

function complimentsAction(res, fn) {
	try {
		fn();
		res.json(complimentsView());
	} catch (err) {
		const status = err instanceof complimentsLib.ValidationError ? 400 : 500;
		if (status === 500) console.error("[lumira-portal] Sprüche:", err);
		res.status(status).json({ error: status === 500 ? "Interner Fehler" : err.message, field: err.field });
	}
}

app.get("/api/compliments", requireAuth, (req, res) => {
	res.json(complimentsView());
});

app.post("/api/compliments", requireAuth, (req, res) => {
	complimentsAction(res, () => complimentsLib.patch(req.body || {}));
});

// Sicherung: alle Sprüche und Einstellungen als Datei bzw. zurückspielen
app.get("/api/compliments/export", requireAuth, (req, res) => {
	const stamp = new Date().toISOString().slice(0, 10);
	res.setHeader("Content-Disposition", `attachment; filename="lumira-sprueche-${stamp}.json"`);
	res.type("application/json").send(JSON.stringify(complimentsLib.load(), null, 2));
});

app.post("/api/compliments/import", requireAuth, (req, res) => {
	complimentsAction(res, () => complimentsLib.importAll(req.body));
});

// CSV: Feuerwehr-Kategorien nur in der Feuerwehr-Ausgabe mit eingeschaltetem Alarm
function complimentsFlags() {
	const settings = settingsLib.load();
	return { alarm: !!getEdition(settings.edition).hasAlarm && !(settings.modules && settings.modules.alarm === false) };
}

app.get("/api/compliments/csv", requireAuth, (req, res) => {
	const stamp = new Date().toISOString().slice(0, 10);
	res.setHeader("Content-Disposition", `attachment; filename="lumira-sprueche-${stamp}.csv"`);
	res.type("text/csv; charset=utf-8").send(complimentsLib.exportCsv(complimentsFlags()));
});

// Body: { text, mode: "add" | "replace", createOwn, dryRun } → Vorschau bzw. übernommen
app.post("/api/compliments/csv", requireAuth, (req, res) => {
	try {
		const b = req.body || {};
		const result = complimentsLib.importCsv(String(b.text || ""), {
			mode: b.mode === "replace" ? "replace" : "add",
			createOwn: b.createOwn !== false,
			dryRun: !!b.dryRun,
			flags: complimentsFlags()
		});
		res.json(Object.assign(result, result.applied ? { data: complimentsView() } : {}));
	} catch (err) {
		const status = err instanceof complimentsLib.ValidationError ? 400 : 500;
		if (status === 500) console.error("[lumira-portal] Sprüche-CSV:", err);
		res.status(status).json({ error: status === 500 ? "Interner Fehler" : err.message });
	}
});

// ---------------------------------------------------------------------------
// Familienplan (familyplan.json) – siehe concept/familienplan.md.
// Bewusst KEIN pm2-Neustart: MMM-FamilyPlan lädt die Datei per fs.watch live
// nach. Nur das Ein-/Ausschalten des Moduls läuft über POST /api/settings.
// Jede schreibende Route schickt die gelesene "revision" mit; ist sie
// veraltet (zweites Handy hat inzwischen gespeichert), kommt 409 + aktueller
// Stand zurück.
// ---------------------------------------------------------------------------
const MM_ROOT = path.dirname(path.dirname(MM_CONFIG_PATH));
// Preset-Avatare liefert das Modul mit (install.sh kopiert es nach
// ~/MagicMirror/modules/). Beim Entwickeln im Repo liegt es daneben.
const PRESET_AVATAR_DIR = [
	process.env.LUMIRA_AVATAR_DIR,
	path.join(MM_ROOT, "modules", "MMM-FamilyPlan", "avatars"),
	path.join(__dirname, "..", "modules", "MMM-FamilyPlan", "avatars")
].filter(Boolean).find((dir) => fs.existsSync(dir));
// Symbole und Hintergrundbilder der Wetteranzeige (für die Vorschau)
const WEATHER_MODULE_DIR = [
	path.join(MM_ROOT, "modules", "MMM-LumiraWeather"),
	path.join(__dirname, "..", "modules", "MMM-LumiraWeather")
].find((dir) => fs.existsSync(path.join(dir, "icons")));
const PRESET_FILE_RE = /^(adult|child)-\d{2}\.jpg$/;
const MEMBER_ID_RE = /^m_[a-z0-9]{4,12}$/;
const AVATAR_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function ensureWeekSafe() {
	try {
		familyplanLib.ensureCurrentWeek(new Date());
	} catch (err) {
		console.error("[lumira-portal] Wochenwechsel Familienplan fehlgeschlagen:", err.message);
	}
}

function familyplanError(res, err) {
	if (err instanceof familyplanLib.ConflictError) {
		return res.status(409).json({ error: err.message, conflict: true, plan: familyplanLib.view(new Date()) });
	}
	const status = err instanceof familyplanLib.ValidationError ? 400 : 500;
	if (status === 500) console.error("[lumira-portal] Familienplan:", err);
	res.status(status).json({ error: err.message, field: err.field });
}

// Führt eine Änderung aus, legt danach ggf. die laufende Woche an (z. B.
// nach dem ersten Anlegen der Mitglieder) und liefert die frische Ansicht.
// "after" darf Zusatzfelder für die Antwort liefern (z. B. restarted).
function familyplanAction(res, fn, after) {
	try {
		fn(new Date());
		ensureWeekSafe();
		const extra = after ? after() : null;
		res.json(Object.assign(familyplanLib.view(new Date()), extra || {}));
	} catch (err) {
		familyplanError(res, err);
	}
}

// Geburtstage auf der Seite „Wichtige Termine“ sind mit Familienmitgliedern
// verknüpft (memberId). Wird jemand umbenannt, zieht der Name mit; wird
// jemand entfernt, bleibt der Geburtstag mit dem letzten Namen stehen.
// Nur wenn sich dabei etwas ändert, wird config.js neu erzeugt (Neustart).
function syncBirthdayNames() {
	const settings = settingsLib.load();
	const birthdays = (settings.family && settings.family.birthdays) || [];
	const members = familyplanLib.load().members;
	let changed = false;
	const next = birthdays.map((b) => {
		if (!b || !b.memberId) return b;
		const m = members.find((x) => x.id === b.memberId);
		if (!m || m.deleted) { changed = true; return { name: b.name, date: b.date }; }
		if (m.name !== b.name) { changed = true; return Object.assign({}, b, { name: m.name }); }
		return b;
	});
	if (!changed) return null;
	const saved = settingsLib.patch({ family: { birthdays: next } });
	regenerateAndRestart(saved);
	return { restarted: true };
}

app.get("/api/familyplan", requireAuth, (req, res) => {
	ensureWeekSafe();
	res.json(familyplanLib.view(new Date()));
});

app.put("/api/familyplan/members", requireAuth, (req, res) => {
	const body = req.body || {};
	familyplanAction(res, (now) => familyplanLib.setMembers(body.revision, body.members, now), syncBirthdayNames);
});

app.put("/api/familyplan/duties", requireAuth, (req, res) => {
	const body = req.body || {};
	familyplanAction(res, (now) => familyplanLib.setDuties(body.revision, body.duties, now));
});

app.put("/api/familyplan/settings", requireAuth, (req, res) => {
	const body = req.body || {};
	familyplanAction(res, (now) => familyplanLib.setSettings(body.revision, body.settings, now));
});

app.post("/api/familyplan/weeks/:start/assign", requireAuth, (req, res) => {
	const body = req.body || {};
	familyplanAction(res, (now) => familyplanLib.assign(body.revision, req.params.start, String(body.memberId || ""), Number(body.slot), String(body.dutyId || ""), now));
});

app.post("/api/familyplan/weeks/:start/day", requireAuth, (req, res) => {
	const body = req.body || {};
	familyplanAction(res, (now) => familyplanLib.assignDay(body.revision, req.params.start, String(body.dutyId || ""), String(body.date || ""), String(body.memberId || ""), now));
});

app.post("/api/familyplan/weeks/:start/reset", requireAuth, (req, res) => {
	const body = req.body || {};
	familyplanAction(res, (now) => familyplanLib.resetWeek(body.revision, req.params.start, now));
});

// scope "future": alle geplanten Änderungen an kommenden Wochen verwerfen.
// scope "current": laufende Woche neu berechnen (nur mit confirm: true).
app.post("/api/familyplan/regenerate", requireAuth, (req, res) => {
	const body = req.body || {};
	if (body.scope === "future") {
		return familyplanAction(res, (now) => familyplanLib.regenerateFuture(body.revision, now));
	}
	if (body.scope !== "current" || body.confirm !== true) {
		return res.status(400).json({ error: "„Aktuelle Woche neu verteilen“ braucht eine Bestätigung" });
	}
	familyplanAction(res, (now) => familyplanLib.regenerateCurrent(body.revision, now));
});

// Datensicherung: eine JSON-Datei mit Plan + Fotos zum Herunterladen.
app.get("/api/familyplan/export", requireAuth, (req, res) => {
	try {
		const now = new Date();
		const payload = familyplanLib.exportData(now);
		const day = now.toISOString().slice(0, 10);
		res.setHeader("Content-Disposition", `attachment; filename="familienplan-${day}.json"`);
		res.type("application/json").send(JSON.stringify(payload, null, 2));
	} catch (err) {
		familyplanError(res, err);
	}
});

app.post(IMPORT_PATH, requireAuth, bodyParser.json({ limit: "8mb" }), (req, res) => {
	familyplanAction(res, (now) => familyplanLib.importData(req.body, now), syncBirthdayNames);
});

app.get("/api/familyplan/backups", requireAuth, (req, res) => {
	res.json({ backups: familyplanLib.listBackups() });
});

app.post("/api/familyplan/backups/restore", requireAuth, (req, res) => {
	const body = req.body || {};
	familyplanAction(res, (now) => familyplanLib.restoreBackup(body.name, now), syncBirthdayNames);
});

app.get("/api/familyplan/presets", requireAuth, (req, res) => {
	if (!PRESET_AVATAR_DIR) return res.json({ presets: [] });
	const presets = fs.readdirSync(PRESET_AVATAR_DIR).filter((f) => PRESET_FILE_RE.test(f)).sort().map((f) => f.replace(/\.jpg$/, ""));
	res.json({ presets });
});

// Eigenes Foto: der Browser schneidet es vorher auf 256 × 256 zu, hier nur
// noch Typ/Größe/Signatur prüfen und unter der Mitglieds-ID ablegen.
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

app.post("/api/familyplan/avatar/:memberId", requireAuth, avatarUpload.single("avatar"), (req, res) => {
	const memberId = req.params.memberId;
	const ext = req.file && AVATAR_MIME[req.file.mimetype];
	if (!MEMBER_ID_RE.test(memberId) || !familyplanLib.memberExists(memberId)) {
		return res.status(404).json({ error: "Mitglied nicht gefunden" });
	}
	if (!ext || !familyplanLib.looksLikeImage(req.file.buffer, ext)) {
		return res.status(400).json({ error: "Nur PNG-, JPG- oder WebP-Bilder bis 2 MB erlaubt" });
	}
	try {
		fs.mkdirSync(familyplanLib.AVATAR_UPLOAD_DIR, { recursive: true });
		for (const other of Object.values(AVATAR_MIME)) {
			const old = path.join(familyplanLib.AVATAR_UPLOAD_DIR, `${memberId}.${other}`);
			if (other !== ext && fs.existsSync(old)) fs.unlinkSync(old);
		}
		const file = `${memberId}.${ext}`;
		fs.writeFileSync(path.join(familyplanLib.AVATAR_UPLOAD_DIR, file), req.file.buffer);
		familyplanLib.setUploadedAvatar(memberId, file);
		res.json(familyplanLib.view(new Date()));
	} catch (err) {
		familyplanError(res, err);
	}
});

app.delete("/api/familyplan/avatar/:memberId", requireAuth, (req, res) => {
	const memberId = req.params.memberId;
	if (!MEMBER_ID_RE.test(memberId)) return res.status(404).json({ error: "Mitglied nicht gefunden" });
	familyplanAction(res, () => familyplanLib.clearAvatar(memberId));
});

if (PRESET_AVATAR_DIR) app.use("/avatars", express.static(PRESET_AVATAR_DIR, { maxAge: "1d" }));
if (WEATHER_MODULE_DIR) {
	app.use("/wx-assets/icons", express.static(path.join(WEATHER_MODULE_DIR, "icons"), { maxAge: "7d" }));
	app.use("/wx-assets/backgrounds", express.static(path.join(WEATHER_MODULE_DIR, "backgrounds"), { maxAge: "7d" }));
}
app.use("/avatar-uploads", requireAuth, express.static(familyplanLib.AVATAR_UPLOAD_DIR, { maxAge: "1h" }));
// Font Awesome liefert das Portal selbst mit (public/vendor/fa) – früher aus
// der MagicMirror-Installation, deren Pfad sich je nach Version unterscheidet.

// ---------------------------------------------------------------------------
// Updates für MagicMirror² und externe Module (Portal → Info), siehe
// lib/updates.js. Prüfen automatisch alle 12 h, aktualisieren nur manuell.
// ---------------------------------------------------------------------------
const OWN_MODULES = ["MMM-aPagerAlarm", "MMM-SmartCompliments", "MMM-LumiraStatus", "MMM-FamilyPlan", "MMM-Ambient"];
const updater = createUpdater({
	mmRoot: MM_ROOT,
	statePath: path.join(settingsLib.LUMIRA_HOME, "updates.json"),
	ownModules: OWN_MODULES,
	restart: () => new Promise((resolve) => {
		const { execFile } = require("child_process");
		execFile("pm2", ["restart", "MagicMirror"], (err) => {
			if (err) console.warn("[lumira-portal] pm2 restart MagicMirror fehlgeschlagen (läuft pm2?):", err.message);
			resolve(); // Update ist trotzdem durch – Neustart notfalls per "Pi neu starten"
		});
	}),
	lumiraRepo: findLumiraRepo,
	// Nach einem LUMIRA-Update läuft noch der alte Portal-Code: beenden mit
	// Code 75, systemd (Restart=on-failure) startet das Portal mit dem neuen
	// Code neu. Im Entwicklungsaufbau abschaltbar.
	selfRestart: () => {
		if (process.env.LUMIRA_NO_SELF_RESTART === "1") {
			console.log("[lumira-portal] LUMIRA-Update fertig – Neustart übersprungen (LUMIRA_NO_SELF_RESTART=1)");
			return;
		}
		console.log("[lumira-portal] LUMIRA-Update fertig – Portal startet neu");
		setTimeout(() => process.exit(75), 1500);
	}
});

// Wo liegt das LUMIRA-Repo? install.sh merkt es sich in ~/.lumira/install.json.
function findLumiraRepo() {
	let fromInstall = "";
	try { fromInstall = JSON.parse(fs.readFileSync(path.join(settingsLib.LUMIRA_HOME, "install.json"), "utf8")).repo || ""; } catch (e) { /* noch nie installiert */ }
	const candidates = [process.env.LUMIRA_REPO, fromInstall, path.join(os.homedir(), "LUMIRA")].filter(Boolean);
	return candidates.find((d) => fs.existsSync(path.join(d, ".git")) && fs.existsSync(path.join(d, "install.sh"))) || null;
}

function updateError(res, err) {
	const status = err.code === "BUSY" ? 409 : err.code === "NOT_FOUND" ? 404 : 500;
	res.status(status).json({ error: err.message });
}

// Werte für die SSH-Anleitung unter Info → Updates (Benutzer, Adresse, Repo-Ordner)
function sshInfo() {
	let user = "magic";
	try { user = os.userInfo().username || user; } catch (e) { /* Standard */ }
	let repo = "~/LUMIRA";
	try {
		const lum = updater.discover().find((c) => c.id === "lumira");
		if (lum) repo = lum.dir.indexOf(os.homedir()) === 0 ? "~" + lum.dir.slice(os.homedir().length).split(path.sep).join("/") : lum.dir;
	} catch (e) { /* Standard */ }
	const ip = localIpv4()[0];
	return { user, host: (settingsLib.load().hostname || "lumira") + ".local", ip: ip ? ip.address : "", repo };
}

app.get("/api/updates", requireAuth, (req, res) => {
	res.json(Object.assign({}, updater.status(), { ssh: sshInfo() }));
});

// Prüfen dauert (git fetch für jede Komponente) – läuft im Hintergrund,
// das Portal fragt GET /api/updates ab, bis "checking" wieder false ist.
app.post("/api/updates/check", requireAuth, (req, res) => {
	updater.check().catch((err) => console.error("[lumira-portal] Update-Prüfung:", err.message));
	res.status(202).json(Object.assign(updater.status(), { checking: true }));
});

app.post("/api/updates/:id/apply", requireAuth, (req, res) => {
	try {
		res.status(202).json(updater.apply(req.params.id));
	} catch (err) {
		updateError(res, err);
	}
});

app.post("/api/updates/:id/repair-electron", requireAuth, (req, res) => {
	try { res.json(updater.repairElectron(req.params.id)); } catch (err) { updateError(res, err); }
});

app.post("/api/updates/:id/rollback", requireAuth, (req, res) => {
	try {
		res.status(202).json(updater.rollback(req.params.id));
	} catch (err) {
		updateError(res, err);
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
// Live-Bild des Spiegels (Karte „Spiegel“ auf Start). MMM-LumiraStatus nimmt
// das Bild auf und gibt es nur an Anfragen von diesem Gerät heraus – hier
// kommt der PIN-Schutz dazu.
// ---------------------------------------------------------------------------
app.get("/api/mirror/screenshot", requireAuth, (req, res) => {
	const upstream = http.get({ host: "127.0.0.1", port: MM_PORT, path: "/lumira/screenshot", timeout: 8000 }, (up) => {
		if (up.statusCode !== 200) {
			let body = "";
			up.on("data", (chunk) => (body += chunk));
			up.on("end", () => {
				let msg = "Kein Bild vom Spiegel";
				try { msg = JSON.parse(body).error || msg; } catch (e) { /* MagicMirror ohne LUMIRA-Modul */ }
				res.status(up.statusCode === 404 ? 503 : up.statusCode || 502).json({ error: msg });
			});
			return;
		}
		res.set({
			"Content-Type": "image/jpeg",
			"Cache-Control": "no-store",
			"X-Lumira-Captured-At": up.headers["x-lumira-captured-at"] || new Date().toISOString()
		});
		up.pipe(res);
	});
	upstream.on("timeout", () => upstream.destroy(new Error("Zeitüberschreitung")));
	upstream.on("error", (err) => {
		if (!res.headersSent) res.status(502).json({ error: `MagicMirror nicht erreichbar: ${err.message}` });
	});
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

// ---------------------------------------------------------------------------
// Dauerschleife auf dem Spiegel (Spiegel → Bildschirm), siehe lib/ambient.js.
// Wirkt live über ~/.lumira/ambient.json – kein MagicMirror-Neustart.
// ---------------------------------------------------------------------------
const ambient = ambientLib.createAmbient({ home: settingsLib.LUMIRA_HOME });
const ambientUpload = multer({
	storage: multer.diskStorage({
		destination: (req, file, cb) => {
			const dir = path.join(ambient.mediaDir, ".incoming");
			fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
		},
		filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.random().toString(16).slice(2))
	}),
	limits: { fileSize: ambientLib.MAX_BYTES, files: 1 }
});

function ambientAction(res, fn) {
	try {
		res.json(fn());
	} catch (err) {
		if (err instanceof ambientLib.AmbientError) return res.status(err.status).json({ error: err.message });
		console.error("[lumira-portal] Dauerschleife:", err);
		res.status(500).json({ error: "Interner Fehler" });
	}
}

app.get("/api/ambient", requireAuth, (req, res) => ambientAction(res, () => ambient.view()));

app.put("/api/ambient", requireAuth, (req, res) => {
	const b = req.body || {};
	ambientAction(res, () => ambient.setState({ enabled: b.enabled, mediaId: b.mediaId, mode: b.mode, sound: b.sound, ytQuality: b.ytQuality, slideshow: b.slideshow, minutes: b.minutes }));
});

app.post("/api/ambient/media", requireAuth, ambientUpload.single("file"), async (req, res) => {
	if (!req.file) return res.status(400).json({ error: "Keine Datei erhalten" });
	// GIF → MP4 (flüssiger auf dem Pi), sonst unverändert
	const prepared = await ambientLib.prepareUpload({ tmpPath: req.file.path, originalName: req.file.originalname, size: req.file.size });
	const name = req.body && req.body.name ? String(req.body.name) : ""; // Endung entfernt lib/ambient.js
	ambientAction(res, () => {
		const entry = ambient.addMedia({ tmpPath: prepared.tmpPath, originalName: prepared.originalName, name, size: prepared.size });
		return Object.assign(ambient.view(), { added: entry.id, converted: prepared.converted, note: prepared.note || "" });
	});
});

// YouTube-Link als Medium. Ohne Namen wird der Videotitel per oEmbed geholt
// (öffentlich, ohne Schlüssel); klappt das nicht, heißt es „YouTube-Video“.
function youtubeTitle(url) {
	return new Promise((resolve) => {
		const q = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url);
		const req = https.get(q, { timeout: 4000 }, (r) => {
			let body = "";
			r.on("data", (c) => { if (body.length < 20000) body += c; });
			r.on("end", () => {
				try { resolve(r.statusCode === 200 ? String(JSON.parse(body).title || "") : ""); } catch (e) { resolve(""); }
			});
		});
		req.on("timeout", () => req.destroy());
		req.on("error", () => resolve(""));
	});
}

app.post("/api/ambient/youtube", requireAuth, async (req, res) => {
	const b = req.body || {};
	const yt = ambientLib.parseYouTube(b.url);
	if (!yt) return res.status(400).json({ error: "Das ist kein YouTube-Link (z. B. https://www.youtube.com/watch?v=… oder https://youtu.be/…)" });
	const name = String(b.name || "").trim() || await youtubeTitle("https://www.youtube.com/watch?v=" + yt.id);
	ambientAction(res, () => {
		const entry = ambient.addYouTube({ url: b.url, name });
		return Object.assign(ambient.view(), { added: entry.id });
	});
});

app.delete("/api/ambient/media/:id", requireAuth, (req, res) => {
	ambientAction(res, () => ambient.removeMedia(req.params.id));
});

// Vorschau im Portal (Video mit Spulen per Range-Anfragen, das macht sendFile)
app.get("/api/ambient/media/:id/file", requireAuth, (req, res) => {
	const f = ambient.mediaFile(req.params.id);
	if (!f || !fs.existsSync(f.path)) return res.status(404).json({ error: "Medium nicht gefunden" });
	res.type(f.mime).sendFile(f.path, { maxAge: "1d" });
});

function expireAmbientSafe() {
	try { ambient.expire(); } catch (err) { console.error("[lumira-portal] Dauerschleife-Timer:", err.message); }
}

// ---------------------------------------------------------------------------
// Türklingel (Spiegel → Klingel), siehe lib/doorbell.js und lib/ring.js.
// Klingeln → Meldung + Live-Video auf dem Spiegel, live über doorbell.json.
// Ring-Zugangsdaten verlassen das Portal nie: E-Mail/Passwort werden nur
// einmal an Ring geschickt, gespeichert wird allein der Token (Datei 0600),
// und keine Route gibt ihn heraus.
// ---------------------------------------------------------------------------
const doorbell = doorbellLib.createDoorbell({ home: settingsLib.LUMIRA_HOME, ring: null });
const ring = ringLib.createRing({
	home: settingsLib.LUMIRA_HOME,
	onDing: (d) => doorbell.trigger({ camera: d.camera, source: "ring", dingId: d.dingId, e2ee: d.e2ee })
});
doorbell.setRing(ring);

function doorbellOn(settings) {
	return !!(settings && settings.modules && settings.modules.doorbell === true);
}

// Nach dem Speichern der Einstellungen: Ring-Verbindung passend an/aus
function syncDoorbell(settings) {
	ring.setEnabled(doorbellOn(settings)).catch((err) => console.error("[lumira-portal] Ring:", err.message));
	if (!doorbellOn(settings)) doorbell.close();
}

function doorbellView() {
	return Object.assign(doorbell.view(), { enabled: doorbellOn(settingsLib.load()), ring: ring.view() });
}

async function doorbellAction(res, fn) {
	try {
		res.json(await fn());
	} catch (err) {
		if (err instanceof doorbellLib.DoorbellError || err instanceof ringLib.RingError) return res.status(err.status).json({ error: err.message });
		console.error("[lumira-portal] Klingel:", err);
		res.status(500).json({ error: "Interner Fehler" });
	}
}

app.get("/api/doorbell", requireAuth, (req, res) => doorbellAction(res, () => doorbellView()));

app.put("/api/doorbell/config", requireAuth, (req, res) => {
	const b = req.body || {};
	doorbellAction(res, () => {
		doorbell.setConfig({ notify: b.notify, sound: b.sound, video: b.video, power: b.power, cameras: b.cameras });
		return doorbellView();
	});
});

// „Klingeln testen“: läuft wie echtes Klingeln – mit Ring-Video, falls verbunden
app.post("/api/doorbell/test", requireAuth, (req, res) => {
	doorbellAction(res, () => {
		if (!doorbellOn(settingsLib.load())) throw new doorbellLib.DoorbellError("Die Türklingel ist ausgeschaltet – erst oben einschalten.");
		const devs = ring.connected() ? ring.devices() : [];
		const active = doorbell.view().config.cameras;
		const cam = devs.find((d) => !active.length || active.indexOf(d.id) !== -1) || null;
		doorbell.trigger({ camera: cam ? { id: cam.id, name: cam.name } : null, source: "test" });
		return doorbellView();
	});
});

app.post("/api/doorbell/close", requireAuth, (req, res) => {
	doorbellAction(res, () => { doorbell.close(); return doorbellView(); });
});

const doorbellSoundUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: doorbellLib.SOUND_MAX_BYTES, files: 1 } });

app.post("/api/doorbell/sound", requireAuth, doorbellSoundUpload.single("sound"), (req, res) => {
	doorbellAction(res, () => {
		if (!req.file) throw new doorbellLib.DoorbellError("Keine Datei erhalten");
		doorbell.saveSound({ buffer: req.file.buffer, mimetype: req.file.mimetype, originalName: req.file.originalname });
		return doorbellView();
	});
});

app.delete("/api/doorbell/sound", requireAuth, (req, res) => {
	doorbellAction(res, () => { doorbell.removeSound(); return doorbellView(); });
});

app.get("/api/doorbell/sound/file", requireAuth, (req, res) => {
	const f = doorbell.soundFile();
	if (!f) return res.status(404).json({ error: "Kein eigener Ton" });
	res.type(f.mime).sendFile(f.path, { maxAge: 0 });
});

// Live-Video/Standbild für die Vorschau im Portal (der Spiegel holt es selbst
// über MMM-Doorbell). Nur Dateien des gerade laufenden Klingel-Ereignisses.
app.get("/api/doorbell/live/:eventId/:file", requireAuth, (req, res) => {
	const p = doorbell.liveFile(req.params.eventId, req.params.file);
	if (!p) return res.status(404).json({ error: "Nicht (mehr) da" });
	res.set("Cache-Control", "no-store");
	res.sendFile(p);
});

app.post("/api/ring/login", requireAuth, (req, res) => {
	const b = req.body || {};
	doorbellAction(res, async () => Object.assign(await ring.loginStart(b.email, b.password), { ring: ring.view() }));
});

app.post("/api/ring/code", requireAuth, (req, res) => {
	doorbellAction(res, async () => Object.assign(await ring.loginCode((req.body || {}).code), { ring: ring.view() }));
});

app.post("/api/ring/cancel", requireAuth, (req, res) => {
	doorbellAction(res, () => ({ ring: ring.cancelLogin() }));
});

app.post("/api/ring/logout", requireAuth, (req, res) => {
	doorbellAction(res, () => { doorbell.close(); ring.logout(); return doorbellView(); });
});

// Diagnose: Push-Kanal (mtalk.google.com:5228) prüfen
app.post("/api/ring/diagnose", requireAuth, (req, res) => {
	doorbellAction(res, async () => { await ring.checkPush(); return doorbellView(); });
});

app.post("/api/ring/reconnect", requireAuth, (req, res) => {
	doorbellAction(res, async () => { await ring.connect(); return doorbellView(); });
});

// ---------------------------------------------------------------------------
// Regenradar & Wetterwarnungen (Spiegel → Radar & Warnungen) und
// Wetteranzeige (Spiegel → Wetteranzeige), siehe lib/weather.js und
// modules/MMM-LumiraWeather. Wirkt live über weather.json.
// ---------------------------------------------------------------------------
const weather = weatherLib.createWeather({ home: settingsLib.LUMIRA_HOME });

app.get("/api/weather", requireAuth, (req, res) => {
	try { res.json(weather.view()); } catch (err) { res.status(500).json({ error: "Interner Fehler" }); }
});

// Wetterdaten für die Vorschau der Designs (Spiegel → Wetteranzeige)
app.get("/api/weather/forecast", requireAuth, async (req, res) => {
	try { res.json(await weather.forecast()); } catch (err) { res.status(500).json({ error: "Interner Fehler" }); }
});

app.put("/api/weather", requireAuth, (req, res) => {
	try {
		res.json(weather.setConfig(req.body || {}));
	} catch (err) {
		if (err instanceof weatherLib.WeatherError) return res.status(err.status).json({ error: err.message });
		console.error("[lumira-portal] Wetter:", err);
		res.status(500).json({ error: "Interner Fehler" });
	}
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	if (err && err.code === "LIMIT_FILE_SIZE") {
		return res.status(413).json({ error: "Die Datei ist zu groß (höchstens 300 MB)" });
	}
	if (err && err.type === "entity.too.large") {
		return res.status(413).json({ error: "Die Datei ist zu groß" });
	}
	if (err && err.type === "entity.parse.failed") {
		return res.status(400).json({ error: "Die Datei ist kein gültiges JSON" });
	}
	console.error("[lumira-portal]", err);
	res.status(500).json({ error: "Interner Fehler" });
});

if (require.main === module) {
	app.listen(PORT, "0.0.0.0", () => {
		console.log(`[lumira-portal] läuft auf Port ${PORT} (Modus: ${modeLib.get().mode})`);
	});
	// Wochenwechsel Familienplan: beim Start und dann jede Minute prüfen.
	ensureWeekSafe();
	setInterval(ensureWeekSafe, 60 * 1000);
	// Timer der Dauerschleife: abgelaufen → wirklich aus
	setInterval(expireAmbientSafe, 60 * 1000);
	// Regenradar & Warnungen: Standort aus den Einstellungen übernehmen
	try { weather.setLocation(settingsLib.load().location); } catch (err) { console.error("[lumira-portal] Wetter:", err.message); }
	// Türklingel: liegengebliebenes Ereignis weg, Ring verbinden (falls an)
	doorbell.reset();
	syncDoorbell(settingsLib.load());
	// Update-Prüfung: erstmals 3 Minuten nach dem Start, dann alle 12 Stunden.
	updater.startSchedule();
}

module.exports = app;
