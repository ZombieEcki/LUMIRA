/* MagicMirror²
 * Module: MMM-Doorbell
 *
 * Türklingel für LUMIRA: Klingelt es an der Ring-Klingel (oder wird im
 * LUMIRA-Portal getestet), erscheint in der Bildschirmmitte
 *   1. eine kompakte Meldung („Es hat geklingelt!“, optional mit Leuchtrahmen)
 *      und der Klingelton (eingebautes Ding-Dong oder eigener Ton),
 *   2. danach das Live-Video der Klingel in der gewählten Größe, mit
 *      Countdown bis zum automatischen Schließen.
 * Danach ist der Spiegel wieder wie vorher. Andere Module bleiben unverändert,
 * die Fläche liegt nur darüber.
 *
 * Steuerung und Ring-Verbindung: LUMIRA-Portal (Spiegel → Klingel), live über
 * ~/.lumira/doorbell.json. Während eines Alarms (MMM-aPagerAlarm) bleibt die
 * Klingel-Anzeige verborgen – der Alarm geht vor.
 *
 * Braucht keine Position: die Fläche hängt direkt am <body>.
 *
 * MIT Licensed.
 */

Module.register("MMM-Doorbell", {

	defaults: {
		hideOnAlarmPhases: [1], // aPager-Zustände, in denen die Klingel-Anzeige verborgen bleibt
		fadeMs: 450
	},

	getStyles: function () {
		return ["MMM-Doorbell.css"];
	},

	getScripts: function () {
		return ["gong.js", "vendor/hls.light.min.js"];
	},

	start: function () {
		this.state = { active: false };
		this.alarm = false;
		this.heard = "";
		this.root = null;
		this.card = null;
		this.panel = null;
		this.panelKey = "";
		this.hls = null;
		this.tick = null;
		this.removeTimer = null;
		this.sendSocketNotification("DOORBELL_INIT");
	},

	getDom: function () {
		return document.createElement("div");
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "DOORBELL_STATE") return;
		this.state = payload || { active: false };
		const s = this.state;
		if (s.active) {
			// Ton einmal pro Klingeln – nicht erneut nach einem Neustart des Spiegels
			const key = s.id + ":" + s.rings;
			if (key !== this.heard) {
				this.heard = key;
				if (Date.now() - Date.parse(s.at) < 20000 && s.sound.enabled && !this.alarm) this.playSound(s.sound);
			}
		}
		this.render();
	},

	notificationReceived: function (notification, payload) {
		if (notification !== "APAGER_STATE") return;
		const state = payload && typeof payload.state === "number" ? payload.state : 0;
		const phases = Array.isArray(this.config.hideOnAlarmPhases) ? this.config.hideOnAlarmPhases : [];
		const alarm = phases.indexOf(state) !== -1;
		if (alarm === this.alarm) return;
		this.alarm = alarm;
		this.render();
	},

	// ------------------------------------------------------------------ Ton
	playSound: function (sound) {
		const vol = Math.max(0, Math.min(100, Number(sound.volume))) / 100;
		if (!vol) return;
		const gong = () => { if (window.LumiraGong) window.LumiraGong.play(vol); };
		if (!sound.url) return gong();
		try {
			const a = new Audio(sound.url + "?t=" + Date.now());
			a.volume = vol;
			const p = a.play();
			if (p && p.catch) p.catch(gong); // Datei weg/kaputt → eingebautes Ding-Dong
		} catch (e) {
			gong();
		}
	},

	// ------------------------------------------------------------------ Anzeige
	phase: function () {
		const s = this.state;
		if (!s.active || this.alarm) return "off";
		const now = Date.now();
		if (now >= Date.parse(s.until)) return "off";
		if (s.notify.enabled && now < Date.parse(s.notifyUntil)) return "notify";
		return s.video.enabled ? "video" : "off";
	},

	render: function () {
		const phase = this.phase();
		if (phase === "off") { this.hide(); return; }
		this.ensureRoot();
		const s = this.state;
		this.root.classList.toggle("is-glow", !!s.notify.glow);

		// Meldung
		this.card.querySelector(".ldb-text").textContent = s.notify.text;
		this.card.querySelector(".ldb-sub").textContent = s.test ? s.camera + " · Test" : s.camera;
		this.card.classList.toggle("is-shown", phase === "notify");

		// Video
		this.panel.className = "ldb-panel size-" + s.video.size + (phase === "video" ? " is-shown" : "");
		if (phase === "video") this.buildPanel();
		this.updateCountdown();

		if (!this.tick) this.tick = setInterval(() => this.onTick(), 250);
	},

	onTick: function () {
		const was = this.lastPhase;
		const now = this.phase();
		this.lastPhase = now;
		if (now !== was) this.render();
		else this.updateCountdown();
	},

	ensureRoot: function () {
		clearTimeout(this.removeTimer);
		if (this.root) {
			this.root.classList.add("is-visible");
			return;
		}
		const root = document.createElement("div");
		root.className = "lumira-doorbell";
		root.style.transitionDuration = this.config.fadeMs + "ms";

		const card = document.createElement("div");
		card.className = "ldb-card";
		card.innerHTML = this.bellSvg("ldb-bell") +
			"<div class=\"ldb-words\"><div class=\"ldb-text\"></div><div class=\"ldb-sub\"></div></div>";
		root.appendChild(card);

		const panel = document.createElement("div");
		panel.className = "ldb-panel";
		root.appendChild(panel);

		document.body.appendChild(root);
		this.root = root;
		this.card = card;
		this.panel = panel;
		// erst nach dem Einhängen sichtbar schalten, sonst kein Einblenden
		requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("is-visible")));
	},

	// Inhalt des Video-Fensters: Live-Video, „Verbinde …“, Fehler mit Standbild, Testbild
	buildPanel: function () {
		const s = this.state;
		const v = s.video;
		const key = [s.id, v.status, v.url || "", s.snapshot || "", v.message].join("|");
		if (key === this.panelKey) return;
		const sameVideo = this.hls && this.panelKey.split("|")[0] === s.id && v.status === "live";
		this.panelKey = key;
		if (sameVideo) return; // nur ein neues Standbild – das laufende Video bleibt

		this.destroyVideo();
		const p = this.panel;
		p.innerHTML = "";

		const stage = document.createElement("div");
		stage.className = "ldb-stage";
		if (s.snapshot) {
			const img = document.createElement("img");
			img.className = "ldb-snap";
			img.src = s.snapshot;
			img.alt = "";
			stage.appendChild(img);
		}
		if (v.status === "live" && v.url) {
			stage.appendChild(this.makeVideo(v.url));
		} else if (v.status === "demo") {
			const demo = document.createElement("div");
			demo.className = "ldb-demo";
			demo.innerHTML = this.bellSvg("ldb-demo-bell") + "<div>Testbild</div><small>Hier erscheint das Live-Video der Klingel, sobald Ring verbunden ist.</small>";
			stage.appendChild(demo);
		} else if (v.status === "starting") {
			const wait = document.createElement("div");
			wait.className = "ldb-wait";
			wait.innerHTML = "<span class=\"ldb-spinner\"></span><span>Verbinde mit der Klingel …</span>";
			stage.appendChild(wait);
		} else {
			const err = document.createElement("div");
			err.className = "ldb-error" + (s.snapshot ? " has-snap" : "");
			err.textContent = s.snapshot ? "Kein Live-Video – letztes Bild der Klingel" : "Video nicht verfügbar";
			const small = document.createElement("small");
			small.textContent = v.message;
			err.appendChild(small);
			stage.appendChild(err);
		}
		p.appendChild(stage);

		const head = document.createElement("div");
		head.className = "ldb-head";
		head.innerHTML = this.bellSvg("ldb-head-bell") + "<span class=\"ldb-cam\"></span>" +
			(v.status === "live" ? "<span class=\"ldb-live\"><i></i>LIVE</span>" : "") +
			(s.test ? "<span class=\"ldb-test\">TEST</span>" : "");
		head.querySelector(".ldb-cam").textContent = s.camera;
		p.appendChild(head);

		const cd = document.createElement("div");
		cd.className = "ldb-countdown";
		cd.innerHTML = "<svg viewBox=\"0 0 44 44\"><circle class=\"ldb-cd-bg\" cx=\"22\" cy=\"22\" r=\"19\"/><circle class=\"ldb-cd-fg\" cx=\"22\" cy=\"22\" r=\"19\"/></svg><span></span>";
		p.appendChild(cd);
	},

	makeVideo: function (url) {
		const video = document.createElement("video");
		video.className = "ldb-video";
		video.muted = true;
		video.autoplay = true;
		video.playsInline = true;
		video.setAttribute("playsinline", "");
		// Seitenverhältnis der Klingel übernehmen (16:9 oder quadratisch „Kopf bis Fuß“)
		video.addEventListener("loadedmetadata", () => {
			if (video.videoWidth && video.videoHeight && this.panel) {
				this.panel.style.setProperty("--ldb-ratio", (video.videoWidth / video.videoHeight).toFixed(4));
			}
			video.classList.add("is-playing");
		});
		const Hls = window.Hls;
		if (Hls && Hls.isSupported()) {
			const hls = new Hls({
				liveSyncDurationCount: 2,     // nah an „live“ bleiben
				liveMaxLatencyDurationCount: 6,
				maxBufferLength: 10,
				backBufferLength: 0,           // Pi: keinen alten Puffer im Speicher halten
				enableWorker: true
			});
			let retries = 0;
			hls.on(Hls.Events.ERROR, (evt, data) => {
				if (!data || !data.fatal) return;
				if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retries++ < 8) hls.startLoad();
				else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries++ < 8) hls.recoverMediaError();
			});
			hls.loadSource(url);
			hls.attachMedia(video);
			this.hls = hls;
		} else if (video.canPlayType("application/vnd.apple.mpegurl")) {
			video.src = url;
			this.hls = { destroy: function () { video.removeAttribute("src"); video.load(); } };
		}
		const p = video.play();
		if (p && p.catch) p.catch(() => {});
		return video;
	},

	updateCountdown: function () {
		if (!this.panel) return;
		const cd = this.panel.querySelector(".ldb-countdown");
		if (!cd) return;
		const s = this.state;
		const show = s.active && s.autoClose && s.video.countdown;
		cd.hidden = !show;
		if (!show) return;
		const start = Date.parse(s.notify.enabled ? s.notifyUntil : s.at);
		const end = Date.parse(s.until);
		const left = Math.max(0, end - Date.now());
		const frac = end > start ? left / (end - start) : 0;
		const fg = cd.querySelector(".ldb-cd-fg");
		const c = 2 * Math.PI * 19;
		fg.style.strokeDasharray = c.toFixed(2);
		fg.style.strokeDashoffset = (c * (1 - frac)).toFixed(2);
		cd.querySelector("span").textContent = String(Math.ceil(left / 1000));
	},

	destroyVideo: function () {
		if (this.hls) {
			try { this.hls.destroy(); } catch (e) { /* schon weg */ }
			this.hls = null;
		}
	},

	hide: function () {
		clearInterval(this.tick);
		this.tick = null;
		this.lastPhase = "off";
		if (!this.root) return;
		const root = this.root;
		root.classList.remove("is-visible");
		clearTimeout(this.removeTimer);
		this.removeTimer = setTimeout(() => {
			this.destroyVideo();
			if (root.parentNode) root.parentNode.removeChild(root);
			if (this.root === root) {
				this.root = null;
				this.card = null;
				this.panel = null;
				this.panelKey = "";
			}
		}, this.config.fadeMs + 50);
	},

	bellSvg: function (cls) {
		return "<svg class=\"" + cls + "\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2a1.5 1.5 0 0 0-1.5 1.5v.6A6.5 6.5 0 0 0 5.5 10.5v4.2L3.6 17a.9.9 0 0 0 .7 1.5h15.4a.9.9 0 0 0 .7-1.5l-1.9-2.3v-4.2a6.5 6.5 0 0 0-5-6.4v-.6A1.5 1.5 0 0 0 12 2Zm-2.6 17.6a2.7 2.7 0 0 0 5.2 0Z\" fill=\"currentColor\"/></svg>";
	}
});
