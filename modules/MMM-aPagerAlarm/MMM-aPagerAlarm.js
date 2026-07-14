/* MagicMirror²
 * Module: MMM-aPagerAlarm
 *
 * Familien-Informationssystem für Feuerwehr-Alarmierungen (aPager PRO).
 *
 * Das Modul kennt vier Zustände:
 *   0  FAMILY  – Familienmodus (nichts sichtbar, Standard)
 *   1  ALARM   – Alarm (rotes Overlay, Ton, Countdown)          Dauer: alarmDuration
 *   2  INFO    – "Papa ist im Einsatz" (ruhige Karte)           Dauer: infoDuration
 *   3  RETURN  – "Papa war im Einsatz" (grüne Karte)            Dauer: returnDuration
 *
 * Nach Ablauf von Zustand 3 kehrt das Modul automatisch in den Familienmodus
 * zurück. Eine erneute Alarmierung setzt alle Timer zurück und startet bei 1.
 *
 * By Liam Eckhof
 * MIT Licensed.
 */

Module.register("MMM-aPagerAlarm", {

	// ------------------------------------------------------------------
	// Standard-Konfiguration
	// ------------------------------------------------------------------
	defaults: {
		// ---- Webhook / node_helper -----------------------------------
		webhookPort: 8090,          // NICHT 8080 – das nutzt MagicMirror selbst
		webhookPath: "/alarm",      // Endpunkt für aPager PRO
		clearPath: "/clear",        // Endpunkt zum manuellen Beenden
		homePath: "/home",          // Endpunkt: "zuhause" -> sofort in Phase 3 springen

		// ---- Zeitsteuerung (in Minuten) ------------------------------
		alarmDuration: 15,          // Zustand 1: Alarm
		infoDuration: 240,          // Zustand 2: "ist im Einsatz" (4 Stunden)
		returnDuration: 30,         // Zustand 3: "war im Einsatz"

		// ---- Zustände einzeln aktivierbar ----------------------------
		enableInfoState: true,      // Zustand 2 anzeigen?
		enableReturnState: true,    // Zustand 3 anzeigen?

		// ---- Person / Botschaften ------------------------------------
		personName: "Papa",         // Wer ist im Einsatz?
		messageRotationMinutes: 5,  // Wechselintervall der Botschaften
		randomizeMessages: true,    // true = zufällig, false = der Reihe nach
		heartSymbol: "❤️",          // Symbol über den Botschaften
		careMessages: [             // Zustand 2 – während des Einsatzes
			"Komm gesund wieder nach Hause.",
			"Die Familie denkt an dich.",
			"Pass gut auf dich auf.",
			"Danke, dass du anderen Menschen hilfst.",
			"Wir wünschen dir einen sicheren Einsatz.",
			"Bis später."
		],
		returnMessages: [           // Zustand 3 – nach dem Einsatz
			"Willkommen zurück.",
			"Danke für deinen Einsatz.",
			"Jetzt gehört der Abend wieder der Familie.",
			"Schön, dass du wieder zuhause bist.",
			"Wir freuen uns, dass du wieder da bist."
		],

		// ---- Texte (frei anpassbar, {name} = personName) -------------
		title: "EINSATZ",                                          // Zustand 1
		readyText: "👷 Bereit machen!",                            // Zustand 1
		badgeText: "🚒 Feuerwehr",                                 // Zustand 2
		infoHeadline: "{name} ist im Einsatz.",                    // Zustand 2
		returnHeadline: "{name} war heute für die Feuerwehr im Einsatz.", // Zustand 3
		labelKeyword: "EINSATZSTICHWORT",                          // Zustand 1
		labelUnit: "EINHEIT",                                      // Zustand 1
		labelTime: "ALARMZEIT",                                    // Zustand 1

		// ---- Alarm-Darstellung (Zustand 1) ---------------------------
		dimBackground: true,        // Restlichen Bildschirm abdunkeln
		dimOpacity: 0.55,           // Stärke der Abdunklung (0.0 – 1.0)
		showCountdown: true,        // Countdown anzeigen
		showDate: true,             // Datum unter der Alarmzeit anzeigen
		hideModulesDuringAlarm: [], // Modulnamen, die im Alarm ausgeblendet werden

		// ---- Ton (Zustand 1) -----------------------------------------
		playSound: true,            // Alarmton abspielen
		soundFile: "alarm.mp3",     // Datei im Ordner sounds/
		soundLoop: false,           // Datei in Endlosschleife abspielen
		soundVolume: 1.0,           // Lautstärke (0.0 – 1.0)
		repeatSoundSeconds: 0,      // Ton alle X Sekunden erneut abspielen (0 = aus)

		// ---- Allgemeine Optik ----------------------------------------
		animate: true,              // Ein-/Ausblend-Animationen
		useGlass: true,             // Glassmorphism (Blur) für Zustand 2/3
		locale: "de-DE",            // Sprache für Datum/Uhrzeit

		// ---- Integration ---------------------------------------------
		broadcastNotifications: true, // "APAGER_STATE" an andere Module senden
		forwardTargets: [],           // URLs (z. B. Home Assistant Webhooks), die bei
		                              // jedem Phasenwechsel ein POST { state, keyword, unit, time } erhalten

		// ---- Test ----------------------------------------------------
		testMode: false,            // Beim Start automatisch einen Zustand zeigen
		testState: 1                // Welcher Zustand im Testmodus (1, 2 oder 3)
	},

	// ------------------------------------------------------------------
	// Zustandskonstanten
	// ------------------------------------------------------------------
	STATE_FAMILY: 0,
	STATE_ALARM: 1,
	STATE_INFO: 2,
	STATE_RETURN: 3,

	// ------------------------------------------------------------------
	// Interner Zustand
	// ------------------------------------------------------------------
	state: 0,             // aktueller Zustand
	currentAlarm: null,   // { unit, keyword, time }
	transitionTimer: null,// Timeout für den nächsten Zustandswechsel
	countdownTimer: null, // Interval für den Countdown (nur Zustand 1)
	rotationTimer: null,  // Interval für rotierende Botschaften (Zustand 2/3)
	soundRepeatTimer: null,// Interval für wiederholten Alarmton
	currentMessage: "",   // aktuell angezeigte Botschaft
	messageIndex: -1,     // Index für sequentielle Botschaften
	alarmEndsAt: 0,       // Zeitpunkt, zu dem Zustand 1 endet (für Countdown)
	_audio: null,         // laufendes Audio-Objekt

	getStyles: function () {
		return ["MMM-aPagerAlarm.css"];
	},

	start: function () {
		Log.info("Starting module: " + this.name);
		this.state = this.STATE_FAMILY;

		// node_helper konfigurieren -> Webhook-Server starten
		this.sendSocketNotification("CONFIG", {
			webhookPort: this.config.webhookPort,
			webhookPath: this.config.webhookPath,
			clearPath: this.config.clearPath,
			homePath: this.config.homePath,
			forwardTargets: this.config.forwardTargets
		});

		// Testmodus: nach kurzer Verzögerung gewünschten Zustand anzeigen
		if (this.config.testMode) {
			setTimeout(() => {
				this.currentAlarm = {
					unit: "Florian Musterstadt",
					keyword: "B2 - Zimmerbrand",
					time: Date.now()
				};
				this.enterState(this.config.testState || this.STATE_ALARM);
			}, 3000);
		}
	},

	// ------------------------------------------------------------------
	// Kommunikation mit node_helper
	// ------------------------------------------------------------------
	socketNotificationReceived: function (notification, payload) {
		if (notification === "NEW_ALARM") {
			Log.info(this.name + ": Neuer Alarm empfangen", payload);
			this.triggerAlarm(payload);
		} else if (notification === "CLEAR_ALARM") {
			Log.info(this.name + ": Alarm wird manuell beendet");
			this.reset();
		} else if (notification === "GO_HOME") {
			Log.info(this.name + ": 'Zuhause' -> Sprung in Phase 3");
			this.goHome();
		}
	},

	// Manuell nach Hause gekommen -> direkt in Phase 3 ("war im Einsatz")
	goHome: function () {
		// Nur sinnvoll, wenn gerade ein Einsatz läuft (Phase 1 oder 2)
		if (!this.currentAlarm || this.state === this.STATE_FAMILY) {
			Log.info(this.name + ": 'Zuhause' ignoriert – kein aktiver Einsatz");
			return;
		}
		if (this.state === this.STATE_RETURN) {
			return; // ist bereits in Phase 3
		}
		if (this.config.enableReturnState) {
			this.enterState(this.STATE_RETURN);
		} else {
			// Phase 3 deaktiviert -> Einsatz einfach beenden
			this.reset();
		}
	},

	// ------------------------------------------------------------------
	// Zustandsmaschine
	// ------------------------------------------------------------------

	// Neue Alarmierung: alle Timer zurücksetzen und bei Zustand 1 beginnen
	triggerAlarm: function (alarm) {
		this.clearAllTimers();
		this.currentAlarm = {
			unit: (alarm && alarm.unit) || "",
			keyword: (alarm && alarm.keyword) || "Alarm",
			time: (alarm && alarm.time) || Date.now()
		};
		this.enterState(this.STATE_ALARM);
	},

	// In einen Zustand wechseln und dessen Timer/Effekte einrichten
	enterState: function (newState) {
		this.clearAllTimers();
		this.stopAlarmSound();
		this.state = newState;

		// Andere Module nur während des Alarms ausblenden
		this.applyModuleVisibility(newState === this.STATE_ALARM);

		switch (newState) {
			case this.STATE_ALARM:
				this.alarmEndsAt = Date.now() + this.minToMs(this.config.alarmDuration);
				if (this.config.playSound) {
					this.playAlarmSound();
					this.startSoundRepeat();
				}
				if (this.config.showCountdown) {
					this.startCountdown();
				}
				this.scheduleTransition(this.config.alarmDuration, this.getNextState(this.STATE_ALARM));
				break;

			case this.STATE_INFO:
				this.messageIndex = -1;
				this.pickMessage(this.config.careMessages);
				this.startRotation(this.config.careMessages);
				this.scheduleTransition(this.config.infoDuration, this.getNextState(this.STATE_INFO));
				break;

			case this.STATE_RETURN:
				this.messageIndex = -1;
				this.pickMessage(this.config.returnMessages);
				this.startRotation(this.config.returnMessages);
				this.scheduleTransition(this.config.returnDuration, this.STATE_FAMILY);
				break;

			case this.STATE_FAMILY:
			default:
				this.reset();
				return;
		}

		this.broadcastState();
		this.forwardState();
		this.updateDom(this.config.animate ? 500 : 0);
	},

	// Nächsten aktiven Zustand bestimmen (übersprungene Zustände beachten)
	getNextState: function (fromState) {
		if (fromState === this.STATE_ALARM) {
			if (this.config.enableInfoState) { return this.STATE_INFO; }
			if (this.config.enableReturnState) { return this.STATE_RETURN; }
			return this.STATE_FAMILY;
		}
		if (fromState === this.STATE_INFO) {
			if (this.config.enableReturnState) { return this.STATE_RETURN; }
			return this.STATE_FAMILY;
		}
		return this.STATE_FAMILY;
	},

	// Zustandswechsel an andere Module melden
	broadcastState: function () {
		if (!this.config.broadcastNotifications) { return; }
		this.sendNotification("APAGER_STATE", {
			state: this.state,
			alarm: this.currentAlarm
		});
	},

	// Zustandswechsel per Webhook nach außen melden (z. B. Home Assistant)
	forwardState: function () {
		if (!Array.isArray(this.config.forwardTargets) || this.config.forwardTargets.length === 0) {
			return;
		}
		this.sendSocketNotification("FORWARD_STATE", {
			state: this.state,
			keyword: this.currentAlarm ? this.currentAlarm.keyword : "",
			unit: this.currentAlarm ? this.currentAlarm.unit : "",
			time: this.currentAlarm ? this.currentAlarm.time : Date.now()
		});
	},

	// Gelistete Module während des Alarms aus-/wieder einblenden
	applyModuleVisibility: function (hide) {
		const names = this.config.hideModulesDuringAlarm;
		if (typeof MM === "undefined" || !Array.isArray(names) || names.length === 0) {
			return;
		}
		const self = this;
		MM.getModules().enumerate(function (module) {
			if (names.indexOf(module.name) !== -1) {
				if (hide) {
					module.hide(300, { lockString: self.identifier });
				} else {
					module.show(300, { lockString: self.identifier });
				}
			}
		});
	},

	// Nächsten Zustandswechsel planen (ereignisgesteuert, kein Polling)
	scheduleTransition: function (durationMinutes, nextState) {
		const ms = this.minToMs(durationMinutes);
		this.transitionTimer = setTimeout(() => {
			this.enterState(nextState);
		}, ms);
	},

	// Vollständig in den Familienmodus zurückkehren
	reset: function () {
		this.clearAllTimers();
		this.stopAlarmSound();
		this.applyModuleVisibility(false); // ausgeblendete Module wieder zeigen
		this.state = this.STATE_FAMILY;
		this.currentAlarm = null;
		this.currentMessage = "";
		this.messageIndex = -1;
		this.broadcastState();
		this.forwardState();
		this.updateDom(this.config.animate ? 500 : 0);
	},

	// ------------------------------------------------------------------
	// Timer-Helfer
	// ------------------------------------------------------------------
	clearAllTimers: function () {
		if (this.transitionTimer) { clearTimeout(this.transitionTimer); this.transitionTimer = null; }
		if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
		if (this.rotationTimer) { clearInterval(this.rotationTimer); this.rotationTimer = null; }
		if (this.soundRepeatTimer) { clearInterval(this.soundRepeatTimer); this.soundRepeatTimer = null; }
	},

	startCountdown: function () {
		this.countdownTimer = setInterval(() => {
			this.updateCountdownDom();
		}, 1000);
	},

	// Botschaften alle X Minuten wechseln
	startRotation: function (messages) {
		const intervalMs = this.minToMs(this.config.messageRotationMinutes);
		if (intervalMs <= 0 || !messages || messages.length < 2) { return; }
		this.rotationTimer = setInterval(() => {
			this.pickMessage(messages);
			this.updateMessageDom();
		}, intervalMs);
	},

	// Alarmton alle X Sekunden erneut abspielen (config.repeatSoundSeconds)
	startSoundRepeat: function () {
		const seconds = Number(this.config.repeatSoundSeconds) || 0;
		if (seconds <= 0) { return; }
		this.soundRepeatTimer = setInterval(() => {
			this.playAlarmSound();
		}, seconds * 1000);
	},

	// Nächste Botschaft wählen – zufällig oder der Reihe nach
	pickMessage: function (messages) {
		if (!messages || messages.length === 0) {
			this.currentMessage = "";
			return;
		}
		if (messages.length === 1) {
			this.currentMessage = messages[0];
			return;
		}

		if (this.config.randomizeMessages) {
			// zufällig, aber nicht zweimal hintereinander dieselbe
			let choice = this.currentMessage;
			let guard = 0;
			while (choice === this.currentMessage && guard < 10) {
				choice = messages[Math.floor(Math.random() * messages.length)];
				guard++;
			}
			this.currentMessage = choice;
		} else {
			// sequentiell durch die Liste
			this.messageIndex = (this.messageIndex + 1) % messages.length;
			this.currentMessage = messages[this.messageIndex];
		}
	},

	minToMs: function (minutes) {
		return Math.max(0, Number(minutes) || 0) * 60 * 1000;
	},

	// ------------------------------------------------------------------
	// Ton
	// ------------------------------------------------------------------
	playAlarmSound: function () {
		try {
			this.stopAlarmSound();
			const audio = new Audio(this.file("sounds/" + this.config.soundFile));
			audio.loop = this.config.soundLoop;
			const vol = Number(this.config.soundVolume);
			audio.volume = isNaN(vol) ? 1 : Math.min(1, Math.max(0, vol));
			this._audio = audio;
			const p = audio.play();
			if (p && typeof p.catch === "function") {
				p.catch((err) => Log.warn(this.name + ": Alarmton konnte nicht abgespielt werden", err));
			}
		} catch (err) {
			Log.warn(this.name + ": Fehler beim Abspielen des Alarmtons", err);
		}
	},

	stopAlarmSound: function () {
		if (this._audio) {
			try {
				this._audio.pause();
				this._audio.currentTime = 0;
			} catch (e) { /* ignorieren */ }
			this._audio = null;
		}
	},

	// ------------------------------------------------------------------
	// Formatierung
	// ------------------------------------------------------------------
	formatTime: function (timestamp) {
		const d = new Date(timestamp);
		return String(d.getHours()).padStart(2, "0") + ":" +
			String(d.getMinutes()).padStart(2, "0");
	},

	formatDate: function (timestamp) {
		const d = new Date(timestamp);
		try {
			return d.toLocaleDateString(this.config.locale || "de-DE", {
				weekday: "long", day: "numeric", month: "long", year: "numeric"
			});
		} catch (e) {
			return d.toLocaleDateString();
		}
	},

	// {name}-Platzhalter durch personName ersetzen
	fillTemplate: function (text) {
		return String(text || "").replace(/\{name\}/g, this.config.personName || "");
	},

	// ------------------------------------------------------------------
	// Gezielte DOM-Aktualisierungen (ohne Neu-Animation der Karte)
	// ------------------------------------------------------------------
	updateCountdownDom: function () {
		const el = document.getElementById("apager-countdown-value");
		if (!el) { return; }
		const remaining = Math.max(0, this.alarmEndsAt - Date.now());
		const minutes = Math.ceil(remaining / 60000);
		el.innerHTML = minutes + (minutes === 1 ? " Minute" : " Minuten");
	},

	updateMessageDom: function () {
		const el = document.getElementById("apager-rotating-message");
		if (!el) { return; }
		el.classList.remove("apager-msg-in");
		// Reflow erzwingen, damit die Animation erneut startet
		void el.offsetWidth;
		el.innerHTML = this.currentMessage;
		el.classList.add("apager-msg-in");
	},

	// ------------------------------------------------------------------
	// Aufbau der Anzeige
	// ------------------------------------------------------------------
	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "apager-root";
		if (!this.config.animate) {
			wrapper.classList.add("apager-no-animate");
		}
		if (!this.config.useGlass) {
			wrapper.classList.add("apager-no-glass");
		}

		if (this.state === this.STATE_FAMILY || !this.currentAlarm) {
			wrapper.classList.add("apager-hidden");
			return wrapper;
		}

		wrapper.classList.add("apager-active");

		if (this.state === this.STATE_ALARM) {
			if (this.config.dimBackground) {
				const overlay = document.createElement("div");
				overlay.className = "apager-overlay";
				overlay.style.background = "rgba(0, 0, 0, " +
					Math.min(1, Math.max(0, Number(this.config.dimOpacity) || 0)) + ")";
				wrapper.appendChild(overlay);
			}
			wrapper.appendChild(this.buildAlarmCard());
		} else if (this.state === this.STATE_INFO) {
			wrapper.appendChild(this.buildInfoCard());
		} else if (this.state === this.STATE_RETURN) {
			wrapper.appendChild(this.buildReturnCard());
		}

		return wrapper;
	},

	// Zustand 1: Alarm (rote Karte, Blaulicht, Countdown)
	buildAlarmCard: function () {
		const box = document.createElement("div");
		box.className = "apager-card apager-card-alarm";

		const header = document.createElement("div");
		header.className = "apager-header";
		header.innerHTML =
			'<span class="apager-light apager-light-left">🚨</span>' +
			'<span class="apager-title">' + this.config.title + '</span>' +
			'<span class="apager-light apager-light-right">🚨</span>';
		box.appendChild(header);

		box.appendChild(this.labeled(this.config.labelKeyword, this.currentAlarm.keyword, "apager-keyword"));

		if (this.currentAlarm.unit) {
			box.appendChild(this.divider());
			box.appendChild(this.labeled(this.config.labelUnit, this.currentAlarm.unit, "apager-unit"));
		}

		box.appendChild(this.divider());
		box.appendChild(this.labeled(this.config.labelTime, this.formatTime(this.currentAlarm.time) + " Uhr", "apager-time"));

		if (this.config.showDate) {
			const date = document.createElement("div");
			date.className = "apager-date";
			date.innerHTML = this.formatDate(this.currentAlarm.time);
			box.appendChild(date);
		}

		if (this.config.readyText) {
			const ready = document.createElement("div");
			ready.className = "apager-ready";
			ready.innerHTML = this.config.readyText;
			box.appendChild(ready);
		}

		if (this.config.showCountdown) {
			const footer = document.createElement("div");
			footer.className = "apager-footer";
			const remaining = Math.max(0, this.alarmEndsAt - Date.now());
			const minutes = Math.ceil(remaining / 60000);
			footer.innerHTML = 'Anzeige endet automatisch in ' +
				'<span id="apager-countdown-value">' + minutes +
				(minutes === 1 ? " Minute" : " Minuten") + '</span>';
			box.appendChild(footer);
		}

		const stripes = document.createElement("div");
		stripes.className = "apager-stripes";
		box.appendChild(stripes);

		return box;
	},

	// Zustand 2: "Papa ist im Einsatz" (ruhige Glassmorphism-Karte)
	buildInfoCard: function () {
		const box = document.createElement("div");
		box.className = "apager-card apager-card-info";

		if (this.config.badgeText) {
			const badge = document.createElement("div");
			badge.className = "apager-badge";
			badge.innerHTML = this.config.badgeText;
			box.appendChild(badge);
		}

		const headline = document.createElement("div");
		headline.className = "apager-headline";
		headline.innerHTML = this.fillTemplate(this.config.infoHeadline);
		box.appendChild(headline);

		const keyword = document.createElement("div");
		keyword.className = "apager-info-keyword";
		keyword.innerHTML = this.currentAlarm.keyword;
		box.appendChild(keyword);

		const alarmed = document.createElement("div");
		alarmed.className = "apager-info-meta";
		alarmed.innerHTML = "Alarmiert: " + this.formatTime(this.currentAlarm.time) + " Uhr";
		box.appendChild(alarmed);

		const heart = document.createElement("div");
		heart.className = "apager-heart";
		heart.innerHTML = this.config.heartSymbol;
		box.appendChild(heart);

		const msg = document.createElement("div");
		msg.className = "apager-message apager-msg-in";
		msg.id = "apager-rotating-message";
		msg.innerHTML = this.currentMessage;
		box.appendChild(msg);

		return box;
	},

	// Zustand 3: "Papa war im Einsatz" (grüne, wertschätzende Karte)
	buildReturnCard: function () {
		const box = document.createElement("div");
		box.className = "apager-card apager-card-return";

		const heart = document.createElement("div");
		heart.className = "apager-heart apager-heart-big";
		heart.innerHTML = this.config.heartSymbol;
		box.appendChild(heart);

		const headline = document.createElement("div");
		headline.className = "apager-headline";
		headline.innerHTML = this.fillTemplate(this.config.returnHeadline);
		box.appendChild(headline);

		const msg = document.createElement("div");
		msg.className = "apager-message apager-msg-in";
		msg.id = "apager-rotating-message";
		msg.innerHTML = this.currentMessage;
		box.appendChild(msg);

		return box;
	},

	// ------------------------------------------------------------------
	// kleine DOM-Bausteine
	// ------------------------------------------------------------------
	labeled: function (labelText, valueText, valueClass) {
		const frag = document.createDocumentFragment();
		const label = document.createElement("div");
		label.className = "apager-label";
		label.innerHTML = labelText;
		frag.appendChild(label);

		const value = document.createElement("div");
		value.className = valueClass;
		value.innerHTML = valueText;
		frag.appendChild(value);
		return frag;
	},

	divider: function () {
		const d = document.createElement("div");
		d.className = "apager-divider";
		return d;
	}
});
