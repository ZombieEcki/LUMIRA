// LUMIRA – nmcli-Wrapper (Access Point, WLAN-Scan/-Verbindung, Watchdog).
// Siehe concept/selfservice.md Abschnitt 7 ("nmcli … hotspot" / "nmcli dev
// wifi …") – NetworkManager ist der Bookworm-Standard auf Raspberry Pi OS.
//
// WICHTIG: alle nmcli-Aufrufe laufen über execFile() mit einem Argument-
// Array, NIEMALS über exec() mit zusammengebautem String – SSID/Passwort
// kommen vom Kunden (Formular bzw. später Captive Portal) und dürfen nicht
// in eine Shell interpoliert werden (Command-Injection-Risiko).
//
// Ungetestet auf echter Hardware in dieser Entwicklungsumgebung (kein Pi,
// kein nmcli hier verfügbar) – vor dem produktiven Einsatz auf einem
// Raspberry Pi mit Raspberry Pi OS Bookworm gegenprüfen.
"use strict";

const { execFile } = require("child_process");
const crypto = require("crypto");

const WIFI_IFACE = process.env.LUMIRA_WIFI_IFACE || "wlan0";
const AP_CON_NAME = "lumira-ap";
const AP_IP = "192.168.4.1";
const NMCLI_TIMEOUT_MS = 25000;

function run(args, { timeout = NMCLI_TIMEOUT_MS } = {}) {
	return new Promise((resolve, reject) => {
		execFile("nmcli", args, { timeout }, (err, stdout, stderr) => {
			if (err) {
				err.stderr = stderr;
				reject(err);
				return;
			}
			resolve(stdout);
		});
	});
}

// nmcli --terse trennt Felder mit ":" und escaped ein echtes ":" im Wert als
// "\:". Diese Funktion zerlegt eine terse-Zeile korrekt.
function splitTerse(line) {
	const fields = [];
	let cur = "";
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === "\\" && line[i + 1] === ":") {
			cur += ":";
			i++;
		} else if (ch === ":") {
			fields.push(cur);
			cur = "";
		} else {
			cur += ch;
		}
	}
	fields.push(cur);
	return fields;
}

async function checkConnectivity() {
	try {
		const out = await run(["networking", "connectivity", "check"], { timeout: 8000 });
		const state = out.trim();
		return { online: state === "full" || state === "limited", state };
	} catch (err) {
		return { online: false, state: "unknown", error: err.message };
	}
}

async function getActiveSsid() {
	try {
		const out = await run(["-t", "-f", "active,ssid", "dev", "wifi"]);
		for (const line of out.split("\n")) {
			if (!line.trim()) continue;
			const [active, ssid] = splitTerse(line);
			if (active === "yes") return ssid;
		}
		return null;
	} catch (err) {
		return null;
	}
}

async function scanWifi() {
	try {
		await run(["dev", "wifi", "rescan"], { timeout: 10000 }).catch(() => {});
		const out = await run(["-t", "-f", "ssid,signal,security", "dev", "wifi", "list"]);
		const seen = new Set();
		const networks = [];
		for (const line of out.split("\n")) {
			if (!line.trim()) continue;
			const [ssid, signal, security] = splitTerse(line);
			if (!ssid || seen.has(ssid)) continue;
			seen.add(ssid);
			networks.push({ ssid, signal: Number(signal) || 0, secure: !!security && security !== "--" });
		}
		networks.sort((a, b) => b.signal - a.signal);
		return networks;
	} catch (err) {
		throw new Error(`WLAN-Scan fehlgeschlagen: ${err.message}`);
	}
}

async function connectWifi(ssid, psk) {
	if (!ssid) throw new Error("SSID fehlt");
	// nmcli legt beim ersten "connect" ein Verbindungsprofil mit dem SSID-Namen
	// an - existiert bereits eins (z.B. von Raspberry Pi Imager beim Erststart,
	// oder aus einem vorherigen fehlgeschlagenen Versuch), verwendet nmcli
	// dieses stattdessen weiter. Ist es unvollständig (kein key-mgmt gesetzt),
	// schlägt der Connect mit "802-11-wireless-security.key-mgmt: property is
	// missing" fehl. Deshalb vor dem Verbinden ein evtl. vorhandenes Profil
	// löschen, damit nmcli garantiert ein frisches, vollständiges Profil anlegt.
	await run(["connection", "delete", ssid]).catch(() => {});
	const args = ["dev", "wifi", "connect", ssid, "ifname", WIFI_IFACE];
	if (psk) args.push("password", psk);
	try {
		await run(args, { timeout: 30000 });
		const active = await getActiveSsid();
		return { ok: active === ssid, ssid: active };
	} catch (err) {
		throw new Error(`WLAN-Verbindung zu "${ssid}" fehlgeschlagen: ${(err.stderr || err.message).trim()}`);
	}
}

async function ensureApProfile(ssid, psk) {
	try {
		await run(["con", "show", AP_CON_NAME]);
	} catch (err) {
		await run(["con", "add", "type", "wifi", "ifname", WIFI_IFACE, "con-name", AP_CON_NAME, "autoconnect", "no", "ssid", ssid]);
	}
	await run([
		"con", "modify", AP_CON_NAME,
		"802-11-wireless.mode", "ap",
		"802-11-wireless.band", "bg",
		"802-11-wireless.ssid", ssid,
		"ipv4.method", "shared",
		"ipv4.addresses", `${AP_IP}/24`,
		"wifi-sec.key-mgmt", "wpa-psk",
		"wifi-sec.psk", psk
	]);
}

async function startHotspot(ssid, psk) {
	if (!ssid || !psk || psk.length < 8) {
		throw new Error("AP-SSID und ein mindestens 8-stelliges AP-Passwort werden benötigt");
	}
	await ensureApProfile(ssid, psk);
	await run(["con", "up", AP_CON_NAME], { timeout: 20000 });
	return { ssid, ip: AP_IP };
}

async function stopHotspot() {
	try {
		await run(["con", "down", AP_CON_NAME]);
	} catch (err) {
		// bereits inaktiv – kein Fehler
	}
}

async function isHotspotActive() {
	try {
		const out = await run(["-t", "-f", "NAME", "con", "show", "--active"]);
		return out.split("\n").some((l) => l.trim() === AP_CON_NAME);
	} catch (err) {
		return false;
	}
}

function generatePassword(length = 12) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
	const bytes = crypto.randomBytes(length);
	let out = "";
	for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
	return out;
}

module.exports = {
	WIFI_IFACE,
	AP_CON_NAME,
	AP_IP,
	checkConnectivity,
	getActiveSsid,
	scanWifi,
	connectWifi,
	startHotspot,
	stopHotspot,
	isHotspotActive,
	generatePassword
};
