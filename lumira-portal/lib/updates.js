// LUMIRA – Updates für MagicMirror² und externe Module.
//
// Überwacht ~/MagicMirror selbst und alle per git installierten Module in
// ~/MagicMirror/modules (z. B. MMM-RainRadarDWD). Die eigenen LUMIRA-Module
// sind per rsync installiert (kein .git) und kommen mit dem LUMIRA-Update,
// sie werden hier übersprungen.
//
//  - Prüfen: git fetch + Vergleich mit dem Upstream-Branch, automatisch alle
//    12 Stunden und auf Knopfdruck im Portal.
//  - Aktualisieren: nur manuell (Portal → Info). git pull --ff-only, dann
//    Abhängigkeiten installieren, dann MagicMirror neu starten.
//  - Zurück: Der Stand vor dem letzten Update wird gemerkt und lässt sich
//    wiederherstellen (wichtig, falls eine neue MagicMirror-Version z. B. auf
//    dem Raspberry Pi 3 Probleme macht).
//
// Nur execFile mit Argument-Listen, nie eine Shell. Komponenten-IDs kommen
// ausschließlich aus der eigenen Ordner-Erkennung.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 3 * 60 * 1000;
const MAX_LOG_LINES = 200;
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;

function run(cmd, args, opts) {
	opts = opts || {};
	return new Promise((resolve, reject) => {
		execFile(cmd, args, {
			cwd: opts.cwd,
			timeout: opts.timeout || 60 * 1000,
			maxBuffer: 4 * 1024 * 1024,
			env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" }),
			windowsHide: true
		}, (err, stdout, stderr) => {
			if (err) {
				err.stdout = String(stdout || "");
				err.stderr = String(stderr || "");
				return reject(err);
			}
			resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
		});
	});
}

function git(dir, args, timeout) {
	return run("git", ["-C", dir].concat(args), { timeout }).then((r) => r.stdout.trim());
}

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (err) {
		return null;
	}
}

function shortError(err) {
	const text = String((err && (err.stderr || err.message)) || err || "").trim().split("\n").filter(Boolean).pop() || "Unbekannter Fehler";
	if (/Could not resolve host|unable to access|Network is unreachable|timed out|ETIMEDOUT/i.test(text)) {
		return "Server nicht erreichbar (kein Internet?)";
	}
	return text.slice(0, 200);
}

/**
 * @param {object} opts
 * @param {string} opts.mmRoot       Pfad zu ~/MagicMirror
 * @param {string} opts.statePath    Pfad zu ~/.lumira/updates.json
 * @param {string[]} [opts.ownModules] eigene LUMIRA-Module (werden übersprungen)
 * @param {Function} [opts.restart]  startet MagicMirror neu (Promise oder sync)
 * @param {Function} [opts.npm]      ersetzt den npm-Aufruf (Tests)
 */
function createUpdater(opts) {
	const mmRoot = opts.mmRoot;
	const statePath = opts.statePath;
	const ownModules = new Set(opts.ownModules || []);
	const restart = opts.restart || (() => {});
	const npm = opts.npm || ((args, cwd) => run(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, timeout: 30 * 60 * 1000 }));

	let state = readJson(statePath) || {};
	state = { checkedAt: state.checkedAt || "", components: state.components || [], lastUpdate: state.lastUpdate || {}, lastJob: state.lastJob || null };
	let checking = false;
	let job = null;
	let timer = null;

	function persist() {
		try {
			fs.mkdirSync(path.dirname(statePath), { recursive: true });
			const tmp = `${statePath}.tmp`;
			fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
			fs.renameSync(tmp, statePath);
		} catch (err) {
			console.error("[lumira-portal] updates.json konnte nicht geschrieben werden:", err.message);
		}
	}

	// MagicMirror + alle Modulordner mit eigenem git-Repo.
	function discover() {
		const list = [];
		if (fs.existsSync(path.join(mmRoot, ".git"))) {
			list.push({ id: "magicmirror", name: "MagicMirror²", kind: "core", dir: mmRoot });
		}
		const modDir = path.join(mmRoot, "modules");
		if (fs.existsSync(modDir)) {
			for (const name of fs.readdirSync(modDir).sort()) {
				if (!NAME_RE.test(name) || name === "default" || name === "node_modules" || ownModules.has(name)) continue;
				const dir = path.join(modDir, name);
				if (fs.existsSync(path.join(dir, ".git"))) list.push({ id: name, name, kind: "module", dir });
			}
		}
		return list;
	}

	function findComponent(id) {
		return discover().find((c) => c.id === id) || null;
	}

	async function inspect(c, fetch) {
		const info = { id: c.id, name: c.name, kind: c.kind };
		try {
			if (fetch) await git(c.dir, ["fetch", "--quiet", "--prune"], 2 * 60 * 1000);
			info.remote = await git(c.dir, ["remote", "get-url", "origin"]).catch(() => "");
			info.branch = await git(c.dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
			const upstream = await git(c.dir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).catch(() => "");
			if (!upstream) throw new Error("Kein Upstream-Branch eingerichtet – Updates nicht prüfbar");
			info.head = await git(c.dir, ["rev-parse", "--short", "HEAD"]);
			info.behind = Number(await git(c.dir, ["rev-list", "--count", "HEAD..@{u}"]));
			info.ahead = Number(await git(c.dir, ["rev-list", "--count", "@{u}..HEAD"]));
			info.dirty = (await git(c.dir, ["status", "--porcelain", "--untracked-files=no"])) !== "";
			const pkg = readJson(path.join(c.dir, "package.json"));
			info.currentVersion = pkg && pkg.version ? String(pkg.version) : "";
			let latestPkg = null;
			try { latestPkg = JSON.parse(await git(c.dir, ["show", "@{u}:package.json"])); } catch (err) { latestPkg = null; }
			info.latestVersion = latestPkg && latestPkg.version ? String(latestPkg.version) : info.currentVersion;
			info.changes = [];
			if (info.behind > 0) {
				const log = await git(c.dir, ["log", "--format=%h%x1f%s%x1f%cI", "-n", "10", "HEAD..@{u}"]);
				info.changes = log.split("\n").filter(Boolean).map((line) => {
					const [hash, subject, date] = line.split("\x1f");
					return { hash, subject: (subject || "").slice(0, 160), date };
				});
			}
			info.updateAvailable = info.behind > 0;
			info.canUpdate = info.behind > 0 && !info.dirty && info.ahead === 0;
			if (info.dirty) info.note = "Im Ordner gibt es lokale Änderungen – Update nur per SSH möglich.";
			else if (info.ahead > 0) info.note = "Der Ordner hat eigene, nicht veröffentlichte Änderungen – Update nur per SSH möglich.";
		} catch (err) {
			info.error = shortError(err);
		}
		return info;
	}

	async function check() {
		if (checking) return status();
		checking = true;
		try {
			const comps = [];
			for (const c of discover()) comps.push(await inspect(c, true)); // nacheinander, schont den Pi 3
			state.components = comps;
			state.checkedAt = new Date().toISOString();
			persist();
		} finally {
			checking = false;
		}
		return status();
	}

	async function refreshOne(id) {
		const c = findComponent(id);
		if (!c) return;
		const info = await inspect(c, false);
		const idx = state.components.findIndex((x) => x.id === id);
		if (idx >= 0) state.components[idx] = info; else state.components.push(info);
		persist();
	}

	function log(line) {
		if (!job) return;
		for (const l of String(line || "").split("\n")) {
			const t = l.replace(/\s+$/, "");
			if (t) job.log.push(t);
		}
		if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
	}

	async function installDeps(c) {
		const pkg = readJson(path.join(c.dir, "package.json"));
		if (!pkg) return;
		let args = null;
		if (pkg.scripts && pkg.scripts["install-mm"]) args = ["run", "install-mm"];
		else if (pkg.dependencies && Object.keys(pkg.dependencies).length) args = ["install", "--omit=dev", "--no-audit", "--no-fund"];
		if (!args) return;
		log(`$ npm ${args.join(" ")}   (kann auf dem Raspberry Pi einige Minuten dauern)`);
		const r = await npm(args, c.dir);
		log(r && r.stdout ? r.stdout.split("\n").slice(-15).join("\n") : "");
	}

	function startJob(id, action, work) {
		if (job && job.status === "running") throw Object.assign(new Error("Es läuft bereits ein Update. Bitte warten."), { code: "BUSY" });
		if (checking) throw Object.assign(new Error("Die Update-Prüfung läuft noch. Bitte kurz warten."), { code: "BUSY" });
		const c = findComponent(id);
		if (!c) throw Object.assign(new Error("Unbekannte Komponente"), { code: "NOT_FOUND" });
		job = { id, name: c.name, action, status: "running", startedAt: new Date().toISOString(), finishedAt: "", log: [], error: "" };
		const current = job;
		let result = "success";
		Promise.resolve()
			.then(() => work(c))
			.catch((err) => {
				result = "failed";
				current.error = shortError(err);
				log(`Fehler: ${current.error}`);
			})
			.then(() => refreshOne(id).catch(() => {}))
			.then(() => {
				// Erst jetzt "fertig" melden – der neue Stand ist dann schon eingelesen
				current.status = result;
				current.finishedAt = new Date().toISOString();
				state.lastJob = Object.assign({}, current, { log: current.log.slice(-40) });
				persist();
			});
		return status();
	}

	function apply(id) {
		return startJob(id, "update", async (c) => {
			const dirty = (await git(c.dir, ["status", "--porcelain", "--untracked-files=no"])) !== "";
			if (dirty) throw new Error("Lokale Änderungen im Ordner – Update abgebrochen");
			const from = await git(c.dir, ["rev-parse", "HEAD"]);
			const fromVersion = (readJson(path.join(c.dir, "package.json")) || {}).version || "";
			log(`$ git pull --ff-only   (${c.name})`);
			const out = await git(c.dir, ["pull", "--ff-only"], 5 * 60 * 1000);
			log(out);
			const to = await git(c.dir, ["rev-parse", "HEAD"]);
			// Ab hier ist der Stand geändert: "Zurück" muss möglich sein, auch wenn npm scheitert
			state.lastUpdate[c.id] = {
				from, to, fromVersion,
				toVersion: (readJson(path.join(c.dir, "package.json")) || {}).version || "",
				at: new Date().toISOString()
			};
			persist();
			await installDeps(c);
			log("MagicMirror wird neu gestartet …");
			await restart();
			log("Fertig.");
		});
	}

	function rollback(id) {
		const last = state.lastUpdate[id];
		if (!last) throw Object.assign(new Error("Für diese Komponente gibt es keinen gemerkten Stand vor einem Update"), { code: "NOT_FOUND" });
		return startJob(id, "rollback", async (c) => {
			const dirty = (await git(c.dir, ["status", "--porcelain", "--untracked-files=no"])) !== "";
			if (dirty) throw new Error("Lokale Änderungen im Ordner – Zurücksetzen abgebrochen");
			await git(c.dir, ["cat-file", "-e", `${last.from}^{commit}`]);
			log(`$ git reset --hard ${last.from.slice(0, 7)}   (${c.name}, zurück auf ${last.fromVersion || "vorherigen Stand"})`);
			log(await git(c.dir, ["reset", "--hard", last.from]));
			delete state.lastUpdate[id];
			persist();
			await installDeps(c);
			log("MagicMirror wird neu gestartet …");
			await restart();
			log("Fertig.");
		});
	}

	function status() {
		const comps = state.components.map((c) => Object.assign({}, c, { rollback: state.lastUpdate[c.id] || null }));
		return {
			checkedAt: state.checkedAt,
			checking,
			components: comps,
			available: comps.filter((c) => c.updateAvailable).length,
			job: job ? Object.assign({}, job, { log: job.log.slice() }) : null,
			lastJob: state.lastJob
		};
	}

	function startSchedule() {
		const tick = () => { if (!job || job.status !== "running") check().catch((err) => console.error("[lumira-portal] Update-Prüfung:", err.message)); };
		setTimeout(tick, FIRST_CHECK_DELAY_MS).unref();
		timer = setInterval(tick, CHECK_INTERVAL_MS);
		timer.unref();
	}

	return { discover, check, apply, rollback, status, startSchedule };
}

module.exports = { createUpdater };
