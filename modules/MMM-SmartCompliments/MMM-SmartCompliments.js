/* MagicMirror²
 * Module: MMM-SmartCompliments
 *
 * Intelligenter Ersatz für das Standardmodul "compliments".
 * Zeigt immer genau EINE Botschaft an und entscheidet per Priorität,
 * welche gerade am sinnvollsten ist (Uhrzeit, Wochentag, Jahreszeit,
 * Wetter, amtliche Warnungen, Kalender, Geburtstage, Hochzeitstag …).
 *
 * Kommuniziert mit MMM-aPagerAlarm: während eines Einsatzes (Zustand 1–3)
 * blendet sich dieses Modul vollständig aus. Der Alarm hat immer Vorrang.
 *
 * Auswahl-Logik (kurz):
 *   - Nach einem Einsatz: Danke-Botschaften (gemischt oder exklusiv).
 *   - Exklusiv, wenn zutreffend: Geburtstag heute, Jahrestag heute, Feiertag.
 *   - Anlässe in einstellbarer Reihenfolge (amtliche Wetterwarnung vom DWD,
 *     Kalendertermin mit Stichwort, Wetterlage) – im eingestellten Anteil.
 *   - Sonst der Mix: Tageszeit, Wochentag, Jahreszeit, Kalender, Erinnerungen,
 *     Countdowns und alle eingeschalteten Kategorien (spruch-catalog.js).
 *   - Zuletzt gezeigte Sprüche werden nicht wiederholt.
 * Die Auswahl selbst steht in spruch-logic.js (auch im Portal und in den Tests).
 *
 * Sprüche, Kategorien, Anlässe und Darstellung kommen live aus
 * ~/.lumira/compliments.json (LUMIRA-Portal → Bildschirm → Sprüche).
 *
 * By Liam Eckhof
 * MIT Licensed.
 */

Module.register("MMM-SmartCompliments", {

	// ------------------------------------------------------------------
	// Standard-Konfiguration
	// ------------------------------------------------------------------
	defaults: {
		updateInterval: 30000,       // Wechselintervall (ms), solange das Portal nichts anderes sagt
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

		weatherIntegration: true,    // Wetter (MMM-LumiraWeather oder Standard-Wettermodul)
		calendarIntegration: true,   // via CALENDAR_EVENTS

		rememberLastMessages: 10,    // wie viele Nachrichten nicht wiederholen (Portal: „Wechsel“)

		// Alte Stimmungs-Schalter (config.js); gelten nur, bis im Portal die
		// Kategorien selbst geschaltet wurden
		moodHerzlich: true,
		moodMotivierend: true,
		moodHumorvoll: true,

		// Persönliche Ereignisse
		birthdays: [                 // { name, date: "MM-TT" }
			// { name: "Max", date: "01-01" }
		],
		birthdayReminderDays: 3,     // Vorlauf für Geburtstagserinnerung
		birthdayText: "🎂 Heute hat {name} Geburtstag.",   // {name} wird ersetzt
		weddingDate: "",             // "JJJJ-MM-TT" (z. B. "2010-06-20"), Rückfall ohne anniversaries
		anniversaries: [             // gemeinsame Jahrestage { type, label, date: "JJJJ-MM-TT" }
			// { type: "wedding", label: "Hochzeitstag", date: "2010-06-20" }
		],
		anniversaryReminderDays: 7,  // Vorlauf für Jahrestag-Erinnerungen
		weddingText: "❤️ Alles Liebe zum Hochzeitstag.",  // Text am Hochzeitstag
		countdowns: [                // optionale Countdowns { label, date }
			// { label: "Weihnachten", date: "12-24" }
		],

		// Wetter-Schwellen (Anlässe Hitze, Frost, Wind)
		heatTemp: 30,                // ab dieser °C
		frostTemp: 0,                // ab/unter dieser °C
		stormWindKmh: 50,            // ab dieser km/h

		// Die Listen der Kategorien (Tageszeit, Herzlich … ) stehen in spruch-catalog.js.
		// Wer ohne LUMIRA-Portal arbeitet, kann sie hier weiter überschreiben
		// (morningMessages, familyMessages, humorMessages … wie bisher).
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
		}
	},

	// ------------------------------------------------------------------
	// Interner Zustand
	// ------------------------------------------------------------------
	history: [],            // zuletzt gezeigte Sprüche (Schlüssel)
	current: null,          // aktuell angezeigt: { text, icon, answer?, id }
	revealed: false,        // Rätsel-Lösung schon sichtbar?
	updateTimer: null,      // Wechsel-Interval
	revealTimer: null,
	firefighterActive: false,// unterdrückt Anzeige, wenn true (nur in hideOnAlarmPhases)
	einsatzOngoing: false,  // läuft gerade ein Einsatz (Phase 1–3)?
	manuallyHidden: false,  // manuell per URL ausgeschaltet
	dutyEndedAt: 0,         // Zeitpunkt, zu dem der letzte Einsatz endete (Nachwirkung)
	weatherLumira: null,    // { temp, windKmh, code, isDay, at } aus MMM-LumiraWeather
	weatherOld: null,       // { temp, windKmh, type, at } aus dem Standard-Wettermodul
	warnings: null,         // { list, at } amtliche DWD-Warnungen
	calendarEvents: [],     // Kalendertermine
	lists: {},              // eigene Listen aus compliments.json (categories)
	settings: null,         // bereinigte Einstellungen (logic.cleanSettings)
	panel: null,            // frei platzierte Anzeige (position: fixed)

	getStyles: function () {
		return ["MMM-SmartCompliments.css", "spruch-view.css"];
	},

	getScripts: function () {
		return ["spruch-catalog.js", "spruch-logic.js"];
	},

	start: function () {
		Log.info("Starting module: " + this.name);
		this.history = [];
		this.lists = {};
		this.manuallyHidden = !!this.config.startHidden;
		this.settings = null;

		// node_helper starten: lädt die Sprüche aus compliments.json (immer)
		// und – falls aktiviert – den manuellen Schalter-Server.
		this.sendSocketNotification("SC_CONFIG", {
			manualControlEnabled: !!this.config.manualControlEnabled,
			port: this.config.manualControlPort
		});
		window.addEventListener("resize", () => this.paint(false));
	},

	// Erst nach dem Laden von spruch-catalog.js/spruch-logic.js loslegen
	notificationReceived: function (notification, payload, sender) {
		if (notification === "MODULE_DOM_CREATED") {
			if (!this.settings) this.settings = window.LumiraSpruchLogic.cleanSettings(null);
			this.updateMessage();
			this.restartTimer();
			return;
		}
		this.handleNotification(notification, payload, sender);
	},

	restartTimer: function () {
		clearInterval(this.updateTimer);
		const s = this.settings;
		const ms = s ? s.behavior.interval * 1000 : this.config.updateInterval;
		this.updateTimer = setInterval(() => this.updateMessage(), ms);
	},

	// Nachrichten vom node_helper
	socketNotificationReceived: function (notification, payload) {
		if (notification === "SC_CONTROL") {
			const action = payload && payload.action;
			if (action === "off") { this.manuallyHidden = true; }
			else if (action === "on") { this.manuallyHidden = false; }
			else if (action === "toggle") { this.manuallyHidden = !this.manuallyHidden; }
			Log.info(this.name + ": manueller Schalter -> " + (this.manuallyHidden ? "AUS" : "AN"));
			this.paint(true);
			return;
		}
		// Vom Portal gepflegte Sprüche und Einstellungen (compliments.json), live nachgeladen
		if (notification === "SC_COMPLIMENTS") {
			this.applyCompliments(payload);
		}
	},

	// Übernimmt compliments.json. Nur Darstellung geändert → derselbe Spruch
	// wird neu gezeichnet (keine neue Auswahl); Inhalte geändert → neuer Spruch.
	applyCompliments: function (payload) {
		if (!payload || typeof payload !== "object" || !window.LumiraSpruchLogic) { return; }
		const L = window.LumiraSpruchLogic;
		const before = this.settings;
		const beforeLists = JSON.stringify(this.lists);
		const lists = {};
		Object.keys(payload).forEach((key) => {
			if (Array.isArray(payload[key])) { lists[key] = payload[key].slice(); }
		});
		this.lists = lists;
		if (payload.weekdayMessages && typeof payload.weekdayMessages === "object") {
			Object.keys(payload.weekdayMessages).forEach((d) => {
				const list = payload.weekdayMessages[d];
				if (Array.isArray(list) && list.length) { this.config.weekdayMessages[d] = list.slice(); }
			});
		}
		if (payload.holidayMessages && typeof payload.holidayMessages === "object") {
			Object.keys(payload.holidayMessages).forEach((k) => {
				const list = payload.holidayMessages[k];
				if (Array.isArray(list) && list.length) { this.config.holidayMessages[k] = list.slice(); }
			});
		}
		if (payload.templates && typeof payload.templates === "object") {
			if (payload.templates.birthdayText) { this.config.birthdayText = payload.templates.birthdayText; }
			if (payload.templates.weddingText) { this.config.weddingText = payload.templates.weddingText; }
		}
		this.settings = L.cleanSettings(payload.settings || {});
		const s = this.settings;
		const contentChanged = !before || beforeLists !== JSON.stringify(this.lists) ||
			JSON.stringify([before.enabled, before.off, before.own, before.words]) !== JSON.stringify([s.enabled, s.off, s.own, s.words]);
		if (!before || before.behavior.interval !== s.behavior.interval) { this.restartTimer(); }
		if (contentChanged || !this.current) { this.updateMessage(); }
		else { this.paint(false); }
	},

	// ------------------------------------------------------------------
	// Notifications von anderen Modulen
	// ------------------------------------------------------------------
	handleNotification: function (notification, payload) {
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

		// Eigenes Wettermodul: aktuelles Wetter (Open-Meteo) und amtliche Warnungen (DWD)
		if (notification === "LUMIRA_WEATHER" && this.config.weatherIntegration && payload) {
			const c = payload.current;
			this.weatherLumira = c && payload.updatedAt ? {
				temp: typeof c.temp === "number" ? c.temp : null,
				windKmh: typeof c.wind === "number" ? c.wind : null,
				code: typeof c.code === "number" ? c.code : null,
				isDay: c.isDay,
				at: Date.parse(payload.updatedAt)
			} : null;
			const w = payload.warnings;
			this.warnings = w && w.updatedAt && Array.isArray(w.list) ? { list: w.list, at: Date.parse(w.updatedAt) } : null;
			return;
		}

		// Standard-Wettermodul – mehrere gängige Notifications defensiv unterstützen
		if (this.config.weatherIntegration) {
			this.handleWeather(notification, payload);
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

		this.weatherOld = {
			temp: typeof temp === "number" ? temp : null,
			windKmh: typeof windKmh === "number" ? windKmh : null,
			type: type ? String(type).toLowerCase() : null,
			at: Date.now()
		};
	},

	// m/s (Standard MM) grob in km/h umrechnen; wirkt auch bei km/h plausibel
	toKmh: function (speed) {
		const s = Number(speed);
		if (isNaN(s)) { return null; }
		return s * 3.6;
	},

	// Eigenes Wettermodul bevorzugt, solange frisch
	currentWeather: function () {
		const w = this.weatherLumira;
		if (w && Date.now() - w.at < 3 * 3600000) { return w; }
		return this.weatherOld;
	},

	// ------------------------------------------------------------------
	// Nachrichtenauswahl
	// ------------------------------------------------------------------
	updateMessage: function () {
		if (!window.LumiraSpruchLogic) { return; }
		clearTimeout(this.revealTimer);
		this.revealed = false;
		this.current = this.firefighterActive ? null : this.selectMessage();
		if (this.current) {
			this.history.push(this.current.id || this.current.text);
			const keep = this.settings ? this.settings.behavior.remember : this.config.rememberLastMessages;
			while (this.history.length > keep) { this.history.shift(); }
		}
		this.paint(true);
		// Rätsel: Lösung nach der eingestellten Zeit (spätestens zur Hälfte des Wechsels)
		if (this.current && this.current.answer) {
			const s = this.settings.behavior;
			const ms = Math.min(s.riddleDelay, Math.max(3, s.interval / 2)) * 1000;
			this.revealTimer = setTimeout(() => { this.revealed = true; this.revealAnswer(); }, ms);
		}
	},

	msg: function (text) { return text ? { text: text, id: text, icon: "" } : null; },

	// Listen: Portal (compliments.json) > config.js > eingebaut (spruch-catalog.js)
	effectiveLists: function () {
		const out = {};
		window.LumiraSpruchCatalog.CATEGORIES.forEach((c) => {
			const portal = this.lists[c.list];
			const conf = this.config[c.list];
			if (Array.isArray(portal) && portal.length) { out[c.list] = portal; }
			else if (Array.isArray(conf) && conf.length) { out[c.list] = conf; }
		});
		return out;
	},

	selectMessage: function () {
		const L = window.LumiraSpruchLogic;
		const C = window.LumiraSpruchCatalog;
		const s = this.settings || L.cleanSettings(null);
		const lists = this.effectiveLists();
		const list = (key) => L.itemsOf(C.byKey(key), s, lists);

		// Nachwirkung nach dem Einsatz
		if (this.afterDutyActive()) {
			if (this.config.afterDutyExclusive || Math.random() < 0.5) {
				return this.msg(this.selectFromPool(list("afterDuty")));
			}
		}

		// Exklusiv: Geburtstag, Jahrestag, Feiertag
		const tierA = this.buildTierA();
		if (tierA && tierA.length) { return this.msg(this.selectFromPool(tierA)); }

		const now = new Date();
		const timeCat = C.byKey(this.timeOfDayKey(now.getHours()));
		const extra = [
			{ key: timeCat.key, icon: timeCat.icon, items: L.itemsOf(timeCat, s, lists) },
			{ key: "weekday", items: this.config.weekdayMessages[now.getDay()] || [] },
			{ key: "season", items: this.config.seasonMessages[this.currentSeason(now)] || [] },
			{ key: "calendar", icon: "📅", items: this.calendarMessages() },
			{ key: "reminder", icon: "🎈", items: this.reminderMessages() },
			{ key: "countdown", icon: "⏳", items: this.countdownMessages() }
		];
		return L.choose({
			now: now,
			settings: s,
			lists: lists,
			legacy: { herzlich: this.config.moodHerzlich, motivierend: this.config.moodMotivierend, humorvoll: this.config.moodHumorvoll },
			flags: { alarm: !!this.config.firefighterIntegration },
			weather: this.currentWeather(),
			warnings: this.warnings,
			events: this.config.calendarIntegration ? this.calendarEvents : [],
			thresholds: { heatTemp: this.config.heatTemp, frostTemp: this.config.frostTemp, stormWindKmh: this.config.stormWindKmh },
			extra: extra,
			history: this.history
		});
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

	// Exklusive, seltene Ereignisse (Reihenfolge = Priorität)
	buildTierA: function () {
		// Geburtstag heute
		const bdayToday = this.birthdaysToday();
		if (bdayToday.length) {
			return bdayToday.map((n) => this.applyName(this.config.birthdayText, n));
		}
		// Jahrestag heute (Hochzeitstag, Kennenlerntag …)
		const annToday = this.anniversariesToday();
		if (annToday.length) {
			return annToday.map((a) => this.anniversaryText(a));
		}
		// Feiertag heute
		const holiday = this.config.holidayMessages[this.todayMMDD()];
		if (holiday && holiday.length) {
			return holiday.slice();
		}
		return null;
	},

	selectFromPool: function (pool) {
		if (!pool || !pool.length) { return null; }
		let candidates = pool.filter((m) => this.history.indexOf(m) === -1);
		if (!candidates.length) { candidates = pool; }
		return candidates[Math.floor(Math.random() * candidates.length)];
	},

	// ------------------------------------------------------------------
	// Kategorie-Helfer
	// ------------------------------------------------------------------
	timeOfDayKey: function (hour) {
		if (hour >= 5 && hour < 11) { return "morning"; }
		if (hour >= 11 && hour < 12) { return "forenoon"; }
		if (hour >= 12 && hour < 18) { return "afternoon"; }
		if (hour >= 18 && hour < 22) { return "evening"; }
		return "night";
	},

	currentSeason: function (date) {
		const m = date.getMonth() + 1;
		if (m >= 3 && m <= 5) { return "spring"; }
		if (m >= 6 && m <= 8) { return "summer"; }
		if (m >= 9 && m <= 11) { return "autumn"; }
		return "winter";
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

	reminderMessages: function () {
		let out = [];
		// Geburtstage in Kürze
		this.config.birthdays.forEach((b) => {
			const days = this.daysUntilMMDD(b.date);
			if (days > 0 && days <= this.config.birthdayReminderDays) {
				out.push("In " + days + (days === 1 ? " Tag" : " Tagen") + " hat " + b.name + " Geburtstag.");
			}
		});
		// Jahrestage in Kürze
		this.anniversaryList().forEach((a) => {
			const days = this.daysUntilMMDD(a.date.slice(5));
			if (days > 0 && days <= this.config.anniversaryReminderDays) {
				const what = a.type === "other" ? "„" + a.label + "“" : "zum " + a.label;
				out.push("❤️ Noch " + days + (days === 1 ? " Tag" : " Tage") + " bis " + what + ".");
			}
		});
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

	// Jahrestage; ältere Konfigurationen haben nur weddingDate
	anniversaryList: function () {
		const list = this.config.anniversaries || [];
		if (list.length) { return list.filter((a) => a && a.label && /^\d{4}-\d{2}-\d{2}$/.test(a.date)); }
		return this.config.weddingDate ? [{ type: "wedding", label: "Hochzeitstag", date: this.config.weddingDate }] : [];
	},

	anniversariesToday: function () {
		const today = this.todayMMDD();
		return this.anniversaryList().filter((a) => a.date.slice(5) === today);
	},

	// "❤️ Alles Gute zum Hochzeitstag! (16 Jahre)"
	anniversaryText: function (a) {
		const years = new Date().getFullYear() - Number(a.date.slice(0, 4));
		const base = a.type === "wedding" ? this.config.weddingText
			: a.type === "other" ? "❤️ Heute: " + a.label + "!"
			: "❤️ Alles Gute zum " + a.label + "!";
		return years > 0 ? base + " (" + years + (years === 1 ? " Jahr" : " Jahre") + ")" : base;
	},

	isWeddingToday: function () {
		return this.anniversariesToday().some((a) => a.type === "wedding");
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
	isFree: function () {
		return !!(this.settings && this.settings.display.anchor !== "auto");
	},

	visible: function () {
		return !this.manuallyHidden && !this.firefighterActive && !!(this.current && this.current.text);
	},

	// Ein Spruch-Element füllen und gestalten (gilt für beide Arten der Anzeige)
	fillBox: function (box) {
		const d = this.settings ? this.settings.display : window.LumiraSpruchLogic.DEFAULTS.display;
		let msg = this.current;
		if (msg && !this.config.emojis) { msg = Object.assign({}, msg, { icon: "" }); }
		window.LumiraSpruchLogic.render(box, msg, this.config.emojis ? d : Object.assign({}, d, { icon: "off" }), { reveal: this.revealed });
		box.style.setProperty("--sc-scale", (d.fontScale / 100).toFixed(2));
		box.style.removeProperty("--sc-fit");
		box.style.padding = d.padding ? d.padding + "px" : "";
		box.style.maxWidth = d.width ? d.width + "px" : "";
		box.style.width = d.width && this.isFree() ? d.width + "px" : "";
		box.style.maxHeight = d.height ? d.height + "px" : "";
		box.style.overflow = d.height ? "hidden" : "";
	},

	// Neu zeichnen; fade = neuer Spruch (weich überblenden)
	paint: function (fade) {
		if (this.isFree()) {
			this.paintPanel(fade);
			this.updateDom(0);
		} else {
			this.removePanel();
			this.updateDom(fade ? this.config.fadeSpeed : 0);
		}
		clearTimeout(this.fitTimer);
		this.fitTimer = setTimeout(() => {
			const box = this.isFree() ? this.panel : document.querySelector("#" + this.identifier + " .smartcompliments");
			if (box && this.settings && this.settings.display.height) { window.LumiraSpruchLogic.fit(box); }
			this.report();
		}, (fade ? this.config.fadeSpeed / 2 : 0) + 200);
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "smartcompliments sc-msg";
		if (this.isFree() || !this.visible()) {
			wrapper.classList.add("sc-hidden");
			return wrapper;
		}
		this.fillBox(wrapper);
		return wrapper;
	},

	// Frei platziert: eigenes Element am <body>, Überblenden per CSS
	paintPanel: function (fade) {
		if (!this.panel) {
			this.panel = document.createElement("div");
			this.panel.className = "smartcompliments sc-msg sc-free";
			this.panel.style.transition = "opacity " + Math.round(this.config.fadeSpeed / 2) + "ms ease";
			this.panel.style.opacity = "0";
			document.body.appendChild(this.panel);
		}
		const p = this.panel;
		const show = () => {
			if (!this.panel) { return; }
			this.fillBox(p);
			this.position(p);
			p.style.opacity = this.visible() ? "1" : "0";
		};
		clearTimeout(this.fadeTimer);
		if (fade && p.style.opacity !== "0") {
			p.style.opacity = "0";
			this.fadeTimer = setTimeout(show, Math.round(this.config.fadeSpeed / 2));
		} else {
			show();
		}
	},

	position: function (el) {
		const d = this.settings.display;
		const s = el.style;
		s.left = s.right = s.top = s.bottom = "";
		const t = [];
		const [v, h] = d.anchor.split("_");
		const ux = d.unit === "pct" ? "vw" : "px";
		const uy = d.unit === "pct" ? "vh" : "px";
		if (v === "top") s.top = d.y + uy;
		else if (v === "bottom") s.bottom = d.y + uy;
		else { s.top = "calc(50% + " + d.y + uy + ")"; t.push("translateY(-50%)"); }
		if (h === "left") s.left = d.x + ux;
		else if (h === "right") s.right = d.x + ux;
		else { s.left = "calc(50% + " + d.x + ux + ")"; t.push("translateX(-50%)"); }
		s.transform = t.join(" ");
	},

	removePanel: function () {
		if (this.panel) { this.panel.remove(); }
		this.panel = null;
	},

	revealAnswer: function () {
		const box = this.isFree() ? this.panel : document.querySelector("#" + this.identifier + " .smartcompliments");
		const a = box && box.querySelector(".sc-answer");
		if (a) { a.classList.add("is-on"); }
	},

	// ------------------------------------------------------------------
	// Rückmeldung fürs Portal: was steht gerade da, überdeckt es etwas?
	// ------------------------------------------------------------------
	NAMES: {
		clock: "Uhr", "MMM-LumiraClock": "Uhr", weather: "Wetter", calendar: "Kalender", newsfeed: "Nachrichten", "MMM-FamilyPlan": "Familienplan",
		"MMM-RainRadarDWD": "altes Regenradar", "MMM-LumiraStatus": "Portal-Hinweis"
	},

	report: function () {
		const free = this.isFree() && this.panel && this.visible();
		const hits = [];
		let off = false;
		if (free) {
			const a = this.panel.getBoundingClientRect();
			const rects = [];
			document.querySelectorAll(".module").forEach((m) => {
				if (m.classList.contains(this.name) || m.classList.contains("MMM-Ambient") || m.classList.contains("MMM-Doorbell")) { return; }
				const r = m.getBoundingClientRect();
				if (r.width < 4 || r.height < 4 || getComputedStyle(m).visibility === "hidden") { return; }
				const name = Object.keys(this.NAMES).find((k) => m.classList.contains(k));
				if (name) { rects.push({ name: this.NAMES[name], r: r }); }
			});
			document.querySelectorAll("[data-lumira-tile]").forEach((el) => {
				rects.push({ name: el.getAttribute("data-lumira-tile"), r: el.getBoundingClientRect() });
			});
			document.querySelectorAll(".lw-panel, .lw-wxpanel").forEach((el) => {
				rects.push({ name: el.classList.contains("lw-wxpanel") ? "Wetteranzeige" : el.classList.contains("lw-radar") ? "Regenradar" : "Warnungen", r: el.getBoundingClientRect() });
			});
			rects.forEach((m) => {
				if (a.left < m.r.right - 2 && a.right > m.r.left + 2 && a.top < m.r.bottom - 2 && a.bottom > m.r.top + 2 && hits.indexOf(m.name) === -1) { hits.push(m.name); }
			});
			off = a.left < -2 || a.top < -2 || a.right > window.innerWidth + 2 || a.bottom > window.innerHeight + 2;
		}
		const rep = {
			screen: { width: window.innerWidth, height: window.innerHeight },
			text: this.current ? this.current.text : "",
			cat: this.current ? this.current.cat || "" : "",
			overlaps: hits,
			offscreen: off
		};
		const key = JSON.stringify(rep);
		if (key === this.lastReport) { return; }
		this.lastReport = key;
		this.sendSocketNotification("SC_REPORT", rep);
	}
});
