// LUMIRA Self-Service-Portal – Overlays: eine Logik für alle (concept/overlays.md).
//
//  LumiraOverlay.ask(opts)            Rückfrage → Promise<true|false> bzw. Text|null (mit Eingabe)
//  LumiraOverlay.notify(text, opts)   Hinweis unten, optional mit Aktion („Rückgängig“)
//  LumiraOverlay.popover(anchor, fn)  Aufklapper am Auslöser (am Handy: Blatt von unten)
//  LumiraOverlay.modal(el, onClose)   Esc, Zurück-Taste und Fokus für eigene Vollbilder
//
// Gleiche Regeln überall: ✕/Esc/Tippen daneben/Zurück-Taste schließen,
// Fokus bleibt drin und kehrt zum Auslöser zurück, nur eine Rückfrage
// gleichzeitig (weitere warten), Knöpfe heißen nach ihrer Wirkung.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  // Folge-Marken: was die Aktion bewirkt
  var MARKS = {
    delete: ["🗑", "endgültig – lässt sich nicht rückgängig machen"],
    restart: ["⟳", "der Bildschirm startet neu (ca. 1 Minute)"],
    reboot: ["⏻", "das Gerät startet neu (ca. 1–2 Minuten nicht erreichbar)"],
    network: ["📶", "die Verbindung bricht kurz ab"],
    undo: ["↶", "lässt sich rückgängig machen"],
    alarm: ["🔔", "echter Alarm mit Ton und Vollbild auf dem Bildschirm"],
    lock: ["🔓", "betrifft den Zugangsschutz"]
  };
  var SMALL = "(max-width: 600px)";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // ------------------------------------------------------------------ Zurück-Taste
  // Solange Overlays offen sind, gibt es genau einen Eintrag im Verlauf;
  // „Zurück“ schließt das oberste statt die Seite zu verlassen.
  var stack = [];
  var pushed = null; // Adresse beim Anlegen des Eintrags
  var ownBack = false;
  window.addEventListener("popstate", function () {
    if (ownBack) { ownBack = false; return; }
    if (!pushed) return;
    pushed = null;
    var top = stack[stack.length - 1];
    if (top) { top.fromHistory = true; top.close(); }
    if (stack.length) push();
  });
  function push() {
    try { history.pushState({ lumiraOverlay: 1 }, ""); pushed = location.href; } catch (e) { /* egal */ }
  }
  function pushLayer(layer) {
    stack.push(layer);
    if (!pushed) push();
  }
  function popLayer(layer) {
    var i = stack.indexOf(layer);
    if (i === -1) return;
    stack.splice(i, 1);
    // erst nach dem Tick: eine wartende Rückfrage übernimmt den Eintrag; hat eine
    // Aktion die Seite gewechselt, bleibt der Eintrag (sonst springt „back“ zurück)
    setTimeout(function () {
      if (stack.length || !pushed) return;
      var same = pushed === location.href;
      pushed = null;
      if (same) { ownBack = true; history.back(); }
    }, 0);
  }

  // Fokus im Element halten (Tab/Umschalt+Tab)
  function trap(box, e) {
    if (e.key !== "Tab") return;
    var f = Array.prototype.filter.call(box.querySelectorAll("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])"), function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  // ------------------------------------------------------------------ Rückfrage
  // opts: { title, text, mark, ok, cancel, danger, input: { label, value, placeholder, maxLength, validate(v) → Fehlertext|"" } }
  var queue = Promise.resolve();
  function ask(opts) {
    var run = function () { return new Promise(function (resolve) { openAsk(opts || {}, resolve); }); };
    var p = queue.then(run);
    queue = p.catch(function () {});
    return p;
  }

  function openAsk(o, resolve) {
    var last = document.activeElement;
    var back = el("div", "ov-back");
    var box = el("div", "ov-dialog" + (o.danger ? " is-danger" : ""));
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    var title = box.appendChild(el("h2", "ov-title", o.title || "Sicher?"));
    title.id = "ov-t-" + Date.now();
    box.setAttribute("aria-labelledby", title.id);
    if (o.text) { var tx = box.appendChild(el("p", "ov-text", o.text)); tx.id = title.id + "-d"; box.setAttribute("aria-describedby", tx.id); }
    var mk = MARKS[o.mark];
    if (mk) { var m = box.appendChild(el("p", "ov-mark ov-mark-" + o.mark)); m.appendChild(el("span", "ov-mark-ic", mk[0])); m.appendChild(document.createTextNode(" " + mk[1])); }
    var inp = null, err = null;
    if (o.input) {
      var f = box.appendChild(el("div", "field"));
      var l = f.appendChild(el("label", null, o.input.label || ""));
      inp = f.appendChild(el("input"));
      inp.type = "text";
      inp.id = title.id + "-i";
      l.htmlFor = inp.id;
      inp.value = o.input.value || "";
      if (o.input.placeholder) inp.placeholder = o.input.placeholder;
      inp.maxLength = o.input.maxLength || 60;
      err = f.appendChild(el("p", "ov-err"));
    }
    var row = box.appendChild(el("div", "ov-btns"));
    var cancel = row.appendChild(el("button", "btn", o.cancel || "Abbrechen")); cancel.type = "button";
    var ok = row.appendChild(el("button", "btn " + (o.danger ? "ov-danger" : "primary"), o.ok || "Weiter")); ok.type = "button";
    back.appendChild(box);
    document.body.appendChild(back);
    document.body.classList.add("ov-open");

    var done = false;
    var layer = {
      close: function () { finish(false); }
    };
    function value() { return inp ? inp.value.trim() : true; }
    function check() {
      if (!inp) return true;
      var v = inp.value.trim();
      var msg = !v ? (o.input.required === false ? "" : "Bitte ausfüllen") : o.input.validate ? o.input.validate(v) || "" : "";
      err.textContent = v ? msg : "";
      ok.disabled = !!msg;
      return !msg;
    }
    function finish(yes) {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      back.remove();
      if (!stack.length || stack.length === 1) document.body.classList.remove("ov-open");
      popLayer(layer);
      if (last && last.focus) last.focus();
      resolve(yes ? value() : (inp ? null : false));
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); return; }
      if (e.key === "Enter" && inp && document.activeElement === inp) { e.preventDefault(); if (check()) finish(true); return; }
      trap(box, e);
    }
    cancel.addEventListener("click", function () { finish(false); });
    ok.addEventListener("click", function () { if (check()) finish(true); });
    back.addEventListener("click", function (e) { if (e.target === back) finish(false); });
    if (inp) inp.addEventListener("input", check);
    document.addEventListener("keydown", onKey, true);
    pushLayer(layer);
    check();
    // Fokus: Eingabe, sonst die sichere Wahl (Abbrechen) bei gefährlichen Aktionen
    setTimeout(function () { (inp || (o.danger ? cancel : ok)).focus(); if (inp) inp.select(); }, 0);
  }

  // ------------------------------------------------------------------ Hinweis
  // opts: { type: "info"|"ok"|"error", action: { label, run }, duration }
  var notes = [];
  var showing = null;
  function notify(text, opts) {
    opts = opts || {};
    notes.push({ text: String(text || ""), opts: opts });
    if (!showing) nextNote();
  }

  function nextNote() {
    var n = notes.shift();
    var host = document.getElementById("toast");
    if (!n || !host) { showing = null; return; }
    showing = n;
    var type = n.opts.type || "info";
    host.innerHTML = "";
    host.className = "toast show ov-note-" + type;
    host.setAttribute("role", type === "error" ? "alert" : "status");
    host.appendChild(el("span", "ov-note-t", n.text));
    var timer = null;
    var gone = false;
    function hide() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      host.classList.remove("show");
      setTimeout(nextNote, 220);
    }
    if (n.opts.action) {
      var a = host.appendChild(el("button", "ov-note-a", n.opts.action.label)); a.type = "button";
      a.addEventListener("click", function () { hide(); n.opts.action.run(); });
    }
    if (type === "error" || n.opts.action) {
      var x = host.appendChild(el("button", "ov-note-x", "✕")); x.type = "button"; x.setAttribute("aria-label", "Hinweis schließen");
      x.addEventListener("click", hide);
    }
    // Fehler bleiben, bis man sie wegtippt (höchstens 20 s); mit Aktion 6 s; sonst 3 s
    timer = setTimeout(hide, n.opts.duration || (type === "error" ? 20000 : n.opts.action ? 6000 : 3000));
  }

  // ------------------------------------------------------------------ Aufklapper
  // fn(panel, close) füllt den Inhalt. Am Handy als Blatt von unten.
  var openPop = null;
  function popover(anchor, fn, opts) {
    opts = opts || {};
    if (openPop) { var same = openPop.anchor === anchor; openPop.close(); if (same) return null; }
    var small = window.matchMedia && window.matchMedia(SMALL).matches;
    var back = small ? el("div", "ov-back ov-sheet-back") : null;
    var panel = el("div", "ov-pop" + (small ? " ov-sheet" : "") + (opts.cls ? " " + opts.cls : ""));
    panel.setAttribute("role", opts.role || "dialog");
    if (opts.label) panel.setAttribute("aria-label", opts.label);
    var last = document.activeElement;
    var layer = {
      anchor: anchor,
      close: function () {
        if (!openPop || openPop !== layer) return;
        openPop = null;
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("click", onDoc, true);
        (back || panel).remove();
        if (back) document.body.classList.remove("ov-open");
        anchor.setAttribute("aria-expanded", "false");
        popLayer(layer);
        if (!layer.fromHistory && last && last.focus) last.focus();
      }
    };
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); layer.close(); return; }
      var items = Array.prototype.slice.call(panel.querySelectorAll("button, a[href]"));
      var i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && items.length) { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === "ArrowUp" && items.length) { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (back) trap(panel, e);
    }
    function onDoc(e) { if (!panel.contains(e.target) && !anchor.contains(e.target)) layer.close(); }
    fn(panel, layer.close);
    if (back) {
      var grip = el("div", "ov-grip");
      panel.insertBefore(grip, panel.firstChild);
      back.appendChild(panel);
      document.body.appendChild(back);
      document.body.classList.add("ov-open");
      back.addEventListener("click", function (e) { if (e.target === back) layer.close(); });
    } else {
      document.body.appendChild(panel);
      var r = anchor.getBoundingClientRect();
      var w = panel.offsetWidth;
      panel.style.top = Math.round(r.bottom + 8 + window.scrollY) + "px";
      panel.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, (opts.align === "left" ? r.left : r.right - w))) + window.scrollX) + "px";
      setTimeout(function () { document.addEventListener("click", onDoc, true); }, 0);
    }
    anchor.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", onKey, true);
    openPop = layer;
    pushLayer(layer);
    setTimeout(function () { var f = panel.querySelector("button, a[href]"); if (f) f.focus(); }, 0);
    return layer;
  }

  // ------------------------------------------------------------------ eigene Vollbilder
  // Für vorhandene Ansichten (Live-Bild): Esc, Zurück-Taste und Fokus wie überall.
  // Liefert eine Funktion, die beim Schließen aufgerufen werden muss.
  function modal(box, onClose) {
    var last = document.activeElement;
    var layer = { close: function () { onClose(); } };
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      trap(box, e);
    }
    document.addEventListener("keydown", onKey, true);
    pushLayer(layer);
    return function closed() {
      document.removeEventListener("keydown", onKey, true);
      popLayer(layer);
      if (!layer.fromHistory && last && last.focus) last.focus();
    };
  }

  window.LumiraOverlay = { ask: ask, notify: notify, popover: popover, modal: modal, MARKS: MARKS };
})();
