/* MMM-LumiraWeather – Kartenausschnitt in Web-Mercator (EPSG:3857).
 *
 * Läuft im Browser (window.LumiraGeo) und in Node (require, für Tests).
 * Ein Ausschnitt ist durch Mittelpunkt, Zoomstufe (wie bei Kartendiensten,
 * 256-px-Kacheln) und Größe in Pixeln bestimmt. Daraus entstehen:
 *  - die BBOX in Metern für die WMS-Bilder des DWD (Radar, Grundkarte),
 *  - die OpenStreetMap-Kacheln samt Lage im Ausschnitt.
 * Weil beides aus derselben Rechnung kommt, liegt das Radar exakt auf der Karte.
 */
(function (root) {
	"use strict";

	var R = 6378137;
	var C = 2 * Math.PI * R; // Erdumfang in Mercator-Metern

	// Weltpixel bei Zoom z (256 × 2^z Pixel für die ganze Welt)
	function toPixel(lat, lon, z) {
		var size = 256 * Math.pow(2, z);
		var s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
		return {
			x: (lon + 180) / 360 * size,
			y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size
		};
	}

	function frame(lat, lon, z, width, height) {
		var w = Math.max(1, Math.round(width));
		var h = Math.max(1, Math.round(height));
		var c = toPixel(lat, lon, z);
		var left = c.x - w / 2;
		var top = c.y - h / 2;
		var res = C / (256 * Math.pow(2, z)); // Meter je Pixel am Äquator
		var mx = function (p) { return p * res - C / 2; };
		var my = function (p) { return C / 2 - p * res; };
		var bbox = [mx(left), my(top + h), mx(left + w), my(top)];

		// OpenStreetMap-Kacheln, die den Ausschnitt abdecken
		var n = Math.pow(2, z);
		var tiles = [];
		for (var ty = Math.floor(top / 256); ty <= Math.floor((top + h - 1) / 256); ty++) {
			if (ty < 0 || ty >= n) continue;
			for (var tx = Math.floor(left / 256); tx <= Math.floor((left + w - 1) / 256); tx++) {
				tiles.push({ z: z, x: ((tx % n) + n) % n, y: ty, left: Math.round(tx * 256 - left), top: Math.round(ty * 256 - top) });
			}
		}
		// Breite des Ausschnitts in km (am Standort, für die Anzeige im Portal)
		var km = Math.round(w * res * Math.cos(lat * Math.PI / 180) / 1000);
		return { width: w, height: h, bbox: bbox, tiles: tiles, marker: { x: w / 2, y: h / 2 }, km: km };
	}

	var api = { toPixel: toPixel, frame: frame };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.LumiraGeo = api;
})(typeof window !== "undefined" ? window : globalThis);
