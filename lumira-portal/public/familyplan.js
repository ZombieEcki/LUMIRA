// LUMIRA Self-Service-Portal – Seite „Familienplan“ (concept/familienplan.md 6.5).
// Reines Vanilla-JS ohne Build-Schritt. Namen aus der Datei landen nur per
// textContent im DOM, nie als HTML.
(function () {
  "use strict";

  var ctx = null;          // { toast, getSettings, setSettings, api }
  var PLAN = null;         // letzte Ansicht vom Server (GET /api/familyplan)
  var PRESETS = [];
  var TAB = "uebersicht";
  var draftMembers = null; // ungespeicherte Änderungen je Reiter
  var draftDuties = null;
  var draftSettings = null;
  var openPicker = null;   // Index der Mitgliederzeile mit offener Avatar-Auswahl
  var openAway = null;     // Index der Mitgliederzeile mit offener Abwesenheit

  var WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var ROLE_LABEL = { adult: "Erwachsener", child: "Kind" };
  var FOR_WHOM = [
    { v: "all", label: "Alle", roles: ["adult", "child"] },
    { v: "adult", label: "Nur Erwachsene", roles: ["adult"] },
    { v: "child", label: "Nur Kinder", roles: ["child"] }
  ];
  var ICON_LABEL = {
    "seedling": "Pflanze", "leaf": "Blatt", "tree": "Baum", "utensils": "Besteck", "bowl-food": "Schüssel",
    "mug-hot": "Tasse", "fire-burner": "Herd", "kitchen-set": "Küche", "sink": "Spüle", "bath": "Badewanne",
    "shower": "Dusche", "toilet": "Toilette", "soap": "Seife", "spray-can-sparkles": "Putzspray", "broom": "Besen",
    "jug-detergent": "Waschmittel", "shirt": "Wäsche", "socks": "Socken", "bed": "Bett", "couch": "Sofa",
    "trash-can": "Mülleimer", "recycle": "Recycling", "dumpster": "Container", "cart-shopping": "Einkauf",
    "basket-shopping": "Korb", "box": "Paket", "envelope": "Post", "dog": "Hund", "cat": "Katze", "fish": "Fisch",
    "paw": "Haustier", "car": "Auto", "bicycle": "Fahrrad", "snowflake": "Winterdienst", "house": "Haus", "wrench": "Werkzeug"
  };
  var MEMBER_COLORS = ["#4ade80", "#facc15", "#a78bfa", "#f472b6", "#38bdf8", "#fb923c", "#2dd4bf", "#e879f9"];
  // Verteilung je Dienst (Konzept v1.1) – Werte wie lib/familyplan.js
  var ROTATION = [
    { v: "weekly", label: "Wöchentlich rotierend", max: 4, one: "jede Woche", many: "alle %n Wochen",
      hint: "Wechselt am Wechseltag (Einstellungen). Feste Tage gehen vor." },
    { v: "daily", label: "Täglich rotierend", max: 7, one: "jeden Tag", many: "alle %n Tage",
      hint: "Jeden Tag jemand anderes – an den markierten Wochentagen, ohne Auswahl an allen. Der Spiegel zeigt nur, wer heute dran ist." },
    { v: "monthly", label: "Monatlich rotierend", max: 6, one: "jeden Monat", many: "alle %n Monate",
      hint: "Wechselt am ersten Wechseltag im neuen Monat. Feste Tage gehen vor." },
    { v: "fixed", label: "Fest zugewiesen", max: 1,
      hint: "Keine Rotation: nur an den eingetragenen Tagen bei der eingetragenen Person – oder „Jeden Tag“ die ganze Woche. „Ganze Familie“ heißt: alle zusammen (z. B. Putzen am Freitag)." }
  ];
  function rotationOf(v) { return ROTATION.filter(function (x) { return x.v === v; })[0] || ROTATION[0]; }

  // ---------------------------------------------------------------------
  // Helfer
  // ---------------------------------------------------------------------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lum(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function textOn(hex) { return /^#[0-9a-f]{6}$/i.test(hex) && lum(hex) > 0.3 ? "#14161a" : "#ffffff"; }
  function dm(key) { var p = key.split("-"); return p[2] + "." + p[1] + "."; }
  function rangeText(w) { return dm(w.start) + " – " + dm(w.end) + w.end.slice(0, 4); }
  function memberById(id) { return (PLAN.allMembers || []).filter(function (m) { return m.id === id; })[0]; }
  function dutyById(id) { return (PLAN.allDuties || []).filter(function (d) { return d.id === id; })[0]; }
  function forWhom(roles) {
    var r = (roles || []).slice().sort().join(",");
    return r === "adult" ? "adult" : r === "child" ? "child" : "all";
  }

  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.form) init.body = opts.form;
    else if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ("HTTP " + res.status));
          err.conflict = !!data.conflict;
          err.plan = data.plan;
          throw err;
        }
        return data;
      });
    });
  }

  function apply(plan) {
    PLAN = plan;
    draftMembers = null; draftDuties = null; draftSettings = null;
    render();
    if (ctx.onPlanChange) ctx.onPlanChange(PLAN); // z. B. Personen-Auswahl auf „Wichtige Termine“
  }

  function fail(err) {
    if (err.conflict && err.plan) apply(err.plan); // anderes Gerät hat gespeichert: frischen Stand zeigen
    ctx.toast(err.message);
    var hint = $("#fp-hint");
    if (hint) hint.textContent = "Fehler: " + err.message;
  }

  function avatarEl(m, size) {
    var a = el("span", "fp-av", (m.name || "?").trim().charAt(0).toUpperCase());
    a.style.background = m.color;
    a.style.color = textOn(m.color);
    if (size) { a.style.width = a.style.height = size + "px"; }
    var src = null;
    if (m.avatar && m.avatar.type === "preset") src = "/avatars/" + m.avatar.value + ".jpg";
    if (m.avatar && m.avatar.type === "upload") src = "/avatar-uploads/" + m.avatar.file + "?v=" + (m.avatar.v || 0);
    if (src) {
      var img = el("img"); img.alt = ""; img.src = src;
      img.onerror = function () { img.remove(); };
      a.appendChild(img);
    }
    return a;
  }

  function icon(name) { var i = el("i", "fa-solid fa-" + name); i.setAttribute("aria-hidden", "true"); return i; }

  var DAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  // [1,2,3,4,5] → "Mo–Fr", [2] → "Di" (wie MMM-FamilyPlan/payload.js)
  function daysText(days) {
    if (!days || !days.length || days.length === 7) return "";
    var idx = [1, 2, 3, 4, 5, 6, 0].filter(function (n) { return days.indexOf(n) !== -1; }).map(function (n) { return (n + 6) % 7; });
    var runs = [];
    idx.forEach(function (i) { var last = runs[runs.length - 1]; if (last && i === last[1] + 1) last[1] = i; else runs.push([i, i]); });
    function nm(i) { return DAY_SHORT[(i + 1) % 7]; }
    return runs.map(function (r) { return r[1] - r[0] >= 2 ? nm(r[0]) + "–" + nm(r[1]) : r[0] === r[1] ? nm(r[0]) : nm(r[0]) + ", " + nm(r[1]); }).join(", ");
  }

  function pill(d) {
    var p = el("span", "fp-pill");
    p.style.background = d.color; p.style.color = textOn(d.color);
    p.appendChild(icon(d.icon)); p.appendChild(el("span", null, d.name));
    var dt = daysText(d.days);
    if (dt) p.appendChild(el("span", "fp-pill-days", dt));
    return p;
  }

  function swBtn(on, label, onChange) {
    var b = el("button", "sw"); b.type = "button";
    b.setAttribute("role", "switch"); b.setAttribute("aria-label", label);
    b.setAttribute("aria-checked", on ? "true" : "false");
    b.addEventListener("click", function () {
      var v = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", v ? "true" : "false");
      onChange(v);
    });
    return b;
  }

  function card(title, sub) {
    var c = el("div", "card");
    if (title) c.appendChild(el("h2", null, title));
    if (sub) c.appendChild(el("p", "sub", sub));
    return c;
  }

  function saveRow(label, onSave, hintText) {
    var row = el("div", "save-row");
    var b = el("button", "btn primary", label); b.type = "button";
    var h = el("span", "save-hint", hintText || ""); h.id = "fp-hint";
    b.addEventListener("click", function () { onSave(b, h); });
    row.appendChild(b); row.appendChild(h);
    return row;
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function render() {
    if (!PLAN) return;
    document.querySelectorAll(".fp-tab").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-fptab") === TAB ? "true" : "false");
    });
    var warn = $("#fp-warnings");
    warn.replaceChildren();
    (PLAN.warnings || []).forEach(function (w) { warn.appendChild(el("div", "setup-banner", "⚠ " + w)); });
    var panel = $("#fp-panel");
    panel.replaceChildren();
    ({ uebersicht: renderOverview, mitglieder: renderMembers, dienste: renderDuties, wochen: renderWeeks, einstellungen: renderSettings })[TAB](panel);
  }

  // ----- Übersicht -----
  function renderOverview(panel) {
    var s = ctx.getSettings().familyPlan || { enabled: false, layout: "stacked", maxWidth: "300px", scale: 100 };
    var mirror = card("Auf dem Spiegel", "Ein- und Ausschalten, Darstellung, Größe und Breite. Speichern startet MagicMirror einmal neu.");
    var t1 = el("div", "toggle");
    t1.appendChild(el("span", "tl2", "Familienplan anzeigen"));
    var enabled = !!s.enabled;
    t1.appendChild(swBtn(enabled, "Familienplan anzeigen", function (v) { enabled = v; }));
    mirror.appendChild(t1);
    var g = el("div", "grid2");
    var f1 = el("div", "field"); var l1 = el("label", null, "Dienste"); l1.htmlFor = "fp-layout";
    var sel = el("select"); sel.id = "fp-layout";
    [["stacked", "untereinander (schmal)"], ["inline", "nebeneinander (breiter)"]].forEach(function (o) {
      var opt = el("option", null, o[1]); opt.value = o[0]; if (s.layout === o[0]) opt.selected = true; sel.appendChild(opt);
    });
    f1.appendChild(l1); f1.appendChild(sel);
    var f2 = el("div", "field"); var l2 = el("label", null, "Maximalbreite"); l2.htmlFor = "fp-maxwidth";
    l2.appendChild(el("span", "opt", " (wie der bisherige Bereich)"));
    var inp = el("input", "mono-in"); inp.type = "text"; inp.id = "fp-maxwidth"; inp.value = s.maxWidth || "300px";
    f2.appendChild(l2); f2.appendChild(inp);
    var f3 = el("div", "field"); var l3 = el("label", null, "Größe auf dem Spiegel"); l3.htmlFor = "fp-scale";
    var sc = el("select"); sc.id = "fp-scale";
    [70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200].forEach(function (n) {
      var o = el("option", null, n + " %" + (n === 100 ? " (normal)" : n < 100 ? " – kleiner" : " – größer")); o.value = n;
      if ((Number(s.scale) || 100) === n) o.selected = true;
      sc.appendChild(o);
    });
    f3.appendChild(l3); f3.appendChild(sc);
    f3.appendChild(el("p", "save-hint", "Schrift, Bilder und Breite wachsen gleichmäßig mit."));
    g.appendChild(f1); g.appendChild(f2); g.appendChild(f3); mirror.appendChild(g);
    mirror.appendChild(saveRow("Speichern", function (btn, hint) {
      btn.disabled = true; hint.textContent = "Speichere …";
      ctx.api("/api/settings", { method: "POST", body: { familyPlan: { enabled: enabled, layout: sel.value, maxWidth: inp.value.trim(), scale: Number(sc.value) } } })
        .then(function (settings) { ctx.setSettings(settings); btn.disabled = false; hint.textContent = "Gespeichert – MagicMirror startet neu."; ctx.toast("Gespeichert"); })
        .catch(function (err) { btn.disabled = false; hint.textContent = "Fehler: " + err.message; });
    }));
    panel.appendChild(mirror);

    var w = PLAN.currentWeek;
    var wc = card(w ? "Laufende Woche · KW " + w.kw : "Laufende Woche", w ? rangeText(w) : null);
    if (!w) {
      wc.appendChild(el("p", "sub", PLAN.members.length ? "Die erste Woche wird angelegt, sobald die automatische Rotation läuft." : "Lege zuerst unter „Familienmitglieder“ die Familie an. Danach entsteht die erste Woche automatisch."));
      panel.appendChild(wc);
      return;
    }
    var ids = Object.keys(w.assign);
    var order = (PLAN.allMembers || []).map(function (m) { return m.id; });
    ids.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    var maxSlots = 0;
    ids.forEach(function (id) { maxSlots = Math.max(maxSlots, w.assign[id].length); });
    var used = (PLAN.allDuties || []).filter(function (d) {
      return ids.some(function (id) { return w.assign[id].indexOf(d.id) !== -1; });
    });
    var wrap = el("div", "fp-scroll");
    var t = el("table", "fp-table");
    var hr = el("tr"); hr.appendChild(el("th", null, "Mitglied"));
    for (var s2 = 0; s2 < maxSlots; s2++) hr.appendChild(el("th", null, "Dienst " + (s2 + 1)));
    var thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody");
    ids.forEach(function (id) {
      var m = memberById(id) || { name: "?", color: "#9ca3af" };
      var tr = el("tr");
      var c0 = el("td"); var who = el("span", "fp-who"); who.appendChild(avatarEl(m, 30)); who.appendChild(el("span", null, m.name));
      c0.appendChild(who); tr.appendChild(c0);
      for (var i = 0; i < maxSlots; i++) {
        var td = el("td");
        var did = w.assign[id][i];
        if (did) td.appendChild(slotSelect(w, id, i, did, used));
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    // Nur Tagesdienste (alles täglich/fest nach Tag): keine leere Wochentabelle
    if (maxSlots) {
      wc.appendChild(wrap);
      wc.appendChild(el("p", "save-hint fp-gap", "Wählst du einen Dienst, den schon jemand hat, tauschen die beiden. Wirkt sofort auf dem Spiegel."));
    }
    var dg = dayGrid(w, true);
    if (dg) wc.appendChild(dg);
    var row = el("div", "save-row");
    if (w.manual || w.manualDays) {
      var rs = el("button", "btn", "↺ Automatische Verteilung wiederherstellen"); rs.type = "button";
      rs.addEventListener("click", function () {
        api("/api/familyplan/weeks/" + w.start + "/reset", { method: "POST", body: { revision: PLAN.revision } })
          .then(function (p) { apply(p); ctx.toast("Automatische Verteilung wiederhergestellt"); }).catch(fail);
      });
      row.appendChild(rs);
    }
    var rg = el("button", "btn", "Aktuelle Woche neu verteilen"); rg.type = "button";
    rg.addEventListener("click", function () {
      if (!confirm("Die laufende Woche wird neu berechnet, manuelle Änderungen gehen verloren. Fortfahren?")) return;
      api("/api/familyplan/regenerate", { method: "POST", body: { revision: PLAN.revision, scope: "current", confirm: true } })
        .then(function (p) { apply(p); ctx.toast("Woche neu verteilt"); }).catch(fail);
    });
    row.appendChild(rg);
    wc.appendChild(row);
    panel.appendChild(wc);
  }

  function slotSelect(w, memberId, slot, did, used) {
    var wrap = el("div", "fp-cell");
    var sel = el("select", "fp-psel"); sel.id = "fp-slot-" + memberId + "-" + slot;
    var m = memberById(memberId);
    sel.setAttribute("aria-label", (m ? m.name : "") + ", Dienst " + (slot + 1));
    used.forEach(function (d) {
      var o = el("option", null, d.name); o.value = d.id; if (d.id === did) o.selected = true;
      o.dataset.icon = d.icon || "circle-question"; o.dataset.color = d.color;
      sel.appendChild(o);
    });
    // Im Knopf nur Text – Farbe und Symbol zeigt das Feld drumherum
    sel.setAttribute("data-lx-trigger", "text");
    // Farbiges Feld mit Dienst-Symbol; das Auswahlfeld selbst ist durchsichtig
    var d0 = dutyById(did) || { color: "#9ca3af", icon: "circle-question" };
    var box = el("span", "fp-pselbox");
    box.style.background = d0.color; box.style.color = textOn(d0.color);
    box.appendChild(icon(d0.icon || "circle-question"));
    box.appendChild(sel);
    sel.addEventListener("change", function () {
      api("/api/familyplan/weeks/" + w.start + "/assign", { method: "POST", body: { revision: PLAN.revision, memberId: memberId, slot: slot, dutyId: sel.value } })
        .then(function (p) { apply(p); ctx.toast("Gespeichert"); }).catch(fail);
    });
    wrap.appendChild(box);
    var auto = w.auto[memberId] || [];
    if (w.manual && auto.indexOf(did) === -1) wrap.appendChild(el("span", "fp-manual", "✎ manuell"));
    return wrap;
  }

  // ----- Familienmitglieder -----
  function renderMembers(panel) {
    if (!draftMembers) draftMembers = clone(PLAN.members);
    var c = card("Familienmitglieder", "Die Familie an einer Stelle: anlegen, Rolle festlegen, Avatar wählen. Kinder bekommen nur Dienste, die für Kinder freigegeben sind.");
    var list = el("div", "fp-list");
    draftMembers.forEach(function (m, i) { list.appendChild(memberRow(m, i)); });
    if (!draftMembers.length) list.appendChild(el("p", "save-hint", "Noch niemand angelegt."));
    c.appendChild(list);
    var actions = el("div", "fp-actions");
    var add = el("button", "btn-add", "+ Mitglied hinzufügen"); add.type = "button";
    add.disabled = draftMembers.length >= 8;
    add.addEventListener("click", function () {
      var usedColors = draftMembers.map(function (m) { return m.color; });
      var color = MEMBER_COLORS.filter(function (x) { return usedColors.indexOf(x) === -1; })[0] || MEMBER_COLORS[0];
      draftMembers.push({ name: "", role: "child", color: color, avatar: { type: "initials" }, active: true });
      renderTab();
      var inputs = document.querySelectorAll(".fp-name-in");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    actions.appendChild(add);
    c.appendChild(actions);
    c.appendChild(saveRow("Speichern", function (btn, hint) {
      btn.disabled = true; hint.textContent = "Speichere …";
      api("/api/familyplan/members", { method: "PUT", body: { revision: PLAN.revision, members: draftMembers } })
        .then(function (p) { apply(p); ctx.toast(p.restarted ? "Gespeichert – Geburtstag umbenannt, Spiegel startet neu" : "Mitglieder gespeichert"); })
        .catch(function (err) { btn.disabled = false; fail(err); });
    }, "Wirkt sofort, Änderungen an Personen gelten ab der nächsten Woche. Geburtstage trägst du unter „Wichtige Termine“ ein."));
    panel.appendChild(c);
  }

  function dirtyMembers() { return draftMembers && JSON.stringify(draftMembers) !== JSON.stringify(PLAN.members); }

  function memberRow(m, i) {
    var box = el("div", "fp-mrow-wrap");
    var row = el("div", "fp-mrow");
    var avBtn = el("button", "fp-avbtn"); avBtn.type = "button"; avBtn.title = "Avatar wählen";
    avBtn.setAttribute("aria-label", "Avatar für " + (m.name || "neues Mitglied") + " wählen");
    avBtn.appendChild(avatarEl(m, 40));
    avBtn.addEventListener("click", function () { openPicker = openPicker === i ? null : i; openAway = null; renderTab(); });
    row.appendChild(avBtn);

    var name = el("input", "fp-name-in"); name.type = "text"; name.maxLength = 30; name.placeholder = "Name";
    name.id = "fp-mname-" + i; name.value = m.name; name.setAttribute("aria-label", "Name");
    name.addEventListener("input", function () { m.name = name.value; });
    row.appendChild(name);

    var role = el("select", "fp-small"); role.id = "fp-mrole-" + i; role.setAttribute("aria-label", "Rolle");
    ["adult", "child"].forEach(function (r) { var o = el("option", null, ROLE_LABEL[r]); o.value = r; if (m.role === r) o.selected = true; role.appendChild(o); });
    role.addEventListener("change", function () { m.role = role.value; });
    row.appendChild(role);

    var color = el("input", "fp-color"); color.type = "color"; color.value = m.color; color.id = "fp-mcolor-" + i;
    color.setAttribute("aria-label", "Farbe");
    color.addEventListener("input", function () { m.color = color.value; var av = $(".fp-av", avBtn); av.style.background = m.color; av.style.color = textOn(m.color); });
    row.appendChild(color);

    var awayBtn = el("button", "btn-x fp-txt fp-awaybtn" + (awayText(m) ? " has-away" : "")); awayBtn.type = "button";
    awayBtn.appendChild(icon("plane-departure"));
    awayBtn.appendChild(el("span", null, awayText(m) || "nicht da …"));
    awayBtn.title = "An bestimmten Tagen befreit (nicht zu Hause)";
    awayBtn.setAttribute("aria-expanded", openAway === i ? "true" : "false");
    awayBtn.addEventListener("click", function () { openAway = openAway === i ? null : i; openPicker = null; renderTab(); });
    row.appendChild(awayBtn);

    var act = swBtn(m.active !== false, "Aktiv", function (v) { m.active = v; });
    act.title = "Aktiv (aus = pausiert, z. B. Urlaub)";
    row.appendChild(act);

    row.appendChild(moveButtons(draftMembers, i));
    var del = el("button", "btn-x", "✕"); del.type = "button"; del.title = "Entfernen"; del.setAttribute("aria-label", "Entfernen");
    del.addEventListener("click", function () { draftMembers.splice(i, 1); openPicker = null; renderTab(); });
    row.appendChild(del);
    box.appendChild(row);
    if (openPicker === i) box.appendChild(avatarPicker(m, i));
    if (openAway === i) box.appendChild(awayEditor(m, i));
    return box;
  }

  // ----- „Nicht zu Hause“: regelmäßig an Wochentagen oder in Zeiträumen -----
  function isoToDe(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : ""; }
  function deToIso(de) {
    var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(de || "").trim());
    if (!m) return "";
    var d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (d.getMonth() !== +m[2] - 1) return "";
    return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  }
  function todayIso() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function awayText(m) {
    var parts = [];
    var dt = daysText(m.awayDays || []);
    if (m.awayDays && m.awayDays.length === 7) dt = "immer";
    if (dt) parts.push(dt);
    var t = todayIso();
    var upcoming = (m.awayDates || []).filter(function (x) { return x.to >= t; });
    if (upcoming.length) {
      var x = upcoming[0];
      parts.push(x.from === x.to ? dm(x.from) : dm(x.from) + "–" + dm(x.to));
      if (upcoming.length > 1) parts.push("+" + (upcoming.length - 1));
    }
    return parts.length ? "nicht da: " + parts.join(" · ") : "";
  }

  function awayEditor(m, i) {
    if (!Array.isArray(m.awayDays)) m.awayDays = [];
    if (!Array.isArray(m.awayDates)) m.awayDates = [];
    var box = el("div", "fp-picker fp-away");
    box.appendChild(el("p", "save-hint", "An diesen Tagen bekommt " + (m.name || "die Person") + " keine Tagesdienste. Ein fester Dienst an so einem Tag geht an jemand Anwesenden; wer die ganze Woche weg ist, bekommt auch keinen Wochendienst. Wirkt nach dem Speichern sofort."));

    var l1 = el("div", "fp-away-l", "Regelmäßig nicht da");
    box.appendChild(l1);
    var days = el("div", "fp-days"); days.setAttribute("role", "group"); days.setAttribute("aria-label", "Regelmäßig nicht da");
    [1, 2, 3, 4, 5, 6, 0].forEach(function (n) {
      var b = el("button", "fp-day", DAY_SHORT[n]); b.type = "button";
      b.setAttribute("aria-pressed", m.awayDays.indexOf(n) !== -1 ? "true" : "false");
      b.addEventListener("click", function () {
        var k = m.awayDays.indexOf(n);
        if (k === -1) m.awayDays.push(n); else m.awayDays.splice(k, 1);
        renderTab();
      });
      days.appendChild(b);
    });
    box.appendChild(days);

    box.appendChild(el("div", "fp-away-l", "Zeiträume (z. B. Urlaub, Klassenfahrt)"));
    var list = el("div", "fp-away-list");
    m.awayDates.forEach(function (x, k) {
      var row = el("div", "fp-away-r");
      ["from", "to"].forEach(function (key, j) {
        var inp = el("input", "mono-in"); inp.type = "text"; inp.placeholder = "TT.MM.JJJJ"; inp.inputMode = "numeric";
        inp.id = "fp-away-" + i + "-" + k + "-" + key;
        inp.setAttribute("aria-label", key === "from" ? "von" : "bis");
        inp.value = isoToDe(x[key]);
        inp.addEventListener("change", function () {
          var iso = deToIso(inp.value);
          x[key] = iso;
          if (key === "from" && iso && (!x.to || x.to < iso)) { x.to = iso; renderTab(); }
        });
        var holder = el("span", "fp-away-d");
        holder.appendChild(inp);
        row.appendChild(holder);
        if (ctx.datePicker) ctx.datePicker(inp, { withYear: true });
        if (j === 0) row.appendChild(el("span", "save-hint", "bis"));
      });
      var del = el("button", "btn-x", "✕"); del.type = "button"; del.setAttribute("aria-label", "Zeitraum entfernen");
      del.addEventListener("click", function () { m.awayDates.splice(k, 1); renderTab(); });
      row.appendChild(del);
      list.appendChild(row);
    });
    box.appendChild(list);
    var add = el("button", "btn-add", "+ Zeitraum"); add.type = "button";
    add.disabled = m.awayDates.length >= 12;
    add.addEventListener("click", function () { var t = todayIso(); m.awayDates.push({ from: t, to: t }); renderTab(); });
    box.appendChild(add);
    return box;
  }

  function moveButtons(list, i) {
    var w = el("span", "fp-move");
    var up = el("button", "btn-x", "▲"); up.type = "button"; up.disabled = i === 0; up.setAttribute("aria-label", "Nach oben");
    var dn = el("button", "btn-x", "▼"); dn.type = "button"; dn.disabled = i === list.length - 1; dn.setAttribute("aria-label", "Nach unten");
    up.addEventListener("click", function () { var t = list[i - 1]; list[i - 1] = list[i]; list[i] = t; openPicker = null; renderTab(); });
    dn.addEventListener("click", function () { var t = list[i + 1]; list[i + 1] = list[i]; list[i] = t; openPicker = null; renderTab(); });
    w.appendChild(up); w.appendChild(dn);
    return w;
  }

  function avatarPicker(m, i) {
    var box = el("div", "fp-picker");
    var grid = el("div", "fp-picker-grid");
    var own = PRESETS.filter(function (p) { return p.indexOf(m.role + "-") === 0; });
    var other = PRESETS.filter(function (p) { return p.indexOf(m.role + "-") !== 0; });
    var ini = el("button", "fp-pick" + (m.avatar.type === "initials" ? " sel" : "")); ini.type = "button";
    ini.appendChild(avatarEl({ name: m.name || "?", color: m.color, avatar: { type: "initials" } }, 44));
    ini.title = "Initialen";
    ini.addEventListener("click", function () { m.avatar = { type: "initials" }; openPicker = null; renderTab(); });
    grid.appendChild(ini);
    own.concat(other).forEach(function (p) {
      var b = el("button", "fp-pick" + (m.avatar.type === "preset" && m.avatar.value === p ? " sel" : "")); b.type = "button";
      b.title = p;
      b.appendChild(avatarEl({ name: m.name || "?", color: m.color, avatar: { type: "preset", value: p } }, 44));
      b.addEventListener("click", function () { m.avatar = { type: "preset", value: p }; openPicker = null; renderTab(); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    var row = el("div", "fp-picker-row");
    if (m.id) {
      var lab = el("label", "btn fp-file", "Eigenes Foto hochladen …");
      var inp = el("input"); inp.type = "file"; inp.accept = "image/png,image/jpeg,image/webp"; inp.id = "fp-photo-" + i;
      lab.appendChild(inp);
      inp.addEventListener("change", function () { if (inp.files && inp.files[0]) uploadPhoto(m, inp.files[0]); });
      row.appendChild(lab);
      if (m.avatar.type === "upload") {
        var rm = el("button", "btn", "Foto entfernen"); rm.type = "button";
        rm.addEventListener("click", function () {
          api("/api/familyplan/avatar/" + m.id, { method: "DELETE" }).then(function (p) { apply(p); ctx.toast("Foto entfernt"); }).catch(fail);
        });
        row.appendChild(rm);
      }
    } else {
      row.appendChild(el("span", "save-hint", "Eigenes Foto geht nach dem ersten Speichern."));
    }
    box.appendChild(row);
    return box;
  }

  // Foto im Browser zuschneiden (rund, Ausschnitt und Zoom frei wählbar,
  // cropper.js) und als 256 × 256 JPEG hochladen – der Pi braucht so keine
  // Bildbibliothek.
  function uploadPhoto(m, file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { ctx.toast("Bitte ein PNG-, JPG- oder WebP-Bild wählen"); return; }
    if (dirtyMembers()) { ctx.toast("Bitte zuerst die anderen Änderungen speichern"); return; }
    window.LumiraCrop.open({ file: file, aspect: 1, round: true, out: { width: 256, height: 256 }, quality: 0.88, title: "Profilbild für " + (m.name || "Mitglied") })
      .then(function (blob) {
        if (!blob) return; // abgebrochen
        var form = new FormData();
        form.append("avatar", blob, "avatar.jpg");
        return api("/api/familyplan/avatar/" + m.id, { method: "POST", form: form })
          .then(function (p) { openPicker = null; apply(p); ctx.toast("Foto gespeichert"); });
      })
      .catch(fail);
  }

  // ----- Dienste -----
  function renderDuties(panel) {
    if (!draftDuties) draftDuties = clone(PLAN.duties);
    var c = card("Dienste", "Name, Farbe, Symbol, für wen der Dienst gilt und wie er verteilt wird: wöchentlich, täglich oder monatlich rotierend oder fest – auch fest nach Wochentag (z. B. Kochdienst Mo Franzi, Di Marcel). Pausierte Dienste werden nicht verteilt (z. B. Garten im Winter).");
    var list = el("div", "fp-list");
    draftDuties.forEach(function (d, i) { list.appendChild(dutyRow(d, i)); });
    c.appendChild(list);
    var add = el("button", "btn-add", "+ Dienst hinzufügen"); add.type = "button";
    add.disabled = draftDuties.length >= 16;
    add.addEventListener("click", function () {
      draftDuties.push({ name: "", color: "#38bdf8", icon: "house", roles: ["adult", "child"], active: true, rotation: "weekly", every: 1, fixed: [] });
      renderTab();
      var inputs = document.querySelectorAll(".fp-dname-in");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    c.appendChild(add);
    c.appendChild(saveRow("Speichern", function (btn, hint) {
      btn.disabled = true; hint.textContent = "Speichere …";
      api("/api/familyplan/duties", { method: "PUT", body: { revision: PLAN.revision, duties: draftDuties } })
        .then(function (p) { apply(p); ctx.toast("Dienste gespeichert"); })
        .catch(function (err) { btn.disabled = false; fail(err); });
    }, "Name, Farbe und Symbol wirken sofort, die Verteilung ändert sich ab der nächsten Woche (sofort: Übersicht → „Aktuelle Woche neu verteilen“)."));
    panel.appendChild(c);
  }

  function dutyRow(d, i) {
    var box = el("div", "fp-dwrap");
    var row = el("div", "fp-drow");
    box.appendChild(row);
    var preview = el("span", "fp-dprev");
    function refresh() { preview.replaceChildren(pill({ name: d.name || "Neuer Dienst", color: d.color, icon: d.icon, days: d.days })); }
    refresh();
    row.appendChild(preview);

    var name = el("input", "fp-dname-in"); name.type = "text"; name.maxLength = 30; name.placeholder = "Name";
    name.id = "fp-dname-" + i; name.value = d.name; name.setAttribute("aria-label", "Name");
    name.addEventListener("input", function () { d.name = name.value; refresh(); });
    row.appendChild(name);

    var color = el("input", "fp-color"); color.type = "color"; color.value = d.color; color.id = "fp-dcolor-" + i;
    color.setAttribute("aria-label", "Farbe");
    color.addEventListener("input", function () { d.color = color.value; refresh(); });
    row.appendChild(color);

    row.appendChild(iconPicker(d.icon, "fp-dicon-" + i, function (n) { d.icon = n; refresh(); }));

    var who = el("select", "fp-small"); who.id = "fp-droles-" + i; who.setAttribute("aria-label", "Für wen");
    FOR_WHOM.forEach(function (f) { var o = el("option", null, f.label); o.value = f.v; if (forWhom(d.roles) === f.v) o.selected = true; who.appendChild(o); });
    who.addEventListener("change", function () { d.roles = FOR_WHOM.filter(function (f) { return f.v === who.value; })[0].roles.slice(); });
    row.appendChild(who);

    // Feste Wochentage (leer = ganze Woche)
    var daysBox = el("div", "fp-days");
    daysBox.setAttribute("role", "group");
    daysBox.setAttribute("aria-label", "Wochentage, leer = ganze Woche");
    daysBox.title = d.rotation === "daily" ? "An diesen Tagen rotiert der Dienst – ohne Auswahl jeden Tag" : "Feste Tage – ohne Auswahl gilt der Dienst die ganze Woche";
    // „Fest“: die Tage ergeben sich aus den Zuweisungen
    if (d.rotation === "fixed") daysBox.hidden = true;
    if (!Array.isArray(d.days)) d.days = [];
    [1, 2, 3, 4, 5, 6, 0].forEach(function (n) {
      var b = el("button", "fp-day", DAY_SHORT[n]); b.type = "button";
      b.setAttribute("aria-pressed", d.days.indexOf(n) !== -1 ? "true" : "false");
      b.addEventListener("click", function () {
        var k = d.days.indexOf(n);
        if (k === -1) d.days.push(n); else d.days.splice(k, 1);
        b.setAttribute("aria-pressed", k === -1 ? "true" : "false");
        refresh();
      });
      daysBox.appendChild(b);
    });
    row.appendChild(daysBox);
    row.appendChild(swBtn(d.active !== false, "Aktiv", function (v) { d.active = v; }));
    row.appendChild(moveButtons(draftDuties, i));
    var del = el("button", "btn-x", "✕"); del.type = "button"; del.title = "Entfernen"; del.setAttribute("aria-label", "Entfernen");
    del.addEventListener("click", function () { draftDuties.splice(i, 1); renderTab(); });
    row.appendChild(del);
    box.appendChild(rotationEditor(d, i));
    return box;
  }

  // Zweite Zeile je Dienst: Verteilung, Rhythmus, feste Zuweisungen
  function rotationEditor(d, i) {
    if (!d.rotation) d.rotation = "weekly";
    if (!Array.isArray(d.fixed)) d.fixed = [];
    var R = rotationOf(d.rotation);
    var box = el("div", "fp-drot");
    var line = el("div", "fp-drot-line");

    var mode = el("select", "fp-small"); mode.id = "fp-drotm-" + i; mode.setAttribute("aria-label", "Verteilung");
    ROTATION.forEach(function (x) { var o = el("option", null, x.label); o.value = x.v; if (x.v === d.rotation) o.selected = true; mode.appendChild(o); });
    mode.addEventListener("change", function () {
      d.rotation = mode.value;
      d.every = 1;
      // Fest ohne Eintrag: gleich eine Zeile anbieten
      if (d.rotation === "fixed" && !d.fixed.length && PLAN.members.length) d.fixed.push({ day: -1, memberId: PLAN.members[0].id });
      renderTab();
    });
    line.appendChild(mode);

    if (d.rotation !== "fixed") {
      var every = el("select", "fp-small"); every.id = "fp-devery-" + i; every.setAttribute("aria-label", "Rhythmus");
      for (var n = 1; n <= R.max; n++) {
        var o = el("option", null, n === 1 ? R.one : R.many.replace("%n", n)); o.value = n;
        if ((d.every || 1) === n) o.selected = true;
        every.appendChild(o);
      }
      every.addEventListener("change", function () { d.every = Number(every.value); });
      line.appendChild(every);
    }
    box.appendChild(line);

    // Feste Zuweisungen: Wochentag (oder jeden Tag) → Person
    var list = el("div", "fp-fixed");
    if (d.fixed.length) list.appendChild(el("span", "fp-fixed-h", d.rotation === "fixed" ? "Fest bei" : "Feste Tage (gehen vor)"));
    d.fixed.forEach(function (f, k) {
      var fr = el("div", "fp-fixed-r");
      var day = el("select", "fp-small"); day.id = "fp-fday-" + i + "-" + k; day.setAttribute("aria-label", "Wochentag");
      [[-1, "Jeden Tag"], [1, "Montag"], [2, "Dienstag"], [3, "Mittwoch"], [4, "Donnerstag"], [5, "Freitag"], [6, "Samstag"], [0, "Sonntag"]].forEach(function (x) {
        var o = el("option", null, x[1]); o.value = x[0]; if (f.day === x[0]) o.selected = true; day.appendChild(o);
      });
      day.addEventListener("change", function () { f.day = Number(day.value); renderTab(); });
      fr.appendChild(day);
      var who = el("select", "fp-small"); who.id = "fp-fmem-" + i + "-" + k; who.setAttribute("aria-label", "Person");
      var allOpt = el("option", null, "Ganze Familie"); allOpt.value = "*"; allOpt.dataset.icon = "users";
      if (f.memberId === "*") allOpt.selected = true;
      who.appendChild(allOpt);
      PLAN.members.forEach(function (m) {
        var o = el("option", null, m.name + (m.active === false ? " (pausiert)" : "")); o.value = m.id;
        if (f.memberId === m.id) o.selected = true;
        o.dataset.color = m.color; o.dataset.initial = (m.name || "?").charAt(0).toUpperCase();
        who.appendChild(o);
      });
      who.addEventListener("change", function () { f.memberId = who.value; });
      fr.appendChild(who);
      var x = el("button", "btn-x", "✕"); x.type = "button"; x.setAttribute("aria-label", "Feste Zuweisung entfernen");
      x.addEventListener("click", function () { d.fixed.splice(k, 1); renderTab(); });
      fr.appendChild(x);
      list.appendChild(fr);
    });
    var allDay = d.fixed.some(function (f) { return f.day === -1; });
    if (!allDay && d.fixed.length < 7) {
      var add = el("button", "btn-x fp-txt", d.fixed.length ? "+ weiterer Tag" : "+ Feste Zuweisung"); add.type = "button";
      add.disabled = !PLAN.members.length;
      add.title = PLAN.members.length ? "Person an einem Wochentag fest eintragen" : "Erst Familienmitglieder anlegen und speichern";
      add.addEventListener("click", function () {
        var used = d.fixed.map(function (f) { return f.day; });
        var free = [1, 2, 3, 4, 5, 6, 0].filter(function (n) { return used.indexOf(n) === -1; })[0];
        d.fixed.push({ day: free === undefined ? 1 : free, memberId: PLAN.members[0].id });
        renderTab();
      });
      list.appendChild(add);
    }
    box.appendChild(list);
    // Wöchentlich ist der Normalfall – den Hinweis nur bei den anderen Arten
    if (d.rotation !== "weekly" || d.fixed.length) box.appendChild(el("p", "save-hint fp-drot-hint", R.hint));
    return box;
  }

  // Eigene Symbolauswahl statt <select>: Knopf mit Symbol + Name, darunter
  // ein Raster mit allen Symbolen. Pfeiltasten wandern durchs Raster,
  // Enter wählt, Esc oder ein Klick daneben schließt.
  var ICON_COLS = 6;

  function closeIconPickers(except) {
    document.querySelectorAll(".fp-icpick.open").forEach(function (p) {
      if (p === except) return;
      p.classList.remove("open");
      p.querySelector(".fp-icbtn").setAttribute("aria-expanded", "false");
    });
  }

  function iconPicker(current, id, onPick) {
    var wrap = el("div", "fp-icpick");
    var btn = el("button", "fp-icbtn"); btn.type = "button"; btn.id = id;
    btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Symbol: " + (ICON_LABEL[current] || current));
    function paintBtn(n) {
      btn.replaceChildren(icon(n), el("span", "fp-icname", ICON_LABEL[n] || n), el("span", "fp-icchev", "▾"));
    }
    paintBtn(current);

    var pop = el("div", "fp-icpop"); pop.setAttribute("role", "listbox"); pop.setAttribute("aria-label", "Symbol wählen");
    var opts = (PLAN.icons || []).map(function (n) {
      var o = el("button", "fp-icopt"); o.type = "button"; o.setAttribute("role", "option");
      o.setAttribute("aria-selected", n === current ? "true" : "false");
      o.title = ICON_LABEL[n] || n;
      o.appendChild(icon(n)); o.appendChild(el("span", null, ICON_LABEL[n] || n));
      o.addEventListener("click", function () {
        current = n;
        opts.forEach(function (x) { x.setAttribute("aria-selected", x === o ? "true" : "false"); });
        paintBtn(n);
        btn.setAttribute("aria-label", "Symbol: " + (ICON_LABEL[n] || n));
        close(true);
        onPick(n);
      });
      pop.appendChild(o);
      return o;
    });

    function open() {
      closeIconPickers(wrap);
      wrap.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      // Nach links bzw. oben ausweichen, wenn rechts/unten kein Platz ist
      pop.classList.remove("to-left", "to-top");
      var r = pop.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) pop.classList.add("to-left");
      if (r.bottom > window.innerHeight - 8 && btn.getBoundingClientRect().top > r.height + 16) pop.classList.add("to-top");
      var sel = pop.querySelector('[aria-selected="true"]') || opts[0];
      if (sel) { sel.scrollIntoView({ block: "nearest" }); sel.focus(); }
    }
    function close(focusBtn) {
      wrap.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      if (focusBtn) btn.focus();
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (wrap.classList.contains("open")) close(false); else open();
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    pop.addEventListener("keydown", function (e) {
      var i = opts.indexOf(document.activeElement);
      var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: ICON_COLS, ArrowUp: -ICON_COLS }[e.key];
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key === "Tab") { close(false); return; }
      if (step && i !== -1) {
        e.preventDefault();
        var t = opts[Math.min(opts.length - 1, Math.max(0, i + step))];
        t.focus();
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(pop);
    return wrap;
  }

  // ----- Wochenplan -----
  var editWeek = null;   // Startdatum der Woche, die gerade bearbeitet wird
  var whyWeek = null;    // Startdatum der Woche mit aufgeklappter Begründung

  function sortedIds(assign) {
    var order = (PLAN.allMembers || []).map(function (m) { return m.id; });
    return Object.keys(assign).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
  }

  // w: { start, kw, assign, auto?, manual?, reasons? }; mode: "current" | "preview" | "past"
  function weekCard(w, mode) {
    var c = el("div", "fp-week" + (mode === "current" ? " current" : "") + (w.manual ? " changed" : ""));
    var h = el("div", "fp-week-h", "KW " + w.kw);
    var sub = mode === "current" ? " · läuft · " + rangeText(w) : mode === "preview" ? " · Vorschau ab " + dm(w.start) : " · " + rangeText(w);
    h.appendChild(el("span", null, sub));
    if (w.manual) h.appendChild(el("span", "fp-manual", " ✎ geändert"));
    c.appendChild(h);

    var editing = editWeek === w.start && mode !== "past";
    var ids = sortedIds(w.assign);
    var used = (PLAN.allDuties || []).filter(function (d) {
      return ids.some(function (id) { return w.assign[id].indexOf(d.id) !== -1; });
    });
    ids.forEach(function (id) {
      var m = memberById(id); if (!m) return;
      var r = el("div", "fp-week-r" + (editing ? " editing" : ""));
      r.appendChild(avatarEl(m, 22)); r.appendChild(el("span", "fp-week-n", m.name));
      var ps = el("span", "fp-week-p");
      w.assign[id].forEach(function (did, slot) {
        if (editing) { ps.appendChild(slotSelect(w, id, slot, did, used)); return; }
        var d = dutyById(did); if (!d) return;
        var p = pill(d);
        if (w.reasons && w.reasons[id] && w.reasons[id][did]) p.title = w.reasons[id][did];
        ps.appendChild(p);
      });
      if (!w.assign[id].length) ps.appendChild(el("span", "save-hint", "frei"));
      r.appendChild(ps); c.appendChild(r);
    });

    // Schmale Karte: kompakt (Symbol + Avatare), Tage ändert man in der Übersicht
    var grid = dayGrid(w, false, true);
    if (grid) {
      c.appendChild(grid);
      if (editing && mode === "current") c.appendChild(el("p", "save-hint", "Einzelne Tage änderst du in der Übersicht."));
    }

    if (whyWeek === w.start && w.reasons) {
      var why = el("div", "fp-why");
      ids.forEach(function (id) {
        var m = memberById(id); if (!m) return;
        w.assign[id].forEach(function (did) {
          var d = dutyById(did); if (!d) return;
          var line = el("div");
          line.appendChild(el("b", null, m.name + " · " + d.name + ": "));
          line.appendChild(document.createTextNode((w.reasons[id] || {})[did] || ""));
          why.appendChild(line);
        });
      });
      c.appendChild(why);
    }

    if (mode !== "past") {
      var actions = el("div", "fp-week-a");
      var eb = el("button", "btn-x fp-txt", editing ? "Fertig" : "Bearbeiten"); eb.type = "button";
      eb.addEventListener("click", function () { editWeek = editing ? null : w.start; renderTab(); });
      actions.appendChild(eb);
      if (w.reasons) {
        var wb = el("button", "btn-x fp-txt", whyWeek === w.start ? "Begründung ausblenden" : "Warum so?"); wb.type = "button";
        wb.addEventListener("click", function () { whyWeek = whyWeek === w.start ? null : w.start; renderTab(); });
        actions.appendChild(wb);
      }
      if (w.manual || w.manualDays) {
        var rb = el("button", "btn-x fp-txt", "↺ automatisch"); rb.type = "button";
        rb.addEventListener("click", function () {
          api("/api/familyplan/weeks/" + w.start + "/reset", { method: "POST", body: { revision: PLAN.revision } })
            .then(function (p) { apply(p); ctx.toast("Automatische Verteilung wiederhergestellt"); }).catch(fail);
        });
        actions.appendChild(rb);
      }
      c.appendChild(actions);
    }
    return c;
  }

  // Tagesplan einer Woche: Dienste, die täglich wechseln oder fest an
  // einzelnen Tagen liegen – je Tag die Person (laufende Woche änderbar)
  var DAY_HEAD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  function dayGrid(w, editable, compact) {
    var days = w.days || {};
    var duties = (PLAN.allDuties || []).filter(function (d) { return days[d.id] && Object.keys(days[d.id]).length; });
    if (!duties.length || !w.dates) return null;
    var todayKey = PLAN.currentWeek && PLAN.currentWeek.todayKey;
    var box = el("div", "fp-daygrid-wrap");
    box.appendChild(el("div", "fp-daygrid-h", "Tagesdienste"));
    var scroll = el("div", "fp-scroll");
    var t = el("table", "fp-table fp-daygrid" + (compact ? " compact" : ""));
    var hr = el("tr"); hr.appendChild(el("th", null, ""));
    w.dates.forEach(function (k) {
      var p = k.split("-");
      var th = el("th", k === todayKey ? "is-today" : null, DAY_HEAD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]);
      if (!compact) th.appendChild(el("small", null, " " + p[2] + "."));
      th.title = dm(k);
      hr.appendChild(th);
    });
    var thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody");
    duties.forEach(function (d) {
      var tr = el("tr");
      var c0 = el("td");
      if (compact) {
        var ic = el("span", "fp-dg-ico"); ic.title = d.name;
        ic.style.background = d.color; ic.style.color = textOn(d.color);
        ic.appendChild(icon(d.icon));
        c0.appendChild(ic);
      } else {
        c0.appendChild(pill({ name: d.name, color: d.color, icon: d.icon }));
      }
      tr.appendChild(c0);
      w.dates.forEach(function (k) {
        var td = el("td", k === todayKey ? "is-today" : null);
        var has = Object.prototype.hasOwnProperty.call(days[d.id], k);
        var pid = days[d.id][k];
        var manual = w.manualDays && w.manualDays[d.id] && w.manualDays[d.id][k] !== undefined;
        if (!has) { td.appendChild(el("span", "fp-dg-none", "")); tr.appendChild(td); return; }
        if (editable) {
          var sel = el("select", "fp-dg-sel"); sel.id = "fp-dg-" + d.id + "-" + k;
          sel.setAttribute("aria-label", d.name + " am " + dm(k));
          var oa = el("option", null, "Alle"); oa.value = "*"; oa.dataset.icon = "users"; if (pid === "*") oa.selected = true;
          sel.appendChild(oa);
          PLAN.members.filter(function (m) { return m.active !== false; }).forEach(function (m) {
            var o = el("option", null, m.name); o.value = m.id; if (m.id === pid) o.selected = true;
            o.dataset.color = m.color; o.dataset.initial = (m.name || "?").charAt(0).toUpperCase();
            sel.appendChild(o);
          });
          if (!pid) { var o0 = el("option", null, "– frei –"); o0.value = ""; o0.selected = true; o0.disabled = true; sel.insertBefore(o0, sel.firstChild); }
          sel.addEventListener("change", function () {
            api("/api/familyplan/weeks/" + w.start + "/day", { method: "POST", body: { revision: PLAN.revision, dutyId: d.id, date: k, memberId: sel.value } })
              .then(function (p) { apply(p); ctx.toast("Gespeichert"); }).catch(fail);
          });
          td.appendChild(sel);
        } else if (pid === "*") {
          var allChip = el("span", "fp-dg-all"); allChip.title = "Ganze Familie · " + d.name + " · " + dm(k);
          allChip.appendChild(icon("users"));
          if (!compact) allChip.appendChild(el("span", null, "Alle"));
          td.appendChild(allChip);
        } else if (pid) {
          var m = memberById(pid) || { name: "?", color: "#9ca3af" };
          var who = el("span", "fp-dg-who"); who.title = m.name + " · " + d.name + " · " + dm(k);
          who.appendChild(avatarEl(m, compact ? 20 : 22));
          if (!compact) who.appendChild(el("span", null, m.name));
          td.appendChild(who);
        } else {
          td.appendChild(el("span", "fp-dg-free", compact ? "–" : "frei"));
        }
        if (manual) { td.classList.add("is-manual"); td.title = "Von Hand geändert"; }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); scroll.appendChild(t); box.appendChild(scroll);
    return box;
  }

  function renderWeeks(panel) {
    var c = card("Wochenplan", "Die laufende Woche und die nächsten Wochen. Auch kommende Wochen lassen sich schon tauschen – die Änderung gilt dann ab Wochenbeginn. Fährt jemand die Maus über einen Dienst (oder tippt auf „Warum so?“), steht dort die Begründung.");
    var grid = el("div", "fp-weeks");
    if (PLAN.currentWeek) grid.appendChild(weekCard(PLAN.currentWeek, "current"));
    (PLAN.preview || []).forEach(function (p) { grid.appendChild(weekCard(p, "preview")); });
    if (!grid.children.length) grid.appendChild(el("p", "save-hint", "Noch keine Wochen – erst Mitglieder anlegen."));
    c.appendChild(grid);
    var planned = (PLAN.preview || []).filter(function (p) { return p.manual; }).length;
    if (planned) {
      var row = el("div", "save-row");
      var rg = el("button", "btn", "Rotationsplan neu generieren"); rg.type = "button";
      rg.addEventListener("click", function () {
        if (!confirm("Alle geplanten Änderungen an kommenden Wochen werden verworfen, die Automatik gilt wieder. Die laufende Woche bleibt. Fortfahren?")) return;
        api("/api/familyplan/regenerate", { method: "POST", body: { revision: PLAN.revision, scope: "future" } })
          .then(function (p) { apply(p); ctx.toast("Kommende Wochen neu berechnet"); }).catch(fail);
      });
      row.appendChild(rg);
      row.appendChild(el("span", "save-hint", planned + (planned === 1 ? " kommende Woche ist" : " kommende Wochen sind") + " von Hand geändert."));
      c.appendChild(row);
    }
    panel.appendChild(c);
    panel.appendChild(fairnessCard());
    if ((PLAN.history || []).length) {
      var h = card("Vergangene Wochen", null);
      var det = el("details"); det.appendChild(el("summary", "save-hint", "Letzte " + PLAN.history.length + " Wochen anzeigen"));
      var g2 = el("div", "fp-weeks");
      PLAN.history.forEach(function (w) { g2.appendChild(weekCard(w, "past")); });
      det.appendChild(g2); h.appendChild(det); panel.appendChild(h);
    }
  }

  // Wer hatte welchen Dienst wie oft? Damit sieht die Familie selbst, dass es fair zugeht.
  function fairnessCard() {
    var f = PLAN.fairness || { weeks: 0, counts: {} };
    var c = card("Wie oft hatte wer was?", f.weeks
      ? (f.weeks === 1 ? "Bisher nur die laufende Woche." : "Die letzten " + f.weeks + " Wochen inklusive der laufenden.") + " Wochendienste zählen je Woche, Tagesdienste je Tag. Je kräftiger die Farbe, desto öfter."
      : "Sobald die erste Woche gelaufen ist, steht hier, wer welchen Dienst wie oft hatte.");
    if (!f.weeks || !PLAN.members.length) return c;
    var duties = PLAN.duties;
    var max = 1;
    PLAN.members.forEach(function (m) { duties.forEach(function (d) { max = Math.max(max, (f.counts[m.id] || {})[d.id] || 0); }); });
    var wrap = el("div", "fp-scroll");
    var t = el("table", "fp-table fp-matrix");
    var hr = el("tr"); hr.appendChild(el("th", null, ""));
    duties.forEach(function (d) {
      var th = el("th"); th.title = d.name;
      var ic = icon(d.icon); ic.style.color = d.color; th.appendChild(ic);
      th.appendChild(el("div", "fp-mx-h", d.name.replace(/dienst$/i, "")));
      hr.appendChild(th);
    });
    hr.appendChild(el("th", null, "Summe"));
    var thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody");
    PLAN.members.forEach(function (m) {
      var tr = el("tr");
      var c0 = el("td"); var who = el("span", "fp-who"); who.appendChild(avatarEl(m, 24)); who.appendChild(el("span", null, m.name));
      c0.appendChild(who); tr.appendChild(c0);
      var sum = 0;
      duties.forEach(function (d) {
        var n = (f.counts[m.id] || {})[d.id] || 0; sum += n;
        var td = el("td", "fp-mx-n", String(n));
        if (n) td.style.background = "color-mix(in srgb, " + d.color + " " + Math.round(15 + 55 * n / max) + "%, transparent)";
        tr.appendChild(td);
      });
      tr.appendChild(el("td", "fp-mx-n", String(sum)));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); c.appendChild(wrap);
    return c;
  }

  // ----- Einstellungen -----
  function renderSettings(panel) {
    if (!draftSettings) draftSettings = clone(PLAN.settings);
    var s = draftSettings;
    var c = card("Einstellungen", null);
    var f0 = el("div", "field first"); var l0 = el("label", null, "Überschrift auf dem Spiegel"); l0.htmlFor = "fp-title";
    var title = el("input"); title.type = "text"; title.id = "fp-title"; title.maxLength = 40; title.value = s.title;
    title.addEventListener("input", function () { s.title = title.value; });
    f0.appendChild(l0); f0.appendChild(title); c.appendChild(f0);

    var g = el("div", "grid2");
    var f1 = el("div", "field"); var l1 = el("label", null, "Wechseltag"); l1.htmlFor = "fp-weekday";
    var wd = el("select"); wd.id = "fp-weekday";
    [1, 2, 3, 4, 5, 6, 0].forEach(function (d) { var o = el("option", null, WEEKDAYS[d]); o.value = d; if (s.rotationWeekday === d) o.selected = true; wd.appendChild(o); });
    wd.addEventListener("change", function () { s.rotationWeekday = Number(wd.value); });
    f1.appendChild(l1); f1.appendChild(wd);
    var f2 = el("div", "field"); var l2 = el("label", null, "Vorschau"); l2.htmlFor = "fp-preview";
    var pw = el("select"); pw.id = "fp-preview";
    for (var n = 1; n <= 8; n++) { var o = el("option", null, n + (n === 1 ? " Woche" : " Wochen")); o.value = n; if (s.previewWeeks === n) o.selected = true; pw.appendChild(o); }
    pw.addEventListener("change", function () { s.previewWeeks = Number(pw.value); });
    f2.appendChild(l2); f2.appendChild(pw);
    g.appendChild(f1); g.appendChild(f2); c.appendChild(g);

    var fm = el("div", "field"); var lm = el("label", null, "Tagesdienste pro Person"); lm.htmlFor = "fp-maxday";
    var mx = el("select"); mx.id = "fp-maxday";
    [[0, "unbegrenzt"], [1, "höchstens 1 pro Tag"], [2, "höchstens 2 pro Tag"], [3, "höchstens 3 pro Tag"], [4, "höchstens 4 pro Tag"], [5, "höchstens 5 pro Tag"], [6, "höchstens 6 pro Tag"]].forEach(function (x) {
      var o = el("option", null, x[1]); o.value = x[0]; if ((s.maxPerDay || 0) === x[0]) o.selected = true; mx.appendChild(o);
    });
    mx.addEventListener("change", function () { s.maxPerDay = Number(mx.value); });
    fm.appendChild(lm); fm.appendChild(mx);
    fm.appendChild(el("p", "save-hint", "Gilt für täglich rotierende und fest nach Tag verteilte Dienste. Passt nicht alles hinein, bleibt der Rest an dem Tag frei (Hinweis oben). Wirkt sofort ab heute."));
    c.appendChild(fm);

    var t = el("div", "toggle"); t.style.marginTop = "10px";
    var tl = el("span", "tl2", "Automatische Rotation"); tl.appendChild(el("small", null, "Aus: Der Plan bleibt stehen, bis du sie wieder einschaltest."));
    t.appendChild(tl); t.appendChild(swBtn(s.autoRotate, "Automatische Rotation", function (v) { s.autoRotate = v; }));
    c.appendChild(t);

    var pm = el("div", "field");
    var lp = el("label", null, "Kombinationen"); lp.htmlFor = "fp-pairmode";
    var ps = el("select"); ps.id = "fp-pairmode";
    [["varying", "Wechselnd – jeder Zyklus mischt die Dienste neu"], ["fixed", "Feste Paare – verbundene Dienste rotieren zusammen"]].forEach(function (x) {
      var o2 = el("option", null, x[1]); o2.value = x[0]; if (s.pairMode === x[0]) o2.selected = true; ps.appendChild(o2);
    });
    ps.addEventListener("change", function () { s.pairMode = ps.value; renderTab(); });
    pm.appendChild(lp); pm.appendChild(ps); c.appendChild(pm);
    if (s.pairMode === "fixed") c.appendChild(pairsEditor(s));

    c.appendChild(saveRow("Speichern", function (btn, hint) {
      btn.disabled = true; hint.textContent = "Speichere …";
      api("/api/familyplan/settings", { method: "PUT", body: { revision: PLAN.revision, settings: draftSettings } })
        .then(function (p) { apply(p); ctx.toast("Einstellungen gespeichert"); })
        .catch(function (err) { btn.disabled = false; fail(err); });
    }, "Wechseltag (für wöchentlich und monatlich rotierende Dienste) und Paar-Modus gelten ab der nächsten Woche, die laufende bleibt."));
    panel.appendChild(c);

    panel.appendChild(backupCard());
  }

  // ----- Datensicherung (Export, Import, automatische Backups) -----
  function backupCard() {
    var c = card("Datensicherung", "Eine Sicherung enthält den kompletten Familienplan samt hochgeladenen Fotos in einer Datei – für den Umzug auf ein anderes Gerät oder nach einer Neuinstallation.");
    var row = el("div", "save-row");
    var ex = el("a", "btn", "⬇ Exportieren"); ex.href = "/api/familyplan/export"; ex.setAttribute("download", "");
    row.appendChild(ex);
    var lab = el("label", "btn fp-file", "⬆ Importieren …");
    var inp = el("input"); inp.type = "file"; inp.accept = "application/json,.json"; inp.id = "fp-import";
    lab.appendChild(inp);
    inp.addEventListener("change", function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var payload;
        try { payload = JSON.parse(reader.result); } catch (e) { ctx.toast("Die Datei ist keine gültige Sicherung"); inp.value = ""; return; }
        if (!confirm("Der aktuelle Familienplan wird durch die Sicherung ersetzt. Vorher legt LUMIRA automatisch ein Backup an. Fortfahren?")) { inp.value = ""; return; }
        api("/api/familyplan/import", { method: "POST", body: payload })
          .then(function (p) { apply(p); ctx.toast("Sicherung eingespielt"); })
          .catch(function (err) { inp.value = ""; fail(err); });
      };
      reader.readAsText(file);
    });
    row.appendChild(lab);
    c.appendChild(row);

    c.appendChild(el("h2", "fp-subhead", "Automatische Backups"));
    c.appendChild(el("p", "sub", "Vor jedem Speichern sichert LUMIRA den vorherigen Stand (die letzten 15). Damit lässt sich ein Versehen rückgängig machen. Hochgeladene Fotos bleiben dabei, wie sie sind."));
    var list = el("div", "fp-backups");
    list.appendChild(el("p", "save-hint", "Lädt …"));
    c.appendChild(list);
    api("/api/familyplan/backups").then(function (r) {
      list.replaceChildren();
      var items = r.backups || [];
      if (!items.length) { list.appendChild(el("p", "save-hint", "Noch keine Backups – die entstehen beim ersten Speichern.")); return; }
      items.forEach(function (b) {
        var line = el("div", "fp-backup");
        var info = el("div", "fp-backup-i");
        var when = b.savedAt ? new Date(b.savedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : b.name;
        info.appendChild(el("b", null, when));
        info.appendChild(el("span", "save-hint", b.broken ? "beschädigt" : (b.members.length ? b.members.join(", ") : "keine Mitglieder") + " · " + b.weeks + (b.weeks === 1 ? " Woche" : " Wochen")));
        line.appendChild(info);
        var btn = el("button", "btn", "Wiederherstellen"); btn.type = "button"; btn.disabled = !!b.broken;
        btn.addEventListener("click", function () {
          if (!confirm("Den Stand vom " + when + " wiederherstellen? Der aktuelle Stand wird vorher selbst als Backup gesichert.")) return;
          api("/api/familyplan/backups/restore", { method: "POST", body: { name: b.name } })
            .then(function (p) { apply(p); ctx.toast("Stand vom " + when + " wiederhergestellt"); }).catch(fail);
        });
        line.appendChild(btn);
        list.appendChild(line);
      });
    }).catch(function (err) { list.replaceChildren(el("p", "save-hint", "Backups konnten nicht geladen werden: " + err.message)); });
    return c;
  }

  function pairsEditor(s) {
    var box = el("div", "fp-pairs");
    var duties = PLAN.duties;
    s.fixedPairs.forEach(function (pair, i) {
      var row = el("div", "fp-pair");
      [0, 1].forEach(function (k) {
        var sel = el("select", "fp-small"); sel.id = "fp-pair-" + i + "-" + k; sel.setAttribute("aria-label", "Paar " + (i + 1) + ", Dienst " + (k + 1));
        duties.forEach(function (d) {
          var o = el("option", null, d.name); o.value = d.id; if (pair[k] === d.id) o.selected = true;
          o.dataset.icon = d.icon || "circle-question"; o.dataset.color = d.color;
          sel.appendChild(o);
        });
        sel.addEventListener("change", function () { pair[k] = sel.value; });
        row.appendChild(sel);
        if (k === 0) row.appendChild(el("span", "save-hint", "+"));
      });
      var del = el("button", "btn-x", "✕"); del.type = "button"; del.setAttribute("aria-label", "Paar entfernen");
      del.addEventListener("click", function () { s.fixedPairs.splice(i, 1); renderTab(); });
      row.appendChild(del);
      box.appendChild(row);
    });
    var add = el("button", "btn-add", "+ Paar hinzufügen"); add.type = "button";
    add.disabled = duties.length < 2;
    add.addEventListener("click", function () {
      var taken = {}; s.fixedPairs.forEach(function (p) { taken[p[0]] = taken[p[1]] = true; });
      var free = duties.filter(function (d) { return !taken[d.id]; });
      if (free.length < 2) { ctx.toast("Keine zwei freien Dienste mehr"); return; }
      s.fixedPairs.push([free[0].id, free[1].id]);
      renderTab();
    });
    box.appendChild(add);
    return box;
  }

  function renderTab() {
    var panel = $("#fp-panel");
    panel.replaceChildren();
    ({ uebersicht: renderOverview, mitglieder: renderMembers, dienste: renderDuties, wochen: renderWeeks, einstellungen: renderSettings })[TAB](panel);
  }

  // ---------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------
  function load() {
    return Promise.all([api("/api/familyplan"), api("/api/familyplan/presets").catch(function () { return { presets: [] }; })])
      .then(function (r) { PRESETS = r[1].presets || []; apply(r[0]); })
      .catch(function (err) { $("#fp-panel").replaceChildren(el("div", "msg error", "Familienplan konnte nicht geladen werden: " + err.message)); });
  }

  window.LumiraFamilyPlan = {
    init: function (context) {
      ctx = context;
      document.querySelectorAll(".fp-tab").forEach(function (b) {
        b.addEventListener("click", function () { TAB = b.getAttribute("data-fptab"); openPicker = null; render(); });
      });
      // Offene Symbolauswahl schließt bei Klick daneben
      document.addEventListener("click", function () { closeIconPickers(null); });
      load();
    },
    reload: load,
    showTab: function (tab) { TAB = tab; openPicker = null; render(); }
  };
})();
