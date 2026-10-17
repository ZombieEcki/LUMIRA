// LUMIRA Self-Service-Portal – Wetteranzeige (Spiegel → Wetteranzeige) und
// Radar & Warnungen (Spiegel → Radar & Warnungen). Siehe lib/weather.js und
// modules/MMM-LumiraWeather. Jede Änderung wird sofort gespeichert und ist
// nach wenigen Sekunden auf dem Spiegel. Die Designs der Wetteranzeige
// zeichnet weather-view.js – derselbe Code wie auf dem Spiegel.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;    // { toast, getSettings, currentPage }
  var S = null;      // letzter Stand von GET /api/weather
  var FX = null;     // Wetterdaten für die Vorschau (GET /api/weather/forecast)
  var saveTimer = null;
  var pending = {};
  var shotTimer = null;
  var shotUrl = null;
  var galleryKey = "";
  var PAGES = ["wetterkarte", "wetteranzeige"];

  var ANCHORS = [
    ["top_left", "oben links"], ["top_center", "oben mittig"], ["top_right", "oben rechts"],
    ["middle_left", "mittig links"], ["middle_center", "Mitte"], ["middle_right", "mittig rechts"],
    ["bottom_left", "unten links"], ["bottom_center", "unten mittig"], ["bottom_right", "unten rechts"]
  ];
  var ZOOMS = [[6, "sehr weit"], [7, "weit"], [8, "Umgebung"], [9, "nah"], [10, "sehr nah"], [11, "Ort"]];
  var FONT = [70, 80, 90, 100, 110, 120, 140, 160, 180, 200];
  var NUMERIC = /^(zoom|past|future|minSeverity|max|days|interval|padding|photoOpacity)$/;
  var PART_NAME = { radar: "Regenradar", warnings: "Warnungen", weather: "Wetteranzeige" };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function View() { return window.LumiraWeatherView; }
  function pageEl() { return $('.page[data-page="' + ctx.currentPage() + '"]'); }

  function api(method, body, sub) {
    var init = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch("/api/weather" + (sub || ""), init).then(function (res) {
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

  function hhmm(iso) {
    var d = new Date(iso);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
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
    var locText = "Standort: " + (S.location.name || (S.location.lat.toFixed(3) + ", " + S.location.lon.toFixed(3))) + " – ändern unter Spiegel → Standort & Wetter.";
    $("#wx-loc").textContent = locText;
    $("#wd-loc").textContent = locText;
    var st = ctx.getSettings();
    $("#wx-old-radar").hidden = !(S.enabled && S.radar.enabled && st && st.rainRadar && st.rainRadar.enabled);

    document.querySelectorAll(".wx-box").forEach(function (card) {
      var part = card.getAttribute("data-wx");
      var b = S[part];
      card.classList.toggle("is-off", part === "weather" ? !b.enabled : (!b.enabled || !S.enabled));
      card.querySelectorAll("[data-k]").forEach(function (c) {
        var k = c.getAttribute("data-k");
        if (c.classList.contains("sw")) setSw(c, b[k]);
        else if (document.activeElement !== c) c.value = String(b[k]);
      });
      var anim = card.querySelector(".wx-anim");
      if (anim) anim.hidden = !b.animate;
      var lay = card.querySelector(".wx-layout");
      if (lay) renderLayout(lay, part, b);
    });
    renderZoomLabels();
    renderDisplay();
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
    var pct = b.unit === "pct";
    box.querySelectorAll('[data-n="x"], [data-n="y"]').forEach(function (inp) { inp.step = pct ? "1" : "10"; });
    var op = box.querySelector(".wx-op-val");
    if (op) op.textContent = b.opacity + " %";
    var u = pct ? " (%)" : " (px)";
    var a = b.anchor.split("_");
    box.querySelector('[data-l="x"]').textContent = (a[1] === "center" ? "Versatz waagerecht" : "Abstand vom " + (a[1] === "left" ? "linken" : "rechten") + " Rand") + u;
    box.querySelector('[data-l="y"]').textContent = (a[0] === "middle" ? "Versatz senkrecht" : "Abstand vom " + (a[0] === "top" ? "oberen" : "unteren") + " Rand") + u;
    // Bei der Wetteranzeige mit Bild regelt die Deckkraft nur die Glasfläche der anderen Designs
    var opf = box.querySelector(".wx-op-field");
    if (opf) opf.hidden = part === "weather" && b.design === "photo";
  }

  // Bildschirmgröße des Spiegels (für die Umrechnung px ↔ %)
  function screenSize() {
    var r = S && S.report && S.report.screen;
    return r && r.width && r.height ? r : { width: 1920, height: 1080 };
  }

  function setUnit(part, unit) {
    var b = S[part];
    if (b.unit === unit) return;
    var sc = screenSize();
    var toPct = unit === "pct";
    var conv = function (v, size) { return toPct ? Math.round(v / size * 100) : Math.round(v * size / 100 / 10) * 10; };
    var x = conv(b.x, sc.width);
    var y = conv(b.y, sc.height);
    pending[part] = pending[part] || {};
    pending[part].unit = unit; pending[part].x = x; pending[part].y = y;
    b.unit = unit; b.x = x; b.y = y;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 0);
    render();
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
    var autoH = part === "warnings" || part === "weather";
    [["x", "Abstand waagerecht (px)"], ["y", "Abstand senkrecht (px)"], ["width", "Breite (px)"], ["height", autoH ? "Höhe höchstens (px)" : "Höhe (px)"]].forEach(function (f) {
      var fd = el("div", "field");
      var lb = el("label", null, f[1]);
      lb.setAttribute("data-l", f[0]);
      var inp = el("input", "mono-in");
      inp.type = "number";
      inp.step = "10";
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
    var fo = el("div", "field wx-op-field");
    var lo = el("label", null, "Hintergrund-Deckkraft ");
    lo.appendChild(el("span", "wx-op-val"));
    var op = el("input", "db-range");
    op.type = "range"; op.min = "0"; op.max = "100"; op.step = "5";
    op.id = "wx-" + part + "-opacity"; lo.htmlFor = op.id;
    op.setAttribute("data-n", "opacity");
    op.addEventListener("input", function () { box.querySelector(".wx-op-val").textContent = op.value + " %"; change(part, "opacity", Number(op.value)); renderDisplay(); });
    fo.appendChild(lo); fo.appendChild(op);
    g.appendChild(fo);
    var ff = el("div", "field");
    var lf = el("label", null, "Schriftgröße");
    var fs = el("select");
    fs.id = "wx-" + part + "-font"; lf.htmlFor = fs.id;
    fs.setAttribute("data-n", "fontScale");
    FONT.forEach(function (n) { var o = el("option", null, n + " %"); o.value = n; fs.appendChild(o); });
    fs.addEventListener("change", function () { change(part, "fontScale", Number(fs.value), true); renderDisplay(); });
    ff.appendChild(lf); ff.appendChild(fs);
    g.appendChild(ff);
    var fu = el("div", "field");
    var lu = el("label", null, "Abstände in");
    var us = el("select");
    us.id = "wx-" + part + "-unit"; lu.htmlFor = us.id;
    us.setAttribute("data-n", "unit");
    [["px", "Pixeln (px)"], ["pct", "% des Bildschirms"]].forEach(function (x) { var o = el("option", null, x[1]); o.value = x[0]; us.appendChild(o); });
    us.addEventListener("change", function () { setUnit(part, us.value); });
    fu.appendChild(lu); fu.appendChild(us);
    g.appendChild(fu);
    box.appendChild(g);
    box.appendChild(el("p", "save-hint", "0 % Deckkraft = ganz durchsichtig, der Hintergrund bleibt voll sichtbar."));
  }

  // ---------------------------------------------------------------------
  // Wetteranzeige: Designauswahl, Werte, Vorschau
  // ---------------------------------------------------------------------
  function viewOpts(extra) {
    return Object.assign({
      name: S.location.name,
      now: new Date(),
      updatedAt: FX && FX.updatedAt,
      error: FX && FX.error,
      iconUrl: function (n) { return "/wx-assets/icons/" + n + ".svg"; },
      bgUrl: function (n) { return "/wx-assets/backgrounds/" + n + ".jpg"; }
    }, extra || {});
  }

  function renderDisplay() {
    if (!S || !View() || !$("#wd-designs")) return;
    var w = S.weather;
    $("#wd-on-sub").textContent = w.enabled ? "an · " + View().design(w.design).name : "aus";
    var st = ctx.getSettings();
    $("#wd-old").hidden = !(w.enabled && st && st.modules && st.modules.weather);
    var data = $("#wd-data");
    if (!FX) data.textContent = "Wetterdaten werden geladen …";
    else if (FX.error && !FX.data) data.textContent = "⚠ " + FX.error;
    else data.textContent = "Daten: Open-Meteo (Wettermodelle u. a. des DWD) · Stand " + (FX.updatedAt ? hhmm(FX.updatedAt) : "?") +
      (FX.source === "mirror" ? " (wie auf dem Spiegel)" : "") + (FX.error ? " · " + FX.error : "");
    $("#wd-photo-field").hidden = w.design !== "photo";
    $("#wd-photo-val").textContent = w.photoOpacity + " %";
    renderFields();
    if (ctx.currentPage() !== "wetteranzeige") return;
    renderGallery();
    renderPreview();
  }

  function renderFields() {
    var box = $("#wd-fields");
    var w = S.weather;
    if (!box.firstChild) {
      View().FIELDS.forEach(function (f) {
        var t = el("div", "toggle");
        var tl = el("span", "tl2", f[1]);
        tl.appendChild(el("small"));
        var sw = el("button", "sw");
        sw.type = "button";
        sw.setAttribute("role", "switch");
        sw.setAttribute("aria-label", f[1]);
        sw.setAttribute("data-f", f[0]);
        sw.addEventListener("click", function () {
          var show = Object.assign({}, S.weather.show);
          show[f[0]] = !show[f[0]];
          change("weather", "show", show, true);
          render();
        });
        t.appendChild(tl); t.appendChild(sw);
        box.appendChild(t);
      });
    }
    box.querySelectorAll("[data-f]").forEach(function (sw) {
      var k = sw.getAttribute("data-f");
      var ok = View().supports(w.design, k);
      setSw(sw, w.show[k]);
      sw.disabled = !ok;
      var row = sw.parentNode;
      row.classList.toggle("is-na", !ok);
      row.querySelector("small").textContent = ok ? "" : "in diesem Design nicht vorgesehen";
    });
  }

  // Alle 12 Designs mit den echten Daten (verkleinert)
  function renderGallery() {
    var box = $("#wd-designs");
    var w = S.weather;
    var key = JSON.stringify([FX && FX.updatedAt, !!(FX && FX.data), w.show, w.days, w.wind, w.opacity, w.border, w.shadow, w.padding, w.photoOpacity, S.location.name]);
    if (!box.firstChild) {
      View().DESIGNS.forEach(function (d, i) {
        var b = el("button", "wd-design");
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("data-d", d.id);
        var th = el("div", "wd-thumb");
        th.appendChild(el("div", "wd-thumb-in"));
        b.appendChild(th);
        b.appendChild(el("span", "wd-name", (i + 1) + " · " + d.name));
        b.addEventListener("click", function () {
          if (S.weather.design === d.id) return;
          pending.weather = pending.weather || {};
          pending.weather.design = d.id;
          pending.weather.width = d.width;
          S.weather.design = d.id;
          S.weather.width = d.width;
          clearTimeout(saveTimer);
          saveTimer = setTimeout(flush, 0);
          render();
        });
        box.appendChild(b);
      });
    }
    box.querySelectorAll(".wd-design").forEach(function (b) {
      var on = b.getAttribute("data-d") === w.design;
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    if (key === galleryKey) return;
    galleryKey = key;
    box.querySelectorAll(".wd-design").forEach(function (b) {
      var d = View().design(b.getAttribute("data-d"));
      var th = b.querySelector(".wd-thumb");
      var inner = b.querySelector(".wd-thumb-in");
      var cfg = Object.assign({}, w, { design: d.id, width: d.width, fontScale: 100 });
      var tile = el("div");
      inner.innerHTML = "";
      inner.appendChild(tile);
      View().build(tile, FX && FX.data, cfg, viewOpts());
      tile.style.width = d.width + "px";
      scaleInto(th, inner, tile, 8);
    });
  }

  // Element verkleinert mittig in einen Rahmen setzen
  function scaleInto(frame, inner, tile, gap) {
    var fw = frame.clientWidth - 2 * gap;
    var fh = frame.clientHeight - 2 * gap;
    var tw = tile.offsetWidth || 1;
    var th = tile.offsetHeight || 1;
    var s = Math.min(1, fw / tw, fh > 0 ? fh / th : 1);
    inner.style.transform = "translate(-50%, -50%) scale(" + s.toFixed(3) + ")";
  }

  // Gewähltes Design in echter Größe (breiter als die Karte: verkleinert)
  function renderPreview() {
    var stage = $("#wd-stage");
    var box = $("#wd-preview");
    var w = S.weather;
    var tile = box.firstChild || box.appendChild(el("div"));
    View().build(tile, FX && FX.data, w, viewOpts());
    tile.style.width = w.width + "px";
    tile.style.maxHeight = w.height + "px";
    var f = View().fit(tile);
    var avail = stage.clientWidth - 24;
    var s = Math.min(1, avail / w.width);
    box.style.transform = "scale(" + s.toFixed(3) + ")";
    box.style.width = w.width + "px";
    stage.style.height = Math.ceil(tile.offsetHeight * s + 24) + "px";
    var note = $("#wd-fit");
    note.hidden = f > 0.99 && s > 0.99;
    var t = [];
    if (s < 0.99) t.push("Hier auf " + Math.round(s * 100) + " % verkleinert dargestellt.");
    if (f <= 0.99) t.push("Die Schrift wird auf " + Math.round(f * 100) + " % verkleinert, damit bei " + w.height + " px Höhe nichts abgeschnitten wird – mehr Höhe oder Breite zeigt sie größer.");
    note.textContent = t.join(" ");
  }

  function loadForecast() {
    return api("GET", undefined, "/forecast").then(function (fx) { FX = fx; galleryKey = ""; renderDisplay(); })
      .catch(function (err) { FX = { data: null, error: err.message }; renderDisplay(); });
  }

  // Rückmeldung des Spiegels: überdeckt eine Kachel andere Inhalte?
  function renderReport() {
    document.querySelectorAll(".wx-report").forEach(function (box) {
      box.innerHTML = "";
      var r = S && S.report;
      var parts = box.getAttribute("data-parts").split(",");
      var active = parts.filter(function (p) { return S[p].enabled && (p === "weather" || S.enabled); });
      if (!S || !r || !active.length) return;
      var lines = [];
      active.forEach(function (p) {
        var o = (r.overlaps && r.overlaps[p]) || [];
        if (o.length) lines.push(PART_NAME[p] + " überdeckt: " + o.join(", "));
        if (r.offscreen && r.offscreen[p]) lines.push(PART_NAME[p] + " ragt über den Bildschirmrand hinaus");
      });
      if (lines.length) {
        lines.forEach(function (t) { box.appendChild(el("div", "setup-banner", "⚠ " + t)); });
      } else {
        box.appendChild(el("p", "save-hint", "✓ Keine Überschneidung mit Uhr, Familienplan, Kalender & Co." + (r.screen && r.screen.width ? " (Spiegel " + r.screen.width + " × " + r.screen.height + " px)" : "")));
      }
    });
  }

  // ---------------------------------------------------------------------
  // Vorschau: Live-Bild des Spiegels (solange eine der Seiten offen ist)
  // ---------------------------------------------------------------------
  function shotActive() { return PAGES.indexOf(ctx.currentPage()) !== -1 && !document.hidden; }

  function shot() {
    clearTimeout(shotTimer);
    if (!shotActive()) return;
    var page = pageEl();
    fetch("/api/mirror/screenshot", { credentials: "same-origin", cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Der Spiegel liefert gerade kein Bild.");
      return res.blob();
    }).then(function (blob) {
      var old = shotUrl;
      shotUrl = URL.createObjectURL(blob);
      document.querySelectorAll(".wx-shot").forEach(function (s) {
        s.querySelector(".wx-shot-img").src = shotUrl;
        s.classList.add("has-img");
      });
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 1000);
    }).catch(function (err) {
      if (page) page.querySelectorAll(".wx-shot-note").forEach(function (n) { n.textContent = err.message; });
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
            c.addEventListener(c.type === "range" ? "input" : "change", function () {
              var v = NUMERIC.test(k) ? Number(c.value) : c.value;
              change(part, k, v, c.type !== "range");
              if (part === "weather") renderDisplay();
            });
          }
        });
      });
      document.querySelectorAll(".wx-shot-reload").forEach(function (b) { b.addEventListener("click", shot); });
      document.addEventListener("visibilitychange", function () { if (shotActive()) shot(); });
      window.addEventListener("resize", function () { if (S && ctx.currentPage() === "wetteranzeige") { galleryKey = ""; renderDisplay(); } });
      // Portal direkt auf einer der Seiten geöffnet
      setTimeout(function () {
        load().then(function () { if (ctx.currentPage() === "wetteranzeige") loadForecast(); });
        if (shotActive()) shot();
      }, 0);
    },
    // Seite geöffnet: frisch laden und Vorschau starten (erst nach dem
    // Umschalten messen – vorher ist die Seite unsichtbar)
    show: function (page) {
      if (!ctx) return;
      setTimeout(function () {
        galleryKey = "";
        load().then(function () { if (page === "wetteranzeige") loadForecast(); });
        shot();
      }, 0);
    }
  };
})();
