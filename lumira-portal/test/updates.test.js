// Tests für lib/updates.js mit echten git-Repositories: ein "Server"-Repo
// (bare) und ein Klon als ~/MagicMirror bzw. Modulordner – wie auf dem Pi.
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

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "lumira-upd-test-"));
test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

function g(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }) }).trim();
}

// Legt Server-Repo + Arbeitskopie an, liefert Funktion zum Veröffentlichen neuer Versionen.
function makeRepo(name, cloneTo, version) {
	const bare = path.join(ROOT, "remote", `${name}.git`);
	const work = path.join(ROOT, "authoring", name);
	fs.mkdirSync(work, { recursive: true });
	g(work, "init", "-q", "-b", "master");
	g(work, "config", "user.email", "test@example.com");
	g(work, "config", "user.name", "Test");
	fs.writeFileSync(path.join(work, "package.json"), JSON.stringify({ name, version }));
	g(work, "add", ".");
	g(work, "commit", "-q", "-m", `Version ${version}`);
	fs.mkdirSync(path.dirname(bare), { recursive: true });
	g(ROOT, "clone", "-q", "--bare", work, bare);
	g(work, "remote", "add", "origin", bare);
	g(ROOT, "clone", "-q", bare, cloneTo);
	return function publish(newVersion, message) {
		fs.writeFileSync(path.join(work, "package.json"), JSON.stringify({ name, version: newVersion }));
		g(work, "commit", "-q", "-am", message || `Version ${newVersion}`);
		g(work, "push", "-q", "origin", "master");
	};
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

const MM = path.join(ROOT, "MagicMirror");
let publishMM, publishRadar, restarts = 0;
let updater;

test("Erkennung: MagicMirror + externe Module, eigene Module und default werden übersprungen", { skip: !hasGit }, () => {
	publishMM = makeRepo("magicmirror", MM, "2.30.0");
	fs.mkdirSync(path.join(MM, "modules", "default"), { recursive: true });
	publishRadar = makeRepo("MMM-RainRadarDWD", path.join(MM, "modules", "MMM-RainRadarDWD"), "1.0.0");
	fs.mkdirSync(path.join(MM, "modules", "MMM-FamilyPlan"), { recursive: true }); // eigenes Modul, ohne .git
	updater = createUpdater({
		mmRoot: MM,
		statePath: path.join(ROOT, "lumira", "updates.json"),
		ownModules: ["MMM-FamilyPlan"],
		restart: () => { restarts++; },
		npm: async () => ({ stdout: "" })
	});
	assert.deepEqual(updater.discover().map((c) => c.id), ["magicmirror", "MMM-RainRadarDWD"]);
});

test("Prüfen: kein Update, dann neue Version auf dem Server wird erkannt", { skip: !hasGit }, async () => {
	let s = await updater.check();
	assert.equal(s.available, 0);
	assert.ok(s.checkedAt);
	publishMM("2.31.0", "Release 2.31.0");
	s = await updater.check();
	const mm = s.components.find((c) => c.id === "magicmirror");
	assert.equal(mm.updateAvailable, true);
	assert.equal(mm.canUpdate, true);
	assert.equal(mm.currentVersion, "2.30.0");
	assert.equal(mm.latestVersion, "2.31.0");
	assert.equal(mm.behind, 1);
	assert.equal(mm.changes[0].subject, "Release 2.31.0");
	assert.equal(s.available, 1);
});

test("Aktualisieren: git pull, Neustart, danach aktuell und „Zurück“ möglich", { skip: !hasGit }, async () => {
	updater.apply("magicmirror");
	assert.throws(() => updater.apply("MMM-RainRadarDWD"), /läuft bereits/);
	const s = await waitForJob(updater);
	assert.equal(s.job.status, "success", s.job.log.join("\n"));
	assert.equal(JSON.parse(fs.readFileSync(path.join(MM, "package.json"), "utf8")).version, "2.31.0");
	assert.equal(restarts, 1);
	const mm = s.components.find((c) => c.id === "magicmirror");
	assert.equal(mm.updateAvailable, false);
	assert.equal(mm.rollback.fromVersion, "2.30.0");
});

test("Zurück zur vorherigen Version", { skip: !hasGit }, async () => {
	updater.rollback("magicmirror");
	const s = await waitForJob(updater);
	assert.equal(s.job.status, "success", s.job.log.join("\n"));
	assert.equal(JSON.parse(fs.readFileSync(path.join(MM, "package.json"), "utf8")).version, "2.30.0");
	const mm = s.components.find((c) => c.id === "magicmirror");
	assert.equal(mm.updateAvailable, true, "die neue Version wird wieder als Update angeboten");
	assert.equal(mm.rollback, null);
	assert.equal(restarts, 2);
});

test("Lokale Änderungen: kein Update über das Portal", { skip: !hasGit }, async () => {
	publishRadar("1.1.0");
	fs.writeFileSync(path.join(MM, "modules", "MMM-RainRadarDWD", "package.json"), "{\"name\":\"lokal\",\"version\":\"1.0.0-lokal\"}");
	const s = await updater.check();
	const radar = s.components.find((c) => c.id === "MMM-RainRadarDWD");
	assert.equal(radar.updateAvailable, true);
	assert.equal(radar.canUpdate, false);
	assert.match(radar.note, /lokale Änderungen/);
	updater.apply("MMM-RainRadarDWD");
	const after = await waitForJob(updater);
	assert.equal(after.job.status, "failed");
	assert.match(after.job.error, /Lokale Änderungen/);
});

test("Unbekannte Komponente und Pfad-Tricks werden abgelehnt", { skip: !hasGit }, () => {
	assert.throws(() => updater.apply("../../etc"), /Unbekannte Komponente/);
	assert.throws(() => updater.rollback("MMM-RainRadarDWD"), /keinen gemerkten Stand/);
});

test("Zustand überlebt einen Neustart des Portals", { skip: !hasGit }, () => {
	const again = createUpdater({ mmRoot: MM, statePath: path.join(ROOT, "lumira", "updates.json") });
	const s = again.status();
	assert.ok(s.checkedAt);
	assert.equal(s.components.length, 2);
	assert.ok(s.lastJob && s.lastJob.finishedAt);
});
