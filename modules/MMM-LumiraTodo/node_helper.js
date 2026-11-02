/* MagicMirror²
 * Node Helper: MMM-LumiraTodo
 *
 * Liest ~/.lumira/todo.json (Listen, Kategorien, Aufgaben und Anzeige;
 * gepflegt nur im LUMIRA-Portal) per fs.watch und schickt sie an die
 * Anzeige – Abhaken im Portal ist nach wenigen Sekunden auf dem Bildschirm.
 * Eine kaputte Datei lässt den letzten guten Stand stehen.
 * Rückmeldung der Anzeige (Überschneidungen) nach ~/.lumira/todo-mirror.json.
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const os = require("os");
const view = require("./todo-view");
const layout = require("./lumira-layout");

const LUMIRA_HOME = process.env.LUMIRA_HOME || path.join(os.homedir(), ".lumira");
const STATE_PATH = path.join(LUMIRA_HOME, "todo.json");
const REPORT_PATH = path.join(LUMIRA_HOME, "todo-mirror.json");

const arr = (v) => (Array.isArray(v) ? v : []);

module.exports = NodeHelper.create({

	watcher: null,
	debounce: null,
	state: null,

	start: function () {
		console.log("Starting node_helper for: " + this.name);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "LT_REPORT") { this.writeReport(payload); return; }
		if (notification !== "LT_INIT") return;
		if (!this.watcher) this.startWatch();
		this.load();
		this.push();
	},

	load: function () {
		try {
			const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
			this.state = { display: view.clean(raw.display), data: { lists: arr(raw.lists), categories: arr(raw.categories), tasks: arr(raw.tasks) } };
		} catch (err) {
			if (!this.state) this.state = { display: view.clean(null), data: { lists: [], categories: [], tasks: [] } };
			if (err.code !== "ENOENT") console.error(this.name + ": todo.json nicht lesbar, zeige letzten Stand: " + err.message);
		}
	},

	push: function () {
		const items = layout.read(LUMIRA_HOME);
		this.sendSocketNotification("LT_STATE", Object.assign({}, this.state, { display: layout.apply(this.state.display, items && items.todo) }));
	},

	startWatch: function () {
		try {
			fs.mkdirSync(LUMIRA_HOME, { recursive: true });
			this.watcher = fs.watch(LUMIRA_HOME, (eventType, filename) => {
				if (filename && filename !== "todo.json" && filename !== layout.FILE) return;
				clearTimeout(this.debounce);
				this.debounce = setTimeout(() => { this.load(); this.push(); }, 200);
			});
		} catch (err) {
			console.error(this.name + ": Überwachung von todo.json konnte nicht gestartet werden: " + err.message);
		}
	},

	writeReport: function (p) {
		if (!p || typeof p !== "object") return;
		const out = {
			at: new Date().toISOString(),
			screen: { width: Number(p.screen && p.screen.width) || 0, height: Number(p.screen && p.screen.height) || 0 },
			overlaps: Array.isArray(p.overlaps) ? p.overlaps.map((x) => String(x).slice(0, 40)).slice(0, 12) : [],
			offscreen: !!p.offscreen,
			dropped: Number(p.dropped) || 0
		};
		try {
			fs.writeFileSync(REPORT_PATH + ".tmp", JSON.stringify(out));
			fs.renameSync(REPORT_PATH + ".tmp", REPORT_PATH);
		} catch (err) {
			console.error(this.name + ": Rückmeldung nicht gespeichert: " + err.message);
		}
	},

	stop: function () {
		if (this.watcher) this.watcher.close();
		clearTimeout(this.debounce);
	}
});
