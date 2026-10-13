// LUMIRA Self-Service-Portal – Radar & Warnungen (Spiegel → Radar & Warnungen).
// Siehe lib/weather.js und modules/MMM-LumiraWeather. Jede Änderung wird
// sofort gespeichert und ist nach wenigen Sekunden auf dem Spiegel.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;    // { toast, getSettings, currentPage }
  var S = null;      // letzter Stand von GET /api/weather
  var saveTimer = null;
  var pending = {};
  var shotTimer = null;
  var shotUrl = null;

  var ANCHORS = [
    ["top_left", "oben links"], ["top_center", "oben mittig"], ["top_right", "oben rechts"],
    ["middle_left", "mittig links"], ["middle_center", "Mitte"], ["middle_right", "mittig rechts"],
    ["bottom_left", "unten links"], ["bottom_center", "unten mittig"], ["bottom_right", "unten rechts"]
  ];
  var ZOOMS = [[6, "sehr weit"], [7, "weit"], [8, "Umgebung"], [9, "nah"], [10, "sehr nah"], [11, "Ort"]];
  var FONT = [80, 90, 100, 110, 120, 140, 160];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function api(method, body) {
    var init = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch("/api/weather", init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || ("HTTP " + res.status));
        return d;
      });
    });
  }

  // Änderungen sammeln und kurz verzögert speichern (Regler, Tippen)
  function change(part, key, value, now) {
    if (part) { pending[part] = pending[part] || {}; pending[part][key] = value; }
    else pending[key] = value;
    if (S) {
      if (part) S[part][key] = value; else S[key] = value;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, now ? 0 : 500);
  }

  function flush() {
    var body = pending;
    pending = {};
    api("PUT", body).then(function (s) { S = s; render(); shotSoon(); }).catch(function (err) { ctx.toast(err.message); load(); });
  }

  // ---------------------------------------------------------------------
  // Anzeige
  // ---------------------------------------------------------------------
  function setSw(btn, on) { btn.setAttribute("aria-checked", on ? "true" : "false"); }

  function render() {
    if (!S) return;
    setSw($("#wx-on"), S.enabled);
    var parts = [];
    if (S.radar.enabled) parts.push("Regenradar");
    if (S.warnings.enabled) parts.push("Warnungen");
    $("#wx-on-sub").textContent = S.enabled ? "an · " + (parts.join(" und ") || "nichts ausgewählt") : "aus";
    $("#wx-loc").textContent = "Standort: " + (S.location.name || (S.location.lat.toFixed(3) + ", " + S.location.lon.toFixed(3))) + " – ändern unter Spiegel → Standort & Wetter.";
    var st = ctx.getSettings();
    $("#wx-old-radar").hidden = !(S.enabled && S.radar.enabled && st && st.rainRadar && st.rainRadar.enabled);

    document.querySelectorAll(".wx-box").forEach(function (card) {
      var part = card.getAttribute("data-wx");
      var b = S[part];
      card.classList.toggle("is-off", !b.enabled || !S.enabled);
      card.querySelectorAll("[data-k]").forEach(function (c) {
        var k = c.getAttribute("data-k");
        if (c.classList.contains("sw")) setSw(c, b[k]);
        else if (document.activeElement !== c) c.value = String(b[k]);
      });
      var anim = card.querySelector(".wx-anim");
      if (anim) anim.hidden = !b.animate;
      renderLayout(card.querySelector(".wx-layout"), part, b);
    });
    renderZoomLabels();
    renderReport();
  }

  function renderZoomLabels() {
    var sel = $('.wx-box[data-wx="radar"] [data-k="zoom"]');
    if (!sel || !S) return;
    if (!sel.options.length) {
      ZOOMS.forEach(function (z) { var o = el("option"); o.value = z[0]; sel.appendChild(o); });
    }
    // Breite in km für die aktuelle Kachelbreite (wie auf dem Spiegel)
    Array.prototype.forEach.call(sel.options, function (o) {
      var z = Number(o.value);
      var label = (ZOOMS.filter(function (x) { return x[0] === z; })[0] || [z, ""])[1];
      var km = window.LumiraGeo ? window.LumiraGeo.frame(S.location.lat, S.location.lon, z, S.radar.width - 28, 100).km : 0;
      o.textContent = label + (km ? " – ca. " + km + " km breit" : "");
    });
    sel.value = String(S.radar.zoom);
  }

  // Position (9 Felder), Abstände, Größe, Deckkraft, Schrift einer Kachel
  function renderLayout(box, part, b) {
    if (!box.firstChild) buildLayout(box, part);
    box.querySelectorAll(".wx-pos button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-a") === b.anchor ? "true" : "false");
    });
    box.querySelectorAll("[data-n]").forEach(function (inp) {
      var k = inp.getAttribute("data-n");
      if (document.activeElement !== inp) inp.value = String(b[k]);
    });
    var op = box.querySelector(".wx-op-val");
    if (op) op.textContent = b.opacity + " %";
    var a = b.anchor.split("_");
    box.querySelector('[data-l="x"]').textContent = a[1] === "center" ? "Versatz waagerecht (px)" : "Abstand vom " + (a[1] === "left" ? "linken" : "rechten") + " Rand (px)";
    box.querySelector('[data-l="y"]').textContent = a[0] === "middle" ? "Versatz senkrecht (px)" : "Abstand vom " + (a[0] === "top" ? "oberen" : "unteren") + " Rand (px)";
  }

  function buildLayout(box, part) {
    var h = el("div", "wx-l-h", "Position & Größe");
    box.appendChild(h);
    var row = el("div", "wx-l-row");
    var pos = el("div", "wx-pos");
    pos.setAttribute("role", "group");
    pos.setAttribute("aria-label", "Position auf dem Spiegel");
    ANCHORS.forEach(function (a) {
      var btn = el("button");
      btn.type = "button";
      btn.title = a[1];
      btn.setAttribute("aria-label", a[1]);
      btn.setAttribute("data-a", a[0]);
      btn.addEventListener("click", function () { change(part, "anchor", a[0], true); render(); });
      pos.appendChild(btn);
    });
    row.appendChild(pos);
    var nums = el("div", "wx-nums");
    [["x", "Abstand waagerecht (px)"], ["y", "Abstand senkrecht (px)"], ["width", "Breite (px)"], ["height", part === "warnings" ? "Höhe höchstens (px)" : "Höhe (px)"]].forEach(function (f) {
      var fd = el("div", "field");
      var lb = el("label", null, f[1]);
      lb.setAttribute("data-l", f[0]);
      var inp = el("input", "mono-in");
      inp.type = "number";
      inp.step = f[0] === "x" || f[0] === "y" ? "10" : "10";
      inp.id = "wx-" + part + "-" + f[0];
      lb.htmlFor = inp.id;
      inp.setAttribute("data-n", f[0]);
      inp.addEventListener("change", function () {
        var v = Math.round(Number(inp.value));
        if (!isFinite(v)) return;
        change(part, f[0], v);
      });
      fd.appendChild(lb); fd.appendChild(inp);
      nums.appendChild(fd);
    });
    row.appendChild(nums);
    box.appendChild(row);

    var g = el("div", "grid2");
    var fo = el("div", "field");
    var lo = el("label", null, "Hintergrund-Deckkraft ");
    lo.appendChild(el("span", "wx-op-val"));
    var op = el("input", "db-range");
    op.type = "range"; op.min = "0"; op.max = "100"; op.step = "5";
    op.id = "wx-" + part + "-opacity"; lo.htmlFor = op.id;
    op.setAttribute("data-n", "opacity");
    op.addEventListener("input", function () { box.querySelector(".wx-op-val").textContent = op.value + " %"; change(part, "opacity", Number(op.value)); });
    fo.appendChild(lo); fo.appendChild(op);
    g.appendChild(fo);
    var ff = el("div", "field");
    var lf = el("label", null, "Schriftgröße");
    var fs = el("select");
    fs.id = "wx-" + part + "-font"; lf.htmlFor = fs.id;
    fs.setAttribute("data-n", "fontScale");
    FONT.forEach(function (n) { var o = el("option", null, n + " %"); o.value = n; fs.appendChild(o); });
    fs.addEventListener("change", function () { change(part, "fontScale", Number(fs.value), true); });
    ff.appendChild(lf); ff.appendChild(fs);
    g.appendChild(ff);
    box.appendChild(g);
    box.appendChild(el("p", "save-hint", "0 % Deckkraft = ganz durchsichtig, der Hintergrund bleibt voll sichtbar."));
  }

  // Rückmeldung des Spiegels: überdeckt eine Kachel andere Inhalte?
  function renderReport() {
    var box = $("#wx-report");
    box.innerHTML = "";
    var r = S && S.report;
    if (!S || !S.enabled || !r) return;
    var lines = [];
    [["radar", "Regenradar"], ["warnings", "Warnungen"]].forEach(function (x) {
      if (!S[x[0]].enabled) return;
      var o = (r.overlaps && r.overlaps[x[0]]) || [];
      if (o.length) lines.push(x[1] + " überdeckt: " + o.join(", "));
      if (r.offscreen && r.offscreen[x[0]]) lines.push(x[1] + " ragt über den Bildschirmrand hinaus");
    });
    if (lines.length) {
      lines.forEach(function (t) { box.appendChild(el("div", "setup-banner", "⚠ " + t)); });
    } else {
      box.appendChild(el("p", "save-hint", "✓ Keine Überschneidung mit Uhr, Familienplan, Kalender & Co." + (r.screen && r.screen.width ? " (Spiegel " + r.screen.width + " × " + r.screen.height + " px)" : "")));
    }
  }

  // ---------------------------------------------------------------------
  // Vorschau: Live-Bild des Spiegels (solange die Seite offen ist)
  // ---------------------------------------------------------------------
  function shotActive() { return ctx.currentPage() === "wetterkarte" && !document.hidden; }

  function shot() {
    clearTimeout(shotTimer);
    if (!shotActive()) return;
    fetch("/api/mirror/screenshot", { credentials: "same-origin", cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Der Spiegel liefert gerade kein Bild.");
      return res.blob();
    }).then(function (blob) {
      var old = shotUrl;
      shotUrl = URL.createObjectURL(blob);
      $("#wx-shot-img").src = shotUrl;
      $("#wx-shot").classList.add("has-img");
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 1000);
    }).catch(function (err) {
      $("#wx-shot-note").textContent = err.message;
    }).then(function () {
      // Rückmeldung (Überschneidung) mit auffrischen
      api("GET").then(function (s) { if (!Object.keys(pending).length) { S = s; renderReport(); } }).catch(function () {});
      if (shotActive()) shotTimer = setTimeout(shot, 5000);
    });
  }

  // Nach einer Änderung kurz warten, bis der Spiegel sie gezeichnet hat
  function shotSoon() {
    clearTimeout(shotTimer);
    shotTimer = setTimeout(shot, 2500);
  }

  function load() {
    return api("GET").then(function (s) { S = s; render(); }).catch(function (err) { ctx.toast(err.message); });
  }

  window.LumiraWeather = {
    init: function (context) {
      ctx = context;
      $("#wx-on").addEventListener("click", function () { change(null, "enabled", !(S && S.enabled), true); render(); });
      document.querySelectorAll(".wx-box").forEach(function (card) {
        var part = card.getAttribute("data-wx");
        card.querySelectorAll("[data-k]").forEach(function (c) {
          var k = c.getAttribute("data-k");
          if (c.classList.contains("sw")) {
            c.addEventListener("click", function () { change(part, k, !(S && S[part][k]), true); render(); });
          } else {
            c.addEventListener("change", function () {
              var v = /^(zoom|past|future|minSeverity|max)$/.test(k) ? Number(c.value) : c.value;
              change(part, k, v, true);
            });
          }
        });
      });
      $("#wx-shot-reload").addEventListener("click", shot);
      document.addEventListener("visibilitychange", function () { if (shotActive()) shot(); });
      load();
    },
    // Seite geöffnet: frisch laden und Vorschau starten
    show: function () { if (ctx) { load(); shot(); } }
  };
})();
