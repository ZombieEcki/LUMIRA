/* LUMIRA – eingebauter Klingelton „Ding-Dong“, gezeichnet mit WebAudio
 * (keine Datei, kein Internet). Dieselbe Datei liegt als
 * lumira-portal/public/doorbell-gong.js im Portal (Ton probehören) – der
 * Portal-Test prüft, dass beide gleich sind.
 *
 * LumiraGong.play(volume 0–1) → spielt einmal „Ding-Dong“.
 */
(function (root) {
	"use strict";

	function play(volume) {
		const AC = root.AudioContext || root.webkitAudioContext;
		if (!AC) return null;
		const ac = new AC();
		if (ac.state === "suspended" && ac.resume) ac.resume().catch(function () {});
		const master = ac.createGain();
		master.gain.value = Math.max(0, Math.min(1, Number(volume))) * 0.9;
		master.connect(ac.destination);
		const t0 = ac.currentTime + 0.05;
		// Zwei Glockentöne (E5, dann C5), jeweils Grundton plus Obertöne, abklingend
		[[659.25, 0], [523.25, 0.6]].forEach(function (note) {
			[[1, 0.6], [2, 0.22], [3.01, 0.09], [4.2, 0.04]].forEach(function (part) {
				const t = t0 + note[1];
				const o = ac.createOscillator();
				o.type = "sine";
				o.frequency.value = note[0] * part[0];
				const g = ac.createGain();
				g.gain.setValueAtTime(0.0001, t);
				g.gain.exponentialRampToValueAtTime(part[1], t + 0.012);
				g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2 / part[0] + 0.4);
				o.connect(g);
				g.connect(master);
				o.start(t);
				o.stop(t + 2.8);
			});
		});
		setTimeout(function () { if (ac.close) ac.close().catch(function () {}); }, 4000);
		return ac;
	}

	root.LumiraGong = { play: play };
})(typeof window !== "undefined" ? window : globalThis);
