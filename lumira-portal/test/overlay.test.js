// Overlays: alle Rückfragen laufen über public/overlay.js (concept/overlays.md),
// keine Browser-Fenster (confirm/prompt/alert) mehr im Portal
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const PUB = path.join(__dirname, "..", "public");

function files(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
		const p = path.join(dir, d.name);
		if (d.isDirectory()) return d.name === "vendor" ? [] : files(p);
		return d.name.endsWith(".js") ? [p] : [];
	});
}

test("Kein confirm/prompt/alert im Portal – nur LumiraOverlay", () => {
	const hits = [];
	for (const f of files(PUB)) {
		fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
			// installPrompt.prompt() (App installieren) ist kein Dialog
			if (/(^|[^.\w$])(confirm|prompt|alert)\s*\(/.test(line.replace(/window\./g, ""))) hits.push(path.relative(PUB, f) + ":" + (i + 1));
		});
	}
	assert.deepEqual(hits, []);
});

test("overlay.js wird vor allen Seiten-Skripten geladen", () => {
	const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
	const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !s.startsWith("vendor/"));
	assert.equal(scripts[0], "overlay.js");
});
