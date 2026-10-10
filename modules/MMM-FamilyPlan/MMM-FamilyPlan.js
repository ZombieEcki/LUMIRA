/* MagicMirror²
 * Module: MMM-FamilyPlan
 *
 * Familienplan für LUMIRA: zeigt, wer diese Woche welche Dienste hat.
 * Die Daten kommen aus ~/.lumira/familyplan.json (gepflegt im
 * LUMIRA-Portal, Seite „Familienplan“), der node_helper lädt sie live nach.
 * Siehe concept/familienplan.md.
 *
 * Die Anzeige baut alles per createElement/textContent – Namen aus dem
 * Portal landen nie als HTML im DOM.
 *
 * MIT Licensed.
 */

Module.register("MMM-FamilyPlan", {
	defaults: {
		maxWidth: "300px",       // nicht breiter als der bisherige Bereich
		layout: "stacked",       // "stacked" = Dienste untereinander, "inline" = nebeneinander
		showHeader: true,
		showWeekRange: true,
		avatarSize: 40,
		fadeSpeed: 1000,
		hideOnAlarmPhases: []    // z. B. [1] = beim akuten Alarm ausblenden (MMM-aPagerAlarm)
	},

	getStyles: function () {
		return ["MMM-FamilyPlan.css"];
	},

	start: function () {
		Log.info("Starting module: " + this.name);
		this.payload = null;
		this.alarmHidden = false;
		this.sendSocketNotification("FP_INIT");
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "FP_DATA") return;
		const first = !this.payload;
		this.payload = payload;
		this.updateDom(first ? 0 : this.config.fadeSpeed);
		if (payload && payload.state === "ok") {
			// Für andere Module, z. B. personalisierte Sprüche (Konzept 5.4)
			this.sendNotification("FAMILYPLAN_UPDATE", {
				weekStart: payload.week.start,
				assignments: payload.members.map((m) => ({ member: m.name, duties: m.duties.map((d) => d.name) }))
			});
		}
	},

	notificationReceived: function (notification, payload) {
		if (notification !== "APAGER_STATE") return;
		const state = payload && typeof payload.state === "number" ? payload.state : 0;
		const phases = Array.isArray(this.config.hideOnAlarmPhases) ? this.config.hideOnAlarmPhases : [];
		const hide = phases.indexOf(state) !== -1;
		if (hide === this.alarmHidden) return;
		this.alarmHidden = hide;
		if (hide) this.hide(500, { lockString: this.identifier });
		else this.show(500, { lockString: this.identifier });
	},

	el: function (tag, className, text) {
		const e = document.createElement(tag);
		if (className) e.className = className;
		if (text !== undefined && text !== null) e.textContent = text;
		return e;
	},

	getDom: function () {
		const p = this.payload;
		const wrapper = this.el("div", "fp fp-" + (this.config.layout === "inline" ? "inline" : "stacked"));
		// Feste Breite (= Breite des bisherigen Bereichs): die Region zieht sich
		// sonst auf den Inhalt zusammen, Dienste wären je Person unterschiedlich
		// breit und "inline" könnte nie nebeneinander umbrechen.
		wrapper.style.width = this.config.maxWidth;
		wrapper.style.maxWidth = "100%";

		if (!p) {
			wrapper.appendChild(this.el("div", "fp-hint dimmed small", "Familienplan lädt …"));
			return wrapper;
		}
		if (this.config.showHeader) {
			wrapper.appendChild(this.el("div", "fp-title", p.title));
		}
		if (p.state !== "ok") {
			wrapper.appendChild(this.el("div", "fp-hint dimmed xsmall", "Wird im LUMIRA-Portal eingerichtet."));
			return wrapper;
		}
		if (this.config.showWeekRange) {
			const week = this.el("div", "fp-week" + (p.stale ? " fp-stale" : ""), "KW " + p.week.kw + " (" + p.week.range + ")");
			if (p.stale) week.appendChild(this.el("span", "fp-stale-tag", " · Vorwoche"));
			wrapper.appendChild(week);
		}

		const size = Number(this.config.avatarSize) || 40;
		p.members.forEach((m) => {
			const row = this.el("div", "fp-row");
			row.style.gridTemplateColumns = "4px " + size + "px minmax(0, 1fr)";

			const bar = this.el("div", "fp-bar");
			bar.style.background = m.color;
			row.appendChild(bar);

			const av = this.el("div", "fp-av", m.initial);
			av.style.width = av.style.height = size + "px";
			av.style.background = m.color;
			av.style.color = m.textColor;
			if (m.avatar) {
				const img = this.el("img");
				img.alt = "";
				img.src = m.avatar;
				img.onerror = function () { img.remove(); };
				av.appendChild(img);
			}
			row.appendChild(av);

			const right = this.el("div", "fp-right");
			right.appendChild(this.el("div", "fp-name", m.name));
			const pills = this.el("div", "fp-pills");
			m.duties.forEach((d) => {
				const pill = this.el("div", "fp-pill");
				pill.style.background = d.color;
				pill.style.color = d.textColor;
				const icon = this.el("i", "fa-solid fa-" + d.icon);
				icon.setAttribute("aria-hidden", "true");
				pill.appendChild(icon);
				pill.appendChild(this.el("span", "fp-pill-text", d.name));
				pills.appendChild(pill);
			});
			if (!m.duties.length) pills.appendChild(this.el("div", "fp-pill fp-free", "Diese Woche frei"));
			right.appendChild(pills);
			row.appendChild(right);
			wrapper.appendChild(row);
		});
		return wrapper;
	}
});
