// LUMIRA selbst als Update (lib/updates.js, Komponente "lumira"): echtes
// git-Repo als ~/LUMIRA, install.sh --update und Portal-Neustart als Attrappen.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createUpdater } = require("../lib/updates");

let hasGit = true;
try { execFileSync("git", ["--version"]); } catch (err) { hasGit = false; }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-self-upd-"));
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

function g(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }) }).trim();
}

const WORK = path.join(ROOT, "authoring");
const BARE = path.join(ROOT, "remote", "LUMIRA.git");
const REPO = path.join(ROOT, "LUMIRA");
const MM = path.join(ROOT, "MagicMirror");

function publish(file, text, message) {
	fs.writeFileSync(path.join(WORK, file), text);
	g(WORK, "add", ".");
	g(WORK, "commit", "-q", "-m", message);
	g(WORK, "push", "-q", "origin", "master");
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

let updater, installerCalls = [], selfRestarts = 0, mmRestarts = 0, npmCalls = 0;
let installerResult = { needsFullInstall: false }, installerFails = false;

test("Erkennung: LUMIRA steht vorne, nur mit Repo und install.sh", { skip: !hasGit }, () => {
	fs.mkdirSync(WORK, { recursive: true });
	g(WORK, "init", "-q", "-b", "master");
	g(WORK, "config", "user.email", "test@example.com");
	g(WORK, "config", "user.name", "Test");
	fs.writeFileSync(path.join(WORK, "install.sh"), "#!/usr/bin/env bash\necho test\n");
	fs.writeFileSync(path.join(WORK, "README.md"), "LUMIRA\n");
	g(WORK, "add", ".");
	g(WORK, "commit", "-q", "-m", "Start");
	fs.mkdirSync(path.dirname(BARE), { recursive: true });
	g(ROOT, "clone", "-q", "--bare", WORK, BARE);
	g(WORK, "remote", "add", "origin", BARE);
	g(ROOT, "clone", "-q", BARE, REPO);
	fs.mkdirSync(MM, { recursive: true }); // MagicMirror ohne git: wird nicht gelistet

	let repo = null;
	updater = createUpdater({
		mmRoot: MM,
		statePath: path.join(ROOT, "lumira", "updates.json"),
		lumiraRepo: () => repo,
		restart: () => { mmRestarts++; },
		npm: async () => { npmCalls++; return { stdout: "" }; },
		runInstaller: async (dir, onLine) => {
			installerCalls.push(dir);
			onLine("==> LUMIRA-Update");
			onLine("  ✓ config.js aus settings.json aktualisiert");
			if (installerFails) throw new Error("install.sh --update ist fehlgeschlagen (Code 1)");
			return installerResult;
		},
		selfRestart: () => { selfRestarts++; }
	});
	assert.deepEqual(updater.discover(), []);
	repo = REPO;
	assert.deepEqual(updater.discover().map((c) => [c.id, c.kind]), [["lumira", "lumira"]]);
});

test("Prüfen: neuer Stand auf dem Server, mit Datum und Änderungen", { skip: !hasGit }, async () => {
	let s = await updater.check();
	assert.equal(s.available, 0);
	assert.ok(s.components[0].headDate);
	publish("README.md", "LUMIRA 2\n", "Dauerschleife auf dem Spiegel");
	s = await updater.check();
	const c = s.components[0];
	assert.equal(c.updateAvailable, true);
	assert.equal(c.canUpdate, true);
	assert.equal(c.changes[0].subject, "Dauerschleife auf dem Spiegel");
	assert.match(c.note, /Portal starten dabei kurz neu/);
});

test("Aktualisieren: git pull, install.sh --update, Hinweis, Portal-Neustart", { skip: !hasGit }, async () => {
	installerResult = { needsFullInstall: true };
	updater.apply("lumira");
	const s = await waitForJob(updater);
	assert.equal(s.job.status, "success", s.job.error);
	assert.deepEqual(installerCalls, [REPO]);
	assert.equal(fs.readFileSync(path.join(REPO, "README.md"), "utf8").trim(), "LUMIRA 2");
	assert.ok(s.job.log.some((l) => l.includes("config.js aus settings.json aktualisiert")));
	assert.match(s.job.notice, /install\.sh/);
	assert.equal(selfRestarts, 1);
	assert.equal(mmRestarts, 0, "MagicMirror startet install.sh selbst neu");
	assert.equal(npmCalls, 0);
	// Ergebnis bleibt nach dem Portal-Neustart als lastJob erhalten
	assert.equal(s.lastJob.kind, "lumira");
	assert.equal(s.lastJob.status, "success");
	assert.ok(s.components[0].rollback, "Zurück ist möglich");
});

test("Fehler in install.sh: als fehlgeschlagen melden, Portal trotzdem neu starten", { skip: !hasGit }, async () => {
	publish("README.md", "LUMIRA 3\n", "Noch ein Stand");
	await updater.check();
	installerFails = true;
	installerResult = { needsFullInstall: false };
	updater.apply("lumira");
	const s = await waitForJob(updater);
	assert.equal(s.job.status, "failed");
	assert.match(s.job.error, /install\.sh --update/);
	assert.equal(selfRestarts, 2, "neue Dateien sind schon da → Neustart");
	installerFails = false;
});

test("Zurück: Stand vor dem Update + install.sh --update", { skip: !hasGit }, async () => {
	updater.rollback("lumira");
	const s = await waitForJob(updater);
	assert.equal(s.job.status, "success", s.job.error);
	assert.equal(fs.readFileSync(path.join(REPO, "README.md"), "utf8").trim(), "LUMIRA 2");
	assert.equal(installerCalls.length, 3);
	assert.equal(selfRestarts, 3);
});
