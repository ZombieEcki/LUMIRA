// LUMIRA – Live-Bild des Spiegels für das Portal (Karte „Spiegel“ auf Start).
//
// 1. Weg: MagicMirror läuft in Electron, der node_helper im Electron-
//    Hauptprozess – das Fenster kann sich selbst abfotografieren
//    (webContents.capturePage). Unabhängig von X11/Wayland, auch auf dem Pi 3.
// 2. Weg (MagicMirror ohne Fenster, „serveronly“): Wayland-Bildschirmfoto
//    per `grim`.
//
// Ein Bild wird höchstens alle `cacheMs` neu aufgenommen, gleichzeitige
// Anfragen teilen sich eine Aufnahme – mehrere offene Portale belasten den
// Pi nicht stärker als eines.
"use strict";

const LONG_SIDE = 800;
const QUALITY = 70;

function loadElectron() {
	try {
		const electron = require("electron");
		// Außerhalb von Electron liefert require("electron") nur einen Pfad
		return electron && typeof electron === "object" && electron.BrowserWindow ? electron : null;
	} catch (e) {
		return null;
	}
}

function createCapturer({
	electron = loadElectron(),
	execFile = require("child_process").execFile,
	now = () => Date.now(),
	cacheMs = 1500
} = {}) {
	let cached = null; // { at, buffer, method }
	let inFlight = null;

	async function viaElectron() {
		const win = electron.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
		if (!win) throw new Error("kein MagicMirror-Fenster");
		const image = await win.webContents.capturePage();
		if (!image || image.isEmpty()) throw new Error("leeres Bild");
		const { width, height } = image.getSize();
		const scaled = Math.max(width, height) > LONG_SIDE
			? image.resize(width >= height ? { width: LONG_SIDE, quality: "good" } : { height: LONG_SIDE, quality: "good" })
			: image;
		return scaled.toJPEG(QUALITY);
	}

	function viaGrim() {
		return new Promise((resolve, reject) => {
			execFile("grim", ["-t", "jpeg", "-q", String(QUALITY), "-s", "0.4", "-"],
				{ encoding: "buffer", maxBuffer: 8 * 1024 * 1024, timeout: 6000 },
				(err, stdout) => {
					if (err) return reject(new Error(err.code === "ENOENT" ? "grim nicht installiert" : err.message));
					if (!stdout || !stdout.length) return reject(new Error("leeres Bild"));
					resolve(stdout);
				});
		});
	}

	async function take() {
		if (electron) {
			try {
				return { buffer: await viaElectron(), method: "electron" };
			} catch (err) {
				// Fenster noch nicht da o. Ä. → grim versuchen
				try {
					return { buffer: await viaGrim(), method: "grim" };
				} catch (e) {
					throw err;
				}
			}
		}
		return { buffer: await viaGrim(), method: "grim" };
	}

	function capture() {
		if (cached && now() - cached.at < cacheMs) return Promise.resolve(cached);
		if (inFlight) return inFlight;
		inFlight = take()
			.then((shot) => {
				cached = { at: now(), buffer: shot.buffer, method: shot.method };
				return cached;
			})
			.finally(() => { inFlight = null; });
		return inFlight;
	}

	return { capture, hasElectron: !!electron };
}

// Nur das Portal auf demselben Gerät darf fragen: MagicMirror lauscht auf
// 0.0.0.0, das Bild geht im Heimnetz nur über das PIN-geschützte Portal raus.
function isLoopback(addr) {
	return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

module.exports = { createCapturer, isLoopback, LONG_SIDE };
