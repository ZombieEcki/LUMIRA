// Fehlerhafte Electron-Version austauschen (lib/electron-fix.js), auch über
// die Update-Prüfung (MagicMirror-Update, „Electron reparieren“).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const electronFix = require("../lib/electron-fix");
const { createUpdater } = require("../lib/updates");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-electron-"));
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

function setElectron(mmRoot, version) {
	const dir = path.join(mmRoot, "node_modules", "electron");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "electron", version }));
}

// npm-Attrappe: „installiert“ electron@x, indem sie die Version umschreibt
function fakeNpm(calls) {
	return async (args, cwd) => {
		calls.push(args.join(" "));
		const spec = args.find((a) => a.startsWith("electron@"));
		if (spec) setElectron(cwd, spec.slice("electron@".length));
		return { stdout: "added 1 package" };
	};
}

test("44.4.5 wird erkannt und gegen 44.5.1 getauscht – ohne package-lock zu ändern", async () => {
	const mm = path.join(ROOT, "mm1");
	setElectron(mm, "44.4.5");
	assert.deepEqual(electronFix.needsFix(mm), { from: "44.4.5", to: "44.5.1", reason: electronFix.FIXES["44.4.5"].reason });
	const calls = [];
	const r = await electronFix.applyFix(mm, { npm: fakeNpm(calls) });
	assert.deepEqual(r, { fixed: true, from: "44.4.5", to: "44.5.1" });
	assert.equal(calls.length, 1);
	assert.match(calls[0], /--no-save/);
	assert.match(calls[0], /--package-lock=false/);
	assert.equal(electronFix.installedElectron(mm), "44.5.1");
	assert.equal(electronFix.needsFix(mm), null);
});

test("Andere Version oder kein Electron: nichts tun", async () => {
	const mm = path.join(ROOT, "mm2");
	const calls = [];
	assert.deepEqual(await electronFix.applyFix(mm, { npm: fakeNpm(calls) }), { fixed: false });
	setElectron(mm, "44.5.1");
	assert.deepEqual(await electronFix.applyFix(mm, { npm: fakeNpm(calls) }), { fixed: false });
	assert.equal(calls.length, 0);
});

test("npm installiert nicht die erwartete Version → Fehler", async () => {
	const mm = path.join(ROOT, "mm3");
	setElectron(mm, "44.4.5");
	await assert.rejects(electronFix.applyFix(mm, { npm: async () => ({ stdout: "" }) }), /statt 44\.5\.1/);
});

let hasGit = true;
try { execFileSync("git", ["--version"]); } catch (err) { hasGit = false; }

function g(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }) }).trim();
}

function waitForJob(updater) {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		(function poll() {
			const s = updater.status();
			if (s.job && s.job.status !== "running" && s.job.finishedAt) return resolve(s);
			if (Date.now() - start > 20000) return reject(new Error("Job hängt"));
			setTimeout(poll, 50);
		})();
	});
}

test("Update-Prüfung: erkennt 44.4.5, „Electron reparieren“ und Austausch nach MagicMirror-Update", { skip: !hasGit }, async () => {
	const work = path.join(ROOT, "authoring");
	const bare = path.join(ROOT, "remote", "mm.git");
	const mm = path.join(ROOT, "MagicMirror");
	fs.mkdirSync(work, { recursive: true });
	g(work, "init", "-q", "-b", "master");
	g(work, "config", "user.email", "t@e.st");
	g(work, "config", "user.name", "Test");
	fs.writeFileSync(path.join(work, "package.json"), JSON.stringify({ name: "magicmirror", version: "2.37.0", scripts: { "install-mm": "true" } }));
	fs.writeFileSync(path.join(work, ".gitignore"), "node_modules\n");
	g(work, "add", ".");
	g(work, "commit", "-q", "-m", "2.37.0");
	fs.mkdirSync(path.dirname(bare), { recursive: true });
	g(ROOT, "clone", "-q", "--bare", work, bare);
	g(work, "remote", "add", "origin", bare);
	g(ROOT, "clone", "-q", bare, mm);

	const calls = [];
	let restarts = 0;
	setElectron(mm, "44.4.5");
	const updater = createUpdater({
		mmRoot: mm,
		statePath: path.join(ROOT, "lumira", "updates.json"),
		restart: () => { restarts++; },
		npm: fakeNpm(calls)
	});

	// Prüfen zeigt Version + Reparatur-Angebot
	let s = await updater.check();
	const core = s.components.find((c) => c.id === "magicmirror");
	assert.equal(core.electron, "44.4.5");
	assert.equal(core.electronFix.to, "44.5.1");

	// Reparieren ohne Update
	updater.repairElectron("magicmirror");
	s = await waitForJob(updater);
	assert.equal(s.job.status, "success", s.job.error);
	assert.equal(electronFix.installedElectron(mm), "44.5.1");
	assert.equal(restarts, 1);
	assert.equal(s.components.find((c) => c.id === "magicmirror").electronFix, undefined);

	// MagicMirror-Update bringt wieder 44.4.5 (wie npm run install-mm) → wird gleich getauscht
	fs.writeFileSync(path.join(work, "package.json"), JSON.stringify({ name: "magicmirror", version: "2.38.0", scripts: { "install-mm": "true" } }));
	g(work, "commit", "-q", "-am", "2.38.0");
	g(work, "push", "-q", "origin", "master");
	await updater.check();
	const npmCalls = calls.length;
	const realNpm = fakeNpm(calls);
	// install-mm setzt Electron auf die ausgelieferte (fehlerhafte) Version zurück
	const updater2 = createUpdater({
		mmRoot: mm,
		statePath: path.join(ROOT, "lumira", "updates2.json"),
		restart: () => { restarts++; },
		npm: async (args, cwd) => { if (args[0] === "run") setElectron(cwd, "44.4.5"); return realNpm(args, cwd); }
	});
	await updater2.check();
	updater2.apply("magicmirror");
	s = await waitForJob(updater2);
	assert.equal(s.job.status, "success", s.job.error);
	assert.equal(electronFix.installedElectron(mm), "44.5.1");
	assert.ok(calls.slice(npmCalls).some((c) => c.includes("electron@44.5.1")));
	assert.ok(s.job.log.some((l) => l.includes("Electron 44.4.5 ist fehlerhaft")));
	// git-Ordner bleibt sauber (sonst würde „lokale Änderungen“ künftige Updates sperren)
	assert.equal(g(mm, "status", "--porcelain", "--untracked-files=no"), "");
});

test("Einbindung: install.sh und Portal nutzen den Fix", () => {
	const sh = fs.readFileSync(path.join(__dirname, "..", "..", "install.sh"), "utf8");
	assert.ok(sh.includes("electron-fix-cli.js"));
	assert.ok((sh.match(/^\s*fix_electron\s*$/gm) || []).length >= 2, "nach Neuinstallation und im Update-Modus");
});
