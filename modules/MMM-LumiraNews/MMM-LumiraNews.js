/* MagicMirror²
 * Module: MMM-LumiraNews
 *
 * Eigene Nachrichten für LUMIRA, ersetzen das MagicMirror-Modul „newsfeed“:
 * mehrere RSS-/Atom-Feeds (vordefiniert und eigene) zusammengeführt, ganz
 * unten am Bildschirm (position: "bottom_bar") als kompakte Leiste mit
 * wechselnder Schlagzeile oder als Vorschaukarten (news-view.js / .css).
 * Einstellungen live aus dem LUMIRA-Portal (Bildschirm → Nachrichten) über
 * ~/.lumira/news.json – kein Neustart.
 *
 * MIT Licensed.
 */

Module.register("MMM-LumiraNews", {

	defaults: {},

	getStyles: function () {
		return ["news-view.css"];
	},

	getScripts: function () {
		return ["news-view.js"];
	},

	start: function () {
		this.state = null;
		this.box = null;
		this.page = 0;
		this.timer = null;
		this.sendSocketNotification("LN_INIT");
	},

	getDom: function () {
		if (!this.box) this.box = document.createElement("div");
		if (this.state) setTimeout(() => this.draw(), 0);
		return this.box;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "LN_STATE") return;
		this.state = payload;
		this.draw();
		this.schedule();
	},

	draw: function () {
		const st = this.state;
		const View = window.LumiraNewsView;
		if (!st || !st.config || !View || !this.box) return;
		View.build(this.box, st.config, st.items, { page: this.page, sources: st.sources, now: Date.now(), baseClass: "ln-panel" });
	},

	// Weiterblättern mit kurzem Überblenden; auch das Alter („vor 5 Minuten“) läuft so mit
	schedule: function () {
		clearTimeout(this.timer);
		const st = this.state;
		const View = window.LumiraNewsView;
		if (!st || !View) return;
		this.timer = setTimeout(() => {
			const n = View.visible(st.items, st.config, Date.now(), st.sources).length;
			const total = View.pages(n, st.config);
			if (this.box && total > 1) {
				this.box.classList.add("is-fading");
				setTimeout(() => { this.page = (this.page + 1) % total; this.draw(); this.box.classList.remove("is-fading"); }, 400);
			} else {
				this.draw();
			}
			this.schedule();
		}, st.config.rotate * 1000);
	}
});
