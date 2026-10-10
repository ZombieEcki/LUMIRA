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

  function pill(d) {
    var p = el("span", "fp-pill");
    p.style.background = d.color; p.style.color = textOn(d.color);
    p.appendChild(icon(d.icon)); p.appendChild(el("span", null, d.name));
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
    var s = ctx.getSettings().familyPlan || { enabled: false, layout: "stacked", maxWidth: "300px" };
    var mirror = card("Auf dem Spiegel", "Ein- und Ausschalten, Darstellung und Breite. Speichern startet MagicMirror einmal neu.");
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
    g.appendChild(f1); g.appendChild(f2); mirror.appendChild(g);
    mirror.appendChild(saveRow("Speichern", function (btn, hint) {
      btn.disabled = true; hint.textContent = "Speichere …";
      ctx.api("/api/settings", { method: "POST", body: { familyPlan: { enabled: enabled, layout: sel.value, maxWidth: inp.value.trim() } } })
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
    t.appendChild(tb); wrap.appendChild(t); wc.appendChild(wrap);
    wc.appendChild(el("p", "save-hint fp-gap", "Wählst du einen Dienst, den schon jemand hat, tauschen die beiden. Wirkt sofort auf dem Spiegel."));
    var row = el("div", "save-row");
    if (w.manual) {
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
      var o = el("option", null, d.name); o.value = d.id; if (d.id === did) o.selected = true; sel.appendChild(o);
    });
    var d0 = dutyById(did) || { color: "#9ca3af" };
    sel.style.background = d0.color; sel.style.color = textOn(d0.color);
    sel.addEventListener("change", function () {
      api("/api/familyplan/weeks/" + w.start + "/assign", { method: "POST", body: { revision: PLAN.revision, memberId: memberId, slot: slot, dutyId: sel.value } })
        .then(function (p) { apply(p); ctx.toast("Gespeichert"); }).catch(fail);
    });
    wrap.appendChild(sel);
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
    avBtn.addEventListener("click", function () { openPicker = openPicker === i ? null : i; renderTab(); });
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

    var act = swBtn(m.active !== false, "Aktiv", function (v) { m.active = v; });
    act.title = "Aktiv (aus = pausiert, z. B. Urlaub)";
    row.appendChild(act);

    row.appendChild(moveButtons(draftMembers, i));
    var del = el("button", "btn-x", "✕"); del.type = "button"; del.title = "Entfernen"; del.setAttribute("aria-label", "Entfernen");
    del.addEventListener("click", function () { draftMembers.splice(i, 1); openPicker = null; renderTab(); });
    row.appendChild(del);
    box.appendChild(row);
    if (openPicker === i) box.appendChild(avatarPicker(m, i));
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

  // Foto im Browser quadratisch auf 256 px zuschneiden, dann hochladen –
  // der Pi braucht so keine Bildbibliothek.
  function uploadPhoto(m, file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { ctx.toast("Bitte ein PNG-, JPG- oder WebP-Bild wählen"); return; }
    if (dirtyMembers()) { ctx.toast("Bitte zuerst die anderen Änderungen speichern"); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(img.width, img.height);
        var c = document.createElement("canvas"); c.width = c.height = 256;
        c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
        c.toBlob(function (blob) {
          if (!blob) { ctx.toast("Bild konnte nicht verarbeitet werden"); return; }
          var form = new FormData();
          form.append("avatar", blob, "avatar.jpg");
          api("/api/familyplan/avatar/" + m.id, { method: "POST", form: form })
            .then(function (p) { openPicker = null; apply(p); ctx.toast("Foto gespeichert"); }).catch(fail);
        }, "image/jpeg", 0.85);
      };
      img.onerror = function () { ctx.toast("Bild konnte nicht gelesen werden"); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ----- Dienste -----
  function renderDuties(panel) {
    if (!draftDuties) draftDuties = clone(PLAN.duties);
    var c = card("Dienste", "Name, Farbe, Symbol und für wen der Dienst gilt. Pausierte Dienste werden nicht verteilt (z. B. Garten im Winter).");
    var list = el("div", "fp-list");
    draftDuties.forEach(function (d, i) { list.appendChild(dutyRow(d, i)); });
    c.appendChild(list);
    var add = el("button", "btn-add", "+ Dienst hinzufügen"); add.type = "button";
    add.disabled = draftDuties.length >= 16;
    add.addEventListener("click", function () {
      draftDuties.push({ name: "", color: "#38bdf8", icon: "house", roles: ["adult", "child"], active: true });
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
    }, "Name, Farbe und Symbol wirken sofort, die Verteilung ändert sich ab der nächsten Woche."));
    panel.appendChild(c);
  }

  function dutyRow(d, i) {
    var row = el("div", "fp-drow");
    var preview = el("span", "fp-dprev");
    function refresh() { preview.replaceChildren(pill({ name: d.name || "Neuer Dienst", color: d.color, icon: d.icon })); }
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

    var ic = el("select", "fp-small"); ic.id = "fp-dicon-" + i; ic.setAttribute("aria-label", "Symbol");
    (PLAN.icons || []).forEach(function (n) { var o = el("option", null, ICON_LABEL[n] || n); o.value = n; if (d.icon === n) o.selected = true; ic.appendChild(o); });
    ic.addEventListener("change", function () { d.icon = ic.value; refresh(); });
    row.appendChild(ic);

    var who = el("select", "fp-small"); who.id = "fp-droles-" + i; who.setAttribute("aria-label", "Für wen");
    FOR_WHOM.forEach(function (f) { var o = el("option", null, f.label); o.value = f.v; if (forWhom(d.roles) === f.v) o.selected = true; who.appendChild(o); });
    who.addEventListener("change", function () { d.roles = FOR_WHOM.filter(function (f) { return f.v === who.value; })[0].roles.slice(); });
    row.appendChild(who);

    row.appendChild(swBtn(d.active !== false, "Aktiv", function (v) { d.active = v; }));
    row.appendChild(moveButtons(draftDuties, i));
    var del = el("button", "btn-x", "✕"); del.type = "button"; del.title = "Entfernen"; del.setAttribute("aria-label", "Entfernen");
    del.addEventListener("click", function () { draftDuties.splice(i, 1); renderTab(); });
    row.appendChild(del);
    return row;
  }

  // ----- Wochenplan -----
  function weekCard(title, sub, assign, current) {
    var c = el("div", "fp-week" + (current ? " current" : ""));
    var h = el("div", "fp-week-h", title); if (sub) h.appendChild(el("span", null, sub)); c.appendChild(h);
    var order = (PLAN.allMembers || []).map(function (m) { return m.id; });
    Object.keys(assign).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }).forEach(function (id) {
      var m = memberById(id); if (!m) return;
      var r = el("div", "fp-week-r");
      r.appendChild(avatarEl(m, 22)); r.appendChild(el("span", "fp-week-n", m.name));
      var ps = el("span", "fp-week-p");
      assign[id].forEach(function (did) { var d = dutyById(did); if (d) ps.appendChild(pill(d)); });
      if (!assign[id].length) ps.appendChild(el("span", "save-hint", "frei"));
      r.appendChild(ps); c.appendChild(r);
    });
    return c;
  }

  function renderWeeks(panel) {
    var c = card("Wochenplan", "Die laufende Woche und die Vorschau. Zukünftige Wochen werden erst zu Wochenbeginn festgelegt und können sich bis dahin noch ändern, z. B. wenn jemand pausiert.");
    var grid = el("div", "fp-weeks");
    if (PLAN.currentWeek) grid.appendChild(weekCard("KW " + PLAN.currentWeek.kw, " · läuft · " + rangeText(PLAN.currentWeek), PLAN.currentWeek.assign, true));
    (PLAN.preview || []).forEach(function (p) { grid.appendChild(weekCard("KW " + p.kw, " · Vorschau ab " + dm(p.start), p.assign, false)); });
    if (!grid.children.length) grid.appendChild(el("p", "save-hint", "Noch keine Wochen – erst Mitglieder anlegen."));
    c.appendChild(grid);
    panel.appendChild(c);
    if ((PLAN.history || []).length) {
      var h = card("Vergangene Wochen", null);
      var det = el("details"); det.appendChild(el("summary", "save-hint", "Letzte " + PLAN.history.length + " Wochen anzeigen"));
      var g2 = el("div", "fp-weeks");
      PLAN.history.forEach(function (w) { g2.appendChild(weekCard("KW " + w.kw, " · " + rangeText(w), w.assign, false)); });
      det.appendChild(g2); h.appendChild(det); panel.appendChild(h);
    }
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
    var f1 = el("div", "field"); var l1 = el("label", null, "Rotationstag"); l1.htmlFor = "fp-weekday";
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
    }, "Rotationstag und Paar-Modus gelten ab der nächsten Woche, die laufende bleibt."));
    panel.appendChild(c);

    var b = card("Datensicherung", "Vor jedem Speichern legt LUMIRA automatisch ein Backup an (die letzten 15 Stände in ~/.lumira/backups/). Export, Import und Wiederherstellen im Portal folgen.");
    panel.appendChild(b);
  }

  function pairsEditor(s) {
    var box = el("div", "fp-pairs");
    var duties = PLAN.duties;
    s.fixedPairs.forEach(function (pair, i) {
      var row = el("div", "fp-pair");
      [0, 1].forEach(function (k) {
        var sel = el("select", "fp-small"); sel.id = "fp-pair-" + i + "-" + k; sel.setAttribute("aria-label", "Paar " + (i + 1) + ", Dienst " + (k + 1));
        duties.forEach(function (d) { var o = el("option", null, d.name); o.value = d.id; if (pair[k] === d.id) o.selected = true; sel.appendChild(o); });
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
      load();
    },
    reload: load
  };
})();
