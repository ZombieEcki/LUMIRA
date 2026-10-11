// LUMIRA – gezeichnetes Lagerfeuer für die Dauerschleife (MMM-Ambient).
//
// Klassischer „Feuer-Algorithmus“ auf kleiner Fläche (z. B. 160 × 100
// Bildpunkte), vom Browser weich hochskaliert – sieht nach Flammen aus und
// kostet selbst einen Raspberry Pi 3 kaum Rechenzeit. Keine Videodatei, keine
// Lizenzfragen.
//
// Dieselbe Datei liegt im Portal als public/ambient-fire.js (Vorschau in der
// Mediathek). Ein Test prüft, dass beide gleich bleiben.
(function (root) {
	"use strict";

	// Farbverlauf von Schwarz über Glut-Rot und Orange bis Gelb-Weiß
	var STOPS = [
		[0, 7, 7, 7], [4, 47, 15, 7], [8, 103, 31, 7], [12, 143, 39, 7], [16, 191, 71, 7],
		[20, 223, 87, 7], [24, 223, 111, 15], [28, 215, 135, 23], [32, 207, 151, 31],
		[34, 223, 183, 63], [36, 255, 239, 191]
	];
	var LEVELS = 37;
	var PALETTE = (function () {
		var p = [];
		for (var i = 0; i < LEVELS; i++) {
			var a = STOPS[0], b = STOPS[STOPS.length - 1];
			for (var s = 0; s < STOPS.length - 1; s++) {
				if (i >= STOPS[s][0] && i <= STOPS[s + 1][0]) { a = STOPS[s]; b = STOPS[s + 1]; break; }
			}
			var t = b[0] === a[0] ? 0 : (i - a[0]) / (b[0] - a[0]);
			p.push([Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t)]);
		}
		return p;
	})();

	function start(canvas, opts) {
		opts = opts || {};
		var W = opts.width || 160, H = opts.height || 100, fps = opts.fps || 24;
		canvas.width = W; canvas.height = H;
		var ctx = canvas.getContext("2d");
		var img = ctx.createImageData(W, H);
		var heat = new Uint8Array(W * H);
		var running = true, timer = null, last = 0;
		var embers = [];

		// Brennstoff in der untersten Zeile: in der Mitte heiß, zu den Seiten aus
		function feed() {
			var y = (H - 1) * W;
			for (var x = 0; x < W; x++) {
				var d = Math.abs(x - W / 2) / (W * 0.18);
				var base = d >= 1 ? 0 : (1 - d * d) * (LEVELS - 1);
				heat[y + x] = Math.max(0, Math.min(LEVELS - 1, Math.round(base * (0.78 + Math.random() * 0.22))));
			}
		}

		// Hitze wandert nach oben, kühlt ab und weht leicht zur Seite
		function spread() {
			for (var x = 0; x < W; x++) {
				for (var y = 1; y < H; y++) {
					var src = y * W + x;
					var h = heat[src];
					if (h === 0) { heat[src - W] = 0; continue; }
					var r = (Math.random() * 3) | 0;
					var dst = src - W - r + 1;
					if (dst < 0) dst = 0;
					// im Mittel 2/3 Stufen pro Zeile: Flammen bis etwa zwei Drittel hoch
					heat[dst] = Math.max(0, h - (r === 1 ? 0 : 1));
				}
			}
		}

		function drawEmbers() {
			if (Math.random() < 0.35) {
				embers.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H - 8, vx: (Math.random() - 0.5) * 0.4, vy: -0.4 - Math.random() * 0.6, life: 40 + Math.random() * 40 });
			}
			for (var i = embers.length - 1; i >= 0; i--) {
				var e = embers[i];
				e.x += e.vx; e.y += e.vy; e.vx += (Math.random() - 0.5) * 0.08; e.life--;
				if (e.life <= 0 || e.y < 0) { embers.splice(i, 1); continue; }
				var a = Math.min(1, e.life / 30);
				ctx.fillStyle = "rgba(255," + (150 + ((Math.random() * 60) | 0)) + ",60," + a.toFixed(2) + ")";
				ctx.fillRect(e.x | 0, e.y | 0, 1, 1);
			}
		}

		// Zwei gekreuzte Holzscheite unten
		function drawLogs() {
			ctx.save();
			ctx.translate(W / 2, H - 3);
			[[-0.22, "#24130a"], [0.22, "#2e180c"]].forEach(function (l) {
				ctx.save();
				ctx.rotate(l[0]);
				ctx.fillStyle = l[1];
				ctx.fillRect(-W * 0.2, -2, W * 0.4, 4);
				ctx.fillStyle = "rgba(255,120,40,0.55)";
				ctx.fillRect(-W * 0.12, -2, W * 0.24, 1);
				ctx.restore();
			});
			ctx.restore();
		}

		function frame(ts) {
			if (!running) return;
			if (!ts || ts - last >= 1000 / fps) {
				last = ts || 0;
				feed();
				spread();
				var d = img.data;
				for (var i = 0; i < heat.length; i++) {
					var c = PALETTE[heat[i]], o = i * 4;
					d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
				}
				ctx.putImageData(img, 0, 0);
				drawLogs();
				drawEmbers();
			}
			timer = (root.requestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 1000 / fps); })(frame);
		}

		// Vorglühen: beim Einschalten brennt es sofort, statt erst hochzuwachsen
		for (var w = 0; w < (opts.warmup == null ? H * 2 : opts.warmup); w++) { feed(); spread(); }
		frame(0);
		return function stop() {
			running = false;
			if (root.cancelAnimationFrame && timer) root.cancelAnimationFrame(timer); else clearTimeout(timer);
		};
	}

	root.LumiraFire = { start: start };
})(typeof window !== "undefined" ? window : this);
