/* MagicMirror²
 * Module: MMM-SmartCompliments
 *
 * Intelligenter Ersatz für das Standardmodul "compliments".
 * Zeigt immer genau EINE Botschaft an und entscheidet per Priorität,
 * welche gerade am sinnvollsten ist (Uhrzeit, Wochentag, Jahreszeit,
 * Wetter, Kalender, Geburtstage, Hochzeitstag, Familienaufgaben …).
 *
 * Kommuniziert mit MMM-aPagerAlarm: während eines Einsatzes (Zustand 1–3)
 * blendet sich dieses Modul vollständig aus. Der Alarm hat immer Vorrang.
 *
 * Auswahl-Logik (kurz):
 *   - Tier A (exklusiv, wenn zutreffend): Geburtstag heute, Hochzeitstag heute,
 *     aktive Wetterwarnung, Feiertag heute.
 *   - Tier B (Familienmix): Tageszeit, Wochentag, Jahreszeit, Wetterhinweis,
 *     Kalender, Aufgaben, Erinnerungen, Familie, Motivation, Humor.
 *   - Die letzten `rememberLastMessages` Nachrichten werden nicht wiederholt.
 *
 * By Liam Eckhof
 * MIT Licensed.
 */

Module.register("MMM-SmartCompliments", {

	// ------------------------------------------------------------------
	// Standard-Konfiguration
	// ------------------------------------------------------------------
	defaults: {
		updateInterval: 30000,       // Wechselintervall der Nachrichten (ms)
		fadeSpeed: 3000,             // Ein-/Ausblendzeit (ms)
		emojis: true,                // Emojis anzeigen (false = entfernen)

		// Manueller Ein-/Aus-Schalter per URL (kleiner Webhook-Server)
		manualControlEnabled: true,  // Schalter aktivieren
		manualControlPort: 8091,     // Port (nicht 8080 = MM, nicht 8090 = Alarm)
		startHidden: false,          // beim Start ausgeblendet starten?

		// Integrationen (je nach vorhandenen Modulen)
		firefighterIntegration: true,// Feuerwehr-Kopplung aktiv (APAGER_STATE auswerten)
		hideOnAlarmPhases: [1],      // in welchen Phasen ausblenden: 1=Alarm, 2=im Einsatz, 3=war im Einsatz
		                             //  z. B. [1] = nur akuter Alarm, [1,2,3] = ganzer Einsatz

		// Wertschätzung NACH dem Einsatz (Nachwirkung)
		afterDutyEnabled: true,      // nach Einsatzende Danke-Botschaften zeigen
		afterDutyExclusive: false,   // true = nur Danke; false = gemischt mit normalen Sprüchen
		afterDutyDurationMinutes: 0, // 0 = bis Mitternacht, sonst X Minuten nach Einsatzende
		afterDutyMessages: [
			"❤️ Danke, dass du heute für andere da warst.",
			"🚒 Schön, dass du wieder sicher zuhause bist.",
			"❤️ Heute warst du im Einsatz – jetzt gehört der Tag wieder dir.",
			"👨‍🚒 Danke für deinen Einsatz heute.",
			"❤️ Wir sind stolz auf dich."
		],

		weatherIntegration: true,    // via Wettermodul-Notification
		calendarIntegration: true,   // via CALENDAR_EVENTS
		choresIntegration: true,     // via choresNotification
		choresNotification: "CHORES_UPDATE", // erwartet { open, done }

		rememberLastMessages: 10,    // wie viele Nachrichten nicht wiederholen

		// Persönliche Ereignisse
		birthdays: [                 // { name, date: "MM-TT" }
			// { name: "Marie", date: "03-15" }
		],
		birthdayReminderDays: 3,     // Vorlauf für Geburtstagserinnerung
		birthdayText: "🎂 Heute hat {name} Geburtstag.",   // {name} wird ersetzt
		weddingDate: "",             // "JJJJ-MM-TT" (z. B. "2010-06-20")
		anniversaryReminderDays: 7,  // Vorlauf für Hochzeitstag-Erinnerung
		weddingText: "❤️ Alles Liebe zum Hochzeitstag.",  // Text am Hochzeitstag
		countdowns: [                // optionale Countdowns { label, date }
			// { label: "Weihnachten", date: "12-24" }
		],

		// Wetter-Schwellen für Warnungen
		heatTemp: 30,                // ab dieser °C: Hitzewarnung
		frostTemp: 0,                // ab/unter dieser °C: Frostwarnung
		stormWindKmh: 50,            // ab dieser km/h: Sturmwarnung

		// ---- Nachrichtenlisten (alle frei überschreibbar) ----
		morningMessages: [
			"Guten Morgen, Sonnenschein! ☀️",
			"Der Kaffee wartet schon ☕",
			"Heute wird ein guter Tag 🌅",
			"Aufstehen und strahlen! ✨",
			"Neuer Tag, neues Glück 🍀",
			"Heute kannst du alles schaffen 💪",
			"Erst Kaffee, dann Welt retten ☕🚒",
			"Starte mit einem Lächeln 😊",
			"Die Welt wartet auf dich 🌍",
			"Jeder Tag ist eine neue Chance 🌈"
		],
		forenoonMessages: [
			"Läuft bei dir! 💪",
			"Schon genug Wasser getrunken? 💧",
			"Bald ist Mittagspause 🍽️"
		],
		afternoonMessages: [
			"Läuft bei dir! 💪",
			"Halbzeit – weiter so! ⏳",
			"Du machst das großartig 🙌",
			"Schon genug Wasser getrunken? 💧",
			"Nicht nachlassen 🚀",
			"Der Feierabend kommt näher 😄",
			"Du bist auf dem richtigen Weg 👍",
			"Kleine Pause? 🍪",
			"Heute läuft's richtig gut 😎"
		],
		eveningMessages: [
			"Feierabend! 🌙",
			"Zeit zum Entspannen 🛋️",
			"Familienzeit ❤️",
			"Der Tag war deiner 🏆",
			"Jetzt Füße hochlegen 🍿",
			"Zeit für einen gemütlichen Abend ✨"
		],
		nightMessages: [
			"Gute Nacht 😴",
			"Morgen wartet ein neuer Tag 🌅"
		],

		familyMessages: [
			"Du siehst heute fantastisch aus! 😍",
			"Schön, dass es dich gibt 💛",
			"Bleib so wie du bist 🌈",
			"Familie ist das Wichtigste ❤️",
			"Zuhause ist da, wo die Familie ist 🏡",
			"Genieße die kleinen Momente 🌼",
			"Du bist unbezahlbar ❤️",
			"Nicht jeder Held trägt einen Umhang 🚒",
			"Retten. Löschen. Bergen. Schützen. ❤️‍🔥",
			"Möge dein Funkmelder heute ruhig bleiben 📟",
			"Danke für deinen Einsatz 👨‍🚒"
		],
		motivationMessages: [
			"Lächeln nicht vergessen 😊",
			"Du bist ein Held 🦸",
			"Mach heute etwas, worauf du morgen stolz bist 🏆",
			"Du schaffst mehr als du glaubst 💪",
			"Jeder Tag ist ein Neuanfang 🌅",
			"Du bist stärker als dein innerer Schweinehund 🐷",
			"Ein Lächeln kostet nichts 😊",
			"Heute wird legendär 🌟",
			"Vergiss nicht zu trinken 💧",
			"Du bist heute die beste Version von dir 💯",
			"Alles beginnt mit dem ersten Schritt 👣",
			"Heute ist dein Tag! 🎉",
			"Manchmal reicht ein Lächeln, um den Tag zu verändern 😊",
			"Glück ist selbstgemacht 🍀"
		],
		humorMessages: [
			"Das Leben ist zu kurz für schlechte Laune 😄",
			"Kaffee löst zwar nicht alles... aber vieles ☕",
			"Kalorien zählen heute nicht 🍕😂",
			"Der Kühlschrank glaubt an dich 🧀😂",
			"Erwachsen sein ist auch nur Improvisation 🤣",
			"Heute bitte keine peinlichen WhatsApps verschicken 📱",
			"Das Leben ist schön – besonders mit Kaffee ☕"
		],

		weekdayMessages: {
			1: [
				"Montag... Kaffee hilft! ☕",
				"Neue Woche – neue Chancen 🚀",
				"Montag ist nur der Anfang 💪",
				"Du schaffst auch diesen Montag 😄"
			],
			2: [
				"Dienstag läuft doch schon viel besser 😎",
				"Heute wird produktiv 📈",
				"Bleib dran! 👍"
			],
			3: [
				"Bergfest! ⛰️",
				"Die Hälfte der Woche ist geschafft 🎉",
				"Das Wochenende kommt näher 😄"
			],
			4: [
				"Fast Freitag 😉",
				"Nur noch einmal schlafen 😄",
				"Endspurt! 🏁"
			],
			5: [
				"Freitag!! 🎉",
				"Das Wochenende ruft 🍻",
				"Heute ist gute Laune Pflicht 😎",
				"Nur noch bis Feierabend 💪"
			],
			6: [
				"Schönes Wochenende ☀️",
				"Genieße den Tag ❤️",
				"Zeit für Familie 🏡",
				"Mach heute etwas Schönes 😊"
			],
			0: [
				"Genieße den Sonntag ☕",
				"Akkus aufladen 🔋",
				"Familienzeit ❤️",
				"Entspannt in die neue Woche starten 🌈"
			]
		},
		seasonMessages: {
			spring: ["Die Natur wacht auf. 🌱"],
			summer: ["Genießt das schöne Wetter. ☀️"],
			autumn: ["Zeit für Tee und Kuscheldecke. 🍂"],
			winter: ["Macht es euch gemütlich. ❄️"]
		},
		holidayMessages: {
			"01-01": ["🎉 Frohes neues Jahr!"],
			"02-14": ["❤️ Happy Valentinstag."],
			"10-31": ["🎃 Happy Halloween."],
			"12-24": ["🎄 Frohe Weihnachten."],
			"12-25": ["🎄 Frohe Weihnachten."],
			"12-26": ["🎄 Schöne Feiertage."],
			"12-31": ["🎆 Guten Rutsch ins neue Jahr!"]
		},

		// Wetterhinweise (nicht kritisch)
		weatherHints: {
			rain: ["Schirm nicht vergessen. ☔"],
			snow: ["Vielleicht fällt heute Schnee. ❄️"]
		},
		// Wetterwarnungen (kritisch, Tier A)
		weatherWarnings: {
			heat: ["Heute wird es heiß.\nViel trinken. 💧"],
			frost: ["Heute Morgen könnte es glatt sein.\nFahrt vorsichtig."],
			storm: ["Heute wird es windig.\nLose Gegenstände sichern."]
		}
	},

	// ------------------------------------------------------------------
	// Interner Zustand
	// ------------------------------------------------------------------
	history: [],            // zuletzt gezeigte Nachrichten
	currentMessage: "",     // aktuell angezeigte Nachricht
	updateTimer: null,      // Wechsel-Interval
	firefighterActive: false,// unterdrückt Anzeige, wenn true (nur in hideOnAlarmPhases)
	einsatzOngoing: false,  // läuft gerade ein Einsatz (Phase 1–3)?
	manuallyHidden: false,  // manuell per URL ausgeschaltet
	dutyEndedAt: 0,         // Zeitpunkt, zu dem der letzte Einsatz endete (Nachwirkung)
	weather: null,          // { temp, windKmh, type }
	calendarEvents: [],     // Kalendertermine
	chores: null,           // { open, done }

	getStyles: function () {
		return ["MMM-SmartCompliments.css"];
	},

	start: function () {
		Log.info("Starting module: " + this.name);
		this.history = [];
		this.manuallyHidden = !!this.config.startHidden;

		// Webhook-Server für den manuellen Schalter starten
		if (this.config.manualControlEnabled) {
			this.sendSocketNotification("SC_CONFIG", {
				port: this.config.manualControlPort
			});
		}

		this.updateMessage();
		this.updateTimer = setInterval(() => this.updateMessage(), this.config.updateInterval);
	},

	// Manuelle Befehle vom node_helper (URL-Schalter)
	socketNotificationReceived: function (notification, payload) {
		if (notification === "SC_CONTROL") {
			const action = payload && payload.action;
			if (action === "off") { this.manuallyHidden = true; }
			else if (action === "on") { this.manuallyHidden = false; }
			else if (action === "toggle") { this.manuallyHidden = !this.manuallyHidden; }
			Log.info(this.name + ": manueller Schalter -> " + (this.manuallyHidden ? "AUS" : "AN"));
			this.updateDom(this.config.fadeSpeed);
		}
	},

	// ------------------------------------------------------------------
	// Notifications von anderen Modulen
	// ------------------------------------------------------------------
	notificationReceived: function (notification, payload, sender) {
		// Feuerwehr: MMM-aPagerAlarm meldet Zustandswechsel
		if (notification === "APAGER_STATE" && this.config.firefighterIntegration) {
			const state = payload && typeof payload.state === "number" ? payload.state : 0;

			// (1) Ausblenden nur in den konfigurierten Alarm-Phasen (z. B. nur Phase 1)
			const phases = Array.isArray(this.config.hideOnAlarmPhases) ? this.config.hideOnAlarmPhases : [];
			this.firefighterActive = phases.indexOf(state) !== -1;

			// (2) Nachwirkung: Ende des GESAMTEN Einsatzes erkennen (state kehrt auf 0 zurück)
			const ongoing = state > 0; // 1 Alarm, 2 im Einsatz, 3 war im Einsatz
			if (this.einsatzOngoing && !ongoing) {
				this.dutyEndedAt = Date.now(); // Einsatz vollständig beendet
			}
			this.einsatzOngoing = ongoing;

			// Anzeige aktualisieren (blendet aus bzw. wählt neue Botschaft)
			this.updateMessage();
			return;
		}

		// Kalender (Standardmodul "calendar")
		if (notification === "CALENDAR_EVENTS" && this.config.calendarIntegration) {
			this.calendarEvents = Array.isArray(payload) ? payload : [];
			return;
		}

		// Familienaufgaben (z. B. MMM-FamilyChores)
		if (notification === this.config.choresNotification && this.config.choresIntegration) {
			this.handleChores(payload);
			return;
		}

		// Wetter – mehrere gängige Notifications defensiv unterstützen
		if (this.config.weatherIntegration) {
			this.handleWeather(notification, payload);
		}
	},

	handleChores: function (payload) {
		if (!payload) { return; }
		if (typeof payload.open === "number") {
			this.chores = { open: payload.open, done: payload.done || 0 };
		} else if (Array.isArray(payload)) {
			const open = payload.filter((t) => !t.done && !t.completed).length;
			this.chores = { open: open, done: payload.length - open };
		}
	},

	handleWeather: function (notification, payload) {
		if (!payload) { return; }
		let temp, windKmh, type;

		// Neues Wettermodul: WEATHER_UPDATED -> payload.currentWeather
		if (notification === "WEATHER_UPDATED" && payload.currentWeather) {
			const w = payload.currentWeather;
			temp = w.temperature;
			windKmh = this.toKmh(w.windSpeed);
			type = w.weatherType;
		}
		// Älteres Modul: CURRENTWEATHER_DATA -> payload direkt
		else if (notification === "CURRENTWEATHER_DATA" && payload.data) {
			const w = payload.data;
			temp = w.main ? w.main.temp : undefined;
			windKmh = w.wind ? this.toKmh(w.wind.speed) : undefined;
			type = w.weather && w.weather[0] ? w.weather[0].main : undefined;
		}
		// Generischer Fallback
		else if (typeof payload.temperature !== "undefined") {
			temp = payload.temperature;
			windKmh = this.toKmh(payload.windSpeed);
			type = payload.weatherType;
		} else {
			return;
		}

		this.weather = {
			temp: typeof temp === "number" ? temp : null,
			windKmh: typeof windKmh === "number" ? windKmh : null,
			type: type ? String(type).toLowerCase() : null
		};
	},

	// m/s (Standard MM) grob in km/h umrechnen; wirkt auch bei km/h plausibel
	toKmh: function (speed) {
		const s = Number(speed);
		if (isNaN(s)) { return null; }
		return s * 3.6;
	},

	// ------------------------------------------------------------------
	// Nachrichtenauswahl
	// ------------------------------------------------------------------
	updateMessage: function () {
		if (this.firefighterActive) {
			this.currentMessage = "";
			this.updateDom(this.config.fadeSpeed);
			return;
		}
		this.currentMessage = this.selectMessage();
		this.updateDom(this.config.fadeSpeed);
	},

	selectMessage: function () {
		// Nachwirkung nach dem Einsatz
		if (this.afterDutyActive()) {
			if (this.config.afterDutyExclusive) {
				return this.selectFromPool(this.config.afterDutyMessages) || "";
			}
			// gemischt: etwa jede zweite Nachricht ist eine Danke-Botschaft
			if (Math.random() < 0.5) {
				return this.selectFromPool(this.config.afterDutyMessages) || "";
			}
		}

		const tierA = this.buildTierA();
		const pool = (tierA && tierA.length) ? tierA : this.buildAmbient();
		return this.selectFromPool(pool) || "";
	},

	// Ist die Einsatz-Nachwirkung gerade aktiv?
	afterDutyActive: function () {
		if (!this.config.afterDutyEnabled) { return false; }
		if (!this.config.firefighterIntegration) { return false; } // braucht die Kopplung
		if (this.einsatzOngoing) { return false; }           // laufender Einsatz: keine Nachwirkung
		if (this.firefighterActive) { return false; }        // gerade ausgeblendet
		if (!this.dutyEndedAt) { return false; }              // heute (noch) kein Einsatz
		const dur = Number(this.config.afterDutyDurationMinutes) || 0;
		if (dur > 0) {
			return (Date.now() - this.dutyEndedAt) <= dur * 60000;
		}
		// 0 = bis Mitternacht: gleicher Kalendertag wie das Einsatzende
		return this.isSameDay(new Date(this.dutyEndedAt), new Date());
	},

	// Tier A: exklusive, seltene Ereignisse (Reihenfolge = Priorität)
	buildTierA: function () {
		// Geburtstag heute
		const bdayToday = this.birthdaysToday();
		if (bdayToday.length) {
			return bdayToday.map((n) => this.applyName(this.config.birthdayText, n));
		}
		// Hochzeitstag heute
		if (this.isWeddingToday()) {
			return [this.config.weddingText];
		}
		// Wetterwarnung
		const warn = this.activeWeatherWarnings();
		if (warn.length) {
			return warn;
		}
		// Feiertag heute
		const holiday = this.config.holidayMessages[this.todayMMDD()];
		if (holiday && holiday.length) {
			return holiday.slice();
		}
		return null;
	},

	// Tier B: der große Familienmix (alles gleichrangig, wird gemischt)
	buildAmbient: function () {
		let pool = [];
		const now = new Date();

		// Tageszeit
		pool = pool.concat(this.timeOfDayMessages(now.getHours()));
		// Wochentag
		const wd = this.config.weekdayMessages[now.getDay()];
		if (wd) { pool = pool.concat(wd); }
		// Jahreszeit
		const season = this.config.seasonMessages[this.currentSeason(now)];
		if (season) { pool = pool.concat(season); }
		// Wetterhinweis (nicht kritisch)
		pool = pool.concat(this.weatherHintMessages());
		// Kalender
		pool = pool.concat(this.calendarMessages());
		// Aufgaben
		pool = pool.concat(this.choresMessages());
		// Erinnerungen (Geburtstag/Hochzeitstag bald)
		pool = pool.concat(this.reminderMessages());
		// Countdowns
		pool = pool.concat(this.countdownMessages());
		// Immer verfügbare Kategorien
		pool = pool.concat(this.config.familyMessages);
		pool = pool.concat(this.config.motivationMessages);
		pool = pool.concat(this.config.humorMessages);

		return pool;
	},

	selectFromPool: function (pool) {
		if (!pool || !pool.length) { return null; }
		let candidates = pool.filter((m) => this.history.indexOf(m) === -1);
		if (!candidates.length) { candidates = pool; }
		const msg = candidates[Math.floor(Math.random() * candidates.length)];
		this.history.push(msg);
		while (this.history.length > this.config.rememberLastMessages) {
			this.history.shift();
		}
		return msg;
	},

	// ------------------------------------------------------------------
	// Kategorie-Helfer
	// ------------------------------------------------------------------
	timeOfDayMessages: function (hour) {
		if (hour >= 5 && hour < 11) { return this.config.morningMessages; }
		if (hour >= 11 && hour < 12) { return this.config.forenoonMessages; }
		if (hour >= 12 && hour < 18) { return this.config.afternoonMessages; }
		if (hour >= 18 && hour < 22) { return this.config.eveningMessages; }
		return this.config.nightMessages;
	},

	currentSeason: function (date) {
		const m = date.getMonth() + 1;
		if (m >= 3 && m <= 5) { return "spring"; }
		if (m >= 6 && m <= 8) { return "summer"; }
		if (m >= 9 && m <= 11) { return "autumn"; }
		return "winter";
	},

	weatherHintMessages: function () {
		if (!this.weather || !this.weather.type) { return []; }
		const t = this.weather.type;
		let out = [];
		if (t.indexOf("rain") !== -1 || t.indexOf("regen") !== -1 || t.indexOf("drizzle") !== -1) {
			out = out.concat(this.config.weatherHints.rain || []);
		}
		if (t.indexOf("snow") !== -1 || t.indexOf("schnee") !== -1) {
			out = out.concat(this.config.weatherHints.snow || []);
		}
		return out;
	},

	activeWeatherWarnings: function () {
		if (!this.weather) { return []; }
		let out = [];
		const w = this.weather;
		if (typeof w.temp === "number" && w.temp >= this.config.heatTemp) {
			out = out.concat(this.config.weatherWarnings.heat || []);
		}
		if (typeof w.temp === "number" && w.temp <= this.config.frostTemp) {
			out = out.concat(this.config.weatherWarnings.frost || []);
		}
		if (typeof w.windKmh === "number" && w.windKmh >= this.config.stormWindKmh) {
			out = out.concat(this.config.weatherWarnings.storm || []);
		}
		return out;
	},

	calendarMessages: function () {
		if (!this.config.calendarIntegration || !this.calendarEvents.length) { return []; }
		const now = new Date();
		const todayCount = this.calendarEvents.filter((e) =>
			this.isSameDay(new Date(this.eventStart(e)), now)).length;
		const tomorrow = new Date(now.getTime() + 86400000);
		const tomorrowCount = this.calendarEvents.filter((e) =>
			this.isSameDay(new Date(this.eventStart(e)), tomorrow)).length;

		let out = [];
		if (todayCount === 0) {
			out.push("Heute ist der Kalender angenehm leer.");
		} else if (todayCount === 1) {
			out.push("Heute steht ein Termin im Kalender.");
		} else {
			out.push("Heute stehen " + todayCount + " Termine im Kalender.");
		}
		if (tomorrowCount > 0) {
			out.push("Morgen steht ein wichtiger Termin an.");
		}
		return out;
	},

	choresMessages: function () {
		if (!this.config.choresIntegration || !this.chores) { return []; }
		if (this.chores.open > 0) {
			const n = this.chores.open;
			return ["Heute " + (n === 1 ? "wartet noch eine Aufgabe." : "warten noch " + n + " Aufgaben.")];
		}
		return ["Super. Alle Aufgaben sind erledigt. ✅"];
	},

	reminderMessages: function () {
		let out = [];
		// Geburtstage in Kürze
		this.config.birthdays.forEach((b) => {
			const days = this.daysUntilMMDD(b.date);
			if (days > 0 && days <= this.config.birthdayReminderDays) {
				out.push("In " + days + (days === 1 ? " Tag" : " Tagen") + " hat " + b.name + " Geburtstag.");
			}
		});
		// Hochzeitstag in Kürze
		if (this.config.weddingDate) {
			const days = this.daysUntilMMDD(this.config.weddingDate.slice(5));
			if (days > 0 && days <= this.config.anniversaryReminderDays) {
				out.push("❤️ Noch " + days + (days === 1 ? " Tag" : " Tage") + " bis zum Hochzeitstag.");
			}
		}
		return out;
	},

	countdownMessages: function () {
		let out = [];
		(this.config.countdowns || []).forEach((c) => {
			const mmdd = c.date.length > 5 ? c.date.slice(5) : c.date;
			const days = this.daysUntilMMDD(mmdd);
			if (days > 0) {
				out.push("Noch " + days + (days === 1 ? " Tag" : " Tage") + " bis " + c.label + ".");
			}
		});
		return out;
	},

	// ------------------------------------------------------------------
	// Datums-Helfer
	// ------------------------------------------------------------------
	applyName: function (text, name) {
		return String(text || "").replace(/\{name\}/g, name || "");
	},

	pad2: function (n) { return String(n).padStart(2, "0"); },

	todayMMDD: function () {
		const d = new Date();
		return this.pad2(d.getMonth() + 1) + "-" + this.pad2(d.getDate());
	},

	birthdaysToday: function () {
		const today = this.todayMMDD();
		return this.config.birthdays
			.filter((b) => b.date === today)
			.map((b) => b.name);
	},

	isWeddingToday: function () {
		if (!this.config.weddingDate) { return false; }
		return this.config.weddingDate.slice(5) === this.todayMMDD();
	},

	// Tage bis zum nächsten Auftreten von "MM-TT"
	daysUntilMMDD: function (mmdd) {
		if (!mmdd || mmdd.indexOf("-") === -1) { return -1; }
		const parts = mmdd.split("-");
		const now = new Date();
		const year = now.getFullYear();
		let target = new Date(year, Number(parts[0]) - 1, Number(parts[1]));
		const startOfToday = new Date(year, now.getMonth(), now.getDate());
		if (target < startOfToday) {
			target = new Date(year + 1, Number(parts[0]) - 1, Number(parts[1]));
		}
		return Math.round((target - startOfToday) / 86400000);
	},

	isSameDay: function (a, b) {
		return a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();
	},

	eventStart: function (event) {
		// Standard-Kalendermodul liefert startDate als ms-String
		if (event.startDate) { return Number(event.startDate); }
		if (event.startdate) { return Number(event.startdate); }
		return Date.now();
	},

	// ------------------------------------------------------------------
	// Darstellung
	// ------------------------------------------------------------------
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "smartcompliments";

		if (this.manuallyHidden || this.firefighterActive || !this.currentMessage) {
			wrapper.classList.add("sc-hidden");
			return wrapper;
		}

		let text = this.currentMessage;
		if (!this.config.emojis) {
			text = this.stripEmojis(text);
		}
		// Zeilenumbrüche unterstützen
		wrapper.innerHTML = text.replace(/\n/g, "<br>");
		return wrapper;
	},

	stripEmojis: function (text) {
		// entfernt gängige Emoji-Bereiche und doppelte Leerzeichen
		return text
			.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, "")
			.replace(/\s{2,}/g, " ")
			.trim();
	}
});
