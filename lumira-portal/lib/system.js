// LUMIRA – Systemsteuerung (Neustart des Mini-PCs) für die "System"-Karte
// auf der Steuerung-Seite. execFile-only, kein exec mit String-Interpolation
// (gleiches Prinzip wie lib/net.js). Setzt eine Polkit-Regel voraus, die dem
// Portal-Benutzer passwortlosen Zugriff auf org.freedesktop.login1.reboot
// erlaubt (siehe systemd/polkit-lumira-reboot.rules, von install.sh installiert).
"use strict";

const { execFile } = require("child_process");

function reboot() {
	return new Promise((resolve, reject) => {
		execFile("systemctl", ["reboot"], (err, stdout, stderr) => {
			if (err) {
				err.stderr = stderr;
				reject(err);
				return;
			}
			resolve();
		});
	});
}

module.exports = { reboot };
