// LUMIRA Self-Service-Portal – Sprüche (Familie → Sprüche).
// Kategorien an/aus, Sprüche bearbeiten, eigene Kategorien, Anlässe,
// Darstellung, Sicherung. Alles landet in ~/.lumira/compliments.json
// (lib/compliments.js) und wirkt live auf dem Spiegel (MMM-SmartCompliments).
// Kategorien, Auswahl und Darstellung kommen aus spruch/catalog.js und
// spruch/logic.js – denselben Dateien wie auf dem Spiegel.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;       // { toast, getSettings, alarmOn, currentPage }
  var C = null;         // Stand von GET /api/compliments
  var pending = {};
  var saveTimer = null;
  var ed = null;        // offener Editor: { cat, work[], off[] }
  var previewMsg = null;
  var shotTimer = null;
  var shotUrl = null;

  var ANCHORS = [
    ["top_left", "oben links"], ["top_center", "oben mittig"], ["top_right", "oben rechts"],
    ["middle_left", "mittig links"], ["middle_center", "Mitte"], ["middle_right", "mittig rechts"],
    ["bottom_left", "unten links"], ["bottom_center", "unten mittig"], ["bottom_right", "unten rechts"]
  ];
  var GROUP_LABEL = { warning: "Wetterwarnung", calendar: "Kalender", weather: "Wetter" };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function Cat() { return window.LumiraSpruchCatalog; }
  function L() { return window.LumiraSpruchLogic; }
  function setSw(btn, on) { btn.setAttribute("aria-checked", on ? "true" : "false"); }

  function api(method, body, path) {
    var init = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch("/api/compliments" + (path || ""), init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || ("HTTP " + res.status));
        return d;
      });
    });
  }

  // ---------------------------------------------------------------------
  // Speichern: Änderungen sammeln und kurz verzögert schicken
  // ---------------------------------------------------------------------
  function queue(patch, now) {
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      if (k === "own" || Array.isArray(v) || typeof v !== "object" || v === null) pending[k] = v;
      else pending[k] = Object.assign({}, pending[k] || {}, v);
      // sofort im eigenen Stand, damit die Anzeige mitgeht
      if (k === "own") C.own = v;
      else C[k] = Object.assign({}, C[k] || {}, v);
    });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, now ? 0 : 700);
  }

  function flush() {
    var body = pending;
    pending = {};
    if (!Object.keys(body).length) return;
    api("POST", body).then(function (d) {
      if (Object.keys(pending).length) return; // weitere Änderungen unterwegs
      C = d;
      renderAll(false);
      shotSoon();
    }).catch(function (err) {
      ctx.toast(err.message);
      load();
    });
  }

  // ---------------------------------------------------------------------
  // Kategorien
  // ---------------------------------------------------------------------
  function legacy() {
    var s = ctx.getSettings();
    var m = (s && s.compliments && s.compliments.moods) || {};
    return { herzlich: m.herzlich !== false, motivierend: m.motivierend !== false, humorvoll: m.humorvoll !== false };
  }

  function flags() { return { alarm: ctx.alarmOn() }; }

  function cats() { return L().allCategories(L().cleanSettings(C)); }

  function catByKey(key) { return cats().filter(function (c) { return c.key === key; })[0] || null; }

  function visibleCat(c) { return c.need !== "alarm" || ctx.alarmOn(); }

  // Arbeitsliste: eigene Liste, wenn vorhanden, sonst die eingebauten Sprüche
  function baseItems(c) {
    if (c.own) return c.items.slice();
    var own = C.categories && C.categories[c.list];
    return (own && own.length ? own : c.items).map(function (it) { return typeof it === "string" ? it : { q: it.q, a: it.a }; });
  }

  function isCustom(c) {
    return !c.own && !!(C.categories && C.categories[c.list] && C.categories[c.list].length);
  }

  function metaText(c) {
    var items = baseItems(c);
    var off = (C.off && C.off[c.key]) || [];
    var on = items.filter(function (it) { return off.indexOf(L().itemKey(it)) === -1; }).length;
    var t = [];
    if (!items.length) t.push("noch leer");
    else t.push(on === items.length ? items.length + " Sprüche" : on + " von " + items.length + " Sprüchen an");
    if (c.own) t.push("eigene Kategorie");
    else if (isCustom(c)) t.push("eigene Liste");
    if (c.days && c.days.length === 1 && c.days[0] === 1) t.push("nur montags");
    if (c.days && c.days.length === 2) t.push("nur am Wochenende");
    if (c.need === "alarm") t.push("Feuerwehr");
    if (c.group === "calendar") t.push("Stichwörter: " + L().wordList(C.words && C.words[c.key] !== undefined ? C.words[c.key] : c.words).join(", "));
    return t.join(" · ");
  }

  function renderCats() {
    var box = $("#sp-cats");
    box.innerHTML = "";
    var all = cats();
    Cat().GROUPS.forEach(function (g) {
      var list = all.filter(function (c) { return c.group === g[0] && visibleCat(c); });
      if (!list.length) return;
      box.appendChild(el("div", "wx-l-h", g[1]));
      list.forEach(function (c) {
        var row = el("div", "toggle sp-cat");
        var tl = el("span", "tl2");
        tl.appendChild(el("span", "sp-cat-ic", c.icon || "💬"));
        tl.appendChild(document.createTextNode(c.label));
        tl.appendChild(el("small", null, metaText(c)));
        row.appendChild(tl);
        var right = el("span", "sp-cat-act");
        var edit = el("button", "btn small ghost", "Bearbeiten");
        edit.type = "button";
        edit.addEventListener("click", function () { openEditor(c.key); });
        right.appendChild(edit);
        if (g[0] !== "time" && g[0] !== "duty") {
          var sw = el("button", "sw");
          sw.type = "button";
          sw.setAttribute("role", "switch");
          sw.setAttribute("aria-label", c.label);
          setSw(sw, L().isEnabled(c, C, legacy()));
          sw.addEventListener("click", function () {
            var en = {};
            en[c.key] = !L().isEnabled(c, C, legacy());
            queue({ enabled: en }, true);
            renderCats();
          });
          right.appendChild(sw);
        }
        row.appendChild(right);
        row.classList.toggle("is-off", g[0] !== "time" && g[0] !== "duty" && !L().isEnabled(c, C, legacy()));
        box.appendChild(row);
      });
      // eigene Kategorien gehören zu den allgemeinen Sprüchen
      if (g[0] === "general") box.appendChild($("#sp-own-add"));
    });
    var anyOn = all.some(function (c) { return c.group === "general" && visibleCat(c) && L().isEnabled(c, C, legacy()) && baseItems(c).length; });
    $("#sp-none").hidden = anyOn;
  }

  // ---------------------------------------------------------------------
  // Editor einer Kategorie
  // ---------------------------------------------------------------------
  function openEditor(key) {
    var c = catByKey(key);
    if (!c) return;
    var off = (C.off && C.off[c.key]) || [];
    var work = baseItems(c);
    ed = { cat: c, work: work, off: work.map(function (it) { return off.indexOf(L().itemKey(it)) !== -1; }) };
    renderEditor(true);
    var box = $("#sp-editor");
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeEditor() {
    ed = null;
    $("#sp-editor").hidden = true;
  }

  function renderEditor(focusFirst) {
    if (!ed) return;
    var c = ed.cat;
    $("#sp-ed-title").textContent = (c.icon ? c.icon + " " : "") + (c.own ? (c.label || "Eigene Kategorie") : c.label);
    var sub = [];
    if (c.group === "warning") sub.push("{event} wird durch die Art der Warnung ersetzt, z. B. „Sturmböen“.");
    if (c.group === "calendar") sub.push("{title} wird durch den Titel des Termins ersetzt.");
    if (c.riddle) sub.push("Erst erscheint das Rätsel, die Lösung nach der unter „Wechsel“ eingestellten Zeit.");
    if (c.group === "time") sub.push("Tageszeit-Sprüche sind immer dabei.");
    sub.push("Ein Spruch mit „aus“ erscheint nie. „\\n“ im Text = neue Zeile.");
    $("#sp-ed-sub").textContent = sub.join(" ");
    $("#sp-ed-own").hidden = !c.own;
    $("#sp-own-del").hidden = !c.own;
    if (c.own) {
      if (document.activeElement !== $("#sp-own-label")) $("#sp-own-label").value = c.label;
      if (document.activeElement !== $("#sp-own-icon")) $("#sp-own-icon").value = c.icon === "💬" ? "" : c.icon;
    }
    $("#sp-ed-words").hidden = c.group !== "calendar";
    if (c.group === "calendar" && document.activeElement !== $("#sp-words")) {
      $("#sp-words").value = C.words && C.words[c.key] !== undefined ? C.words[c.key] : c.words;
    }
    $("#sp-ed-state").textContent = c.own ? "" : isCustom(c) ? "Eigene Liste (statt der eingebauten Sprüche)" : c.items.length ? "Eingebaute Sprüche – Ändern legt eine eigene Liste an" : "Noch keine Sprüche – hier eintragen";
    $("#sp-ed-reset").hidden = c.own || !isCustom(c) || !c.items.length;
    $("#sp-bulk").placeholder = c.riddle ? "Je Zeile: Rätsel | Lösung" : "Je Zeile ein Spruch";
    var list = $("#sp-ed-list");
    list.innerHTML = "";
    ed.work.forEach(function (it, i) { list.appendChild(editorRow(i)); });
    if (!ed.work.length) list.appendChild(el("p", "save-hint", "Leer."));
    if (focusFirst && c.own && !ed.work.length) $("#sp-own-label").focus();
  }

  function editorRow(i) {
    var c = ed.cat;
    var it = ed.work[i];
    var row = el("div", "sp-row" + (ed.off[i] ? " is-off" : ""));
    var sw = el("button", "sw");
    sw.type = "button";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-label", "Spruch an");
    setSw(sw, !ed.off[i]);
    sw.addEventListener("click", function () { ed.off[i] = !ed.off[i]; row.classList.toggle("is-off", ed.off[i]); setSw(sw, !ed.off[i]); saveEditor(true); });
    row.appendChild(sw);
    var fields = el("div", "sp-row-f");
    // Zeilenumbruch im Feld als „\n“ (einzeilige Eingabe), gespeichert als echter Umbruch
    var mk = function (val, ph, onIn) {
      var inp = el("input");
      inp.type = "text";
      inp.maxLength = 300;
      inp.placeholder = ph;
      inp.value = String(val).replace(/\n/g, "\\n");
      inp.addEventListener("input", function () { onIn(inp.value.replace(/\\n/g, "\n")); saveEditor(false); });
      fields.appendChild(inp);
      return inp;
    };
    if (c.riddle) {
      mk(it.q, "Rätsel", function (v) { ed.work[i].q = v; });
      mk(it.a, "Lösung", function (v) { ed.work[i].a = v; });
    } else {
      mk(it, "Spruch", function (v) { ed.work[i] = v; });
    }
    row.appendChild(fields);
    var pv = el("button", "btn-x", "👁");
    pv.type = "button";
    pv.title = "Vorschau";
    pv.addEventListener("click", function () {
      var cur = ed.work[i];
      previewMsg = c.riddle ? { text: cur.q, answer: cur.a, icon: c.icon } : { text: L().fill(cur, { event: "Sturmböen", title: "Fußball-Training" }), icon: c.icon };
      renderPreview(true);
      $("#sp-stage").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    row.appendChild(pv);
    var del = el("button", "btn-x", "✕");
    del.type = "button";
    del.title = "Entfernen";
    del.addEventListener("click", function () {
      ed.work.splice(i, 1);
      ed.off.splice(i, 1);
      saveEditor(true);
      renderEditor(false);
    });
    row.appendChild(del);
    return row;
  }

  function cleanWork() {
    var riddle = ed.cat.riddle;
    var keep = [];
    var off = [];
    ed.work.forEach(function (it, i) {
      var ok = riddle ? (it.q.trim() && it.a.trim()) : String(it).trim();
      if (!ok) return;
      var v = riddle ? { q: it.q.trim(), a: it.a.trim() } : String(it).trim();
      keep.push(v);
      if (ed.off[i]) off.push(L().itemKey(v));
    });
    return { items: keep, off: off };
  }

  function saveEditor(now) {
    if (!ed) return;
    var c = ed.cat;
    var w = cleanWork();
    var offPatch = {};
    offPatch[c.key] = w.off;
    if (c.own) {
      var own = (C.own || []).map(function (o) {
        return o.key === c.key ? { key: o.key, label: ($("#sp-own-label").value || "").trim() || "Eigene Kategorie", icon: ($("#sp-own-icon").value || "").trim(), items: w.items } : o;
      });
      queue({ own: own, off: offPatch }, now);
    } else {
      var same = JSON.stringify(w.items) === JSON.stringify(c.items);
      var cat = {};
      cat[c.list] = same ? [] : w.items;
      queue({ categories: cat, off: offPatch }, now);
    }
  }

  function addItems(lines) {
    if (!ed) return;
    lines.forEach(function (line) {
      if (ed.cat.riddle) {
        var p = line.split("|");
        ed.work.push({ q: (p[0] || "").trim(), a: (p.slice(1).join("|") || "").trim() });
      } else {
        ed.work.push(line);
      }
      ed.off.push(false);
    });
  }

  function newOwn() {
    var key = "own_" + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "a");
    var own = (C.own || []).concat([{ key: key, label: "Neue Kategorie", icon: "", items: [] }]);
    if (own.length > 20) { ctx.toast("Höchstens 20 eigene Kategorien"); return; }
    queue({ own: own }, true);
    renderCats();
    openEditor(key);
  }

  // ---------------------------------------------------------------------
  // Darstellung, Wechsel, Anlässe
  // ---------------------------------------------------------------------
  function renderSettings() {
    var d = C.display;
    var b = C.behavior;
    var free = d.anchor !== "auto";
    $("#sp-auto").setAttribute("aria-pressed", free ? "false" : "true");
    document.querySelectorAll("#sp-pos button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-a") === d.anchor ? "true" : "false");
    });
    document.querySelectorAll("[data-d]").forEach(function (c) {
      if (document.activeElement !== c) c.value = String(d[c.getAttribute("data-d")]);
    });
    ["sp-x", "sp-y", "sp-unit"].forEach(function (id) { $("#" + id).disabled = !free; });
    var a = d.anchor.split("_");
    var u = d.unit === "pct" ? " (%)" : " (px)";
    $("#sp-x-l").textContent = !free ? "Abstand waagerecht" : (a[1] === "center" ? "Versatz waagerecht" : "Abstand vom " + (a[1] === "left" ? "linken" : "rechten") + " Rand") + u;
    $("#sp-y-l").textContent = !free ? "Abstand senkrecht" : (a[0] === "middle" ? "Versatz senkrecht" : "Abstand vom " + (a[0] === "top" ? "oberen" : "unteren") + " Rand") + u;
    document.querySelectorAll("[data-b]").forEach(function (c) {
      var k = c.getAttribute("data-b");
      if (c.classList.contains("sw")) setSw(c, b[k]);
      else if (document.activeElement !== c) c.value = String(b[k]);
    });
    var rd = Math.min(b.riddleDelay, Math.max(3, b.interval / 2));
    $("#sp-riddle-note").textContent = rd < b.riddleDelay ? "Bei " + b.interval + " Sekunden Wechsel kommt die Lösung schon nach " + rd + " Sekunden." : "";
    renderOrder();
  }

  function renderOrder() {
    var ol = $("#sp-order");
    ol.innerHTML = "";
    var order = C.behavior.order;
    order.forEach(function (g, i) {
      var li = el("li", "sp-order-i");
      li.appendChild(el("span", null, GROUP_LABEL[g]));
      [["↑", -1], ["↓", 1]].forEach(function (x) {
        var btn = el("button", "btn-x", x[0]);
        btn.type = "button";
        btn.title = x[1] < 0 ? "nach oben" : "nach unten";
        btn.disabled = i + x[1] < 0 || i + x[1] >= order.length;
        btn.addEventListener("click", function () {
          var o = order.slice();
          var t = o[i]; o[i] = o[i + x[1]]; o[i + x[1]] = t;
          queue({ behavior: { order: o } }, true);
          renderOrder();
        });
        li.appendChild(btn);
      });
      ol.appendChild(li);
    });
  }

  function screenSize() {
    var r = C && C.report && C.report.screen;
    return r && r.width && r.height ? r : { width: 1920, height: 1080 };
  }

  function setUnit(unit) {
    var d = C.display;
    if (d.unit === unit) return;
    var sc = screenSize();
    var toPct = unit === "pct";
    var conv = function (v, size) { return toPct ? Math.round(v / size * 100) : Math.round(v * size / 100 / 10) * 10; };
    queue({ display: { unit: unit, x: conv(d.x, sc.width), y: conv(d.y, sc.height) } }, true);
    renderSettings();
    renderPreview(false);
  }

  // ---------------------------------------------------------------------
  // Vorschau: Spruch auf einem verkleinerten „Spiegel“
  // ---------------------------------------------------------------------
  function sampleMsg() {
    if (C.report && C.report.text) return { text: C.report.text, icon: (catByKey(C.report.cat) || {}).icon || "" };
    return { text: "Bleib so wie du bist 🌈", icon: "❤️" };
  }

  function renderPreview() {
    var stage = $("#sp-stage");
    var scr = $("#sp-screen");
    var box = $("#sp-prev");
    var d = C.display;
    var sc = screenSize();
    var k = Math.max(0.05, (stage.clientWidth || 600) / sc.width);
    scr.style.width = sc.width + "px";
    scr.style.height = sc.height + "px";
    scr.style.transform = "scale(" + k.toFixed(4) + ")";
    stage.style.height = Math.round(sc.height * k) + "px";
    var portrait = sc.width <= 900 || sc.height > sc.width;
    var msg = previewMsg || sampleMsg();
    L().render(box, msg, d, { reveal: true });
    box.style.setProperty("--sc-base", (sc.width * (portrait ? 0.05 : 0.02)).toFixed(1) + "px");
    box.style.setProperty("--sc-scale", (d.fontScale / 100).toFixed(2));
    box.style.removeProperty("--sc-fit");
    box.style.padding = d.padding ? d.padding + "px" : "";
    box.style.width = d.width ? d.width + "px" : "";
    box.style.maxWidth = d.width ? d.width + "px" : Math.round(sc.width * (portrait ? 0.9 : 0.8)) + "px";
    box.style.maxHeight = d.height ? d.height + "px" : "";
    box.style.overflow = d.height ? "hidden" : "";
    var s = box.style;
    s.left = s.right = s.top = s.bottom = "";
    var t = [];
    if (d.anchor === "auto") {
      // wie bisher: oben mittig im Spiegel-Layout (genaue Lage bestimmt MagicMirror)
      s.top = Math.round(sc.height * 0.03) + "px";
      s.left = "50%";
      t.push("translateX(-50%)");
    } else {
      var a = d.anchor.split("_");
      var ux = d.unit === "pct" ? sc.width / 100 : 1;
      var uy = d.unit === "pct" ? sc.height / 100 : 1;
      if (a[0] === "top") s.top = d.y * uy + "px";
      else if (a[0] === "bottom") s.bottom = d.y * uy + "px";
      else { s.top = "calc(50% + " + d.y * uy + "px)"; t.push("translateY(-50%)"); }
      if (a[1] === "left") s.left = d.x * ux + "px";
      else if (a[1] === "right") s.right = d.x * ux + "px";
      else { s.left = "calc(50% + " + d.x * ux + "px)"; t.push("translateX(-50%)"); }
    }
    s.transform = t.join(" ");
    var f = d.height ? L().fit(box) : 1;
    var note = [];
    if (d.anchor === "auto") note.push("„Wie bisher“: Die genaue Lage oben mittig bestimmt MagicMirror – das Live-Bild zeigt sie.");
    if (f < 0.99) note.push("Bei " + d.height + " px Höhe wird die Schrift für diesen Spruch auf " + Math.round(f * 100) + " % verkleinert.");
    $("#sp-prev-note").textContent = note.join(" ");
  }

  function renderReport() {
    var box = $("#sp-report");
    box.innerHTML = "";
    var r = C && C.report;
    if (!r) return;
    if (r.text) $("#sp-now").textContent = "Gerade auf dem Spiegel: „" + r.text.replace(/\n/g, " ") + "“";
    if (C.display.anchor === "auto") return;
    var lines = [];
    if (r.overlaps && r.overlaps.length) lines.push("Der Spruch überdeckt: " + r.overlaps.join(", "));
    if (r.offscreen) lines.push("Der Spruch ragt über den Bildschirmrand hinaus");
    if (lines.length) lines.forEach(function (t) { box.appendChild(el("div", "setup-banner", "⚠ " + t)); });
    else if (r.text) box.appendChild(el("p", "save-hint", "✓ Keine Überschneidung mit Uhr, Familienplan, Wetter & Co."));
  }

  function renderAll(withEditor) {
    if (!C) return;
    renderSettings();
    renderCats();
    renderPreview();
    renderReport();
    if (withEditor && ed) {
      var c = catByKey(ed.cat.key);
      if (!c) closeEditor(); else { ed.cat = c; renderEditor(false); }
    } else if (ed) {
      var cc = catByKey(ed.cat.key);
      if (cc) { ed.cat = cc; $("#sp-ed-state").textContent = cc.own ? "" : isCustom(cc) ? "Eigene Liste (statt der eingebauten Sprüche)" : cc.items.length ? "Eingebaute Sprüche – Ändern legt eine eigene Liste an" : "Noch keine Sprüche – hier eintragen"; $("#sp-ed-reset").hidden = cc.own || !isCustom(cc) || !cc.items.length; }
    }
  }

  // ---------------------------------------------------------------------
  // Live-Bild des Spiegels (solange die Seite offen ist)
  // ---------------------------------------------------------------------
  function shotActive() { return ctx.currentPage() === "spruche" && !document.hidden; }

  function shot() {
    clearTimeout(shotTimer);
    if (!shotActive()) return;
    fetch("/api/mirror/screenshot", { credentials: "same-origin", cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Der Spiegel liefert gerade kein Bild.");
      return res.blob();
    }).then(function (blob) {
      var old = shotUrl;
      shotUrl = URL.createObjectURL(blob);
      $("#sp-shot-img").src = shotUrl;
      $("#sp-shot").classList.add("has-img");
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 1000);
    }).catch(function (err) {
      $("#sp-shot-note").textContent = err.message;
    }).then(function () {
      api("GET").then(function (d) { if (!Object.keys(pending).length && C) { C.report = d.report; renderReport(); if (!previewMsg) renderPreview(); } }).catch(function () {});
      if (shotActive()) shotTimer = setTimeout(shot, 5000);
    });
  }

  function shotSoon() {
    clearTimeout(shotTimer);
    shotTimer = setTimeout(shot, 2500);
  }

  function load() {
    return api("GET").then(function (d) { C = d; renderAll(true); }).catch(function (err) { ctx.toast(err.message); });
  }

  // ---------------------------------------------------------------------
  // Verdrahtung
  // ---------------------------------------------------------------------
  function wire() {
    var pos = $("#sp-pos");
    ANCHORS.forEach(function (a) {
      var btn = el("button");
      btn.type = "button";
      btn.title = a[1];
      btn.setAttribute("aria-label", a[1]);
      btn.setAttribute("data-a", a[0]);
      btn.addEventListener("click", function () { queue({ display: { anchor: a[0] } }, true); renderSettings(); renderPreview(); });
      pos.appendChild(btn);
    });
    $("#sp-auto").addEventListener("click", function () { queue({ display: { anchor: "auto" } }, true); renderSettings(); renderPreview(); });
    document.querySelectorAll("[data-d]").forEach(function (c) {
      var k = c.getAttribute("data-d");
      c.addEventListener("change", function () {
        if (k === "unit") { setUnit(c.value); return; }
        var p = {};
        p[k] = k === "icon" ? c.value : Math.round(Number(c.value)) || 0;
        queue({ display: p }, c.tagName === "SELECT");
        renderSettings();
        renderPreview();
      });
    });
    document.querySelectorAll("[data-b]").forEach(function (c) {
      var k = c.getAttribute("data-b");
      if (c.classList.contains("sw")) {
        c.addEventListener("click", function () { var p = {}; p[k] = !C.behavior[k]; queue({ behavior: p }, true); renderSettings(); });
      } else {
        c.addEventListener("change", function () { var p = {}; p[k] = Number(c.value); queue({ behavior: p }, true); renderSettings(); });
      }
    });
    $("#sp-ed-close").addEventListener("click", closeEditor);
    $("#sp-ed-add").addEventListener("click", function () {
      addItems([ed.cat.riddle ? "|" : ""]);
      renderEditor(false);
      var ins = document.querySelectorAll("#sp-ed-list input");
      if (ins.length) ins[ed.cat.riddle ? ins.length - 2 : ins.length - 1].focus();
    });
    $("#sp-bulk-add").addEventListener("click", function () {
      var lines = $("#sp-bulk").value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (!lines.length) return;
      addItems(lines);
      $("#sp-bulk").value = "";
      saveEditor(true);
      renderEditor(false);
      ctx.toast(lines.length + (lines.length === 1 ? " Spruch" : " Sprüche") + " hinzugefügt");
    });
    $("#sp-ed-reset").addEventListener("click", function () {
      if (!ed || !window.confirm("Eigene Liste löschen und wieder die eingebauten Sprüche verwenden?")) return;
      var cat = {};
      cat[ed.cat.list] = [];
      var off = {};
      off[ed.cat.key] = [];
      queue({ categories: cat, off: off }, true);
      openEditor(ed.cat.key);
    });
    ["#sp-own-label", "#sp-own-icon"].forEach(function (id) {
      $(id).addEventListener("input", function () { saveEditor(false); });
    });
    $("#sp-own-del").addEventListener("click", function () {
      if (!ed || !ed.cat.own || !window.confirm("Kategorie „" + ed.cat.label + "“ mit allen Sprüchen löschen?")) return;
      var key = ed.cat.key;
      queue({ own: (C.own || []).filter(function (o) { return o.key !== key; }) }, true);
      closeEditor();
      renderCats();
    });
    $("#sp-words").addEventListener("input", function () {
      if (!ed) return;
      var w = {};
      w[ed.cat.key] = $("#sp-words").value;
      queue({ words: w }, false);
    });
    $("#sp-own-add").addEventListener("click", newOwn);
    $("#sp-shot-reload").addEventListener("click", shot);
    $("#sp-import").addEventListener("change", function () {
      var f = this.files && this.files[0];
      this.value = "";
      if (!f) return;
      if (!window.confirm("Alle Sprüche und Einstellungen durch die Sicherung „" + f.name + "“ ersetzen?")) return;
      f.text().then(function (txt) {
        var data;
        try { data = JSON.parse(txt); } catch (e) { throw new Error("Die Datei ist keine Sprüche-Sicherung (kein JSON)."); }
        return api("POST", data, "/import");
      }).then(function (d) { C = d; closeEditor(); renderAll(true); ctx.toast("Sicherung eingespielt"); })
        .catch(function (err) { ctx.toast(err.message); });
    });
    document.addEventListener("visibilitychange", function () { if (shotActive()) shot(); });
    window.addEventListener("resize", function () { if (C && ctx.currentPage() === "spruche") renderPreview(); });
  }

  window.LumiraSpruche = {
    init: function (context) {
      ctx = context;
      wire();
      setTimeout(function () {
        load();
        if (shotActive()) shot();
      }, 0);
    },
    // Seite geöffnet: frisch laden (erst nach dem Umschalten messen)
    show: function () {
      if (!ctx) return;
      setTimeout(function () { previewMsg = null; load(); shot(); }, 0);
    }
  };
})();
