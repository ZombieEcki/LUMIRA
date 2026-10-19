// LUMIRA Self-Service-Portal – Bildschirm → Uhr (MMM-LumiraClock).
// Siehe lib/clock.js. Jede Änderung wird sofort gespeichert und ist nach
// wenigen Sekunden auf dem Bildschirm; nur Ein/Aus startet MagicMirror neu.
// Die Designs zeichnet clock-view.js – derselbe Code wie auf dem Bildschirm.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;    // { toast, getSettings, currentPage, setModule, onChange }
  var C = null;      // letzter Stand von GET /api/clock
  var saveTimer = null;
  var pending = {};
  var shotTimer = null;
  var shotUrl = null;
  var tickTimer = null;
  var galleryKey = "";
  var PAGE = "uhr";

  var ANCHORS = [
    ["top_left", "oben links"], ["top_center", "oben mittig"], ["top_right", "oben rechts"],
    ["middle_left", "mittig links"], ["middle_center", "Mitte"], ["middle_right", "mittig rechts"],
    ["bottom_left", "unten links"], ["bottom_center", "unten mittig"], ["bottom_right", "unten rechts"]
  ];
  var FONT = [50, 60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 200, 250, 300];
  var NUMERIC = /^(opacity|line)$/;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function View() { return window.LumiraClockView; }
  function onPage() { return ctx && ctx.currentPage() === PAGE; }
  function setSw(btn, on) { btn.setAttribute("aria-checked", on ? "true" : "false"); }

  function api(method, body) {
    var init = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch("/api/clock", init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || ("HTTP " + res.status));
        return d;
      });
    });
  }

  // Änderungen sammeln und kurz verzögert speichern (Regler, Tippen)
  function change(key, value, now) {
    pending[key] = value;
    if (C) C[key] = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, now ? 0 : 500);
  }

  function changeMany(obj) {
    Object.keys(obj).forEach(function (k) { pending[k] = obj[k]; if (C) C[k] = obj[k]; });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 0);
  }

  function flush() {
    var body = pending;
    pending = {};
    api("PUT", body).then(function (c) { C = c; render(); shotSoon(); if (ctx.onChange) ctx.onChange(c); }).catch(function (err) { ctx.toast(err.message); load(); });
  }

  function clockOn() {
    var s = ctx.getSettings();
    return !(s && s.modules && s.modules.clock === false);
  }

  // ---------------------------------------------------------------------
  // Anzeige
  // ---------------------------------------------------------------------
  function render() {
    if (!C || !View()) return;
    var on = clockOn();
    setSw($("#lc-on"), on);
    $("#lc-on-sub").textContent = on ? "an · " + View().design(C.design).name : "aus";
    document.querySelectorAll('.page[data-page="uhr"] .lc-box').forEach(function (card) { card.classList.toggle("is-off", !on); });
    document.querySelectorAll("[data-c]").forEach(function (c) {
      var k = c.getAttribute("data-c");
      if (c.classList.contains("sw")) setSw(c, C[k]);
      else if (document.activeElement !== c) c.value = String(C[k]);
    });
    var analog = !!View().design(C.design).analog;
    var dig = $('[data-c="digital"]');
    dig.disabled = !analog;
    $("#lc-digital-row").classList.toggle("is-na", !analog);
    $("#lc-digital-sub").textContent = analog ? "unter dem Zifferblatt" : "nur bei den analogen Designs";
    $("#lc-opacity-val").textContent = C.opacity + " %";
    var acc = C.accent || View().design(C.design).accent || "#ffffff";
    if (document.activeElement !== $("#lc-accent")) $("#lc-accent").value = acc;
    $("#lc-accent-reset").disabled = !C.accent;
    renderLayout();
    renderGallery();
    renderPreview();
    renderReport();
  }

  // Position: „Wie bisher“ (oben links im Layout) oder 9 Felder, Abstände, Größe
  function renderLayout() {
    var box = $("#lc-layout");
    if (!box.firstChild) buildLayout(box);
    var free = C.anchor !== "auto";
    $("#lc-auto").setAttribute("aria-pressed", free ? "false" : "true");
    box.querySelectorAll(".wx-pos button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-a") === C.anchor ? "true" : "false");
    });
    box.querySelectorAll("[data-n]").forEach(function (inp) {
      var k = inp.getAttribute("data-n");
      if (document.activeElement !== inp) inp.value = String(C[k]);
    });
    var pct = C.unit === "pct";
    ["x", "y", "unit"].forEach(function (k) { box.querySelector('[data-n="' + k + '"]').disabled = !free; });
    box.querySelectorAll('[data-n="x"], [data-n="y"]').forEach(function (inp) { inp.step = pct ? "1" : "10"; });
    var u = pct ? " (%)" : " (px)";
    var a = free ? C.anchor.split("_") : ["top", "left"];
    box.querySelector('[data-l="x"]').textContent = !free ? "Abstand waagerecht" : (a[1] === "center" ? "Versatz waagerecht" : "Abstand vom " + (a[1] === "left" ? "linken" : "rechten") + " Rand") + u;
    box.querySelector('[data-l="y"]').textContent = !free ? "Abstand senkrecht" : (a[0] === "middle" ? "Versatz senkrecht" : "Abstand vom " + (a[0] === "top" ? "oberen" : "unteren") + " Rand") + u;
    $("#lc-pos-note").textContent = free ? "Frei auf dem Bildschirm – unabhängig von den anderen Modulen."
      : "„Wie bisher“: oben links im Layout wie die alte Uhr, der Familienplan steht darunter.";
  }

  function screenSize() {
    var r = C && C.report && C.report.screen;
    return r && r.width && r.height ? r : { width: 1920, height: 1080 };
  }

  function setUnit(unit) {
    if (C.unit === unit) return;
    var sc = screenSize();
    var toPct = unit === "pct";
    var conv = function (v, size) { return toPct ? Math.round(v / size * 100) : Math.round(v * size / 100 / 10) * 10; };
    changeMany({ unit: unit, x: conv(C.x, sc.width), y: conv(C.y, sc.height) });
    render();
  }

  function numField(parent, key, label) {
    var fd = el("div", "field");
    var lb = el("label", null, label);
    lb.setAttribute("data-l", key);
    var inp = el("input", "mono-in");
    inp.type = "number";
    inp.step = key === "gap" || key === "padding" ? "1" : "10";
    inp.id = "lc-" + key;
    lb.htmlFor = inp.id;
    inp.setAttribute("data-n", key);
    inp.addEventListener("change", function () {
      var v = Math.round(Number(inp.value));
      if (!isFinite(v) || inp.value === "") { render(); return; }
      change(key, v);
      renderPreview();
    });
    fd.appendChild(lb); fd.appendChild(inp);
    parent.appendChild(fd);
  }

  function buildLayout(box) {
    var row = el("div", "wx-l-row");
    var wrap = el("div", "sp-pos-wrap");
    var auto = el("button", "btn small sp-auto", "Wie bisher");
    auto.type = "button";
    auto.id = "lc-auto";
    auto.title = "oben links im Layout, wie die alte Uhr";
    auto.addEventListener("click", function () { change("anchor", "auto", true); render(); });
    wrap.appendChild(auto);
    var pos = el("div", "wx-pos");
    pos.setAttribute("role", "group");
    pos.setAttribute("aria-label", "Position auf dem Bildschirm");
    ANCHORS.forEach(function (a) {
      var btn = el("button");
      btn.type = "button";
      btn.title = a[1];
      btn.setAttribute("aria-label", a[1]);
      btn.setAttribute("data-a", a[0]);
      btn.addEventListener("click", function () { change("anchor", a[0], true); render(); });
      pos.appendChild(btn);
    });
    wrap.appendChild(pos);
    row.appendChild(wrap);
    var nums = el("div", "wx-nums");
    numField(nums, "x", "Abstand waagerecht");
    numField(nums, "y", "Abstand senkrecht");
    numField(nums, "width", "Breite (px)");
    numField(nums, "height", "Höhe höchstens (px)");
    numField(nums, "gap", "Abstand Uhrzeit–Datum (px)");
    numField(nums, "padding", "Innenabstand (px)");
    row.appendChild(nums);
    box.appendChild(row);
    box.appendChild(el("p", "save-hint", "")).id = "lc-pos-note";

    var g = el("div", "grid2");
    var ff = el("div", "field");
    var lf = el("label", null, "Schriftgröße");
    var fs = el("select");
    fs.id = "lc-font"; lf.htmlFor = fs.id;
    fs.setAttribute("data-n", "fontScale");
    FONT.forEach(function (n) { var o = el("option", null, n + " %" + (n === 100 ? " (normal)" : "")); o.value = n; fs.appendChild(o); });
    fs.addEventListener("change", function () { change("fontScale", Number(fs.value), true); renderPreview(); });
    ff.appendChild(lf); ff.appendChild(fs);
    g.appendChild(ff);
    var fu = el("div", "field");
    var lu = el("label", null, "Abstände in");
    var us = el("select");
    us.id = "lc-unit"; lu.htmlFor = us.id;
    us.setAttribute("data-n", "unit");
    [["px", "Pixeln (px)"], ["pct", "% des Bildschirms"]].forEach(function (x) { var o = el("option", null, x[1]); o.value = x[0]; us.appendChild(o); });
    us.addEventListener("change", function () { setUnit(us.value); });
    fu.appendChild(lu); fu.appendChild(us);
    g.appendChild(fu);
    box.appendChild(g);
    box.appendChild(el("p", "save-hint", "Die Schriftgröße vergrößert die ganze Uhr. Passt sie nicht in Breite und Höhe, wird sie automatisch kleiner statt abgeschnitten."));
  }

  // Ausrichtung wie auf dem Bildschirm (frei: nach der gewählten Seite)
  function alignOf(c) {
    if (c.anchor === "auto") return "left";
    var h = c.anchor.split("_")[1];
    return h === "center" ? "center" : h;
  }

  // Alle 16 Designs mit der echten Uhrzeit (verkleinert)
  function renderGallery() {
    var box = $("#lc-designs");
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
          if (C.design === d.id) return;
          changeMany({ design: d.id, width: d.width });
          render();
        });
        box.appendChild(b);
      });
    }
    box.querySelectorAll(".wd-design").forEach(function (b) {
      b.setAttribute("aria-checked", b.getAttribute("data-d") === C.design ? "true" : "false");
    });
    var key = JSON.stringify([C.hour12, C.seconds, C.weekday, C.date, C.dateStyle, C.digital, C.glass, C.opacity, C.line, C.accent, C.gap]);
    if (key === galleryKey || !onPage()) return;
    galleryKey = key;
    box.querySelectorAll(".wd-design").forEach(function (b) {
      var d = View().design(b.getAttribute("data-d"));
      var th = b.querySelector(".wd-thumb");
      var inner = b.querySelector(".wd-thumb-in");
      var cfg = Object.assign({}, C, { design: d.id, width: d.width, fontScale: 100, padding: 0, accent: C.accent });
      var tile = el("div");
      inner.innerHTML = "";
      inner.appendChild(tile);
      View().build(tile, cfg, { align: "center" });
      tile.style.width = d.width + "px";
      tile.style.maxHeight = "none";
      View().fit(tile);
      scaleInto(th, inner, tile, 8);
    });
  }

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
    if (!C || !onPage()) return;
    var stage = $("#lc-stage");
    var box = $("#lc-preview");
    var tile = box.firstChild || box.appendChild(el("div"));
    View().build(tile, C, { align: alignOf(C) });
    tile.style.width = C.width + "px";
    tile.style.maxHeight = C.height + "px";
    var f = View().fit(tile);
    var avail = stage.clientWidth - 24;
    var s = Math.min(1, avail / C.width);
    box.style.transform = "scale(" + s.toFixed(3) + ")";
    box.style.width = C.width + "px";
    stage.style.height = Math.ceil(tile.offsetHeight * s + 24) + "px";
    var note = $("#lc-fit");
    note.hidden = f > 0.99 && s > 0.99;
    var t = [];
    if (s < 0.99) t.push("Hier auf " + Math.round(s * 100) + " % verkleinert dargestellt.");
    if (f <= 0.99) t.push("Die Schrift wird auf " + Math.round(f * 100) + " % verkleinert, damit bei " + C.width + " × " + C.height + " px nichts abgeschnitten wird – mehr Breite oder Höhe zeigt sie größer.");
    note.textContent = t.join(" ");
  }

  // Sekunden bzw. Minuten weiterzählen, solange die Seite offen ist
  function startTicks() {
    clearTimeout(tickTimer);
    if (!onPage() || document.hidden || !C) return;
    var now = new Date();
    var next = 60000;
    document.querySelectorAll('.page[data-page="uhr"] .lc-clock').forEach(function (t) { next = Math.min(next, View().tick(t, now)); });
    tickTimer = setTimeout(startTicks, Math.max(200, next));
  }

  function renderReport() {
    var box = $("#lc-report");
    box.innerHTML = "";
    var r = C && C.report;
    if (!r || !clockOn()) return;
    var lines = [];
    if (r.overlaps && r.overlaps.length) lines.push("Die Uhr überdeckt: " + r.overlaps.join(", "));
    if (r.offscreen) lines.push("Die Uhr ragt über den Bildschirmrand hinaus");
    if (lines.length) lines.forEach(function (t) { box.appendChild(el("div", "setup-banner", "⚠ " + t)); });
    else if (C.anchor !== "auto") box.appendChild(el("p", "save-hint", "✓ Keine Überschneidung mit Wetter, Familienplan, Kalender & Co." + (r.screen && r.screen.width ? " (Bildschirm " + r.screen.width + " × " + r.screen.height + " px)" : "")));
  }

  // ---------------------------------------------------------------------
  // Live-Bild des Bildschirms (solange die Seite offen ist)
  // ---------------------------------------------------------------------
  function shotActive() { return onPage() && !document.hidden; }

  function shot() {
    clearTimeout(shotTimer);
    if (!shotActive()) return;
    fetch("/api/mirror/screenshot", { credentials: "same-origin", cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Der Bildschirm liefert gerade kein Bild.");
      return res.blob();
    }).then(function (blob) {
      var old = shotUrl;
      shotUrl = URL.createObjectURL(blob);
      $("#lc-shot-img").src = shotUrl;
      $("#lc-shot").classList.add("has-img");
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 1000);
    }).catch(function (err) {
      $("#lc-shot-note").textContent = err.message;
    }).then(function () {
      api("GET").then(function (c) { if (!Object.keys(pending).length) { C = c; renderReport(); } }).catch(function () {});
      if (shotActive()) shotTimer = setTimeout(shot, 5000);
    });
  }

  function shotSoon() {
    clearTimeout(shotTimer);
    shotTimer = setTimeout(shot, 2500);
  }

  function load() {
    return api("GET").then(function (c) { C = c; render(); startTicks(); }).catch(function (err) { ctx.toast(err.message); });
  }

  function wire() {
    $("#lc-on").addEventListener("click", function () {
      var btn = this;
      var on = !clockOn();
      btn.disabled = true;
      ctx.setModule(on).then(function () {
        btn.disabled = false;
        render();
        ctx.toast(on ? "Uhr an – MagicMirror startet neu" : "Uhr aus – MagicMirror startet neu");
      }).catch(function (err) { btn.disabled = false; ctx.toast(err.message); });
    });
    document.querySelectorAll("[data-c]").forEach(function (c) {
      var k = c.getAttribute("data-c");
      if (c.classList.contains("sw")) {
        c.addEventListener("click", function () { if (!C || c.disabled) return; change(k, !C[k], true); render(); });
      } else {
        c.addEventListener(c.type === "range" ? "input" : "change", function () {
          var v = c.value;
          if (k === "hour12") v = v === "true";
          else if (NUMERIC.test(k)) v = Number(v);
          change(k, v, c.type !== "range");
          render();
        });
      }
    });
    $("#lc-accent").addEventListener("input", function () { change("accent", this.value.toLowerCase()); renderPreview(); });
    $("#lc-accent").addEventListener("change", function () { render(); });
    $("#lc-accent-reset").addEventListener("click", function () { change("accent", "", true); render(); });
    $("#lc-shot-reload").addEventListener("click", shot);
    document.addEventListener("visibilitychange", function () { if (shotActive()) { shot(); startTicks(); } });
    window.addEventListener("resize", function () { if (C && onPage()) { galleryKey = ""; render(); } });
  }

  window.LumiraClock = {
    init: function (context) {
      ctx = context;
      wire();
      setTimeout(function () { load(); if (shotActive()) shot(); }, 0);
    },
    // Seite geöffnet: frisch laden (erst nach dem Umschalten messen)
    show: function () {
      if (!ctx) return;
      setTimeout(function () { galleryKey = ""; load(); shot(); }, 0);
    },
    // Ein/Aus woanders geändert (Bildschirm → Übersicht)
    refresh: function () { if (C) render(); }
  };
})();
