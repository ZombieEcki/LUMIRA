// LUMIRA – Verbindung zur Ring-Türklingel (über ring-client-api, inoffiziell).
//
// Anmeldung im Portal: E-Mail + Passwort, danach der Bestätigungscode (Ring
// verlangt immer 2FA). Gespeichert wird nur der Refresh-Token in
// ~/.lumira/ring-auth.json (nur für den Benutzer lesbar), nie E-Mail oder
// Passwort. Ring tauscht den Token etwa stündlich aus – jeder neue wird sofort
// gespeichert, sonst kommen nach einem Neustart keine Klingel-Pushes mehr an.
//
// Klingeln kommt per Push (Firebase), dafür braucht der Pi keine Portfreigabe.
// Das Live-Video holt ffmpeg (System-ffmpeg, apt) und schreibt es unverändert
// (ohne Umrechnen – das schafft der Pi 3 nicht) als HLS in einen Ordner.
"use strict";

const fs = require("fs");
const { renameRetry } = require("./atomic");
const path = require("path");
const net = require("net");
const dns = require("dns");

const FFMPEG = process.env.LUMIRA_FFMPEG || "ffmpeg";
const DISPLAY_NAME = "LUMIRA Spiegel"; // so heißt der Spiegel im Ring-Kontrollzentrum
const LOGIN_TTL_MS = 10 * 60 * 1000;
const RETRY_MS = [30e3, 2 * 60e3, 5 * 60e3, 15 * 60e3];
// Klingel-Pushes kommen über Googles Firebase: dauerhafte Verbindung zu
// mtalk.google.com:5228. Werbeblocker im DNS (Pi-hole) oder Firewalls
// blockieren das gern – dann klappt alles außer dem Klingeln.
const PUSH_HOST = "mtalk.google.com";
const PUSH_PORT = 5228;
// Alle 2 s ein Vollbild von der Klingel anfordern (siehe startStream)
const KEYFRAME_MS = 2000;

// Push-Kanal prüfen: Name auflösen, TCP-Verbindung aufbauen
function probePush(host = PUSH_HOST, port = PUSH_PORT, timeoutMs = 6000) {
	return new Promise((resolve) => {
		dns.lookup(host, (err, address) => {
			if (err) return resolve({ ok: false, code: "dns", address: "", message: `${host} lässt sich nicht auflösen – blockiert ein Werbeblocker (z. B. Pi-hole) oder der Router diese Adresse?` });
			if (/^(0\.0\.0\.0|127\.|::$|::1$)/.test(address)) {
				return resolve({ ok: false, code: "blocked", address, message: `${host} wird auf ${address} umgeleitet – ein Werbeblocker (z. B. Pi-hole, AdGuard) blockiert die Klingel-Nachrichten. Bitte ${host} dort freigeben.` });
			}
			const sock = net.connect({ host: address, port });
			let done = false;
			const finish = (res) => { if (done) return; done = true; sock.destroy(); resolve(Object.assign({ address }, res)); };
			sock.setTimeout(timeoutMs, () => finish({ ok: false, code: "timeout", message: `Keine Verbindung zu ${host}:${port} (Zeitüberschreitung) – blockiert eine Firewall Port ${port}?` }));
			sock.once("connect", () => finish({ ok: true, code: "ok", message: "Push-Kanal erreichbar" }));
			sock.once("error", (e) => finish({ ok: false, code: e.code || "error", message: `Keine Verbindung zu ${host}:${port} (${e.code || e.message}) – blockiert eine Firewall Port ${port}?` }));
		});
	});
}

class RingError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status || 400;
	}
}

// Ring-Fehlermeldungen (englisch) → verständlich auf Deutsch
function friendlyError(err) {
	const m = String((err && err.message) || err || "");
	if (/too many 2fa codes|too many requests/i.test(m)) return "Zu viele Codes angefordert – Ring erlaubt 10 in 10 Minuten. Bitte später noch einmal.";
	if (/email and password are correct/i.test(m)) return "E-Mail oder Passwort stimmt nicht.";
	if (/refresh token is correct|refresh token is not valid|invalid_grant/i.test(m)) return "Die Ring-Anmeldung ist abgelaufen – bitte neu anmelden.";
	if (/verification code/i.test(m)) return "Der Code stimmt nicht – bitte noch einmal eingeben.";
	if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(m)) return "Ring ist nicht erreichbar – Internetverbindung von LUMIRA prüfen.";
	return m.slice(0, 160) || "Unbekannter Fehler bei Ring";
}

// „Please enter the code sent to ***12 via sms“ → deutscher Hinweis
function friendlyPrompt(p) {
	const s = String(p || "");
	if (/authenticator/i.test(s)) return "Code aus deiner Authenticator-App eingeben.";
	const m = /sent to (.+?) via (\w+)/i.exec(s);
	if (m) return `Code eingeben, den Ring per ${m[2].toLowerCase() === "sms" ? "SMS" : m[2] === "email" ? "E-Mail" : m[2]} an ${m[1]} geschickt hat.`;
	if (/invalid 2fa/i.test(s)) return "Der Code stimmt nicht – bitte noch einmal eingeben.";
	return "Code eingeben, den Ring per SMS oder E-Mail geschickt hat.";
}

function isAuthProblem(err) {
	return /refresh token|invalid_grant|401|unauthori[sz]ed|email and password/i.test(String((err && err.message) || err));
}

// loadLib: zum Testen austauschbar; standardmäßig ring-client-api (ESM)
function createRing({ home, onDing = () => {}, loadLib, log = console, timers = { setTimeout, clearTimeout }, pushProbe = probePush, keyframeMs = KEYFRAME_MS } = {}) {
	home = path.resolve(home);
	const authPath = path.join(home, "ring-auth.json");
	// RingRestClient (Anmeldung) gibt das Paket nur über den Unterpfad heraus
	const load = loadLib || (() => Promise.all([import("ring-client-api"), import("ring-client-api/rest-client"), import("ring-client-api/util")])
		.then(([main, rest, util]) => ({ RingApi: main.RingApi, RingRestClient: rest.RingRestClient, useLogger: util.useLogger, enableDebug: util.enableDebug })));

	let enabled = false;
	let api = null;
	let cameras = new Map(); // id → RingCamera
	let subs = [];
	let pending = null;      // Anmeldung, die auf den Code wartet
	let retry = null;
	let retryStep = 0;
	let connecting = null;
	const state = { status: "off", message: "", account: "", devices: [], lastDing: null };
	// Diagnose: Push-Kanal, letzte Nachricht von Ring, Protokoll der Bibliothek
	const diag = { push: null, lastNotification: null, notifications: 0, errors: [], log: [] };
	let loggerSet = false;

	function addLog(level, parts) {
		const text = parts.map((p) => (typeof p === "string" ? p : p && p.message ? p.message : (() => { try { return JSON.stringify(p); } catch (e) { return String(p); } })()))
			.join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
		if (!text) return;
		const list = level === "error" ? diag.errors : diag.log;
		list.push({ at: new Date().toISOString(), text });
		if (list.length > (level === "error" ? 15 : 30)) list.shift();
		// Fehler auch ins Journal (journalctl -u lumira-portal)
		if (level === "error") log.warn("[lumira-portal] Ring:", text);
	}

	// Die Bibliothek protokolliert sonst nur mit DEBUG=ring – Fehler wie
	// „Failed to connect push notification receiver“ blieben unsichtbar
	function hookLogger(lib) {
		if (loggerSet || !lib || typeof lib.useLogger !== "function") return;
		loggerSet = true;
		lib.useLogger({
			logInfo: (...m) => addLog("info", m),
			logError: (...m) => addLog("error", m)
		});
		if (typeof lib.enableDebug === "function") lib.enableDebug();
	}

	async function checkPush() {
		try {
			const res = await pushProbe();
			diag.push = Object.assign({ checkedAt: new Date().toISOString() }, res);
		} catch (err) {
			diag.push = { ok: false, code: "error", message: String((err && err.message) || err), checkedAt: new Date().toISOString() };
		}
		return diag.push;
	}

	function readAuth() {
		try {
			const a = JSON.parse(fs.readFileSync(authPath, "utf8"));
			return a && typeof a.refreshToken === "string" && a.refreshToken ? a : null;
		} catch (e) {
			return null;
		}
	}

	function writeAuth(a) {
		fs.mkdirSync(home, { recursive: true });
		const tmp = authPath + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(a), { mode: 0o600 });
		renameRetry(tmp, authPath);
		try { fs.chmodSync(authPath, 0o600); } catch (e) { /* Windows */ }
	}

	function set(status, message) {
		state.status = status;
		state.message = message || "";
	}

	function view() {
		return {
			status: state.status,
			message: state.message,
			account: state.account,
			loggedIn: !!readAuth(),
			awaitingCode: !!(pending && Date.now() - pending.at < LOGIN_TTL_MS),
			prompt: pending ? pending.prompt : "",
			devices: state.devices.slice(),
			lastDing: state.lastDing,
			diag: {
				push: diag.push,
				lastNotification: diag.lastNotification,
				notifications: diag.notifications,
				errors: diag.errors.slice().reverse(),
				log: diag.log.slice(-12).reverse()
			}
		};
	}

	function connected() {
		return state.status === "connected" && !!api;
	}

	function devices() {
		return state.devices.slice();
	}

	function deviceInfo(cam) {
		let battery = null;
		try { battery = !!cam.operatingOnBattery; } catch (e) { battery = null; }
		let level = null;
		try { level = cam.batteryLevel; } catch (e) { level = null; }
		let offline = false;
		try { offline = !!cam.isOffline; } catch (e) { offline = false; }
		return { id: String(cam.id), name: String(cam.name || "Klingel"), model: String(cam.model || ""), battery, batteryLevel: typeof level === "number" ? level : null, offline };
	}

	function disconnect() {
		timers.clearTimeout(retry);
		retry = null;
		for (const s of subs) { try { s.unsubscribe(); } catch (e) { /* egal */ } }
		subs = [];
		if (api) { try { api.disconnect(); } catch (e) { /* egal */ } }
		api = null;
		cameras = new Map();
		state.devices = [];
	}

	function scheduleRetry() {
		timers.clearTimeout(retry);
		const ms = RETRY_MS[Math.min(retryStep, RETRY_MS.length - 1)];
		retryStep++;
		retry = timers.setTimeout(() => { retry = null; connect().catch(() => {}); }, ms);
	}

	async function connect() {
		if (!enabled) return view();
		if (connecting) return connecting;
		connecting = (async () => {
			disconnect();
			const auth = readAuth();
			if (!auth) { set("needs-login", ""); return view(); }
			let lib;
			try {
				lib = await load();
			} catch (err) {
				set("error", "Ring-Unterstützung fehlt – bitte LUMIRA aktualisieren (Info → Updates).");
				return view();
			}
			hookLogger(lib);
			set("connecting", "Verbinde mit Ring …");
			try {
				const ringApi = new lib.RingApi({
					refreshToken: auth.refreshToken,
					controlCenterDisplayName: DISPLAY_NAME,
					avoidSnapshotBatteryDrain: true,
					ffmpegPath: FFMPEG
				});
				api = ringApi;
				subs.push(ringApi.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
					if (newRefreshToken) writeAuth(Object.assign({}, readAuth() || {}, { refreshToken: newRefreshToken, updatedAt: new Date().toISOString() }));
				}));
				const all = await ringApi.getCameras();
				if (api !== ringApi) return view(); // inzwischen getrennt
				const bells = all.filter((c) => c.isDoorbot);
				cameras = new Map(bells.map((c) => [String(c.id), c]));
				state.devices = bells.map(deviceInfo);
				for (const cam of bells) {
					// Jede Nachricht von Ring (Klingeln, Bewegung, …) – zeigt, ob überhaupt etwas ankommt
					if (cam.onNewNotification && cam.onNewNotification.subscribe) {
						subs.push(cam.onNewNotification.subscribe((n) => {
							const cat = String((n && n.android_config && n.android_config.category) || "");
							diag.notifications++;
							diag.lastNotification = {
								at: new Date().toISOString(),
								camera: String(cam.name || ""),
								kind: /ding$/.test(cat) ? "ding" : /motion/.test(cat) ? "motion" : "other",
								category: cat.slice(0, 80)
							};
						}));
					}
					subs.push(cam.onDoorbellPressed.subscribe((ding) => {
						const dev = (ding && ding.data && ding.data.device) || {};
						const ev = (ding && ding.data && ding.data.event && ding.data.event.ding) || {};
						state.lastDing = { at: new Date().toISOString(), camera: String(cam.name || "") };
						try {
							onDing({ camera: { id: String(cam.id), name: String(cam.name || "Klingel") }, dingId: String(ev.id || ""), e2ee: !!dev.e2ee_enabled });
						} catch (err) {
							log.error("[lumira-portal] Klingel-Ereignis:", err && err.message);
						}
					}));
					subs.push(cam.onData.subscribe(() => {
						const i = state.devices.findIndex((d) => d.id === String(cam.id));
						if (i !== -1) state.devices[i] = deviceInfo(cam);
					}));
				}
				try {
					const profile = await ringApi.getProfile();
					state.account = maskEmail(profile && profile.email);
				} catch (e) { /* nur Anzeige */ }
				retryStep = 0;
				set("connected", bells.length ? "" : "Verbunden, aber keine Ring-Türklingel im Konto gefunden");
				checkPush().then((p) => { if (p && !p.ok) addLog("error", [p.message]); });
			} catch (err) {
				disconnect();
				if (isAuthProblem(err)) {
					set("needs-login", friendlyError(err));
				} else {
					set("error", friendlyError(err));
					scheduleRetry();
				}
			}
			return view();
		})();
		try { return await connecting; } finally { connecting = null; }
	}

	// Ein/aus mit dem Schalter „Türklingel“ (Bildschirm → Übersicht bzw. Klingel)
	async function setEnabled(on) {
		// Jedes Speichern im Portal ruft das auf – eine stehende Verbindung
		// bleibt, sonst gingen währenddessen Klingel-Pushes verloren
		if (on && enabled && (connecting || state.status === "connected")) return view();
		enabled = !!on;
		if (!enabled) { disconnect(); set("off", ""); return view(); }
		return connect();
	}

	// ---------------------------------------------------------------- Anmeldung
	async function loginStart(email, password) {
		email = String(email || "").trim();
		password = String(password || "");
		if (!/^[^\s@]+@[^\s@]+$/.test(email) || !password) throw new RingError("Bitte E-Mail und Passwort deines Ring-Kontos eingeben.");
		let lib;
		try { lib = await load(); } catch (e) { throw new RingError("Ring-Unterstützung fehlt – bitte LUMIRA aktualisieren.", 503); }
		const client = new lib.RingRestClient({ email, password, controlCenterDisplayName: DISPLAY_NAME });
		try {
			const auth = await client.getCurrentAuth();
			return finishLogin(auth, email);
		} catch (err) {
			if (client.promptFor2fa) {
				pending = { client, email, at: Date.now(), prompt: friendlyPrompt(client.promptFor2fa) };
				return { needsCode: true, prompt: pending.prompt };
			}
			throw new RingError(friendlyError(err));
		}
	}

	async function loginCode(code) {
		code = String(code || "").replace(/\s+/g, "");
		if (!pending || Date.now() - pending.at > LOGIN_TTL_MS) { pending = null; throw new RingError("Die Anmeldung ist abgelaufen – bitte noch einmal mit E-Mail und Passwort beginnen."); }
		if (!/^[0-9]{4,8}$/.test(code)) throw new RingError("Der Code besteht aus Ziffern.");
		try {
			const auth = await pending.client.getAuth(code);
			const email = pending.email;
			pending = null;
			return finishLogin(auth, email);
		} catch (err) {
			throw new RingError(friendlyError(err));
		}
	}

	async function finishLogin(auth, email) {
		if (!auth || !auth.refresh_token) throw new RingError("Ring hat keinen Zugang geliefert – bitte noch einmal versuchen.");
		writeAuth({ refreshToken: auth.refresh_token, createdAt: new Date().toISOString() });
		state.account = maskEmail(email);
		retryStep = 0;
		if (enabled) await connect();
		return Object.assign({ done: true }, view());
	}

	function cancelLogin() {
		pending = null;
		return view();
	}

	function logout() {
		disconnect();
		pending = null;
		try { fs.unlinkSync(authPath); } catch (e) { /* schon weg */ }
		state.account = "";
		set(enabled ? "needs-login" : "off", enabled ? "Abgemeldet" : "");
		return view();
	}

	// ---------------------------------------------------------------- Video/Bild
	// mode "copy": Video unverändert weiterreichen (wenig Last, Standard).
	// mode "transcode": in 640 px H.264 Baseline umwandeln – spielt jeder
	// Player ab, falls das Bild sonst schwarz bleibt; der Pi 3 schafft das noch.
	const VIDEO_ARGS = {
		copy: ["-c:v", "copy"],
		transcode: ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-profile:v", "baseline",
			"-vf", "scale=640:-2", "-r", "15", "-g", "15", "-pix_fmt", "yuv420p"]
	};

	async function startStream(cameraId, dir, opts = {}) {
		const cam = cameras.get(String(cameraId));
		if (!cam) throw new Error("Klingel nicht gefunden");
		const session = await cam.streamVideo({
			// Zeitstempel neu erzeugen: RTP von Ring hat oft Lücken, das stört HLS
			input: ["-fflags", "+genpts"],
			audio: ["-an"],            // Ton bleibt aus (Spiegel ist kein Gegensprechen)
			video: VIDEO_ARGS[opts.mode] || VIDEO_ARGS.copy,
			output: [
				"-f", "hls",
				"-hls_time", "2",
				"-hls_list_size", "5",
				"-hls_flags", "delete_segments+independent_segments",
				"-hls_segment_filename", path.join(dir, "seg%05d.ts"),
				path.join(dir, "stream.m3u8")
			]
		});
		// Ring schickt per WebRTC ein Vollbild (Keyframe) fast nur am Anfang.
		// Ohne neue Vollbilder beginnen die HLS-Stücke mitten in einer
		// Bildfolge – der Spiegel zeigt dann verschmierte, lila Flächen, und
		// jede kleine Lücke im Datenstrom bleibt sichtbar. Darum regelmäßig
		// eines anfordern: Jedes Stück beginnt sauber, Fehler heilen nach ≤ 2 s.
		const keyframes = setInterval(() => {
			try { session.requestKeyFrame(); } catch (e) { /* Anruf schon zu */ }
		}, keyframeMs);
		subs.push(session.onCallEnded.subscribe(() => clearInterval(keyframes)));
		return {
			stop: () => { clearInterval(keyframes); session.stop(); },
			onEnded: (cb) => { subs.push(session.onCallEnded.subscribe(() => cb())); }
		};
	}

	async function snapshot(cameraId, { dingId } = {}) {
		const cam = cameras.get(String(cameraId));
		if (!cam) return null;
		const p = dingId ? cam.getSnapshot({ uuid: dingId }) : cam.getSnapshot();
		let t;
		const timeout = new Promise((resolve) => { t = timers.setTimeout(() => resolve(null), 15000); });
		try { return await Promise.race([p, timeout]); } finally { timers.clearTimeout(t); }
	}

	return { view, connected, devices, connect, setEnabled, loginStart, loginCode, cancelLogin, logout, startStream, snapshot, disconnect, checkPush, authPath };
}

function maskEmail(e) {
	const s = String(e || "");
	const at = s.indexOf("@");
	if (at < 1) return "";
	return s[0] + "•••" + s.slice(at);
}

module.exports = { createRing, probePush, RingError, friendlyError, friendlyPrompt, maskEmail, PUSH_HOST, PUSH_PORT };
