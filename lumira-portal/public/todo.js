// LUMIRA Self-Service-Portal – Extras → To-do (MMM-LumiraTodo).
// Siehe lib/todo.js. Aufgaben anlegen, abhaken, bearbeiten, sortieren;
// Listen und Kategorien; Design, Anzeige, Position. Dazu die Karte auf der
// Startseite zum schnellen Abhaken. Alles wirkt nach wenigen Sekunden auf
// dem Bildschirm, nur Ein/Aus startet MagicMirror neu.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;    // { toast, getSettings, currentPage, setModule, onChange, datePicker }
  var D = null;      // GET /api/todo
  var sel = "";      // gewählte Liste
  var editing = null;
  var saveTimer = null;
  var pending = {};
  var shotTimer = null;
  var shotUrl = null;
  var galleryKey = "";
  var PAGE = "todo";
  var ANCHORS = [
    ["top_left", "oben links"], ["top_center", "oben mittig"], ["top_right", "oben rechts"],
    ["middle_left", "mittig links"], ["middle_center", "Mitte"], ["middle_right", "mittig rechts"],
    ["bottom_left", "unten links"], ["bottom_center", "unten mittig"], ["bottom_right", "unten rechts"]
  ];
  var FONT = [60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 200];
  var REPEATS = [["none", "keine"], ["daily", "täglich / alle n Tage"], ["weekdays", "an bestimmten Wochentagen"], ["weekly", "wöchentlich / alle n Wochen"], ["monthly", "monatlich"], ["yearly", "jährlich"]];
  var WD = [[1, "Mo"], [2, "Di"], [3, "Mi"], [4, "Do"], [5, "Fr"], [6, "Sa"], [0, "So"]];

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function fa(name) { var i = el("i", "fa-solid fa-" + name); i.setAttribute("aria-hidden", "true"); return i; }
  function btn(cls, text, label) { var b = el("button", cls, text); b.type = "button"; if (label) b.setAttribute("aria-label", label); return b; }
  function View() { return window.LumiraTodoView; }
  function onPage() { return ctx && ctx.currentPage() === PAGE; }
  function setSw(b, on) { b.setAttribute("aria-checked", on ? "true" : "false"); }
  function todoOn() { var s = ctx.getSettings(); return !!(s && s.modules && s.modules.todo === true); }

  function api(method, sub, body) {
    var init = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch("/api/todo" + (sub || ""), init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || ("HTTP " + res.status));
        return d;
      });
    });
  }
  function act(p) { return p.then(apply).catch(function (err) { ctx.toast(err.message); load(); }); }

  function apply(d) {
    D = d;
    if (ctx.onChange) ctx.onChange(D);
    if (!D.lists.some(function (l) { return l.id === sel; })) sel = D.lists[0].id;
    render();
    renderStart();
    shotSoon();
  }

  function change(key, value, now) {
    pending[key] = value;
    if (D) D.display[key] = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, now ? 0 : 500);
  }
  function flush() {
    var b = pending;
    pending = {};
    api("PUT", "/display", b).then(apply).catch(function (err) { ctx.toast(err.message); load(); });
  }

  // Datum wie im übrigen Portal: TT.MM.JJJJ im Feld, JJJJ-MM-TT gespeichert
  function isoToDe(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? m[3] + "." + m[2] + "." + m[1] : ""; }
  function deToIso(s) {
    var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s || "").trim());
    if (!m) return null;
    var t = new Date(+m[3], +m[2] - 1, +m[1]);
    if (t.getDate() !== +m[1] || t.getMonth() !== +m[2] - 1) return null;
    return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  }
  // „9:5“ geht nicht, „9:05“, „0905“ und „9.05“ schon → „09:05“
  function normTime(s) {
    var m = /^(\d{1,2})[:.]?(\d{2})$/.exec(String(s || "").trim());
    return m && +m[1] < 24 && +m[2] < 60 ? ("0" + m[1]).slice(-2) + ":" + m[2] : null;
  }

  function catOf(id) { return D.categories.filter(function (c) { return c.id === id; })[0]; }

  // ---------------------------------------------------------------------
  function render() {
    if (!D || !View()) return;
    var on = todoOn();
    setSw($("#lt-on"), on);
    var open = D.tasks.filter(function (t) { return !t.done; }).length;
    $("#lt-on-sub").textContent = (on ? "an · " + View().design(D.display.design).name : "aus") + " · " + open + " offen";
    document.querySelectorAll('.page[data-page="todo"] .lt-pagebox').forEach(function (c) { c.classList.toggle("is-off", !on); });
    renderTabs();
    renderTasks();
    renderLists();
    renderCats();
    var d = D.display;
    document.querySelectorAll('.page[data-page="todo"] [data-k]').forEach(function (c) {
      var k = c.getAttribute("data-k");
      if (c.classList.contains("sw")) setSw(c, d[k]);
      else if (document.activeElement !== c) c.value = String(d[k]);
    });
    $("#lt-opacity-val").textContent = d.opacity + " %";
    if (document.activeElement !== $("#lt-accent")) $("#lt-accent").value = d.accent || "#3d9cff";
    $("#lt-accent-reset").disabled = !d.accent;
    renderLayout();
    renderGallery();
    renderPreview();
    renderReport();
  }

  function renderTabs() {
    var box = $("#lt-tabs");
    box.innerHTML = "";
    D.lists.forEach(function (l) {
      var n = D.tasks.filter(function (t) { return t.list === l.id && !t.done; }).length;
      var b = btn(null, l.name + (n ? " · " + n : ""));
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", l.id === sel ? "true" : "false");
      b.addEventListener("click", function () { sel = l.id; editing = null; render(); });
      box.appendChild(b);
    });
  }

  // ----- Aufgaben -----
  function meta(t) {
    var parts = [];
    var p = View().PRIORITIES.filter(function (x) { return x[0] === t.priority; })[0];
    if (t.priority !== "normal") parts.push(p[2] + " " + p[1]);
    var due = View().dueText(t, Date.now());
    if (due) parts.push(due);
    else if (t.time) parts.push(t.time);
    if (t.repeat && t.repeat.type !== "none") parts.push("↻ " + REPEATS.filter(function (r) { return r[0] === t.repeat.type; })[0][1].split(" /")[0]);
    if (t.sub.length) parts.push(t.sub.filter(function (s) { return s.done; }).length + "/" + t.sub.length + " Unteraufgaben");
    if (t.note) parts.push("Notiz");
    return parts.join(" · ");
  }

  function taskRow(t, opts) {
    opts = opts || {};
    var row = el("div", "lt-row" + (t.done ? " is-done" : "") + (editing === t.id ? " is-editing" : ""));
    var cb = btn("lt-check" + (t.done ? " is-on" : ""), "", (t.done ? "Wieder öffnen: " : "Erledigt: ") + t.title);
    cb.setAttribute("role", "checkbox");
    cb.setAttribute("aria-checked", t.done ? "true" : "false");
    if (t.done) cb.appendChild(fa("check"));
    cb.addEventListener("click", function () { cb.disabled = true; act(api("POST", "/tasks/" + t.id + "/toggle", { done: !t.done })); });
    row.appendChild(cb);
    var c = catOf(t.category);
    var ic = t.icon || (c && c.icon);
    if (ic) { var i = row.appendChild(fa(ic)); i.classList.add("lt-row-ic"); if (c) i.style.color = c.color; }
    var tx = row.appendChild(el("div", "lt-row-t"));
    tx.appendChild(el("b", null, t.title));
    var m = meta(t);
    var sm = el("small", null, (c ? c.name + (m ? " · " : "") : "") + m);
    if (t.due && !t.done && t.due < View().dayKey(Date.now())) sm.classList.add("lk-bad");
    tx.appendChild(sm);
    if (opts.edit !== false) {
      var a = row.appendChild(el("div", "lk-src-a"));
      if (opts.move) {
        var up = btn("lk-mv", "↑", t.title + " nach oben"); up.disabled = opts.first;
        up.addEventListener("click", function () { move(t, -1); });
        var dn = btn("lk-mv", "↓", t.title + " nach unten"); dn.disabled = opts.last;
        dn.addEventListener("click", function () { move(t, 1); });
        a.appendChild(up); a.appendChild(dn);
      }
      var ed = btn("btn small", "Bearbeiten");
      ed.addEventListener("click", function () { openEditor(t.id); });
      a.appendChild(ed);
    }
    return row;
  }

  function openTasks() {
    return D.tasks.filter(function (t) { return t.list === sel && !t.done; }).sort(function (a, b) { return a.order - b.order; });
  }

  function renderTasks() {
    var box = $("#lt-tasks");
    // Editor steht unter der bearbeiteten Aufgabe – vor dem Leeren zurückhängen
    var ed = $("#lt-editor");
    box.parentNode.insertBefore(ed, box.nextSibling);
    ed.hidden = !editing;
    if (!editing) ed.innerHTML = "";
    box.innerHTML = "";
    var open = openTasks();
    if (!open.length) box.appendChild(el("p", "save-hint", "Keine offenen Aufgaben in dieser Liste."));
    open.forEach(function (t, i) {
      box.appendChild(taskRow(t, { move: true, first: i === 0, last: i === open.length - 1 }));
      if (editing === t.id) box.appendChild($("#lt-editor"));
    });
    var done = D.tasks.filter(function (t) { return t.list === sel && t.done; }).sort(function (a, b) { return String(b.doneAt).localeCompare(String(a.doneAt)); });
    $("#lt-done-sum").textContent = "Erledigt (" + done.length + ")";
    $("#lt-donebox").hidden = !done.length;
    var db = $("#lt-done");
    db.innerHTML = "";
    done.forEach(function (t) { db.appendChild(taskRow(t, {})); if (editing === t.id) db.appendChild($("#lt-editor")); });
  }

  function move(t, d) {
    var ids = openTasks().map(function (x) { return x.id; });
    var i = ids.indexOf(t.id);
    var j = i + d;
    if (j < 0 || j >= ids.length) return;
    ids[i] = ids[j]; ids[j] = t.id;
    act(api("PUT", "/tasks/order", { ids: ids }));
  }

  function field(parent, label, input) {
    var f = parent.appendChild(el("div", "field"));
    var l = f.appendChild(el("label", null, label));
    input.id = "lt-e-" + Math.random().toString(36).slice(2, 8);
    l.htmlFor = input.id;
    f.appendChild(input);
    return input;
  }
  function select(opts, value) {
    var s = el("select");
    opts.forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; if (String(o[0]) === String(value)) x.selected = true; s.appendChild(x); });
    return s;
  }

  function openEditor(id) {
    editing = id;
    var t = D.tasks.filter(function (x) { return x.id === id; })[0];
    if (!t) { editing = null; return; }
    var box = $("#lt-editor");
    box.innerHTML = "";
    box.hidden = false;
    var g = box.appendChild(el("div", "grid2"));
    var title = field(g, "Titel", el("input")); title.type = "text"; title.maxLength = 200; title.value = t.title;
    var list = field(g, "Liste", select(D.lists.map(function (l) { return [l.id, l.name]; }), t.list));
    var cat = field(g, "Kategorie", select([["", "ohne"]].concat(D.categories.map(function (c) { return [c.id, c.name]; })), t.category));
    var prio = field(g, "Priorität", select(View().PRIORITIES.map(function (p) { return [p[0], (p[2] ? p[2] + " " : "") + p[1]]; }), t.priority));
    var due = field(g, "Fällig am (optional)", el("input", "mono-in")); due.type = "text"; due.placeholder = "TT.MM.JJJJ"; due.inputMode = "numeric"; due.value = isoToDe(t.due);
    if (ctx.datePicker) ctx.datePicker(due, { withYear: true });
    var time = field(g, "Uhrzeit (optional)", el("input", "mono-in")); time.type = "text"; time.placeholder = "HH:MM"; time.inputMode = "numeric"; time.maxLength = 5; time.value = t.time;
    var icon = field(g, "Symbol", select([["", "wie die Kategorie"]].concat(View().ICONS), t.icon));
    var rep = field(g, "Wiederholung", select(REPEATS, t.repeat.type));
    var every = field(g, "alle … (Tage / Wochen / Monate)", el("input")); every.type = "number"; every.min = "1"; every.max = "99"; every.value = t.repeat.every || 1;
    var days = box.appendChild(el("div", "lt-days"));
    var dayOn = (t.repeat.days || []).slice();
    WD.forEach(function (w) {
      var b = btn("lt-day", w[1]);
      b.setAttribute("aria-pressed", dayOn.indexOf(w[0]) !== -1 ? "true" : "false");
      b.addEventListener("click", function () {
        var k = dayOn.indexOf(w[0]);
        if (k === -1) dayOn.push(w[0]); else dayOn.splice(k, 1);
        b.setAttribute("aria-pressed", k === -1 ? "true" : "false");
      });
      days.appendChild(b);
    });
    function repUi() {
      days.hidden = rep.value !== "weekdays";
      every.parentNode.hidden = ["daily", "weekly", "monthly"].indexOf(rep.value) === -1;
    }
    rep.addEventListener("change", repUi);
    repUi();
    var nf = box.appendChild(el("div", "field"));
    var nl = nf.appendChild(el("label", null, "Notiz (optional)"));
    var note = nf.appendChild(el("textarea")); note.rows = 2; note.maxLength = 1000; note.value = t.note; note.id = "lt-e-note"; nl.htmlFor = note.id;
    box.appendChild(el("div", "wx-l-h", "Unteraufgaben"));
    var subs = box.appendChild(el("div", "lt-subs"));
    var subList = t.sub.map(function (s) { return { id: s.id, title: s.title, done: s.done }; });
    function drawSubs() {
      subs.innerHTML = "";
      subList.forEach(function (s, k) {
        var r = subs.appendChild(el("div", "lt-subrow"));
        var cb = btn("lt-check small" + (s.done ? " is-on" : ""), "", "Unteraufgabe erledigt");
        if (s.done) cb.appendChild(fa("check"));
        cb.addEventListener("click", function () { s.done = !s.done; drawSubs(); });
        var inp = el("input"); inp.type = "text"; inp.maxLength = 200; inp.value = s.title; inp.setAttribute("aria-label", "Unteraufgabe");
        inp.addEventListener("input", function () { s.title = inp.value; });
        var x = btn("btn-x", "✕", "Unteraufgabe entfernen");
        x.addEventListener("click", function () { subList.splice(k, 1); drawSubs(); });
        r.appendChild(cb); r.appendChild(inp); r.appendChild(x);
      });
      var add = subs.appendChild(btn("btn-add", "+ Unteraufgabe"));
      add.addEventListener("click", function () { subList.push({ title: "", done: false }); drawSubs(); subs.querySelector(".lt-subrow:last-of-type input").focus(); });
    }
    drawSubs();
    var row = box.appendChild(el("div", "save-row"));
    var save = row.appendChild(btn("btn primary", "Speichern"));
    var cancel = row.appendChild(btn("btn", "Abbrechen"));
    var del = row.appendChild(btn("btn lk-del", "Löschen"));
    save.addEventListener("click", function () {
      var dueIso = due.value.trim() ? deToIso(due.value) : "";
      var hm = time.value.trim() ? normTime(time.value) : "";
      if (dueIso === null) { ctx.toast("Datum bitte als TT.MM.JJJJ, z. B. 24.12.2026"); due.focus(); return; }
      if (hm === null) { ctx.toast("Uhrzeit bitte als HH:MM, z. B. 17:30"); time.focus(); return; }
      var body = {
        title: title.value.trim(), list: list.value, category: cat.value, priority: prio.value, due: dueIso, time: hm, icon: icon.value,
        note: note.value, repeat: { type: rep.value, every: Number(every.value) || 1, days: dayOn },
        sub: subList.filter(function (s) { return s.title.trim(); })
      };
      if (body.repeat.type === "weekdays" && !dayOn.length) { ctx.toast("Bitte mindestens einen Wochentag wählen"); return; }
      save.disabled = true;
      api("PUT", "/tasks/" + t.id, body).then(function (d) { editing = null; if (body.list !== sel) sel = body.list; apply(d); ctx.toast("Gespeichert"); })
        .catch(function (err) { save.disabled = false; ctx.toast(err.message); });
    });
    cancel.addEventListener("click", function () { editing = null; render(); });
    del.addEventListener("click", function () {
      if (!confirm("Aufgabe „" + t.title + "“ löschen?")) return;
      editing = null;
      act(api("DELETE", "/tasks/" + t.id));
    });
    renderTasks();
    title.focus();
  }

  // ----- Listen und Kategorien -----
  function renderLists() {
    var box = $("#lt-lists");
    box.innerHTML = "";
    D.lists.forEach(function (l, i) {
      var row = box.appendChild(el("div", "lk-src"));
      var n = D.tasks.filter(function (t) { return t.list === l.id; }).length;
      var name = el("input", "lt-name"); name.type = "text"; name.maxLength = 40; name.value = l.name; name.setAttribute("aria-label", "Name der Liste");
      name.addEventListener("change", function () { if (name.value.trim()) act(api("PUT", "/lists/" + l.id, { name: name.value.trim() })); else name.value = l.name; });
      var t = row.appendChild(el("div", "lk-src-t"));
      t.appendChild(name);
      t.appendChild(el("small", null, n + (n === 1 ? " Aufgabe" : " Aufgaben") + " · " + (l.enabled ? "auf dem Bildschirm" : "nicht auf dem Bildschirm")));
      var a = row.appendChild(el("div", "lk-src-a"));
      var up = a.appendChild(btn("lk-mv", "↑", l.name + " nach oben")); up.disabled = i === 0;
      var dn = a.appendChild(btn("lk-mv", "↓", l.name + " nach unten")); dn.disabled = i === D.lists.length - 1;
      [[up, -1], [dn, 1]].forEach(function (x) {
        x[0].addEventListener("click", function () {
          var ids = D.lists.map(function (z) { return z.id; });
          var j = i + x[1];
          ids[i] = ids[j]; ids[j] = l.id;
          act(api("PUT", "/lists/order", { ids: ids }));
        });
      });
      var sw = a.appendChild(btn("sw", "", l.name + " auf dem Bildschirm")); sw.setAttribute("role", "switch"); setSw(sw, l.enabled);
      sw.addEventListener("click", function () { act(api("PUT", "/lists/" + l.id, { enabled: !l.enabled })); });
      var del = a.appendChild(btn("btn small lk-del", "Löschen"));
      del.disabled = D.lists.length === 1;
      del.addEventListener("click", function () {
        if (!confirm("Liste „" + l.name + "“ löschen?" + (n ? " Dabei werden auch ihre " + n + " Aufgaben gelöscht." : ""))) return;
        act(api("DELETE", "/lists/" + l.id));
      });
    });
  }

  function renderCats() {
    var box = $("#lt-cats");
    box.innerHTML = "";
    D.categories.forEach(function (c) {
      var row = box.appendChild(el("div", "lk-src" + (c.hidden ? " is-off" : "")));
      var col = el("input", "lt-color"); col.type = "color"; col.value = c.color; col.setAttribute("aria-label", "Farbe " + c.name);
      col.addEventListener("change", function () { act(api("PUT", "/categories/" + c.id, { color: col.value })); });
      row.appendChild(col);
      var t = row.appendChild(el("div", "lk-src-t"));
      var name = t.appendChild(el("input", "lt-name")); name.type = "text"; name.maxLength = 40; name.value = c.name; name.setAttribute("aria-label", "Name der Kategorie");
      name.addEventListener("change", function () { if (name.value.trim()) act(api("PUT", "/categories/" + c.id, { name: name.value.trim() })); else name.value = c.name; });
      var a = row.appendChild(el("div", "lk-src-a"));
      var ic = a.appendChild(select(View().ICONS, c.icon)); ic.className = "lt-icsel"; ic.setAttribute("aria-label", "Symbol " + c.name);
      ic.addEventListener("change", function () { act(api("PUT", "/categories/" + c.id, { icon: ic.value })); });
      var sw = a.appendChild(btn("sw", "", c.name + " zeigen")); sw.setAttribute("role", "switch"); setSw(sw, !c.hidden);
      sw.addEventListener("click", function () { act(api("PUT", "/categories/" + c.id, { hidden: !c.hidden })); });
      var del = a.appendChild(btn("btn-x", "✕", c.name + " löschen"));
      del.addEventListener("click", function () {
        var n = D.tasks.filter(function (x) { return x.category === c.id; }).length;
        if (!confirm("Kategorie „" + c.name + "“ löschen?" + (n ? " Ihre " + n + " Aufgaben bleiben, nur ohne Kategorie." : ""))) return;
        act(api("DELETE", "/categories/" + c.id));
      });
    });
  }

  // ----- Position & Größe (wie bei Uhr und Kalender) -----
  function renderLayout() {
    var box = $("#lt-layout");
    var d = D.display;
    if (!box.firstChild) buildLayout(box);
    box.querySelectorAll(".wx-pos button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-a") === d.anchor ? "true" : "false"); });
    box.querySelectorAll("[data-n]").forEach(function (inp) { if (document.activeElement !== inp) inp.value = String(d[inp.getAttribute("data-n")]); });
    var a = d.anchor.split("_");
    var u = d.unit === "pct" ? " (%)" : " (px)";
    box.querySelector('[data-l="x"]').textContent = (a[1] === "center" ? "Versatz waagerecht" : "Abstand vom " + (a[1] === "left" ? "linken" : "rechten") + " Rand") + u;
    box.querySelector('[data-l="y"]').textContent = (a[0] === "middle" ? "Versatz senkrecht" : "Abstand vom " + (a[0] === "top" ? "oberen" : "unteren") + " Rand") + u;
  }

  function buildLayout(box) {
    var row = box.appendChild(el("div", "wx-l-row"));
    var pos = row.appendChild(el("div", "wx-pos"));
    pos.setAttribute("role", "group"); pos.setAttribute("aria-label", "Position auf dem Bildschirm");
    ANCHORS.forEach(function (a) {
      var b = btn(null, "", a[1]); b.title = a[1]; b.setAttribute("data-a", a[0]);
      b.addEventListener("click", function () { change("anchor", a[0], true); render(); });
      pos.appendChild(b);
    });
    var nums = row.appendChild(el("div", "wx-nums"));
    [["x", "Abstand waagerecht", "10"], ["y", "Abstand senkrecht", "10"], ["width", "Breite (px)", "10"], ["height", "Höhe höchstens (px)", "10"], ["gap", "Abstand zwischen Aufgaben (px)", "1"], ["padding", "Innenabstand (px)", "1"]].forEach(function (f) {
      var fd = nums.appendChild(el("div", "field"));
      var lb = fd.appendChild(el("label", null, f[1])); lb.setAttribute("data-l", f[0]);
      var inp = fd.appendChild(el("input", "mono-in")); inp.type = "number"; inp.step = f[2]; inp.id = "lt-n-" + f[0]; lb.htmlFor = inp.id; inp.setAttribute("data-n", f[0]);
      inp.addEventListener("change", function () { var v = Math.round(Number(inp.value)); if (!isFinite(v) || inp.value === "") { render(); return; } change(f[0], v); renderPreview(); });
    });
    var g = box.appendChild(el("div", "grid2"));
    var fs = field(g, "Schriftgröße", select(FONT.map(function (n) { return [n, n + " %" + (n === 100 ? " (normal)" : "")]; }), 100)); fs.setAttribute("data-n", "fontScale");
    fs.addEventListener("change", function () { change("fontScale", Number(fs.value), true); renderPreview(); });
    var us = field(g, "Abstände in", select([["px", "Pixeln (px)"], ["pct", "% des Bildschirms"]], "px")); us.setAttribute("data-n", "unit");
    us.addEventListener("change", function () {
      var d = D.display;
      var sc = (D.report && D.report.screen && D.report.screen.width) ? D.report.screen : { width: 1920, height: 1080 };
      var pct = us.value === "pct";
      var conv = function (v, size) { return pct ? Math.round(v / size * 100) : Math.round(v * size / 100 / 10) * 10; };
      pending.unit = us.value; pending.x = conv(d.x, sc.width); pending.y = conv(d.y, sc.height);
      d.unit = pending.unit; d.x = pending.x; d.y = pending.y;
      clearTimeout(saveTimer); saveTimer = setTimeout(flush, 0);
      render();
    });
    box.appendChild(el("p", "save-hint", "Passt nicht alles hinein, wird die Schrift etwas kleiner, dann stehen weniger Aufgaben da („+ X weitere“) – abgeschnitten wird nichts."));
  }

  // ----- Design, Vorschau -----
  function alignOf(d) { var h = d.anchor.split("_")[1]; return h === "center" ? "center" : h; }

  function renderGallery() {
    var box = $("#lt-designs");
    if (!box.firstChild) {
      View().DESIGNS.forEach(function (d, i) {
        var b = btn("wd-design"); b.setAttribute("role", "radio"); b.setAttribute("data-d", d.id);
        var th = b.appendChild(el("div", "wd-thumb")); th.appendChild(el("div", "wd-thumb-in"));
        b.appendChild(el("span", "wd-name", (i + 1) + " · " + d.name));
        b.addEventListener("click", function () {
          if (D.display.design === d.id) return;
          pending.design = d.id; pending.width = d.width; D.display.design = d.id; D.display.width = d.width;
          clearTimeout(saveTimer); saveTimer = setTimeout(flush, 0);
          render();
        });
        box.appendChild(b);
      });
    }
    box.querySelectorAll(".wd-design").forEach(function (b) { b.setAttribute("aria-checked", b.getAttribute("data-d") === D.display.design ? "true" : "false"); });
    var key = JSON.stringify([D.tasks, D.lists, D.categories, D.display.done, D.display.doneHours, D.display.range, D.display.icons, D.display.count, D.display.progress, D.display.title, D.display.lists]);
    if (key === galleryKey || !onPage()) return;
    galleryKey = key;
    box.querySelectorAll(".wd-design").forEach(function (b) {
      var d = View().design(b.getAttribute("data-d"));
      var inner = b.querySelector(".wd-thumb-in");
      var tile = el("div");
      inner.innerHTML = "";
      inner.appendChild(tile);
      View().build(tile, Object.assign({}, D.display, { design: d.id, width: d.width, fontScale: 100, max: Math.min(D.display.max, 6) }), D, { now: Date.now() });
      tile.style.width = d.width + "px";
      tile.style.maxHeight = "560px";
      View().fit(tile);
      var th = b.querySelector(".wd-thumb");
      var s = Math.min(1, (th.clientWidth - 12) / (tile.offsetWidth || 1), (th.clientHeight - 12) / (tile.offsetHeight || 1));
      inner.style.transform = "translate(-50%, -50%) scale(" + s.toFixed(3) + ")";
    });
  }

  function renderPreview() {
    if (!D || !onPage()) return;
    var d = D.display;
    var stage = $("#lt-stage");
    var box = $("#lt-preview");
    var tile = box.firstChild || box.appendChild(el("div"));
    View().build(tile, d, D, { align: alignOf(d), now: Date.now() });
    tile.style.width = d.width + "px";
    tile.style.maxHeight = d.height + "px";
    var f = View().fit(tile);
    var dropped = Number(tile.getAttribute("data-dropped")) || 0;
    var s = Math.min(1, (stage.clientWidth - 24) / d.width);
    box.style.transform = "scale(" + s.toFixed(3) + ")";
    box.style.width = d.width + "px";
    stage.style.height = Math.ceil(tile.offsetHeight * s + 24) + "px";
    var t = [];
    if (s < 0.99) t.push("Hier auf " + Math.round(s * 100) + " % verkleinert dargestellt.");
    if (f <= 0.99) t.push("Schrift auf " + Math.round(f * 100) + " % verkleinert.");
    if (dropped) t.push(dropped + (dropped === 1 ? " Aufgabe passt" : " Aufgaben passen") + " bei " + d.width + " × " + d.height + " px nicht hinein.");
    $("#lt-fit").hidden = !t.length;
    $("#lt-fit").textContent = t.join(" ");
  }

  function renderReport() {
    var box = $("#lt-report");
    box.innerHTML = "";
    var r = D && D.report;
    if (!r || !todoOn()) return;
    var lines = [];
    if (r.overlaps && r.overlaps.length) lines.push("Die To-do-Liste überdeckt: " + r.overlaps.join(", "));
    if (r.offscreen) lines.push("Die To-do-Liste ragt über den Bildschirmrand hinaus");
    if (r.dropped) lines.push("Auf dem Bildschirm passen " + r.dropped + " Aufgaben nicht hinein");
    if (lines.length) lines.forEach(function (x) { box.appendChild(el("div", "setup-banner", "⚠ " + x)); });
    else box.appendChild(el("p", "save-hint", "✓ Keine Überschneidung mit Uhr, Wetter, Kalender & Co."));
  }

  // ----- Startseite: offene Aufgaben schnell abhaken -----
  function renderStart() {
    var card = $("#start-todo");
    if (!card) return;
    card.hidden = !D || !todoOn();
    if (card.hidden) return;
    var shown = D.lists.filter(function (l) { return l.enabled; }).map(function (l) { return l.id; });
    var today = View().dayKey(Date.now());
    var open = D.tasks.filter(function (t) { return !t.done && shown.indexOf(t.list) !== -1; }).sort(function (a, b) {
      var ad = a.due || "9999", bd = b.due || "9999";
      return ad < bd ? -1 : ad > bd ? 1 : a.order - b.order;
    });
    $("#start-todo-count").textContent = open.length + " offen" + (open.some(function (t) { return t.due && t.due < today; }) ? " · überfällige" : "");
    var box = $("#start-todo-rows");
    box.innerHTML = "";
    if (!open.length) box.appendChild(el("p", "save-hint", "Alles erledigt 🎉"));
    open.slice(0, 6).forEach(function (t) { box.appendChild(taskRow(t, { edit: false })); });
    if (open.length > 6) box.appendChild(el("p", "save-hint", "+ " + (open.length - 6) + " weitere"));
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
      $("#lt-shot-img").src = shotUrl;
      $("#lt-shot").classList.add("has-img");
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 1000);
    }).catch(function (err) {
      $("#lt-shot-note").textContent = err.message;
    }).then(function () {
      api("GET").then(function (d) { if (!Object.keys(pending).length && D && !editing) { D.report = d.report; renderReport(); } }).catch(function () {});
      if (shotActive()) shotTimer = setTimeout(shot, 5000);
    });
  }
  function shotSoon() { if (!onPage()) return; clearTimeout(shotTimer); shotTimer = setTimeout(shot, 2500); }

  function load() {
    return api("GET").then(function (d) { D = d; if (ctx.onChange) ctx.onChange(D); if (!sel || !D.lists.some(function (l) { return l.id === sel; })) sel = D.lists[0].id; render(); renderStart(); })
      .catch(function (err) { if (onPage()) ctx.toast(err.message); });
  }

  function quickAdd(form, listOf) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = form.querySelector("input");
      var title = inp.value.trim();
      if (!title) return;
      inp.value = "";
      act(api("POST", "/tasks", { title: title, list: listOf() }));
    });
  }

  function wire() {
    $("#lt-on").addEventListener("click", function () {
      var b = this;
      var on = !todoOn();
      b.disabled = true;
      Promise.resolve(ctx.setModule(on)).then(function (done) {
        b.disabled = false;
        render();
        renderStart();
        if (done !== false) ctx.toast(on ? "To-do-Liste an – MagicMirror startet neu" : "To-do-Liste aus – MagicMirror startet neu");
      }).catch(function (err) { b.disabled = false; ctx.toast(err.message); });
    });
    quickAdd($("#lt-quick"), function () { return sel; });
    quickAdd($("#start-todo-add"), function () { var l = D && D.lists.filter(function (x) { return x.enabled; })[0]; return l ? l.id : sel; });
    $("#lt-list-add").addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = this.querySelector("input");
      if (!inp.value.trim()) return;
      act(api("POST", "/lists", { name: inp.value.trim() }));
      inp.value = "";
    });
    $("#lt-cat-add").addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = this.querySelector("input");
      if (!inp.value.trim()) return;
      act(api("POST", "/categories", { name: inp.value.trim() }));
      inp.value = "";
    });
    $("#lt-clear").addEventListener("click", function () {
      var n = D.tasks.filter(function (t) { return t.list === sel && t.done; }).length;
      if (!confirm(n + " erledigte Aufgaben dieser Liste endgültig löschen?")) return;
      act(api("POST", "/clear-done", { list: sel }));
    });
    document.querySelectorAll('.page[data-page="todo"] [data-k]').forEach(function (c) {
      var k = c.getAttribute("data-k");
      if (c.classList.contains("sw")) c.addEventListener("click", function () { if (D) { change(k, !D.display[k], true); render(); } });
      else c.addEventListener(c.type === "range" || c.type === "text" ? "input" : "change", function () {
        change(k, c.type === "text" || k === "done" ? c.value : Number(c.value), c.type !== "range" && c.type !== "text");
        renderPreview();
        if (c.type !== "text" && c.type !== "range") render();
      });
    });
    $("#lt-accent").addEventListener("input", function () { change("accent", this.value.toLowerCase()); renderPreview(); });
    $("#lt-accent-reset").addEventListener("click", function () { change("accent", "", true); render(); });
    $("#lt-shot-reload").addEventListener("click", shot);
    document.addEventListener("visibilitychange", function () { if (shotActive()) shot(); });
    window.addEventListener("resize", function () { if (D && onPage()) { galleryKey = ""; render(); } });
    // „heute“ / „überfällig“ und Erledigte laufen mit der Zeit
    setInterval(function () { if (D && !editing) { if (onPage()) { galleryKey = ""; renderPreview(); renderGallery(); } renderStart(); } }, 60000);
  }

  window.LumiraTodo = {
    init: function (context) {
      ctx = context;
      wire();
      setTimeout(function () { load(); if (shotActive()) shot(); }, 0);
    },
    show: function () {
      if (!ctx) return;
      setTimeout(function () { galleryKey = ""; load(); shot(); }, 0);
    },
    refresh: function () { if (D) { render(); renderStart(); } }
  };
})();
