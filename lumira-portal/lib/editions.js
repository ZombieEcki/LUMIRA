// LUMIRA – Editions-Definitionen (einzige Quelle für generate-config.js,
// server.js und den install.sh --edition=…-Flag).
//
// Muss inhaltlich zu version/<edition>/config.js.sample und zu den
// EDITIONS-Flags in portal.html passen (hasAlarm/hasFamily/hasCal/hasRain).
// portal.html ist eine statische Vorschau ohne Build-Schritt und hält daher
// eine eigene Kopie dieser Flags – bei Änderungen hier bitte dort spiegeln.
"use strict";

const EDITIONS = {
	home: {
		name: "LUMIRA Home",
		hasAlarm: false,
		hasFamily: true,
		hasCal: true,
		hasRain: true,
		personLabel: "Name der Person",
		alarmTitle: "EINSATZ",
		readyText: "👷 Bereit machen!"
	},
	fire: {
		name: "LUMIRA Fire",
		hasAlarm: true,
		hasFamily: true,
		hasCal: true,
		hasRain: true,
		personLabel: "Name der Person im Einsatz",
		alarmTitle: "EINSATZ",
		readyText: "👷 Bereit machen!"
	},
	rescue: {
		name: "LUMIRA Rescue",
		hasAlarm: true,
		hasFamily: true,
		hasCal: true,
		hasRain: true,
		personLabel: "Name der Person im Dienst",
		alarmTitle: "EINSATZ",
		readyText: "🚑 Bereit machen!"
	},
	business: {
		name: "LUMIRA Business",
		hasAlarm: false,
		hasFamily: false,
		hasCal: true,
		hasRain: true,
		personLabel: "Anzeigename",
		alarmTitle: "EINSATZ",
		readyText: "👷 Bereit machen!"
	},
	station: {
		name: "LUMIRA Station",
		hasAlarm: true,
		hasFamily: false,
		hasCal: false,
		hasRain: false,
		personLabel: "Bezeichnung der Einheit",
		alarmTitle: "ALARM",
		readyText: "🚒 Bereit machen!"
	}
};

const EDITION_IDS = Object.keys(EDITIONS);
const DEFAULT_EDITION = "fire";

function isValidEdition(id) {
	return Object.prototype.hasOwnProperty.call(EDITIONS, id);
}

function getEdition(id) {
	return EDITIONS[id] || EDITIONS[DEFAULT_EDITION];
}

module.exports = { EDITIONS, EDITION_IDS, DEFAULT_EDITION, isValidEdition, getEdition };
