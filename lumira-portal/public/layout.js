// LUMIRA Self-Service-Portal – Bildschirm → Übersicht: Layout-Editor.
// Siehe lib/layout.js. Classic = jedes Modul nach seinen eigenen
// Einstellungen (wie bisher); Free = Profile mit Position, Größe, Ebene,
// Sichtbarkeit. Ziehen, Ecken ziehen (Inhalt wächst mit), Raster, Einrasten,
// Hilfslinien – alles nur Entwurf, bis „Speichern“. Kein Neustart nötig.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;    // { toast, currentPage, goPage }
  var L = null;      // GET /api/layout
  var pid = "";      // bearbeitetes Profil
  var draft = {};    // Entwurf: { key: item }
  var saved = "";    // gespeicherter Stand (JSON) zum Vergleichen
  var hist = [];     // Rückgängig im Entwurf
  var sel = "";      // gewähltes Modul
  var zoom = 1;
  var shotUrl = null;
  var LEVEL = { full: "Position + Größe", position: "nur Position", fixed: "fest" };
  var NOTE_PAGES = { uhr: "clock", kalender: "calendar", todo: "todo", wetter: "weather", spruche: "compliments", familienplan: "familyPlan" };

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function btn(cls, text, label) { var b = el("button", cls, text); b.type = "button"; if (label) b.setAttribute("aria-label", label); return b; }
  function api(method, sub, body) {
    var init = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch("/api/layout" + (sub || ""), init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || ("HTTP " + res.status));
        return d;
      });
    });
  }

  function screen() { return (L && L.mirror && L.mirror.screen) || { width: 1920, height: 1080 }; }
  function mod(key) { return L.modules.filter(function (m) { return m.key === key; })[0]; }
  function profile() { return L.profiles.filter(function (p) { return p.id === pid; })[0] || L.profiles[0]; }
  function dirty() { return JSON.stringify(draft) !== saved; }
  function round2(v) { return Math.round(v * 100) / 100; }

  function apply(d, keepDraft) {
    L = d;
    if (!L.profiles.some(function (p) { return p.id === pid; })) pid = L.active;
    if (!keepDraft) loadDraft();
    render();
    notes();
  }

  function loadDraft() {
    draft = JSON.parse(JSON.stringify(profile().items || {}));
    saved = JSON.stringify(draft);
    hist = [];
  }

  function remember() { hist.push(JSON.stringify(draft)); if (hist.length > 50) hist.shift(); }

  // Ausgangspunkt wie der Bildschirm gerade aussieht (gemeldete Positionen)
  function fromCurrent() {
    var out = {};
    L.modules.forEach(function (m) {
      if (!m.on || m.level === "fixed") return;
      var r = L.mirror.rects[m.key];
      var fb = (L.fallback && L.fallback[m.key]) || { x: 5, y: 5 };
      var it = { x: r ? round2(r.x) : fb.x, y: r ? round2(r.y) : fb.y, z: 0, visible: true };
      if (m.level === "full") {
        it.w = Math.round((m.current && m.current.w) || (r && r.w) || 380);
        it.h = Math.round((m.current && m.current.h) || (r && r.h) || 300);
        if (m.current && m.current.font) it.font = m.current.font;
      }
      out[m.key] = it;
    });
    return out;
  }

  // Größe eines Eintrags in px (nur-Position: wie gemeldet bzw. Schätzung)
  function sizeOf(key, it) {
    if (it && it.w) return { w: it.w, h: it.h };
    var r = L.mirror.rects[key];
    return r ? { w: r.w, h: r.h } : { w: 300, h: 140 };
  }

  // ---------------------------------------------------------------------
  function render() {
    if (!L || !$("#ly")) return;
    var free = L.mode === "free";
    document.querySelectorAll("#ly-mode button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === L.mode ? "true" : "false"); });
    var ps = $("#ly-profile");
    ps.innerHTML = "";
    L.profiles.forEach(function (p) {
      var o = el("option", null, p.name + (p.id === L.active ? " (aktiv)" : "")); o.value = p.id; if (p.id === pid) o.selected = true; ps.appendChild(o);
    });
    $("#ly-del").disabled = L.profiles.length < 2;
    $("#ly-save").disabled = !dirty();
    $("#ly-discard").disabled = !dirty();
    $("#ly-undo-draft").disabled = !hist.length;
    $("#ly-undo").disabled = !L.backups;
    $("#ly-activate").hidden = pid === L.active && free;
    $("#ly-activate").textContent = free ? "Dieses Layout aktivieren" : "Free mit diesem Layout aktivieren";
    var st = $("#ly-status");
    var p = profile();
    st.className = "save-hint";
    if (!free) st.textContent = "Classic ist aktiv – jedes Modul steht nach seinen eigenen Einstellungen (wie bisher). Hier gestaltete Layouts wirken erst mit „Free“.";
    else st.textContent = "Free ist aktiv mit „" + (L.profiles.filter(function (x) { return x.id === L.active; })[0] || {}).name + "“." + (pid !== L.active ? " Du bearbeitest gerade „" + p.name + "“." : "");
    if (dirty()) { st.textContent += " · Ungespeicherte Änderungen"; st.className = "save-hint ly-dirty"; }
    $("#ly-empty").hidden = Object.keys(draft).length > 0;
    document.querySelectorAll("[data-ly-e]").forEach(function (c) {
      var k = c.getAttribute("data-ly-e");
      if (c.type === "checkbox") c.checked = !!L.editor[k]; else c.value = String(L.editor[k]);
    });
    renderLib();
    renderCanvas();
    renderProps();
  }

  function renderLib() {
    var box = $("#ly-lib-list");
    var q = ($("#ly-search").value || "").toLowerCase();
    box.innerHTML = "";
    L.modules.forEach(function (m) {
      if (q && m.name.toLowerCase().indexOf(q) === -1) return;
      var it = draft[m.key];
      var row = el("div", "ly-mod" + (sel === m.key ? " is-sel" : "") + (!m.on ? " is-off" : ""));
      var t = row.appendChild(el("button", "ly-mod-t"));
      t.type = "button";
      t.appendChild(el("b", null, m.name));
      t.appendChild(el("small", null, !m.on ? "aus" : LEVEL[m.level] + (m.level !== "fixed" && !it ? " · nicht im Layout" : "")));
      t.addEventListener("click", function () { select(m.key); });
      if (m.on && m.level !== "fixed") {
        var eye = row.appendChild(btn("ly-eye" + (it && it.visible === false ? " is-hidden" : ""), it && it.visible === false ? "◌" : "●", m.name + (it && it.visible === false ? " einblenden" : " ausblenden")));
        eye.title = it ? (it.visible === false ? "ausgeblendet – einblenden" : "sichtbar – ausblenden") : "ins Layout aufnehmen";
        eye.addEventListener("click", function () {
          remember();
          if (!draft[m.key]) draft[m.key] = fromCurrent()[m.key] || { x: 5, y: 5, z: 0, visible: true, w: 380, h: 300 };
          else draft[m.key].visible = draft[m.key].visible === false;
          sel = m.key;
          render();
        });
      }
      box.appendChild(row);
    });
  }

  // ----- Fläche -----
  function canvasRect() { return $("#ly-canvas").getBoundingClientRect(); }

  function renderCanvas() {
    var sc = screen();
    var wrap = $("#ly-stagewrap");
    var cv = $("#ly-canvas");
    var w = Math.max(240, (wrap.clientWidth - 2) * zoom);
    cv.style.width = w + "px";
    cv.style.height = (w * sc.height / sc.width) + "px";
    cv.classList.toggle("show-grid", !!L.editor.showGrid);
    var step = 100 / L.editor.grid;
    cv.style.setProperty("--ly-gx", step + "%");
    cv.style.setProperty("--ly-gy", (step * sc.width / sc.height) + "%");
    cv.style.backgroundImage = "";
    if ($("#ly-shot").checked && shotUrl) cv.style.setProperty("--ly-shot", "url(" + shotUrl + ")"); else cv.style.removeProperty("--ly-shot");
    cv.classList.toggle("has-shot", !!($("#ly-shot").checked && shotUrl));
    cv.querySelectorAll(".ly-item, .ly-fixed").forEach(function (x) { x.remove(); });
    // feste Module als Hinweis (nicht verschiebbar)
    var news = mod("news");
    if (news && news.on) {
      var f = cv.appendChild(el("div", "ly-fixed ly-fixed-bottom", "Nachrichten (fest, immer unten)"));
      f.title = "Fest – nicht verschiebbar";
    }
    Object.keys(draft).forEach(function (key) {
      var m = mod(key);
      if (!m || !m.on) return;
      var it = draft[key];
      var sz = sizeOf(key, it);
      var d = el("div", "ly-item ly-l-" + m.level + (sel === key ? " is-sel" : "") + (it.visible === false ? " is-hidden" : ""));
      d.setAttribute("data-key", key);
      d.tabIndex = 0;
      d.setAttribute("role", "button");
      d.setAttribute("aria-label", m.name + " verschieben (Pfeiltasten)");
      d.style.left = it.x + "%";
      d.style.top = it.y + "%";
      d.style.width = (sz.w / sc.width * 100) + "%";
      d.style.height = (sz.h / sc.height * 100) + "%";
      d.style.zIndex = String(10 + (it.z || 0));
      d.appendChild(el("span", "ly-name", m.name));
      d.appendChild(el("span", "ly-size", m.level === "full" ? Math.round(sz.w) + " × " + Math.round(sz.h) + (it.font ? " · " + it.font + " %" : "") : LEVEL[m.level]));
      if (m.level === "full") ["nw", "ne", "sw", "se"].forEach(function (c) { var h = d.appendChild(el("span", "ly-h ly-h-" + c)); h.setAttribute("data-h", c); });
      d.addEventListener("pointerdown", startDrag);
      d.addEventListener("keydown", keyMove);
      cv.appendChild(d);
    });
  }

  // Ziehen und Größe ändern (Entwurf, erst „Speichern“ schreibt)
  var drag = null;
  function startDrag(e) {
    var d = e.currentTarget;
    var key = d.getAttribute("data-key");
    var it = draft[key];
    if (!it || e.button > 0) return;
    e.preventDefault();
    select(key, true);
    remember();
    var sz = sizeOf(key, it);
    drag = { key: key, mode: e.target.getAttribute("data-h") || "move", sx: e.clientX, sy: e.clientY, x: it.x, y: it.y, w: sz.w, h: sz.h, font: it.font, el: $('#ly-canvas [data-key="' + key + '"]') };
    drag.el.setPointerCapture(e.pointerId);
    drag.el.addEventListener("pointermove", moveDrag);
    drag.el.addEventListener("pointerup", endDrag, { once: true });
    drag.el.addEventListener("pointercancel", endDrag, { once: true });
  }

  function snap(v, step) { return L.editor.snap ? Math.round(v / step) * step : v; }

  function moveDrag(e) {
    if (!drag) return;
    var r = canvasRect();
    var sc = screen();
    var dx = (e.clientX - drag.sx) / r.width * 100;
    var dy = (e.clientY - drag.sy) / r.height * 100;
    var it = draft[drag.key];
    var stepX = 100 / L.editor.grid;
    var stepY = stepX * sc.width / sc.height;
    var wPct = drag.w / sc.width * 100;
    var hPct = drag.h / sc.height * 100;
    if (drag.mode === "move") {
      var nx = snap(drag.x + dx, stepX);
      var ny = snap(drag.y + dy, stepY);
      var g = guides(drag.key, nx, ny, wPct, hPct);
      it.x = round2(g.x); it.y = round2(g.y);
    } else {
      // Ecke ziehen: Rahmen und Inhalt wachsen mit (Schrift im Verhältnis der Breite)
      var left = drag.x, top = drag.y, right = drag.x + wPct, bottom = drag.y + hPct;
      if (drag.mode.indexOf("w") !== -1) left = snap(drag.x + dx, stepX); else right = snap(drag.x + wPct + dx, stepX);
      if (drag.mode.indexOf("n") !== -1) top = snap(drag.y + dy, stepY); else bottom = snap(drag.y + hPct + dy, stepY);
      var nw = Math.max(60, (right - left) / 100 * sc.width);
      var nh = Math.max(40, (bottom - top) / 100 * sc.height);
      if (drag.mode.indexOf("w") !== -1) left = right - nw / sc.width * 100;
      if (drag.mode.indexOf("n") !== -1) top = bottom - nh / sc.height * 100;
      it.x = round2(left); it.y = round2(top); it.w = Math.round(nw); it.h = Math.round(nh);
      if (drag.font) it.font = Math.max(30, Math.min(400, Math.round(drag.font * nw / drag.w)));
      clearGuides();
    }
    renderCanvas();
    renderProps();
  }

  function endDrag() {
    if (!drag) return;
    drag.el.removeEventListener("pointermove", moveDrag);
    drag = null;
    clearGuides();
    if (hist.length && hist[hist.length - 1] === JSON.stringify(draft)) hist.pop();
    render();
  }

  // Hilfslinien: Kanten und Mitten anderer Module und des Bildschirms (rastet ein)
  function guides(key, x, y, w, h) {
    clearGuides();
    if (!L.editor.guides) return { x: x, y: y };
    var sc = screen();
    var vx = [0, 50, 100], vy = [0, 50, 100];
    Object.keys(draft).forEach(function (k) {
      if (k === key || !mod(k) || !mod(k).on) return;
      var o = draft[k], s = sizeOf(k, o);
      var ow = s.w / sc.width * 100, oh = s.h / sc.height * 100;
      vx.push(o.x, o.x + ow / 2, o.x + ow);
      vy.push(o.y, o.y + oh / 2, o.y + oh);
    });
    var T = 0.8;
    var best = function (pos, size, lines) {
      var cands = [[pos, 0], [pos + size / 2, size / 2], [pos + size, size]];
      var hit = null;
      cands.forEach(function (c) { lines.forEach(function (l) { var d = Math.abs(c[0] - l); if (d < T && (!hit || d < hit.d)) hit = { d: d, pos: l - c[1], line: l }; }); });
      return hit;
    };
    var gx = best(x, w, vx), gy = best(y, h, vy);
    var cv = $("#ly-canvas");
    if (gx) { x = gx.pos; var lx = cv.appendChild(el("div", "ly-guide ly-guide-v")); lx.style.left = gx.line + "%"; }
    if (gy) { y = gy.pos; var ly = cv.appendChild(el("div", "ly-guide ly-guide-h")); ly.style.top = gy.line + "%"; }
    return { x: x, y: y };
  }
  function clearGuides() { document.querySelectorAll("#ly-canvas .ly-guide").forEach(function (g) { g.remove(); }); }

  function keyMove(e) {
    var key = e.currentTarget.getAttribute("data-key");
    var it = draft[key];
    var map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!map[e.key]) return;
    e.preventDefault();
    remember();
    var sc = screen();
    var stepX = 100 / L.editor.grid * (e.shiftKey ? 4 : 1);
    var stepY = stepX * sc.width / sc.height;
    it.x = round2(it.x + map[e.key][0] * stepX);
    it.y = round2(it.y + map[e.key][1] * stepY);
    render();
    var again = $('#ly-canvas [data-key="' + key + '"]');
    if (again) again.focus();
  }

  function select(key, quiet) {
    sel = key;
    if (quiet) { renderProps(); document.querySelectorAll("#ly-canvas .ly-item").forEach(function (x) { x.classList.toggle("is-sel", x.getAttribute("data-key") === key); }); return; }
    render();
  }

  // ----- Eigenschaften -----
  function offscreen(key, it) {
    var sc = screen(), s = sizeOf(key, it);
    return it.x < 0 || it.y < 0 || it.x + s.w / sc.width * 100 > 100.5 || it.y + s.h / sc.height * 100 > 100.5;
  }

  function numIn(parent, label, value, min, max, step, onChange, disabled) {
    var f = parent.appendChild(el("div", "field"));
    var l = f.appendChild(el("label", null, label));
    var i = f.appendChild(el("input", "mono-in"));
    i.type = "number"; i.min = min; i.max = max; i.step = step; i.value = value === undefined || value === null ? "" : value; i.disabled = !!disabled;
    i.id = "ly-p-" + label.replace(/\W+/g, "").toLowerCase(); l.htmlFor = i.id;
    i.addEventListener("change", function () {
      var v = Number(i.value);
      if (i.value === "" || !isFinite(v) || v < min || v > max) { ctx.toast(label + ": " + min + " bis " + max); renderProps(); return; }
      remember(); onChange(v); render();
    });
    return i;
  }

  function renderProps() {
    var box = $("#ly-props");
    box.innerHTML = "";
    var m = sel && mod(sel);
    if (!m) { box.appendChild(el("p", "save-hint", "Ein Modul auf der Fläche oder in der Liste anklicken. Pfeiltasten verschieben (mit Umschalt in größeren Schritten).")); return; }
    var head = box.appendChild(el("div", "ly-p-head"));
    head.appendChild(el("b", null, m.name));
    head.appendChild(el("span", "ly-badge ly-l-" + m.level, LEVEL[m.level]));
    if (m.note) box.appendChild(el("p", "save-hint", m.note));
    var link = box.appendChild(el("a", "more-link", "Einstellungen →"));
    link.href = "#" + m.page;
    if (!m.on) { box.appendChild(el("p", "save-hint", "Gerade ausgeschaltet – unter „Module auf dem Bildschirm“ einschalten.")); return; }
    if (m.level === "fixed") { box.appendChild(el("p", "save-hint", "Feste Stelle – lässt sich nicht verschieben.")); return; }
    var it = draft[sel];
    if (!it) {
      var add = box.appendChild(btn("btn small", "Ins Layout aufnehmen"));
      add.addEventListener("click", function () { remember(); draft[sel] = fromCurrent()[sel] || { x: 5, y: 5, z: 0, visible: true, w: 380, h: 300 }; render(); });
      return;
    }
    var g = box.appendChild(el("div", "grid2"));
    numIn(g, "X (% von links)", it.x, -50, 150, 0.5, function (v) { it.x = round2(v); });
    numIn(g, "Y (% von oben)", it.y, -50, 150, 0.5, function (v) { it.y = round2(v); });
    var full = m.level === "full";
    var sz = sizeOf(sel, it);
    numIn(g, "Breite (px)", full ? it.w : Math.round(sz.w), 40, 4000, 10, function (v) { it.w = Math.round(v); }, !full);
    numIn(g, "Höhe (px)", full ? it.h : Math.round(sz.h), 30, 4000, 10, function (v) { it.h = Math.round(v); }, !full);
    numIn(g, "Schrift (%)", full ? it.font : "", 30, 400, 5, function (v) { it.font = Math.round(v); }, !full);
    numIn(g, "Ebene (0–20)", it.z || 0, 0, 20, 1, function (v) { it.z = Math.round(v); });
    if (!full) box.appendChild(el("p", "save-hint", "Größe nicht über das Layout: " + (m.note || "das Modul bestimmt sie selbst.")));
    var vis = box.appendChild(el("div", "toggle"));
    vis.appendChild(el("span", "tl2", "Sichtbar"));
    var sw = vis.appendChild(btn("sw", "", "Sichtbar")); sw.setAttribute("role", "switch"); sw.setAttribute("aria-checked", it.visible === false ? "false" : "true");
    sw.addEventListener("click", function () { remember(); it.visible = it.visible === false; render(); });
    if (offscreen(sel, it)) {
      box.appendChild(el("div", "setup-banner", "⚠ Ragt über den Bildschirmrand hinaus."));
      var fix = box.appendChild(btn("btn small", "In den sichtbaren Bereich holen"));
      fix.addEventListener("click", function () {
        remember();
        var sc = screen(), s = sizeOf(sel, it);
        it.x = round2(Math.min(Math.max(0, it.x), Math.max(0, 100 - s.w / sc.width * 100)));
        it.y = round2(Math.min(Math.max(0, it.y), Math.max(0, 100 - s.h / sc.height * 100)));
        render();
      });
    }
    var rm = box.appendChild(btn("btn small lk-del", "Aus diesem Layout nehmen"));
    rm.title = "Das Modul steht dann nach seinen eigenen Einstellungen";
    rm.addEventListener("click", function () { remember(); delete draft[sel]; render(); });
  }

  // ----- Hinweis auf den Modul-Seiten, wenn das Free-Layout die Position bestimmt -----
  function notes() {
    Object.keys(NOTE_PAGES).forEach(function (page) {
      var sec = $('.page[data-page="' + page + '"]');
      if (!sec) return;
      var n = sec.querySelector(":scope > .ly-note");
      var key = NOTE_PAGES[page];
      var act = L && L.mode === "free" && L.profiles.filter(function (p) { return p.id === L.active; })[0];
      var on = act && act.items && act.items[key];
      if (!on) { if (n) n.remove(); return; }
      if (!n) {
        n = el("div", "setup-banner ly-note");
        sec.insertBefore(n, sec.firstChild);
      }
      n.textContent = "Free-Layout „" + act.name + "“ ist aktiv: Position" + (mod(key) && mod(key).level === "full" ? ", Größe und Schrift" : "") + " kommen aus Bildschirm → Übersicht. Die Werte hier gelten wieder mit „Classic“.";
    });
  }

  // ----- Aktionen -----
  function saveDraft(then) {
    var p = profile();
    var live = L.mode === "free" && pid === L.active;
    if (live && !confirm("Layout „" + p.name + "“ speichern? Der Bildschirm übernimmt es nach wenigen Sekunden.")) return Promise.resolve(false);
    return api("PUT", "/profiles/" + pid, { items: draft }).then(function (d) { apply(d); ctx.toast(live ? "Gespeichert – der Bildschirm übernimmt es gleich" : "Gespeichert"); if (then) then(); return true; })
      .catch(function (err) { ctx.toast(err.message); return false; });
  }

  function guardDirty() { return !dirty() || confirm("Ungespeicherte Änderungen verwerfen?"); }

  function wire() {
    document.querySelectorAll("#ly-mode button").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-m");
        if (m === L.mode) return;
        if (m === "free") {
          if (!Object.keys(draft).length) { ctx.toast("Dieses Layout ist noch leer – erst „Vom Bildschirm übernehmen“ oder Module hineinziehen"); return; }
          if (dirty() && !confirm("Ungespeicherte Änderungen zuerst speichern?")) return;
          var go = function () {
            if (!confirm("Free-Layout „" + profile().name + "“ auf dem Bildschirm aktivieren? Classic bleibt gespeichert und lässt sich jederzeit zurückholen.")) return;
            api("PUT", "/mode", { mode: "free", active: pid }).then(function (d) { apply(d, true); ctx.toast("Free-Layout aktiv"); }).catch(function (err) { ctx.toast(err.message); });
          };
          if (dirty()) api("PUT", "/profiles/" + pid, { items: draft }).then(function (d) { apply(d); go(); }).catch(function (err) { ctx.toast(err.message); });
          else go();
        } else {
          if (!confirm("Zurück zu Classic? Jedes Modul steht dann wieder nach seinen eigenen Einstellungen. Die Free-Layouts bleiben gespeichert.")) return;
          api("PUT", "/mode", { mode: "classic" }).then(function (d) { apply(d, true); ctx.toast("Classic aktiv"); }).catch(function (err) { ctx.toast(err.message); });
        }
      });
    });
    $("#ly-profile").addEventListener("change", function () {
      if (!guardDirty()) { this.value = pid; return; }
      pid = this.value; sel = ""; loadDraft(); render();
    });
    $("#ly-activate").addEventListener("click", function () {
      if (dirty() && !confirm("Ungespeicherte Änderungen werden vorher gespeichert. Weiter?")) return;
      var p = profile();
      var go = function () {
        if (!confirm("„" + p.name + "“ auf dem Bildschirm aktivieren?")) return;
        api("PUT", "/mode", { mode: "free", active: pid }).then(function (d) { apply(d, true); ctx.toast("„" + p.name + "“ ist aktiv"); }).catch(function (err) { ctx.toast(err.message); });
      };
      if (!Object.keys(draft).length) { ctx.toast("Dieses Layout ist noch leer"); return; }
      if (dirty()) api("PUT", "/profiles/" + pid, { items: draft }).then(function (d) { apply(d); go(); }).catch(function (err) { ctx.toast(err.message); });
      else go();
    });
    $("#ly-new").addEventListener("click", function () {
      if (!guardDirty()) return;
      var name = prompt("Name des neuen Layouts (z. B. Abend, Familie, Minimal):", "");
      if (!name || !name.trim()) return;
      api("POST", "/profiles", { name: name.trim(), from: "current" }).then(function (d) { pid = d.profiles[d.profiles.length - 1].id; apply(d); ctx.toast("Layout angelegt – Ausgangspunkt ist der aktuelle Bildschirm"); }).catch(function (err) { ctx.toast(err.message); });
    });
    $("#ly-dup").addEventListener("click", function () {
      if (!guardDirty()) return;
      var name = prompt("Name der Kopie:", profile().name + " (Kopie)");
      if (!name || !name.trim()) return;
      api("POST", "/profiles", { name: name.trim(), from: pid }).then(function (d) { pid = d.profiles[d.profiles.length - 1].id; apply(d); }).catch(function (err) { ctx.toast(err.message); });
    });
    $("#ly-rename").addEventListener("click", function () {
      var name = prompt("Neuer Name:", profile().name);
      if (!name || !name.trim()) return;
      api("PUT", "/profiles/" + pid, { name: name.trim() }).then(function (d) { apply(d, true); }).catch(function (err) { ctx.toast(err.message); });
    });
    $("#ly-del").addEventListener("click", function () {
      if (!confirm("Layout „" + profile().name + "“ löschen?")) return;
      api("DELETE", "/profiles/" + pid).then(function (d) { pid = d.active; apply(d); ctx.toast("Layout gelöscht"); }).catch(function (err) { ctx.toast(err.message); });
    });
    $("#ly-take").addEventListener("click", function () { remember(); draft = fromCurrent(); render(); });
    $("#ly-save").addEventListener("click", function () { saveDraft(); });
    $("#ly-discard").addEventListener("click", function () { if (confirm("Änderungen verwerfen?")) { loadDraft(); render(); } });
    $("#ly-undo-draft").addEventListener("click", function () { if (hist.length) { draft = JSON.parse(hist.pop()); render(); } });
    $("#ly-undo").addEventListener("click", function () {
      if (!guardDirty() || !confirm("Letzte Speicherung zurücknehmen? Der vorherige Stand (Layouts und Modus) kommt zurück.")) return;
      api("POST", "/undo").then(function (d) { apply(d); ctx.toast("Vorheriger Stand ist zurück"); }).catch(function (err) { ctx.toast(err.message); });
    });
    $("#ly-search").addEventListener("input", renderLib);
    $("#ly-zoom").addEventListener("change", function () { zoom = Number(this.value) || 1; renderCanvas(); });
    $("#ly-shot").addEventListener("change", function () { if (this.checked) loadShot(); else renderCanvas(); });
    document.querySelectorAll("[data-ly-e]").forEach(function (c) {
      c.addEventListener("change", function () {
        var k = c.getAttribute("data-ly-e");
        var body = {}; body[k] = c.type === "checkbox" ? c.checked : Number(c.value);
        L.editor[k] = body[k];
        renderCanvas();
        api("PUT", "/editor", body).then(function (d) { L.editor = d.editor; L.backups = d.backups; }).catch(function (err) { ctx.toast(err.message); });
      });
    });
    window.addEventListener("resize", function () { if (L && ctx.currentPage() === "module") renderCanvas(); });
    window.addEventListener("beforeunload", function (e) { if (L && dirty()) { e.preventDefault(); e.returnValue = ""; } });
  }

  function loadShot() {
    fetch("/api/mirror/screenshot", { credentials: "same-origin", cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Der Bildschirm liefert gerade kein Bild.");
      return res.blob();
    }).then(function (b) {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      shotUrl = URL.createObjectURL(b);
      renderCanvas();
    }).catch(function (err) { $("#ly-shot").checked = false; ctx.toast(err.message); });
  }

  function load(keepDraft) {
    return api("GET").then(function (d) { apply(d, keepDraft && !!L); }).catch(function (err) { if (ctx.currentPage() === "module") ctx.toast(err.message); });
  }

  window.LumiraLayout = {
    init: function (context) {
      ctx = context;
      if (!$("#ly")) return;
      wire();
      setTimeout(function () { pid = ""; load(); }, 0);
    },
    // Übersicht geöffnet: frischer Stand (Positionen, an/aus) – Entwurf bleibt
    show: function () { if (ctx) setTimeout(function () { load(dirty()); }, 0); },
    refresh: function () { if (L) load(dirty()); }
  };
})();
