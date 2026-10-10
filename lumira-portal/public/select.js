// LUMIRA Self-Service-Portal – eigene Auswahlfelder im Portal-Stil.
//
// Jedes <select> im Portal bekommt automatisch einen eigenen Knopf mit
// aufklappender Liste. Das echte <select> bleibt unsichtbar im DOM: Werte,
// change-Ereignisse und der übrige Code (sel.value …) funktionieren wie
// bisher. Optionen können ein Bild mitbringen:
//   <option data-img="/avatars/x.jpg" data-color="#f472b6" data-initial="M">
//   <option data-icon="broom" data-color="#4ade80">   (Font-Awesome-Name)
// <select data-native> bleibt ein normales Auswahlfeld,
// <select data-lx-trigger="text"> zeigt im Knopf nur den Text.
(function () {
  "use strict";

  var list = null;        // eine gemeinsame Liste, fest positioniert am <body>
  var current = null;     // { sel, trigger, items, active }
  var uid = 0;
  var valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  var indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function chevron() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "lx-chev"); svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path"); p.setAttribute("d", "M6 9l6 6 6-6");
    svg.appendChild(p);
    return svg;
  }

  function textOn(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#121214";
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#121214" : "#FFFFFF";
  }

  // Bild einer Option: Foto/Avatar, Symbol oder Anfangsbuchstabe
  function media(opt) {
    var d = opt.dataset || {};
    if (!d.img && !d.icon && !d.initial) return null;
    var m = el("span", "lx-media");
    if (d.color) { m.style.background = d.color; m.style.color = textOn(d.color); }
    if (d.icon) {
      var i = el("i", "fa-solid fa-" + d.icon); i.setAttribute("aria-hidden", "true"); m.appendChild(i);
    } else {
      m.appendChild(document.createTextNode(d.initial || ""));
      if (d.img) {
        var img = el("img"); img.alt = ""; img.src = d.img;
        img.onerror = function () { img.remove(); };
        m.appendChild(img);
      }
    }
    return m;
  }

  function optionContent(opt, withMedia) {
    var frag = document.createDocumentFragment();
    var md = withMedia ? media(opt) : null;
    if (md) frag.appendChild(md);
    frag.appendChild(el("span", "lx-text", opt.textContent));
    return frag;
  }

  function labelFor(sel) {
    if (sel.getAttribute("aria-label")) return sel.getAttribute("aria-label");
    if (sel.id) {
      var l = document.querySelector('label[for="' + sel.id + '"]');
      if (l) return l.textContent.replace(/\s+/g, " ").trim();
    }
    return "Auswahl";
  }

  function enhance(sel) {
    if (sel._lx || sel.multiple || sel.hasAttribute("data-native")) return;
    sel._lx = true;

    var wrap = el("div", "lx-select");
    var trigger = el("button", "lx-trigger " + sel.className);
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    if (sel.parentNode) sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(trigger);
    wrap.appendChild(sel);
    sel.classList.add("lx-native");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");

    function paint() {
      var opt = sel.options[indexDesc.get.call(sel)];
      trigger.replaceChildren();
      var box = el("span", "lx-value");
      if (opt) box.appendChild(optionContent(opt, sel.getAttribute("data-lx-trigger") !== "text"));
      trigger.appendChild(box);
      trigger.appendChild(chevron());
      trigger.setAttribute("aria-label", labelFor(sel) + ": " + (opt ? opt.textContent : "–"));
      trigger.disabled = sel.disabled;
      wrap.hidden = sel.hidden;
      wrap.style.display = sel.style.display === "none" ? "none" : "";
      if (current && current.sel === sel) buildList();
    }
    sel._lxPaint = paint;

    // Auch per Code gesetzte Werte im Knopf zeigen
    Object.defineProperty(sel, "value", { configurable: true,
      get: function () { return valueDesc.get.call(sel); },
      set: function (v) { valueDesc.set.call(sel, v); paint(); } });
    Object.defineProperty(sel, "selectedIndex", { configurable: true,
      get: function () { return indexDesc.get.call(sel); },
      set: function (v) { indexDesc.set.call(sel, v); paint(); } });
    new MutationObserver(paint).observe(sel, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["disabled", "hidden", "style", "selected"] });
    sel.addEventListener("change", paint);
    // Klick aufs <label> bzw. Fokus aufs versteckte Feld → eigener Knopf
    sel.addEventListener("focus", function () { trigger.focus(); });

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (current && current.sel === sel) close(true); else open(sel, trigger);
    });
    trigger.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(sel, trigger);
      }
    });
    paint();
  }

  // ---------------------------------------------------------------------
  // Aufklappliste
  // ---------------------------------------------------------------------
  function ensureList() {
    if (list) return list;
    list = el("div", "lx-list");
    list.setAttribute("role", "listbox");
    list.hidden = true;
    list.addEventListener("click", function (e) { e.stopPropagation(); });
    list.addEventListener("keydown", onListKey);
    document.body.appendChild(list);
    document.addEventListener("click", function () { close(false); });
    window.addEventListener("resize", function () { close(false); });
    // Beim Scrollen der Seite mitwandern statt stehen zu bleiben
    window.addEventListener("scroll", function (e) {
      if (current && !list.contains(e.target)) place();
    }, true);
    return list;
  }

  function buildList() {
    var sel = current.sel;
    list.replaceChildren();
    list.setAttribute("aria-label", labelFor(sel));
    var withMedia = Array.prototype.some.call(sel.options, function (o) { return o.dataset.img || o.dataset.icon || o.dataset.initial; });
    list.classList.toggle("with-media", withMedia);
    current.items = Array.prototype.map.call(sel.options, function (opt, i) {
      var b = el("button", "lx-option");
      b.type = "button";
      b.id = "lx-opt-" + (++uid);
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", i === indexDesc.get.call(sel) ? "true" : "false");
      b.disabled = opt.disabled;
      b.appendChild(optionContent(opt, withMedia));
      if (i === indexDesc.get.call(sel)) {
        var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "lx-check"); svg.setAttribute("aria-hidden", "true");
        var p = document.createElementNS(ns, "path"); p.setAttribute("d", "M5 12.5l4.5 4.5L19 7.5"); svg.appendChild(p);
        b.appendChild(svg);
      }
      b.addEventListener("click", function () { choose(i); });
      list.appendChild(b);
      return b;
    });
  }

  function place() {
    if (!current) return;
    var r = current.trigger.getBoundingClientRect();
    // Knopf aus dem Bild gescrollt → zu
    if (r.bottom < 0 || r.top > window.innerHeight) { close(false); return; }
    var width = Math.max(r.width, 200);
    var left = Math.min(r.left, window.innerWidth - width - 8);
    list.style.minWidth = width + "px";
    list.style.left = Math.max(8, left) + "px";
    list.style.maxHeight = "";
    var h = Math.min(list.scrollHeight, 320);
    var below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    if (h > below && above > below) {
      list.style.top = "";
      list.style.bottom = (window.innerHeight - r.top + 6) + "px";
      list.style.maxHeight = Math.min(320, above) + "px";
    } else {
      list.style.bottom = "";
      list.style.top = (r.bottom + 6) + "px";
      list.style.maxHeight = Math.min(320, Math.max(below, 120)) + "px";
    }
  }

  function open(sel, trigger) {
    ensureList();
    close(false);
    current = { sel: sel, trigger: trigger, items: [], active: 0 };
    buildList();
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.closest(".lx-select").classList.add("open");
    place();
    focusItem(Math.max(0, indexDesc.get.call(sel)));
  }

  function close(focusTrigger) {
    if (!current) return;
    var c = current;
    current = null;
    list.hidden = true;
    c.trigger.setAttribute("aria-expanded", "false");
    var w = c.trigger.closest(".lx-select");
    if (w) w.classList.remove("open");
    if (focusTrigger) c.trigger.focus();
  }

  function focusItem(i) {
    var items = current.items;
    if (!items.length) return;
    i = Math.max(0, Math.min(items.length - 1, i));
    current.active = i;
    items[i].focus({ preventScroll: true });
    items[i].scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    var sel = current.sel;
    var changed = indexDesc.get.call(sel) !== i;
    indexDesc.set.call(sel, i);
    close(true);
    sel._lxPaint();
    if (changed) {
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function onListKey(e) {
    if (!current) return;
    var i = current.items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(current.items.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") { close(true); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Tippen springt zum ersten passenden Eintrag
      var k = e.key.toLowerCase(), opts = current.sel.options;
      for (var n = 1; n <= opts.length; n++) {
        var j = (i + n) % opts.length;
        if (opts[j].textContent.trim().toLowerCase().indexOf(k) === 0) { focusItem(j); break; }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Automatisch für alle (auch später erzeugten) Auswahlfelder
  // ---------------------------------------------------------------------
  function scan(root) {
    if (root.tagName === "SELECT") enhance(root);
    else if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll("select"), enhance);
  }

  function start() {
    scan(document.body);
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        Array.prototype.forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1) scan(n); });
      });
      // Liste schließen, wenn ihr Feld aus der Seite verschwunden ist
      if (current && !document.body.contains(current.sel)) close(false);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.LumiraSelect = { enhance: enhance };
})();
