/* MagicMirror²
 * Module: MMM-Ambient
 *
 * Dauerschleife auf dem Spiegel – ein gezeichnetes Lagerfeuer oder ein
 * eigenes Video/Bild aus dem LUMIRA-Portal (Spiegel → Bildschirm).
 *
 *  - „Vollbild“: nur das Medium, über allem.
 *  - „Hintergrund“: Medium abgedunkelt hinter den Modulen.
 *  - Medien: Lagerfeuer (gezeichnet), Diashow, eigenes Video/Bild oder YouTube-Video.
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
		backgroundBrightness: 0.45,   // Helligkeit im Hintergrund-Modus (0–1), per Abdunkel-Fläche
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
		const key = active ? [s.mode, s.media.kind, s.media.url || s.media.embedUrl || (s.media.urls || []).join(","), s.media.quality || "",
			s.media.interval || "", s.media.shuffle ? 1 : 0, s.sound ? 1 : 0].join("|") : "";
		if (key === this.key) return;
		this.key = key;
		this.teardown();
		if (active) this.build(s);
	},

	build: function (s) {
		const stage = document.createElement("div");
		stage.className = "lumira-ambient " + (s.mode === "background" ? "is-background" : "is-fullscreen");
		stage.style.transitionDuration = this.config.fadeMs + "ms";

		if (s.media.kind === "campfire") {
			stage.classList.add("is-campfire");
			const canvas = document.createElement("canvas");
			canvas.className = "lumira-ambient-media";
			stage.appendChild(canvas);
			this.stopFire = window.LumiraFire ? window.LumiraFire.start(canvas) : null;
		} else if (s.media.kind === "slideshow") {
			this.startSlideshow(stage, s.media);
		} else if (s.media.kind === "youtube") {
			// YouTube braucht Internet; die Fläche „füllt“ den Spiegel wie ein Video
			// (16:9 hochskaliert, Ränder abgeschnitten), Bedienung ist abgeschaltet
			stage.classList.add("is-youtube");
			const frame = document.createElement("iframe");
			frame.className = "lumira-ambient-yt";
			// Kleiner Player → YouTube liefert eine kleine Auflösung;
			// hochskaliert wird per transform, das kostet den Pi fast nichts
			// YouTube wählt eine Stufe über der Player-Größe (gemessen: 640 × 360 → 480p,
			// 854 × 480 → 720p), daher hier jeweils eine Stufe kleiner. Durch die
			// Pixeldichte geteilt, weil YouTube sie bei der Qualitätswahl einrechnet.
			const base = { 360: [426, 240], 480: [640, 360], 720: [854, 480], 1080: [1280, 720] }[s.media.quality] || [640, 360];
			const dpr = window.devicePixelRatio || 1;
			const size = [Math.round(base[0] / dpr), Math.round(base[1] / dpr)];
			frame.width = size[0]; frame.height = size[1];
			frame.style.width = size[0] + "px"; frame.style.height = size[1] + "px";
			this.fitFrame = () => {
				// wie object-fit: cover, plus 20 % – Titelzeile/„Weitere Videos“ fallen weg
				const k = Math.max(window.innerWidth / size[0], window.innerHeight / size[1]) * 1.2;
				frame.style.transform = "translate(-50%, -50%) scale(" + k.toFixed(4) + ")";
			};
			this.fitFrame();
			window.addEventListener("resize", this.fitFrame);
			frame.src = s.media.embedUrl;
			frame.setAttribute("allow", "autoplay; encrypted-media");
			frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
			frame.setAttribute("tabindex", "-1");
			frame.setAttribute("title", "YouTube");
			stage.appendChild(frame);
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

		if (s.mode === "background") {
			const dim = document.createElement("div");
			dim.className = "lumira-ambient-dim";
			dim.style.opacity = String(Math.min(1, Math.max(0, 1 - this.config.backgroundBrightness)));
			stage.appendChild(dim);
		}

		// Hintergrund-Modus: der schwarze <body>-Hintergrund würde die Fläche
		// sonst verdecken (sie liegt unter den Modulen, z-index -1)
		if (s.mode === "background") document.body.classList.add("lumira-ambient-bg");
		document.body.appendChild(stage);
		this.stage = stage;
		requestAnimationFrame(() => stage.classList.add("is-on"));
	},

	// Diashow: zwei Bild-Ebenen, die weich überblenden; das nächste Bild wird
	// vorab geladen, damit nie ein halb geladenes Bild erscheint
	startSlideshow: function (stage, media) {
		const layers = [0, 1].map(() => {
			const img = document.createElement("img");
			img.className = "lumira-ambient-media lumira-slide";
			img.alt = "";
			stage.appendChild(img);
			return img;
		});
		const urls = media.urls.slice();
		let order = [], pos = -1, front = 0;
		const nextUrl = () => {
			if (urls.length === 1) return urls[0];
			pos++;
			if (pos >= order.length) {
				const last = order[order.length - 1];
				order = urls.slice();
				if (media.shuffle) {
					for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
					if (order[0] === last) order.push(order.shift()); // nicht zweimal hintereinander
				}
				pos = 0;
			}
			return order[pos];
		};
		const show = () => {
			const url = nextUrl();
			const back = layers[1 - front];
			const pre = new Image();
			pre.onload = pre.onerror = () => {
				if (this.slideTimer === null) return; // inzwischen beendet
				back.src = url;
				back.classList.add("is-shown");
				layers[front].classList.remove("is-shown");
				front = 1 - front;
			};
			pre.src = url;
		};
		this.slideTimer = 0;
		show();
		if (urls.length > 1) this.slideTimer = setInterval(show, Math.max(5, media.interval) * 1000);
	},

	teardown: function () {
		if (this.slideTimer) clearInterval(this.slideTimer);
		this.slideTimer = null;
		if (this.stopFire) { this.stopFire(); this.stopFire = null; }
		if (this.fitFrame) { window.removeEventListener("resize", this.fitFrame); this.fitFrame = null; }
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
