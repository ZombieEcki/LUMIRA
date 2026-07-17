#!/usr/bin/env node
// LUMIRA – Boot-/Watchdog-Logik (Phase 4, siehe concept/selfservice.md
// Abschnitt 2 + 4b). Wird von systemd/lumira-provision.timer regelmäßig
// (Standard: alle 2 Minuten) sowie einmal beim Booten aufgerufen
// (systemd/lumira-provision.service). Läuft absichtlich als kurzlebiges
// Einzel-Skript (kein Dauerprozess) – systemd übernimmt die Wiederholung.
"use strict";

const netLib = require("./lib/net");
const modeLib = require("./lib/mode");
const settingsLib = require("./lib/settings");

// Aufeinanderfolgende fehlgeschlagene Checks, bevor ein bereits im Heimnetz
// laufendes Gerät automatisch in den SETUP-Modus zurückfällt. Bei einem
// Timer-Intervall von 2 Minuten entspricht 5 also ~10 Minuten (Abschnitt 2).
const OFFLINE_THRESHOLD = Number(process.env.LUMIRA_OFFLINE_THRESHOLD || 5);

function log(...args) {
	console.log("[provision]", ...args);
}

async function ensureApPassword(settings) {
	let { apSsid, apPsk } = settings.network;
	apSsid = apSsid || "LUMIRA-Setup";
	if (!apPsk) {
		apPsk = netLib.generatePassword(12);
		settingsLib.patch({ network: { apSsid, apPsk } });
		log("neues AP-Passwort erzeugt");
	}
	return { apSsid, apPsk };
}

async function enterSetup(settings, reason) {
	const { apSsid, apPsk } = await ensureApPassword(settings);
	await netLib.startHotspot(apSsid, apPsk);
	modeLib.set(modeLib.MODES.SETUP, { reason, apSsid, apPsk, offlineChecks: 0 });
	log(`SETUP-Modus aktiv (${reason}) – WLAN "${apSsid}"`);
}

async function main() {
	const current = modeLib.get();
	const settings = settingsLib.load();

	if (current.mode === modeLib.MODES.SETUP) {
		// Selbstheilung: Falls der Hotspot z.B. nach einem Absturz nicht mehr
		// läuft, aber wir laut Zustand im Setup-Modus sein sollten, neu starten.
		const active = await netLib.isHotspotActive();
		if (!active && current.apSsid && current.apPsk) {
			log("Hotspot war inaktiv, starte neu:", current.apSsid);
			await netLib.startHotspot(current.apSsid, current.apPsk).catch((err) =>
				console.error("[provision] Hotspot-Neustart fehlgeschlagen:", err.message)
			);
		}
		return;
	}

	// FAMILY-Modus: Erstinbetriebnahme ohne hinterlegtes Heimnetz → sofort
	// SETUP (Abschnitt 3, Schritt 1), kein Grace-Zeitraum nötig.
	if (!settings.network.homeSsid) {
		log("kein Heimnetz hinterlegt – Ersteinrichtung");
		await enterSetup(settings, "first-boot");
		return;
	}

	const { online } = await netLib.checkConnectivity();
	if (online) {
		if (current.offlineChecks) modeLib.set(modeLib.MODES.FAMILY, { offlineChecks: 0 });
		return;
	}

	const offlineChecks = (current.offlineChecks || 0) + 1;
	log(`kein Netz (${offlineChecks}/${OFFLINE_THRESHOLD})`);
	if (offlineChecks < OFFLINE_THRESHOLD) {
		modeLib.set(modeLib.MODES.FAMILY, { offlineChecks });
		return;
	}

	await enterSetup(settings, "watchdog-offline");
}

main().catch((err) => {
	console.error("[provision] Fehler:", err);
	process.exit(1);
});
