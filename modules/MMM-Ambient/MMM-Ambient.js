/* MagicMirror²
 * Module: MMM-Ambient
 *
 * Dauerschleife auf dem Spiegel – ein gezeichnetes Lagerfeuer oder ein
 * eigenes Video/Bild aus dem LUMIRA-Portal (Spiegel → Bildschirm).
 *
 *  - „Vollbild“: nur das Medium, über allem.
 *  - „Hintergrund“: Medium abgedunkelt hinter den Modulen.
 *  - Ein Alarm (MMM-aPagerAlarm, APAGER_STATE) unterbricht sofort; danach
 *    läuft die Schleife weiter, falls sie noch eingeschaltet ist.
 *
 * Braucht keine Position: die Fläche hängt direkt am <body>.
 *
 * MIT Licensed.
 */

Module.register("MMM-Ambient", {

	defaults: {
		interruptOnAlarmPhases: [1],  // aPager-Zustände, in denen die Schleife pausiert
		backgroundBrightness: 0.45,   // Helligkeit im Hintergrund-Modus (0–1)
		fadeMs: 1200
	},

	getStyles: function () {
		return ["MMM-Ambient.css"];
	},

	getScripts: function () {
		return ["fire.js"];
	},

	start: function () {
		this.state = { enabled: false };
		this.alarm = false;
		this.key = "";
		this.stage = null;
		this.stopFire = null;
		this.sendSocketNotification("AMBIENT_INIT");
	},

	getDom: function () {
		return document.createElement("div");
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "AMBIENT_STATE") return;
		this.state = payload || { enabled: false };
		this.render();
	},

	notificationReceived: function (notification, payload) {
		if (notification !== "APAGER_STATE") return;
		const state = payload && typeof payload.state === "number" ? payload.state : 0;
		const phases = Array.isArray(this.config.interruptOnAlarmPhases) ? this.config.interruptOnAlarmPhases : [];
		const alarm = phases.indexOf(state) !== -1;
		if (alarm === this.alarm) return;
		this.alarm = alarm;
		this.render();
	},

	render: function () {
		const s = this.state || {};
		const active = !!s.enabled && !this.alarm;
		const key = active ? [s.mode, s.media.kind, s.media.url || "", s.sound ? 1 : 0].join("|") : "";
		if (key === this.key) return;
		this.key = key;
		this.teardown();
		if (active) this.build(s);
	},

	build: function (s) {
		const stage = document.createElement("div");
		stage.className = "lumira-ambient " + (s.mode === "background" ? "is-background" : "is-fullscreen");
		stage.style.transitionDuration = this.config.fadeMs + "ms";
		if (s.mode === "background") stage.style.filter = "brightness(" + this.config.backgroundBrightness + ")";

		if (s.media.kind === "campfire") {
			stage.classList.add("is-campfire");
			const canvas = document.createElement("canvas");
			canvas.className = "lumira-ambient-media";
			stage.appendChild(canvas);
			this.stopFire = window.LumiraFire ? window.LumiraFire.start(canvas) : null;
		} else if (s.media.kind === "video") {
			const v = document.createElement("video");
			v.className = "lumira-ambient-media";
			v.src = s.media.url;
			v.loop = true; v.autoplay = true; v.playsInline = true;
			v.muted = !s.sound;
			v.setAttribute("playsinline", "");
			stage.appendChild(v);
			const p = v.play();
			if (p && p.catch) {
				// Mit Ton blockiert? Dann stumm weiterlaufen lassen
				p.catch(() => { v.muted = true; v.play().catch(() => {}); });
			}
		} else {
			const img = document.createElement("img");
			img.className = "lumira-ambient-media";
			img.src = s.media.url;
			img.alt = "";
			stage.appendChild(img);
		}

		// Hintergrund-Modus: der schwarze <body>-Hintergrund würde die Fläche
		// sonst verdecken (sie liegt unter den Modulen, z-index -1)
		if (s.mode === "background") document.body.classList.add("lumira-ambient-bg");
		document.body.appendChild(stage);
		this.stage = stage;
		requestAnimationFrame(() => stage.classList.add("is-on"));
	},

	teardown: function () {
		if (this.stopFire) { this.stopFire(); this.stopFire = null; }
		document.body.classList.remove("lumira-ambient-bg");
		const old = this.stage;
		this.stage = null;
		if (!old) return;
		const v = old.querySelector("video");
		old.classList.remove("is-on");
		setTimeout(() => {
			if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
			old.remove();
		}, this.config.fadeMs);
	}
});
