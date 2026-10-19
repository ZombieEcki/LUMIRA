// LUMIRA Self-Service-Portal – Bildschirm → Kalender (MMM-LumiraCalendar).
// Siehe lib/calendar.js. Kalenderquellen (ICS-Abos) anlegen, testen,
// bearbeiten, sortieren; Design, Termine, Position und Aussehen wirken nach
// wenigen Sekunden auf dem Bildschirm, nur Ein/Aus startet MagicMirror neu.
// Die geheimen Links kommen nie zurück – angezeigt wird nur der Rechner.
// Die Designs zeichnet calendar-view.js – derselbe Code wie auf dem Bildschirm.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;    // { toast, getSettings, currentPage, setModule, onChange }
  var K = null;      // letzter Stand von GET /api/calendar
  var EV = null;     // Termine für die Vorschau (GET /api/calendar/events)
  var saveTimer = null;
  var pending = {};
  var shotTimer = null;
  var shotUrl = null;
  var tickTimer = null;
  var galleryKey = "";
  var editing = null; // null | "new" | Quellen-ID
  var PAGE = "kalender";

  var ANCHORS = [
    ["top_left", "oben links"], ["top_center", "oben mittig"], ["top_right", "oben rechts"],
    ["middle_left", "mittig links"], ["middle_center", "Mitte"], ["middle_right", "mittig rechts"],
    ["bottom_left", "unten links"], ["bottom_center", "unten mittig"], ["bottom_right", "unten rechts"]
  ];
  var FONT = [50, 60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 200];
  var NUMERIC = /^(opacity|line|interval)$/;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function View() { return window.LumiraCalendarView; }
  function onPage() { return ctx && ctx.currentPage() === PAGE; }
  function setSw(btn, on) { btn.setAttribute("aria-checked", on ? "true" : "false"); }
  function hhmm(iso) { var d = new Date(iso); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  function api(method, sub, body) {
    var init = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch("/api/calendar" + (sub || ""), init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || ("HTTP " + res.status));
        return d;
      });
    });
  }

  function change(key, value, now) {
    pending[key] = value;
    if (K) K[key] = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, now ? 0 : 500);
  }
  function changeMany(obj) {
    Object.keys(obj).forEach(function (k) { pending[k] = obj[k]; if (K) K[k] = obj[k]; });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 0);
  }
  function flush() {
    var body = pending;
    pending = {};
    api("PUT", "", body).then(function (k) { K = k; render(); shotSoon(); if (ctx.onChange) ctx.onChange(k); })
      .catch(function (err) { ctx.toast(err.message); load(); });
  }

  // Quellen geändert: Stand übernehmen, Termine neu holen
  function afterSources(k, msg) {
    K = k;
    if (msg) ctx.toast(msg);
    render();
    loadEvents();
    shotSoon();
  }

  function calOn() {
    var s = ctx.getSettings();
    return !(s && s.modules && s.modules.calendar === false);
  }

  // ---------------------------------------------------------------------
  // Anzeige
  // ---------------------------------------------------------------------
  function render() {
    if (!K || !View()) return;
    var on = calOn();
    setSw($("#lk-on"), on);
    var n = K.sources.filter(function (s) { return s.enabled; }).length;
    $("#lk-on-sub").textContent = on ? "an · " + View().design(K.design).name + " · " + n + (n === 1 ? " Kalender" : " Kalender") : "aus";
    document.querySelectorAll('.page[data-page="kalender"] .lk-box').forEach(function (c) { c.classList.toggle("is-off", !on); });
    document.querySelectorAll('.page[data-page="kalender"] [data-k]').forEach(function (c) {
      var k = c.getAttribute("data-k");
      if (c.classList.contains("sw")) setSw(c, K[k]);
      else if (document.activeElement !== c) c.value = String(K[k]);
    });
    presetSelect($("#lk-range"), $("#lk-range-n"), K.range);
    presetSelect($("#lk-max"), $("#lk-max-n"), K.max);
    $("#lk-opacity-val").textContent = K.opacity + " %";
    renderSources();
    renderLayout();
    renderGallery();
    renderPreview();
    renderReport();
    renderData();
  }

  // Auswahl mit Vorgaben plus „eigener Wert“
  function presetSelect(sel, inp, v) {
    var preset = Array.prototype.some.call(sel.options, function (o) { return o.value === String(v); });
    if (document.activeElement !== sel && !sel._custom) sel.value = preset ? String(v) : "custom";
    inp.hidden = sel.value !== "custom";
    if (document.activeElement !== inp) inp.value = String(v);
  }

  // ----- Kalenderquellen -----
  function statusText(s) {
    var st = (EV && EV.status && EV.status[s.id]) || (K.status && K.status[s.id]);
    if (!s.enabled) return { t: "aus", bad: false };
    if (!st) return { t: "wird gleich abgerufen …", bad: false };
    if (st.error) return { t: "⚠ " + st.error + (st.updatedAt ? " – zeigt Stand " + hhmm(st.updatedAt) : ""), bad: true };
    return { t: st.count + (st.count === 1 ? " Termin" : " Termine") + (st.updatedAt ? " · Stand " + hhmm(st.updatedAt) : ""), bad: false };
  }

  function swatch(s) {
    var sw = el("span", "lk-sw");
    sw.style.background = s.color;
    var i = el("i", "fa-solid fa-" + s.icon);
    i.setAttribute("aria-hidden", "true");
    sw.appendChild(i);
    return sw;
  }

  function renderSources() {
    var box = $("#lk-sources");
    box.innerHTML = "";
    if (!K.sources.length) box.appendChild(el("p", "save-hint", "Noch kein Kalender – mit „+ Kalender hinzufügen“ den ersten Link eintragen."));
    K.sources.forEach(function (s, i) {
      var row = el("div", "lk-src" + (s.enabled ? "" : " is-off") + (editing === s.id ? " is-editing" : ""));
      row.appendChild(swatch(s));
      var txt = el("div", "lk-src-t");
      txt.appendChild(el("b", null, s.name));
      var st = statusText(s);
      txt.appendChild(el("small", st.bad ? "lk-bad" : null, (s.host ? s.host + " · " : "") + st.t));
      row.appendChild(txt);
      var act = el("div", "lk-src-a");
      var up = el("button", "lk-mv", "↑"); up.type = "button"; up.title = "nach oben"; up.setAttribute("aria-label", s.name + " nach oben"); up.disabled = i === 0;
      up.addEventListener("click", function () { move(i, -1); });
      var dn = el("button", "lk-mv", "↓"); dn.type = "button"; dn.title = "nach unten"; dn.setAttribute("aria-label", s.name + " nach unten"); dn.disabled = i === K.sources.length - 1;
      dn.addEventListener("click", function () { move(i, 1); });
      var sw = el("button", "sw"); sw.type = "button"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-label", s.name + " anzeigen"); setSw(sw, s.enabled);
      sw.addEventListener("click", function () {
        api("PUT", "/sources/" + s.id, { enabled: !s.enabled }).then(function (k) { afterSources(k); }).catch(function (err) { ctx.toast(err.message); });
      });
      var ed = el("button", "btn small", "Bearbeiten"); ed.type = "button";
      ed.addEventListener("click", function () { openEditor(s.id); });
      act.appendChild(up); act.appendChild(dn); act.appendChild(sw); act.appendChild(ed);
      row.appendChild(act);
      box.appendChild(row);
    });
    $("#lk-add").hidden = editing === "new" || K.sources.length >= 20;
  }

  function move(i, d) {
    var ids = K.sources.map(function (s) { return s.id; });
    var j = i + d;
    if (j < 0 || j >= ids.length) return;
    var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    api("PUT", "/order", { ids: ids }).then(function (k) { afterSources(k); }).catch(function (err) { ctx.toast(err.message); });
  }

  // ----- Bearbeiten / Hinzufügen -----
  function openEditor(id) {
    editing = id;
    var box = $("#lk-editor");
    box.innerHTML = "";
    box.hidden = false;
    var isNew = id === "new";
    var cur = isNew ? View().cleanSource({}, K.sources.length) : K.sources.filter(function (s) { return s.id === id; })[0];
    if (!cur) { closeEditor(); return; }
    var draft = { name: isNew ? "" : cur.name, color: cur.color, icon: cur.icon, showTitle: cur.showTitle, showLocation: cur.showLocation, showTime: cur.showTime };
    box.appendChild(el("h3", null, isNew ? "Kalender hinzufügen" : "„" + cur.name + "“ bearbeiten"));

    var g = el("div", "grid2");
    var f1 = el("div", "field"); var l1 = el("label", null, "Name"); var name = el("input");
    name.type = "text"; name.id = "lk-e-name"; name.maxLength = 40; name.placeholder = "z. B. Familie, Arbeit, Feuerwehr"; name.value = draft.name; l1.htmlFor = name.id;
    f1.appendChild(l1); f1.appendChild(name); g.appendChild(f1);
    var f2 = el("div", "field"); var l2 = el("label", null, "Kalender-Link"); var url = el("input", "mono-in");
    url.type = "url"; url.id = "lk-e-url"; url.autocomplete = "off"; url.spellcheck = false; l2.htmlFor = url.id;
    url.placeholder = isNew ? "webcal://… oder https://….ics" : "unverändert (" + (cur.host || "kein Link") + ") – zum Ersetzen neu einfügen";
    f2.appendChild(l2); f2.appendChild(url); g.appendChild(f2);
    box.appendChild(g);

    box.appendChild(el("div", "wx-l-h", "Farbe"));
    var colors = el("div", "lk-colors");
    var colorBtns = [];
    View().COLORS.forEach(function (c) {
      var b = el("button", "lk-color"); b.type = "button"; b.style.background = c; b.title = c; b.setAttribute("aria-label", "Farbe " + c);
      b.addEventListener("click", function () { draft.color = c; paint(); });
      colors.appendChild(b); colorBtns.push([b, c]);
    });
    var own = el("input"); own.type = "color"; own.className = "lk-color-own"; own.title = "eigene Farbe"; own.setAttribute("aria-label", "eigene Farbe");
    own.addEventListener("input", function () { draft.color = own.value.toLowerCase(); paint(); });
    colors.appendChild(own);
    box.appendChild(colors);

    box.appendChild(el("div", "wx-l-h", "Symbol"));
    var icons = el("div", "lk-icons");
    var iconBtns = [];
    View().ICONS.forEach(function (ic) {
      var b = el("button", "lk-icon"); b.type = "button"; b.title = ic[1]; b.setAttribute("aria-label", "Symbol " + ic[1]);
      var i = el("i", "fa-solid fa-" + ic[0]); i.setAttribute("aria-hidden", "true"); b.appendChild(i);
      b.addEventListener("click", function () { draft.icon = ic[0]; paint(); });
      icons.appendChild(b); iconBtns.push([b, ic[0]]);
    });
    box.appendChild(icons);

    [["showTitle", "Titel zeigen", "aus: nur „Belegt“ – z. B. für den Arbeitskalender"], ["showTime", "Uhrzeit zeigen", ""], ["showLocation", "Ort zeigen", "wenn „Ort“ unter Termine an ist"]].forEach(function (x) {
      var t = el("div", "toggle");
      var tl = el("span", "tl2", x[1]); if (x[2]) tl.appendChild(el("small", null, x[2]));
      var sw = el("button", "sw"); sw.type = "button"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-label", x[1]); setSw(sw, draft[x[0]]);
      sw.addEventListener("click", function () { draft[x[0]] = !draft[x[0]]; setSw(sw, draft[x[0]]); });
      t.appendChild(tl); t.appendChild(sw); box.appendChild(t);
    });

    var result = el("div", "lk-test");
    var row = el("div", "save-row");
    var save = el("button", "btn primary", isNew ? "Hinzufügen" : "Speichern"); save.type = "button";
    var test = el("button", "btn", "Testen"); test.type = "button";
    var cancel = el("button", "btn", "Abbrechen"); cancel.type = "button";
    row.appendChild(save); row.appendChild(test); row.appendChild(cancel);
    if (!isNew) {
      var del = el("button", "btn lk-del", "Entfernen"); del.type = "button";
      del.addEventListener("click", function () {
        if (!confirm("Kalender „" + cur.name + "“ entfernen? Im Kalender selbst wird nichts gelöscht.")) return;
        api("DELETE", "/sources/" + cur.id).then(function (k) { closeEditor(); afterSources(k, "Kalender entfernt"); }).catch(function (err) { ctx.toast(err.message); });
      });
      row.appendChild(del);
    }
    box.appendChild(row);
    box.appendChild(result);

    function paint() {
      colorBtns.forEach(function (x) { x[0].setAttribute("aria-pressed", x[1] === draft.color ? "true" : "false"); });
      own.value = draft.color;
      iconBtns.forEach(function (x) {
        x[0].setAttribute("aria-pressed", x[1] === draft.icon ? "true" : "false");
        x[0].style.color = x[1] === draft.icon ? draft.color : "";
      });
    }
    paint();

    test.addEventListener("click", function () {
      var body = url.value.trim() ? { url: url.value.trim() } : (isNew ? {} : { id: cur.id });
      if (isNew && !body.url) { result.textContent = "Bitte zuerst den Link einfügen."; return; }
      test.disabled = true;
      result.className = "lk-test";
      result.textContent = "Teste …";
      api("POST", "/test", body).then(function (r) {
        test.disabled = false;
        result.innerHTML = "";
        if (!r.ok) { result.className = "lk-test is-bad"; result.textContent = "⚠ " + r.error; return; }
        result.className = "lk-test is-ok";
        result.appendChild(el("div", null, "✓ Kalender gefunden" + (r.name ? ": „" + r.name + "“" : "") + " – " + r.count + " Termine in den nächsten Wochen."));
        if (!name.value.trim() && r.name) name.value = r.name.slice(0, 40);
        r.next.forEach(function (e) {
          result.appendChild(el("div", "lk-test-e", View().dayLabel(e.start, Date.now()) + (e.allDay ? " · ganztags" : " · " + hhmm(e.start)) + " – " + e.title));
        });
      }).catch(function (err) { test.disabled = false; result.className = "lk-test is-bad"; result.textContent = "⚠ " + err.message; });
    });

    save.addEventListener("click", function () {
      var body = Object.assign({}, draft, { name: name.value.trim() || (isNew ? "" : cur.name) });
      if (!body.name) body.name = "Kalender " + (K.sources.length + 1);
      if (url.value.trim()) body.url = url.value.trim();
      save.disabled = true;
      (isNew ? api("POST", "/sources", body) : api("PUT", "/sources/" + cur.id, body)).then(function (k) {
        closeEditor();
        afterSources(k, isNew ? "Kalender hinzugefügt – Termine kommen gleich" : "Gespeichert");
      }).catch(function (err) { save.disabled = false; result.className = "lk-test is-bad"; result.textContent = "⚠ " + err.message; });
    });
    cancel.addEventListener("click", closeEditor);
    renderSources();
    (isNew ? url : name).focus();
  }

  function closeEditor() {
    editing = null;
    var box = $("#lk-editor");
    box.innerHTML = "";
    box.hidden = true;
    renderSources();
  }

  // ----- Position & Größe -----
  function renderLayout() {
    var box = $("#lk-layout");
    if (!box.firstChild) buildLayout(box);
    var free = K.anchor !== "auto";
    $("#lk-auto").setAttribute("aria-pressed", free ? "false" : "true");
    box.querySelectorAll(".wx-pos button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-a") === K.anchor ? "true" : "false");
    });
    box.querySelectorAll("[data-n]").forEach(function (inp) {
      var k = inp.getAttribute("data-n");
      if (document.activeElement !== inp) inp.value = String(K[k]);
    });
    ["x", "y", "unit"].forEach(function (k) { box.querySelector('[data-n="' + k + '"]').disabled = !free; });
    var pct = K.unit === "pct";
    var u = pct ? " (%)" : " (px)";
    var a = free ? K.anchor.split("_") : ["bottom", "left"];
    box.querySelector('[data-l="x"]').textContent = !free ? "Abstand waagerecht" : (a[1] === "center" ? "Versatz waagerecht" : "Abstand vom " + (a[1] === "left" ? "linken" : "rechten") + " Rand") + u;
    box.querySelector('[data-l="y"]').textContent = !free ? "Abstand senkrecht" : (a[0] === "middle" ? "Versatz senkrecht" : "Abstand vom " + (a[0] === "top" ? "oberen" : "unteren") + " Rand") + u;
    $("#lk-pos-note").textContent = free ? "Frei auf dem Bildschirm – unabhängig von den anderen Modulen."
      : "„Wie bisher“: unten links im Layout wie der alte Kalender.";
  }

  function screenSize() {
    var r = K && K.report && K.report.screen;
    return r && r.width && r.height ? r : { width: 1920, height: 1080 };
  }

  function setUnit(unit) {
    if (K.unit === unit) return;
    var sc = screenSize();
    var toPct = unit === "pct";
    var conv = function (v, size) { return toPct ? Math.round(v / size * 100) : Math.round(v * size / 100 / 10) * 10; };
    changeMany({ unit: unit, x: conv(K.x, sc.width), y: conv(K.y, sc.height) });
    render();
  }

  function numField(parent, key, label, step) {
    var fd = el("div", "field");
    var lb = el("label", null, label);
    lb.setAttribute("data-l", key);
    var inp = el("input", "mono-in");
    inp.type = "number"; inp.step = step || "10"; inp.id = "lk-" + key; lb.htmlFor = inp.id;
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
    auto.type = "button"; auto.id = "lk-auto"; auto.title = "unten links im Layout, wie der alte Kalender";
    auto.addEventListener("click", function () { change("anchor", "auto", true); render(); });
    wrap.appendChild(auto);
    var pos = el("div", "wx-pos");
    pos.setAttribute("role", "group"); pos.setAttribute("aria-label", "Position auf dem Bildschirm");
    ANCHORS.forEach(function (a) {
      var btn = el("button"); btn.type = "button"; btn.title = a[1]; btn.setAttribute("aria-label", a[1]); btn.setAttribute("data-a", a[0]);
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
    numField(nums, "gap", "Abstand zwischen Terminen (px)", "1");
    numField(nums, "padding", "Innenabstand (px)", "1");
    row.appendChild(nums);
    box.appendChild(row);
    box.appendChild(el("p", "save-hint")).id = "lk-pos-note";
    var g = el("div", "grid2");
    var ff = el("div", "field"); var lf = el("label", null, "Schriftgröße"); var fs = el("select");
    fs.id = "lk-font"; lf.htmlFor = fs.id; fs.setAttribute("data-n", "fontScale");
    FONT.forEach(function (n) { var o = el("option", null, n + " %" + (n === 100 ? " (normal)" : "")); o.value = n; fs.appendChild(o); });
    fs.addEventListener("change", function () { change("fontScale", Number(fs.value), true); renderPreview(); });
    ff.appendChild(lf); ff.appendChild(fs); g.appendChild(ff);
    var fu = el("div", "field"); var lu = el("label", null, "Abstände in"); var us = el("select");
    us.id = "lk-unit"; lu.htmlFor = us.id; us.setAttribute("data-n", "unit");
    [["px", "Pixeln (px)"], ["pct", "% des Bildschirms"]].forEach(function (x) { var o = el("option", null, x[1]); o.value = x[0]; us.appendChild(o); });
    us.addEventListener("change", function () { setUnit(us.value); });
    fu.appendChild(lu); fu.appendChild(us); g.appendChild(fu);
    box.appendChild(g);
    box.appendChild(el("p", "save-hint", "Passt nicht alles in Breite und Höhe, wird die Schrift etwas kleiner und dann stehen weniger Termine da („+ weitere“) – abgeschnitten wird nichts."));
  }

  // ----- Designs, Vorschau -----
  function viewData() {
    var src = {};
    K.sources.forEach(function (s) { src[s.id] = s; });
    var probs = [];
    var st = (EV && EV.status) || {};
    K.sources.forEach(function (s) {
      var x = st[s.id];
      if (s.enabled && x && x.error) probs.push(s.name + ": " + (x.updatedAt ? "Stand " + hhmm(x.updatedAt) : "gerade nicht erreichbar"));
    });
    return { events: (EV && EV.events) || [], sources: src, now: Date.now(), problems: probs };
  }

  function alignOf(c) {
    if (c.anchor === "auto") return "left";
    var h = c.anchor.split("_")[1];
    return h === "center" ? "center" : h;
  }

  function renderGallery() {
    var box = $("#lk-designs");
    if (!box.firstChild) {
      View().DESIGNS.forEach(function (d, i) {
        var b = el("button", "wd-design"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("data-d", d.id);
        var th = el("div", "wd-thumb"); th.appendChild(el("div", "wd-thumb-in")); b.appendChild(th);
        b.appendChild(el("span", "wd-name", (i + 1) + " · " + d.name));
        b.addEventListener("click", function () {
          if (K.design === d.id) return;
          changeMany({ design: d.id, width: d.width });
          render();
        });
        box.appendChild(b);
      });
    }
    box.querySelectorAll(".wd-design").forEach(function (b) { b.setAttribute("aria-checked", b.getAttribute("data-d") === K.design ? "true" : "false"); });
    var data = viewData();
    var key = JSON.stringify([EV && EV.updatedAt, data.events.length, K.sources, K.range, K.max, K.more, K.past, K.allDay, K.time, K.endTime, K.location, K.mark, K.wrap, K.title, K.glass, K.opacity, K.line, K.gap, Math.floor(Date.now() / 60000)]);
    if (key === galleryKey || !onPage()) return;
    galleryKey = key;
    box.querySelectorAll(".wd-design").forEach(function (b) {
      var d = View().design(b.getAttribute("data-d"));
      var th = b.querySelector(".wd-thumb");
      var inner = b.querySelector(".wd-thumb-in");
      var cfg = Object.assign({}, K, { design: d.id, width: d.width, height: 560, fontScale: 100, max: Math.min(K.max, 5) });
      var tile = el("div");
      inner.innerHTML = "";
      inner.appendChild(tile);
      View().build(tile, cfg, data, { align: "left" });
      tile.style.width = d.width + "px";
      tile.style.maxHeight = "560px";
      View().fit(tile);
      scaleInto(th, inner, tile, 6);
    });
  }

  function scaleInto(frame, inner, tile, gap) {
    var fw = frame.clientWidth - 2 * gap;
    var fh = frame.clientHeight - 2 * gap;
    var s = Math.min(1, fw / (tile.offsetWidth || 1), fh > 0 ? fh / (tile.offsetHeight || 1) : 1);
    inner.style.transform = "translate(-50%, -50%) scale(" + s.toFixed(3) + ")";
  }

  function renderPreview() {
    if (!K || !onPage()) return;
    var stage = $("#lk-stage");
    var box = $("#lk-preview");
    var tile = box.firstChild || box.appendChild(el("div"));
    View().build(tile, K, viewData(), { align: alignOf(K) });
    tile.style.width = K.width + "px";
    tile.style.maxHeight = K.height + "px";
    var f = View().fit(tile);
    var dropped = Number(tile.getAttribute("data-dropped")) || 0;
    var s = Math.min(1, (stage.clientWidth - 24) / K.width);
    box.style.transform = "scale(" + s.toFixed(3) + ")";
    box.style.width = K.width + "px";
    stage.style.height = Math.ceil(tile.offsetHeight * s + 24) + "px";
    var note = $("#lk-fit");
    var t = [];
    if (s < 0.99) t.push("Hier auf " + Math.round(s * 100) + " % verkleinert dargestellt.");
    if (f <= 0.99) t.push("Schrift auf " + Math.round(f * 100) + " % verkleinert.");
    if (dropped) t.push(dropped + (dropped === 1 ? " Termin passt" : " Termine passen") + " bei " + K.width + " × " + K.height + " px nicht mehr hinein – mehr Höhe oder weniger Termine zeigen alle.");
    note.hidden = !t.length;
    note.textContent = t.join(" ");
  }

  function renderData() {
    var p = $("#lk-data");
    if (!K.sources.length) { p.textContent = "Ohne Kalender zeigt die Vorschau nur das leere Design."; return; }
    if (!EV) { p.textContent = "Termine werden geladen …"; return; }
    p.textContent = (EV.events || []).length + " Termine geladen · Stand " + hhmm(EV.updatedAt) + (EV.source === "mirror" ? " (wie auf dem Bildschirm)" : " (vom Portal abgerufen)");
  }

  function renderReport() {
    var box = $("#lk-report");
    box.innerHTML = "";
    var r = K && K.report;
    if (!r || !calOn()) return;
    var lines = [];
    if (r.overlaps && r.overlaps.length) lines.push("Der Kalender überdeckt: " + r.overlaps.join(", "));
    if (r.offscreen) lines.push("Der Kalender ragt über den Bildschirmrand hinaus");
    if (r.dropped) lines.push("Auf dem Bildschirm passen " + r.dropped + " Termine nicht hinein – mehr Höhe oder weniger Termine");
    if (lines.length) lines.forEach(function (t) { box.appendChild(el("div", "setup-banner", "⚠ " + t)); });
    else if (K.anchor !== "auto") box.appendChild(el("p", "save-hint", "✓ Keine Überschneidung mit Uhr, Wetter, Familienplan & Co." + (r.screen && r.screen.width ? " (Bildschirm " + r.screen.width + " × " + r.screen.height + " px)" : "")));
  }

  function startTicks() {
    clearTimeout(tickTimer);
    if (!onPage() || document.hidden || !K) return;
    tickTimer = setTimeout(function () { renderGallery(); renderPreview(); startTicks(); }, 60000 - (Date.now() % 60000) + 200);
  }

  // ----- Live-Bild -----
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
      $("#lk-shot-img").src = shotUrl;
      $("#lk-shot").classList.add("has-img");
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 1000);
    }).catch(function (err) {
      $("#lk-shot-note").textContent = err.message;
    }).then(function () {
      api("GET").then(function (k) { if (!Object.keys(pending).length && K) { K.report = k.report; K.status = k.status; renderReport(); renderSources(); } }).catch(function () {});
      if (shotActive()) shotTimer = setTimeout(shot, 5000);
    });
  }
  function shotSoon() { clearTimeout(shotTimer); shotTimer = setTimeout(shot, 2500); }

  function load() {
    return api("GET").then(function (k) { K = k; render(); startTicks(); }).catch(function (err) { ctx.toast(err.message); });
  }
  function loadEvents() {
    return api("GET", "/events").then(function (e) { EV = e; galleryKey = ""; render(); })
      .catch(function (err) { EV = { events: [], status: {}, error: err.message }; render(); });
  }

  function wire() {
    $("#lk-on").addEventListener("click", function () {
      var btn = this;
      var on = !calOn();
      btn.disabled = true;
      ctx.setModule(on).then(function () {
        btn.disabled = false;
        render();
        ctx.toast(on ? "Kalender an – MagicMirror startet neu" : "Kalender aus – MagicMirror startet neu");
      }).catch(function (err) { btn.disabled = false; ctx.toast(err.message); });
    });
    $("#lk-add").addEventListener("click", function () { openEditor("new"); });
    document.querySelectorAll('.page[data-page="kalender"] [data-k]').forEach(function (c) {
      var k = c.getAttribute("data-k");
      if (c.classList.contains("sw")) {
        c.addEventListener("click", function () { if (!K) return; change(k, !K[k], true); render(); });
      } else {
        c.addEventListener(c.type === "range" || c.type === "text" ? "input" : "change", function () {
          change(k, NUMERIC.test(k) ? Number(c.value) : c.value, c.type !== "range" && c.type !== "text");
          renderPreview();
          if (c.type !== "text" && c.type !== "range") render();
        });
      }
    });
    [["lk-range", "lk-range-n", "range"], ["lk-max", "lk-max-n", "max"]].forEach(function (x) {
      var sel = $("#" + x[0]);
      var inp = $("#" + x[1]);
      sel.addEventListener("change", function () {
        sel._custom = sel.value === "custom";
        if (sel._custom) { inp.hidden = false; inp.focus(); return; }
        change(x[2], Number(sel.value), true);
        render();
      });
      inp.addEventListener("change", function () {
        var v = Math.round(Number(inp.value));
        var lim = x[2] === "range" ? 62 : 100;
        if (!isFinite(v) || v < 1 || v > lim) { ctx.toast("Bitte 1 bis " + lim); render(); return; }
        change(x[2], v, true);
        render();
      });
    });
    $("#lk-shot-reload").addEventListener("click", shot);
    document.addEventListener("visibilitychange", function () { if (shotActive()) { shot(); startTicks(); } });
    window.addEventListener("resize", function () { if (K && onPage()) { galleryKey = ""; render(); } });
  }

  window.LumiraCalendar = {
    init: function (context) {
      ctx = context;
      wire();
      setTimeout(function () { load().then(function () { if (onPage()) loadEvents(); }); if (shotActive()) shot(); }, 0);
    },
    show: function () {
      if (!ctx) return;
      setTimeout(function () { galleryKey = ""; load().then(loadEvents); shot(); }, 0);
    },
    refresh: function () { if (K) render(); }
  };
})();
