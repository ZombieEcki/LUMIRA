// LUMIRA Self-Service-Portal – Bildschirm → Nachrichten (MMM-LumiraNews).
// Siehe lib/news.js. Vordefinierte Feeds an-/abwählen, eigene Feeds
// anlegen, testen, bearbeiten; Reihenfolge, Variante, Zeitraum. Wirkt nach
// wenigen Sekunden auf dem Bildschirm, nur Ein/Aus startet MagicMirror neu.
// Die Darstellung zeichnet news-view.js – derselbe Code wie auf dem Bildschirm.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;    // { toast, getSettings, currentPage, setModule }
  var N = null;      // GET /api/news
  var IT = null;     // GET /api/news/items (Vorschau)
  var saveTimer = null;
  var pending = {};
  var shotTimer = null;
  var shotUrl = null;
  var rotTimer = null;
  var page = 0;
  var editing = null; // null | "new" | Feed-ID
  var PAGE = "news";
  var SCREEN_W = 1280; // Vorschau auf Bildschirmbreite gerechnet

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function View() { return window.LumiraNewsView; }
  function onPage() { return ctx && ctx.currentPage() === PAGE; }
  function setSw(btn, on) { btn.setAttribute("aria-checked", on ? "true" : "false"); }
  function hhmm(iso) { var d = new Date(iso); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  function api(method, sub, body) {
    var init = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch("/api/news" + (sub || ""), init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || ("HTTP " + res.status));
        return d;
      });
    });
  }

  function change(key, value, now) {
    pending[key] = value;
    if (N) N[key] = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, now ? 0 : 500);
  }
  function flush() {
    var body = pending;
    pending = {};
    api("PUT", "", body).then(function (n) { N = n; render(); shotSoon(); }).catch(function (err) { ctx.toast(err.message, "error"); load(); });
  }
  function afterSources(n, msg) {
    N = n;
    if (msg) ctx.toast(msg);
    render();
    loadItems();
    shotSoon();
  }

  function newsOn() {
    var s = ctx.getSettings();
    return !(s && s.modules && s.modules.news === false);
  }

  // ---------------------------------------------------------------------
  function render() {
    if (!N || !View()) return;
    var on = newsOn();
    setSw($("#ln-on"), on);
    var act = N.sources.filter(function (s) { return s.enabled; }).length;
    $("#ln-on-sub").textContent = on ? "an · " + (N.variant === "cards" ? "Vorschauboxen" : "kompakte Leiste") + " · " + act + (act === 1 ? " Feed" : " Feeds") : "aus";
    document.querySelectorAll('.page[data-page="news"] .ln-box').forEach(function (c) { c.classList.toggle("is-off", !on); });
    document.querySelectorAll("#ln-variant button").forEach(function (b) { b.setAttribute("aria-checked", b.getAttribute("data-v") === N.variant ? "true" : "false"); b.setAttribute("aria-pressed", b.getAttribute("data-v") === N.variant ? "true" : "false"); });
    document.querySelectorAll('.page[data-page="news"] [data-k]').forEach(function (c) {
      var k = c.getAttribute("data-k");
      if (c.classList.contains("sw")) setSw(c, N[k]);
      else if (document.activeElement !== c) c.value = String(N[k]);
    });
    var cards = N.variant === "cards";
    $("#ln-cards-field").hidden = !cards;
    $("#ln-opacity-field").hidden = !cards;
    $("#ln-images-row").hidden = !cards;
    $("#ln-opacity-val").textContent = N.opacity + " %";
    var sel = $("#ln-hours");
    var preset = Array.prototype.some.call(sel.options, function (o) { return o.value === String(N.hours); });
    if (document.activeElement !== sel && !sel._custom) sel.value = preset ? String(N.hours) : "custom";
    $("#ln-hours-n").hidden = sel.value !== "custom";
    if (document.activeElement !== $("#ln-hours-n")) $("#ln-hours-n").value = String(N.hours);
    renderSources();
    renderPresets();
    renderPreview();
    renderData();
  }

  function statusText(s) {
    var st = (IT && IT.status && IT.status[s.id]) || (N.status && N.status[s.id]);
    if (!s.enabled) return { t: "aus", bad: false };
    if (!st) return { t: "wird gleich abgerufen …", bad: false };
    if (st.error) return { t: "⚠ " + st.error + (st.updatedAt ? " – zeigt Stand " + hhmm(st.updatedAt) : ""), bad: true };
    return { t: st.count + " Meldungen" + (st.updatedAt ? " · Stand " + hhmm(st.updatedAt) : ""), bad: false };
  }

  function renderSources() {
    var box = $("#ln-sources");
    box.innerHTML = "";
    if (!N.sources.length) box.appendChild(el("p", "save-hint", "Noch kein Feed – unten einen vordefinierten wählen oder einen eigenen hinzufügen."));
    N.sources.forEach(function (s, i) {
      var row = el("div", "lk-src" + (s.enabled ? "" : " is-off") + (editing === s.id ? " is-editing" : ""));
      var sw0 = el("span", "lk-sw ln-sw");
      var ic = el("i", "fa-solid fa-rss"); ic.setAttribute("aria-hidden", "true"); sw0.appendChild(ic);
      row.appendChild(sw0);
      var txt = el("div", "lk-src-t");
      txt.appendChild(el("b", null, s.name));
      var st = statusText(s);
      txt.appendChild(el("small", st.bad ? "lk-bad" : null, s.category + " · " + st.t));
      row.appendChild(txt);
      var actions = el("div", "lk-src-a");
      var up = el("button", "lk-mv", "↑"); up.type = "button"; up.setAttribute("aria-label", s.name + " nach oben"); up.disabled = i === 0;
      up.addEventListener("click", function () { move(i, -1); });
      var dn = el("button", "lk-mv", "↓"); dn.type = "button"; dn.setAttribute("aria-label", s.name + " nach unten"); dn.disabled = i === N.sources.length - 1;
      dn.addEventListener("click", function () { move(i, 1); });
      var sw = el("button", "sw"); sw.type = "button"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-label", s.name + " anzeigen"); setSw(sw, s.enabled);
      sw.addEventListener("click", function () {
        api("PUT", "/sources/" + s.id, { enabled: !s.enabled }).then(function (n) { afterSources(n); }).catch(function (err) { ctx.toast(err.message, "error"); });
      });
      actions.appendChild(up); actions.appendChild(dn); actions.appendChild(sw);
      if (s.preset) {
        var rm = el("button", "btn small", "Entfernen"); rm.type = "button";
        rm.addEventListener("click", function () { api("PUT", "/presets/" + s.preset, { on: false }).then(function (n) { afterSources(n); }).catch(function (err) { ctx.toast(err.message, "error"); }); });
        actions.appendChild(rm);
      } else {
        var ed = el("button", "btn small", "Bearbeiten"); ed.type = "button";
        ed.addEventListener("click", function () { openEditor(s.id); });
        actions.appendChild(ed);
      }
      row.appendChild(actions);
      box.appendChild(row);
    });
    $("#ln-add").hidden = editing === "new";
  }

  function move(i, d) {
    var ids = N.sources.map(function (s) { return s.id; });
    var j = i + d;
    if (j < 0 || j >= ids.length) return;
    var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    api("PUT", "/order", { ids: ids }).then(function (n) { afterSources(n); }).catch(function (err) { ctx.toast(err.message, "error"); });
  }

  // Vordefinierte Feeds nach Kategorie
  function renderPresets() {
    var box = $("#ln-presets");
    box.innerHTML = "";
    N.categories.forEach(function (cat) {
      var list = N.presets.filter(function (p) { return p.category === cat; });
      if (!list.length) return;
      box.appendChild(el("div", "ln-pcat", cat));
      list.forEach(function (p) {
        var on = N.sources.some(function (s) { return s.preset === p.id; });
        var t = el("div", "toggle");
        var tl = el("span", "tl2", p.name);
        var host = ""; try { host = new URL(p.url).hostname.replace(/^www\./, ""); } catch (e) { host = ""; }
        tl.appendChild(el("small", null, host));
        var sw = el("button", "sw"); sw.type = "button"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-label", p.name); setSw(sw, on);
        sw.addEventListener("click", function () {
          sw.disabled = true;
          api("PUT", "/presets/" + p.id, { on: !on }).then(function (n) { afterSources(n, on ? "Feed entfernt" : "Feed hinzugefügt – Meldungen kommen gleich"); })
            .catch(function (err) { sw.disabled = false; ctx.toast(err.message, "error"); });
        });
        t.appendChild(tl); t.appendChild(sw);
        box.appendChild(t);
      });
    });
  }

  // ----- eigener Feed: hinzufügen / bearbeiten -----
  function openEditor(id) {
    editing = id;
    var box = $("#ln-editor");
    box.innerHTML = "";
    box.hidden = false;
    var isNew = id === "new";
    var cur = isNew ? { name: "", url: "", category: "Eigene" } : N.sources.filter(function (s) { return s.id === id; })[0];
    if (!cur) { closeEditor(); return; }
    box.appendChild(el("h3", null, isNew ? "Eigenen Feed hinzufügen" : "„" + cur.name + "“ bearbeiten"));
    var g = el("div", "grid2");
    var f1 = el("div", "field"); var l1 = el("label", null, "Feed-Adresse (RSS oder Atom)"); var url = el("input", "mono-in");
    url.type = "url"; url.id = "ln-e-url"; url.placeholder = "https://…/rss.xml"; url.value = cur.url; l1.htmlFor = url.id;
    f1.appendChild(l1); f1.appendChild(url); g.appendChild(f1);
    var f2 = el("div", "field"); var l2 = el("label", null, "Name"); var name = el("input");
    name.type = "text"; name.id = "ln-e-name"; name.maxLength = 40; name.placeholder = "z. B. Gemeinde Allershausen"; name.value = cur.name; l2.htmlFor = name.id;
    f2.appendChild(l2); f2.appendChild(name); g.appendChild(f2);
    var f3 = el("div", "field"); var l3 = el("label", null, "Kategorie"); var cat = el("select");
    cat.id = "ln-e-cat"; l3.htmlFor = cat.id;
    N.categories.forEach(function (c) { var o = el("option", null, c); o.value = c; if (c === cur.category) o.selected = true; cat.appendChild(o); });
    f3.appendChild(l3); f3.appendChild(cat); g.appendChild(f3);
    box.appendChild(g);
    var result = el("div", "lk-test");
    var row = el("div", "save-row");
    var save = el("button", "btn primary", isNew ? "Hinzufügen" : "Speichern"); save.type = "button";
    var test = el("button", "btn", "Testen"); test.type = "button";
    var cancel = el("button", "btn", "Abbrechen"); cancel.type = "button";
    row.appendChild(save); row.appendChild(test); row.appendChild(cancel);
    if (!isNew) {
      var del = el("button", "btn lk-del", "Löschen"); del.type = "button";
      del.addEventListener("click", function () {
        // Rückgängig statt Rückfrage: trägt den Feed wieder ein (am Ende der Liste)
        var gone = { name: cur.name, category: cur.category, url: cur.url, enabled: cur.enabled };
        api("DELETE", "/sources/" + cur.id).then(function (n) {
          closeEditor(); afterSources(n);
          window.LumiraOverlay.notify("Feed gelöscht", { action: { label: "Rückgängig", run: function () {
            (cur.preset ? api("PUT", "/presets/" + cur.preset, { on: true }) : api("POST", "/sources", gone)).then(function (k) { afterSources(k, "Feed wieder da"); }).catch(function (err) { ctx.toast(err.message, "error"); });
          } } });
        }).catch(function (err) { ctx.toast(err.message, "error"); });
      });
      row.appendChild(del);
    }
    box.appendChild(row);
    box.appendChild(result);

    // Testen – vor dem Speichern immer, damit nur funktionierende Feeds landen
    function runTest() {
      if (!url.value.trim()) { result.className = "lk-test is-bad"; result.textContent = "Bitte zuerst die Feed-Adresse einfügen."; return Promise.resolve(false); }
      result.className = "lk-test";
      result.textContent = "Teste …";
      return api("POST", "/test", { url: url.value.trim() }).then(function (r) {
        result.innerHTML = "";
        if (!r.ok) { result.className = "lk-test is-bad"; result.textContent = "⚠ " + r.error; return false; }
        result.className = "lk-test is-ok";
        result.appendChild(el("div", null, "✓ Feed gefunden" + (r.title ? ": „" + r.title + "“" : "") + " – " + r.count + " Meldungen" + (r.images ? ", " + r.images + " mit Bild" : "") + "."));
        if (r.undated) result.appendChild(el("div", "lk-test-e", r.undated + " Meldungen ohne Zeitangabe werden ausgeblendet."));
        if (!name.value.trim() && r.title) name.value = r.title.slice(0, 40);
        r.newest.forEach(function (it) { result.appendChild(el("div", "lk-test-e", View().ago(it.date, Date.now()) + " – " + it.title)); });
        if (!r.count) { result.className = "lk-test is-bad"; result.appendChild(el("div", null, "⚠ Der Feed enthält gerade keine Meldungen.")); }
        return r.count - (r.undated || 0) > 0 || r.count > 0;
      }).catch(function (err) { result.className = "lk-test is-bad"; result.textContent = "⚠ " + err.message; return false; });
    }
    test.addEventListener("click", runTest);
    save.addEventListener("click", function () {
      save.disabled = true;
      runTest().then(function (ok) {
        if (!ok) { save.disabled = false; return; }
        var body = { name: name.value.trim() || "Eigener Feed", url: url.value.trim(), category: cat.value };
        return (isNew ? api("POST", "/sources", body) : api("PUT", "/sources/" + cur.id, body)).then(function (n) {
          closeEditor();
          afterSources(n, isNew ? "Feed hinzugefügt – Meldungen kommen gleich" : "Gespeichert");
        });
      }).catch(function (err) { save.disabled = false; result.className = "lk-test is-bad"; result.textContent = "⚠ " + err.message; });
    });
    cancel.addEventListener("click", closeEditor);
    renderSources();
    url.focus();
  }

  function closeEditor() {
    editing = null;
    var box = $("#ln-editor");
    box.innerHTML = "";
    box.hidden = true;
    renderSources();
  }

  // ----- Vorschau -----
  function sourcesMap() {
    var m = {};
    N.sources.forEach(function (s) { m[s.id] = s; });
    return m;
  }

  function renderPreview() {
    if (!N || !onPage()) return;
    var stage = $("#ln-stage");
    var box = $("#ln-preview");
    var tile = box.firstChild || box.appendChild(el("div"));
    var items = (IT && IT.items) || [];
    View().build(tile, N, items, { page: page, sources: sourcesMap(), now: Date.now() });
    tile.style.width = SCREEN_W + "px";
    var s = Math.min(1, (stage.clientWidth - 24) / SCREEN_W);
    box.style.transform = "scale(" + s.toFixed(3) + ")";
    box.style.width = SCREEN_W + "px";
    stage.style.height = Math.ceil(tile.offsetHeight * s + 24) + "px";
  }

  // In der Vorschau mitblättern wie auf dem Bildschirm
  function rotate() {
    clearTimeout(rotTimer);
    if (!onPage() || document.hidden || !N) return;
    rotTimer = setTimeout(function () {
      var n = View().visible((IT && IT.items) || [], N, Date.now(), sourcesMap()).length;
      page = (page + 1) % View().pages(n, N);
      renderPreview();
      rotate();
    }, N.rotate * 1000);
  }

  function renderData() {
    var p = $("#ln-data");
    if (!IT) { p.textContent = N.sources.length ? "Meldungen werden geladen …" : ""; return; }
    var n = View().visible(IT.items || [], N, Date.now(), sourcesMap()).length;
    p.textContent = n + " Meldungen aus den letzten " + N.hours + " Stunden · Stand " + hhmm(IT.updatedAt) + (IT.source === "mirror" ? " (wie auf dem Bildschirm)" : " (vom Portal abgerufen)");
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
      $("#ln-shot-img").src = shotUrl;
      $("#ln-shot").classList.add("has-img");
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 1000);
    }).catch(function (err) {
      $("#ln-shot-note").textContent = err.message;
    }).then(function () {
      if (shotActive()) shotTimer = setTimeout(shot, 5000);
    });
  }
  function shotSoon() { clearTimeout(shotTimer); shotTimer = setTimeout(shot, 2500); }

  function load() {
    return api("GET").then(function (n) { N = n; render(); rotate(); }).catch(function (err) { ctx.toast(err.message, "error"); });
  }
  function loadItems() {
    return api("GET", "/items").then(function (r) { IT = r; page = 0; render(); })
      .catch(function (err) { IT = { items: [], status: {}, error: err.message }; render(); });
  }

  function wire() {
    $("#ln-on").addEventListener("click", function () {
      var btn = this;
      var on = !newsOn();
      btn.disabled = true;
      ctx.setModule(on).then(function () {
        btn.disabled = false;
        render();
        ctx.toast(on ? "Nachrichten an – MagicMirror startet neu" : "Nachrichten aus – MagicMirror startet neu");
      }).catch(function (err) { btn.disabled = false; ctx.toast(err.message, "error"); });
    });
    $("#ln-add").addEventListener("click", function () { openEditor("new"); });
    document.querySelectorAll("#ln-variant button").forEach(function (b) {
      b.addEventListener("click", function () { page = 0; change("variant", b.getAttribute("data-v"), true); render(); });
    });
    document.querySelectorAll('.page[data-page="news"] [data-k]').forEach(function (c) {
      var k = c.getAttribute("data-k");
      if (c.classList.contains("sw")) {
        c.addEventListener("click", function () { if (!N) return; change(k, !N[k], true); render(); });
      } else {
        c.addEventListener(c.type === "range" ? "input" : "change", function () {
          change(k, Number(c.value), c.type !== "range");
          render();
        });
      }
    });
    var sel = $("#ln-hours");
    var inp = $("#ln-hours-n");
    sel.addEventListener("change", function () {
      sel._custom = sel.value === "custom";
      if (sel._custom) { inp.hidden = false; inp.focus(); return; }
      change("hours", Number(sel.value), true);
      render();
    });
    inp.addEventListener("change", function () {
      var v = Math.round(Number(inp.value));
      if (!isFinite(v) || v < 1 || v > 720) { ctx.toast("Bitte 1 bis 720 Stunden"); render(); return; }
      change("hours", v, true);
      render();
    });
    $("#ln-shot-reload").addEventListener("click", shot);
    document.addEventListener("visibilitychange", function () { if (shotActive()) { shot(); rotate(); } });
    window.addEventListener("resize", function () { if (N && onPage()) renderPreview(); });
  }

  window.LumiraNews = {
    init: function (context) {
      ctx = context;
      wire();
      setTimeout(function () { load().then(function () { if (onPage()) loadItems(); }); if (shotActive()) shot(); }, 0);
    },
    show: function () {
      if (!ctx) return;
      setTimeout(function () { load().then(loadItems); shot(); }, 0);
    },
    refresh: function () { if (N) render(); }
  };
})();
