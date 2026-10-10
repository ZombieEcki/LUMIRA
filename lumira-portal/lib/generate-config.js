// LUMIRA – settings.json → config.js
//
// Gemeinsam genutzter Generator (siehe concept/selfservice.md Abschnitt 7):
// [Web-Portal] + [install.sh-Wizard] → settings.json → generate-config.js → config.js
//
// Erzeugt bewusst eine reine JSON-Struktur (gültiges Objektliteral in JS) –
// keine handgebaute String-Verkettung mit Anführungszeichen-Mischmasch, die
// schon einmal zu einem stillen Syntaxfehler geführt hat (siehe CHECKLIST.md
// / Git-Historie von portal.html).
"use strict";

const { getEdition } = require("./editions");
const familyDates = require("./family-dates");

// „Wichtige Termine“ → Format von MMM-SmartCompliments ("MM-TT"). Rechnet
// auch alte Einträge um, die die frühere Personen-Seite als "TT.MM."
// gespeichert hat (die wurden vom Modul nie erkannt). Ungültige fallen weg.
function birthdaysFor(family) {
	return (family.birthdays || [])
		.map((b) => ({ name: String((b && b.name) || "").trim(), date: familyDates.toMMDD(b && b.date) }))
		.filter((b) => b.name && b.date);
}

function countdownsFor(family) {
	return (family.countdowns || [])
		.map((c) => ({ label: String((c && c.label) || "").trim(), date: familyDates.toMMDD(c && c.date) }))
		.filter((c) => c.label && c.date);
}

function buildModules(settings) {
	const edition = getEdition(settings.edition);
	const modules = [
		{ module: "alert" },
		{ module: "updatenotification", position: "top_bar" },
		{
			module: "clock",
			position: "top_left",
			config: { displayType: "digital", displaySeconds: false }
		}
	];

	// Familienplan (concept/familienplan.md) – direkt nach der Uhr, damit er
	// in top_left unter ihr steht. Inhalte kommen live aus familyplan.json,
	// hier nur Einbindung/Position/Breite.
	const familyPlan = settings.familyPlan || {};
	if (edition.hasFamily && familyPlan.enabled) {
		modules.push({
			module: "MMM-FamilyPlan",
			position: familyPlan.position || "top_left",
			config: {
				maxWidth: familyPlan.maxWidth || "300px",
				layout: familyPlan.layout === "inline" ? "inline" : "stacked",
				showHeader: true,
				showWeekRange: true,
				hideOnAlarmPhases: edition.hasAlarm ? [1] : []
			}
		});
	}

	if (edition.hasFamily) {
		const moods = (settings.compliments && settings.compliments.moods) || {};
		modules.push({
			module: "MMM-SmartCompliments",
			position: "top_center",
			config: {
				updateInterval: 30000,
				fadeSpeed: 4000,
				moodHerzlich: moods.herzlich !== false,
				moodMotivierend: moods.motivierend !== false,
				moodHumorvoll: moods.humorvoll !== false,
				birthdays: birthdaysFor(settings.family),
				birthdayText: "🥳 Happy Birthday, {name}!",
				birthdayReminderDays: 3,
				weddingDate: familyDates.toFullDate(settings.family.weddingDate) || "",
				countdowns: countdownsFor(settings.family),
				weddingText: "❤️ Alles Gute zum Hochzeitstag!",
				anniversaryReminderDays: 7,
				firefighterIntegration: edition.hasAlarm,
				hideOnAlarmPhases: edition.hasAlarm ? [1] : [],
				afterDutyEnabled: edition.hasAlarm,
				afterDutyExclusive: false,
				afterDutyDurationMinutes: 0,
				manualControlEnabled: true,
				manualControlPort: 8091
			}
		});
	}

	if (edition.hasAlarm) {
		modules.push({
			module: "MMM-aPagerAlarm",
			position: "fullscreen_above",
			config: {
				webhookPort: 8090,
				webhookPath: "/alarm",
				title: settings.alarm.title || edition.alarmTitle,
				readyText: edition.readyText,
				personName: settings.person.name,
				alarmDuration: settings.alarm.alarmDuration,
				infoDuration: settings.alarm.infoDuration,
				returnDuration: settings.alarm.returnDuration,
				playSound: !!settings.alarm.playSound,
				soundFile: settings.alarm.soundFile || "alarm.mp3",
				dimBackground: true,
				showCountdown: true,
				forwardTargets: settings.alarm.haWebhookUrl ? [settings.alarm.haWebhookUrl] : []
			}
		});
	}

	const calUrls = (settings.calendar.urls || []).filter(Boolean);
	if (edition.hasCal && calUrls.length) {
		modules.push({
			module: "calendar",
			header: edition.hasFamily ? "Familienkalender" : "Kalender",
			position: "bottom_left",
			config: {
				maximumEntries: 5,
				// Mehrere Kalender werden vom calendar-Modul nativ zu einer
				// gemeinsamen, chronologisch sortierten Agenda zusammengeführt -
				// bewusst kein separates Modul pro Kalender (siehe concept/…-Notiz
				// zur Portal-Änderung "Kalender/News trennen").
				calendars: calUrls.map((url) => ({ symbol: "calendar-check", url }))
			}
		});
	}

	modules.push({
		module: "weather",
		position: "top_right",
		config: {
			weatherProvider: "openmeteo",
			type: "current",
			lat: settings.location.lat,
			lon: settings.location.lon
		}
	});
	modules.push({
		module: "weather",
		position: "top_right",
		header: "Wettervorhersage",
		config: {
			weatherProvider: "openmeteo",
			type: "forecast",
			lat: settings.location.lat,
			lon: settings.location.lon
		}
	});

	if (edition.hasRain && settings.rainRadar.enabled) {
		modules.push({
			module: "MMM-RainRadarDWD",
			position: "top_right",
			config: {
				lat: settings.location.lat,
				lon: settings.location.lon,
				alwaysVisible: true,
				showIfRainWithin: 120,
				timePast: 60,
				timeFuture: 120,
				frameStep: 10,
				width: "350px",
				height: "350px",
				zoomLevel: 9,
				cloudBlur: 12,
				markerSymbol: "fa-home",
				markerColor: "#ff0000",
				showLegend: true,
				legendPosition: "bottom",
				animationSpeed: 2000,
				updateInterval: 600000,
				logLevel: "INFO"
			}
		});
	}

	if (settings.news.url) {
		modules.push({
			module: "newsfeed",
			position: "bottom_bar",
			config: {
				feeds: [{ title: settings.news.title || "Nachrichten", url: settings.news.url }],
				showSourceTitle: false,
				showPublishDate: true,
				reloadInterval: 300000,
				updateInterval: 20000,
				maxNewsItems: 10,
				wrapTitle: true,
				wrapDescription: false,
				ignoreOldItems: true,
				ignoreOlderThan: 86400000
			}
		});
	}

	// Dezenter Status-Hinweis / SETUP-Anleitung auf dem Spiegel selbst
	// (siehe concept/selfservice.md Abschnitt 5).
	modules.push({
		module: "MMM-LumiraStatus",
		position: "bottom_right",
		config: {
			portalUrl: `http://${settings.hostname}.local:8092`,
			statusUrl: "http://127.0.0.1:8092/api/status",
			pollInterval: 5000,
			showStatusHint: true
		}
	});

	return modules;
}

function generateConfig(settings) {
	const edition = getEdition(settings.edition);
	const config = {
		address: "0.0.0.0",
		port: 8080,
		basePath: "/",
		ipWhitelist: [],
		useHttps: false,
		language: "de",
		locale: "de-DE",
		logLevel: ["INFO", "LOG", "WARN", "ERROR"],
		timeFormat: 24,
		units: "metric",
		modules: buildModules(settings)
	};

	const header =
		`/* MagicMirror² – ${edition.name}\n` +
		` * Automatisch erzeugt von lumira-portal/lib/generate-config.js\n` +
		` * ${new Date().toISOString()}\n` +
		` * Nicht von Hand bearbeiten – Änderungen über das Portal\n` +
		` * (http://${settings.hostname}.local:8092) oder ./install.sh --reconfigure.\n` +
		` */\n`;

	return `${header}let config = ${JSON.stringify(config, null, "\t")};\n\nif (typeof module !== "undefined") { module.exports = config; }\n`;
}

module.exports = { generateConfig, buildModules };
