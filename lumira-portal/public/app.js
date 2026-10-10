// LUMIRA Self-Service-Portal – Frontend.
// Ein Web-Konfigurator für zwei Kontexte (Setup-AP und Heimnetz), siehe
// concept/selfservice.md. Reines Vanilla-JS, kein Build-Schritt.
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var STATUS = null;
  var SETTINGS = null;
  var COMPLIMENTS = null;

  function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin"
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ("HTTP " + res.status));
          err.field = data.field;
          throw err;
        }
        return data;
      });
    });
  }

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  function boot() {
    api("/api/status").then(function (status) {
      STATUS = status;
      if (status.mode === "SETUP") return showSetup();
      return api("/api/auth/status").then(function (auth) {
        if (auth.pinSet && !auth.authenticated) return showLogin();
        return showApp();
      });
    }).catch(function (err) {
      document.body.innerHTML = "<div class=\"center-screen\"><div class=\"card card-narrow\">" +
        "<h2>Fehler</h2><p class=\"sub\">" + escapeHtml(err.message) + "</p></div></div>";
    });
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }

  // ---------------------------------------------------------------------
  // Setup-Bildschirm (Access-Point-Modus)
  // ---------------------------------------------------------------------
  var selectedSsid = "";

  function showSetup() {
    show($("#setup-screen"));
    $("#setup-portal-url").textContent = (STATUS.portalUrl || "").replace(/^https?:\/\//, "");
    loadWifiList();
    $("#wifi-rescan").addEventListener("click", loadWifiList);
    $("#setup-connect").addEventListener("click", connectWifi);
  }

  function loadWifiList() {
    var list = $("#wifi-list");
    list.innerHTML = '<div class="save-hint">Suche läuft…</div>';
    api("/api/wifi/scan").then(function (data) {
      var nets = data.networks || [];
      if (!nets.length) {
        list.innerHTML = '<div class="save-hint">Keine Netzwerke gefunden.</div>';
        return;
      }
      list.innerHTML = "";
      nets.forEach(function (n) {
        var row = document.createElement("div");
        row.className = "wifi-item";
        row.innerHTML = '<span class="ssid">' + (n.secure ? "🔒 " : "📶 ") + escapeHtml(n.ssid) + '</span>' +
          '<span class="sig">' + n.signal + '%</span>';
        row.addEventListener("click", function () {
          $all(".wifi-item", list).forEach(function (r) { r.classList.remove("sel"); });
          row.classList.add("sel");
          selectedSsid = n.ssid;
          $("#setup-ssid").value = n.ssid;
          $("#setup-psk").focus();
        });
        list.appendChild(row);
      });
    }).catch(function (err) {
      list.innerHTML = '<div class="save-hint">Scan fehlgeschlagen: ' + escapeHtml(err.message) + "</div>";
    });
  }

  function connectWifi() {
    var ssid = $("#setup-ssid").value.trim();
    var psk = $("#setup-psk").value;
    var msg = $("#setup-msg");
    var btn = $("#setup-connect");
    msg.innerHTML = "";
    if (!ssid) { msg.innerHTML = '<div class="msg error">Bitte zuerst ein Netzwerk auswählen.</div>'; return; }
    btn.disabled = true;
    $("#setup-status").textContent = "Verbinde…";
    api("/api/wifi/connect", { method: "POST", body: { ssid: ssid, psk: psk } }).then(function () {
      $("#setup-status").textContent = "";
      msg.innerHTML = '<div class="msg ok">Verbunden! Bitte verbinde dein Handy jetzt ebenfalls mit dem Heimnetz und rufe die Portal-Adresse erneut auf.</div>';
      $("#setup-psk").disabled = true;
    }).catch(function (err) {
      btn.disabled = false;
      $("#setup-status").textContent = "";
      msg.innerHTML = '<div class="msg error">' + escapeHtml(err.message) + "</div>";
    });
  }

  // ---------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------
  function showLogin() {
    show($("#login-screen"));
    $("#login-submit").addEventListener("click", doLogin);
    $("#login-pin").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
  }

  function doLogin() {
    var pin = $("#login-pin").value.trim();
    var msg = $("#login-msg");
    msg.innerHTML = "";
    api("/api/auth/login", { method: "POST", body: { pin: pin } }).then(function () {
      hide($("#login-screen"));
      showApp();
    }).catch(function (err) {
      msg.innerHTML = '<div class="msg error">' + escapeHtml(err.message) + "</div>";
    });
  }

  // ---------------------------------------------------------------------
  // Haupt-App
  // ---------------------------------------------------------------------
  function showApp() {
    return api("/api/settings").then(function (settings) {
      SETTINGS = settings;
      return api("/api/compliments").catch(function () { return null; });
    }).then(function (compliments) {
      COMPLIMENTS = compliments;
      show($("#app"));
      applyEdition();
      populateForm();
      wireNav();
      wireSaves();
      wireSteuerung();
      wireWlan();
      wireSicherheit();
      wireStandortSearch();
      wireAlarmSound();
      wireSpruche();
      $("#addBday").addEventListener("click", function () {
        var first = FP_MEMBERS[0];
        $("#bdays").appendChild(bdayRow(first ? { memberId: first.id, name: first.name, date: "" } : { name: "", date: "" }));
      });
      $("#addCountdown").addEventListener("click", function () { $("#countdowns").appendChild(countdownRow({ label: "", date: "" })); });
      $("#addCalUrl").addEventListener("click", function () {
        if ($all("#cal-urls .calrow").length >= 3) return;
        $("#cal-urls").appendChild(calUrlRow(""));
        updateAddCalUrlState();
      });
      if (STATUS.edition.flags.hasFamily && window.LumiraFamilyPlan) {
        window.LumiraFamilyPlan.init({
          api: api,
          toast: toast,
          getSettings: function () { return SETTINGS; },
          setSettings: function (s) { SETTINGS = s; renderModulePreview(); },
          onPlanChange: function (plan) { setFamilyMembers(plan.members || []); }
        });
      }
      renderModuleList();
      renderModulePreview();
      refreshStatus();
      setInterval(refreshStatus, 5000);
    });
  }

  function applyEdition() {
    var flags = STATUS.edition.flags;
    $("#edn-name").textContent = STATUS.edition.name;
    $("#lbl-personname").textContent = STATUS.edition.personLabel;
    $all(".navbtn[data-need]").forEach(function (btn) {
      var need = btn.getAttribute("data-need");
      btn.style.display = flags[need] ? "" : "none";
    });
    $("#card-alarm-actions").hidden = !flags.hasAlarm;
    $("#rain-row").style.display = flags.hasRain ? "" : "none";
    $("#info-edition").textContent = STATUS.edition.name;
    $("#info-hostname").textContent = STATUS.hostname;
    $("#info-portal").textContent = (STATUS.portalUrl || "").replace(/^https?:\/\//, "");
  }

  function populateForm() {
    var s = SETTINGS;
    renderBdays(s.family.birthdays || []);
    renderCountdowns(s.family.countdowns || []);
    $("#weddingDate").value = fullToDe(s.family.weddingDate || "");

    $("#loc-name").value = s.location.name || "";
    $("#loc-lat").value = s.location.lat;
    $("#loc-lon").value = s.location.lon;
    setSwitch($("#sw-rain"), !!s.rainRadar.enabled);

    renderCalUrls(s.calendar.urls || []);
    var newsSel = $("#news-select");
    if (s.news.url === "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml") {
      newsSel.value = "tagesschau";
    } else if (s.news.url === "https://www.heise.de/rss/heise-atom.xml") {
      newsSel.value = "heise";
    } else {
      newsSel.value = "custom";
      $("#news-custom-row").hidden = false;
      $("#news-url").value = s.news.url || "";
    }

    $("#personName").value = s.person.name || "";
    $("#alarmTitle").value = s.alarm.title || "";
    $("#alarmDuration").value = s.alarm.alarmDuration;
    $("#infoDuration").value = s.alarm.infoDuration;
    $("#returnDuration").value = s.alarm.returnDuration;
    setSwitch($("#sw-sound"), !!s.alarm.playSound);
    $("#haWebhookUrl").value = s.alarm.haWebhookUrl || "";
    $("#alarm-sound-hint").textContent = s.alarm.soundFile ? "Eigener Ton: " + s.alarm.soundFile : "Standardton";
    $("#alarm-sound-reset").hidden = !s.alarm.soundFile;

    var moods = (s.compliments && s.compliments.moods) || {};
    setSwitch($("#mood-herzlich"), moods.herzlich !== false);
    setSwitch($("#mood-motivierend"), moods.motivierend !== false);
    setSwitch($("#mood-humorvoll"), moods.humorvoll !== false);
    renderSpruchCards();
  }

  function setSwitch(el, on) {
    el.setAttribute("aria-checked", on ? "true" : "false");
    el.onclick = function () { el.setAttribute("aria-checked", el.getAttribute("aria-checked") === "true" ? "false" : "true"); };
  }
  function switchOn(el) { return el.getAttribute("aria-checked") === "true"; }

  // ---------------------------------------------------------------------
  // Wichtige Termine: Geburtstage (verknüpft mit den Familienmitgliedern des
  // Familienplans), Hochzeitstag, Countdowns. settings.json speichert das
  // Format von MMM-SmartCompliments ("MM-TT" / "JJJJ-MM-TT"), hier wird
  // deutsch angezeigt und eingegeben ("TT.MM." / "TT.MM.JJJJ").
  // ---------------------------------------------------------------------
  var FP_MEMBERS = [];          // Familienmitglieder aus dem Familienplan
  var OTHER = "__other";

  function mmddToDe(s) {
    var m = /^(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? m[2] + "." + m[1] + "." : String(s || "");
  }
  function fullToDe(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? m[3] + "." + m[2] + "." + m[1] : String(s || "");
  }

  // Neue Mitgliederliste: Auswahl aktualisieren, alte Einträge ohne
  // Verknüpfung per Namen verknüpfen (wird beim nächsten Speichern übernommen).
  function setFamilyMembers(members) {
    var current = $("#bdays") ? collectBdayRows() : [];
    FP_MEMBERS = members.slice();
    current.forEach(function (b) {
      if (b.memberId && !FP_MEMBERS.some(function (m) { return m.id === b.memberId; })) delete b.memberId;
      if (b.memberId) return;
      var match = FP_MEMBERS.filter(function (m) { return m.name.trim().toLowerCase() === b.name.trim().toLowerCase(); })[0];
      if (match) b.memberId = match.id;
    });
    renderBdays(current, true);
  }

  function renderBdays(list, raw) {
    var wrap = $("#bdays");
    wrap.innerHTML = "";
    list.forEach(function (b) { wrap.appendChild(bdayRow(raw ? b : { memberId: b.memberId, name: b.name, date: mmddToDe(b.date) })); });
  }

  function bdayRow(b) {
    var row = document.createElement("div");
    row.className = "term-row";
    // Verknüpfung merken, auch wenn die Mitglieder noch nicht geladen sind
    row.dataset.memberId = b.memberId || "";
    var sel = document.createElement("select");
    sel.setAttribute("aria-label", "Person");
    var linked = b.memberId && FP_MEMBERS.some(function (m) { return m.id === b.memberId; });
    FP_MEMBERS.forEach(function (m) {
      var o = document.createElement("option"); o.value = m.id; o.textContent = m.name;
      if (linked && m.id === b.memberId) o.selected = true;
      sel.appendChild(o);
    });
    var other = document.createElement("option"); other.value = OTHER; other.textContent = "Andere Person …";
    if (!linked) other.selected = true;
    sel.appendChild(other);
    var name = document.createElement("input");
    name.type = "text"; name.placeholder = "Name, z. B. Oma Erika"; name.maxLength = 40; name.className = "term-name";
    name.value = linked ? "" : (b.name || "");
    name.hidden = linked;
    var date = document.createElement("input");
    date.type = "text"; date.className = "mono-in"; date.placeholder = "TT.MM."; date.inputMode = "numeric"; date.value = b.date || "";
    date.setAttribute("aria-label", "Datum");
    var del = document.createElement("button"); del.type = "button"; del.className = "btn-x"; del.title = "entfernen"; del.textContent = "✕";
    sel.addEventListener("change", function () {
      row.dataset.memberId = sel.value === OTHER ? "" : sel.value;
      name.hidden = sel.value !== OTHER;
      if (!name.hidden) name.focus();
    });
    del.addEventListener("click", function () { row.remove(); });
    var who = document.createElement("div"); who.className = "term-who";
    who.appendChild(sel); who.appendChild(name);
    row.appendChild(who); row.appendChild(date); row.appendChild(del);
    return row;
  }

  function collectBdayRows() {
    return $all("#bdays .term-row").map(function (row) {
      var sel = $("select", row), inputs = $all("input", row);
      var member = FP_MEMBERS.filter(function (m) { return m.id === sel.value; })[0];
      if (member) return { memberId: member.id, name: member.name, date: inputs[1].value.trim() };
      var out = { name: inputs[0].value.trim(), date: inputs[1].value.trim() };
      if (row.dataset.memberId) out.memberId = row.dataset.memberId; // noch nicht aufgelöste Verknüpfung
      return out;
    });
  }
  function collectBdays() {
    return collectBdayRows().filter(function (b) { return b.name || b.date; });
  }

  function renderCountdowns(list) {
    var wrap = $("#countdowns");
    wrap.innerHTML = "";
    list.forEach(function (c) { wrap.appendChild(countdownRow({ label: c.label, date: mmddToDe(c.date) })); });
  }
  function countdownRow(c) {
    var row = document.createElement("div");
    row.className = "term-row";
    var label = document.createElement("input");
    label.type = "text"; label.placeholder = "z. B. Sommerurlaub"; label.maxLength = 40; label.value = c.label || "";
    label.setAttribute("aria-label", "Bezeichnung");
    var date = document.createElement("input");
    date.type = "text"; date.className = "mono-in"; date.placeholder = "TT.MM."; date.inputMode = "numeric"; date.value = c.date || "";
    date.setAttribute("aria-label", "Datum");
    var del = document.createElement("button"); del.type = "button"; del.className = "btn-x"; del.title = "entfernen"; del.textContent = "✕";
    del.addEventListener("click", function () { row.remove(); });
    row.appendChild(label); row.appendChild(date); row.appendChild(del);
    return row;
  }
  function collectCountdowns() {
    return $all("#countdowns .term-row").map(function (row) {
      var inputs = $all("input", row);
      return { label: inputs[0].value.trim(), date: inputs[1].value.trim() };
    }).filter(function (c) { return c.label || c.date; });
  }

  function renderCalUrls(list) {
    var wrap = $("#cal-urls");
    wrap.innerHTML = "";
    list.forEach(function (url) { wrap.appendChild(calUrlRow(url)); });
    updateAddCalUrlState();
  }
  function calUrlRow(url) {
    var row = document.createElement("div");
    row.className = "calrow";
    row.innerHTML = '<input type="url" class="mono-in" placeholder="https://…/kalender.ics">' +
      '<button type="button" class="btn-x" title="entfernen">✕</button>';
    $("input", row).value = url || "";
    $("button", row).addEventListener("click", function () { row.remove(); updateAddCalUrlState(); });
    return row;
  }
  function collectCalUrls() {
    return $all("#cal-urls .calrow input").map(function (input) { return input.value.trim(); })
      .filter(function (url) { return url; });
  }
  function updateAddCalUrlState() {
    $("#addCalUrl").disabled = $all("#cal-urls .calrow").length >= 3;
  }

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  function goPage(name) {
    $all(".navbtn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-page") === name); });
    $all(".page").forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-page") === name); });
    var sel = $("#page-select");
    if (sel && sel.value !== name) sel.value = name;
  }

  function wireNav() {
    $all(".navbtn").forEach(function (btn) {
      btn.addEventListener("click", function () { goPage(btn.getAttribute("data-page")); });
    });
    var sel = $("#page-select");
    sel.innerHTML = "";
    $all(".navgroup").forEach(function (group) {
      var label = $(".glabel", group);
      var optgroup = document.createElement("optgroup");
      optgroup.label = label ? label.textContent : "";
      $all(".navbtn", group).forEach(function (btn) {
        if (btn.style.display === "none") return;
        var opt = document.createElement("option");
        opt.value = btn.getAttribute("data-page");
        opt.textContent = btn.textContent;
        optgroup.appendChild(opt);
      });
      if (optgroup.children.length) sel.appendChild(optgroup);
    });
    sel.addEventListener("change", function () { goPage(sel.value); });
    goPage("steuerung");
  }

  // ---------------------------------------------------------------------
  // Speichern
  // ---------------------------------------------------------------------
  function wireSaves() {
    $all("[data-save]").forEach(function (btn) {
      btn.addEventListener("click", function () { save(btn.getAttribute("data-save"), btn); });
    });
    $("#news-select").addEventListener("change", function () {
      $("#news-custom-row").hidden = $("#news-select").value !== "custom";
    });
  }

  var NEWS_PRESETS = {
    tagesschau: { title: "Tagesschau", url: "https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml" },
    heise: { title: "heise", url: "https://www.heise.de/rss/heise-atom.xml" }
  };

  function patchFor(section) {
    if (section === "familie") {
      return { family: { birthdays: collectBdays(), weddingDate: $("#weddingDate").value.trim(), countdowns: collectCountdowns() } };
    }
    if (section === "standort") {
      return {
        location: { name: $("#loc-name").value.trim(), lat: Number($("#loc-lat").value), lon: Number($("#loc-lon").value) },
        rainRadar: { enabled: switchOn($("#sw-rain")) }
      };
    }
    if (section === "kalender") {
      return { calendar: { urls: collectCalUrls() } };
    }
    if (section === "news") {
      var sel = $("#news-select").value;
      var news = sel === "custom" ? { title: "Nachrichten", url: $("#news-url").value.trim() } : NEWS_PRESETS[sel];
      return { news: news };
    }
    if (section === "alarm") {
      return {
        person: { name: $("#personName").value.trim() },
        alarm: {
          title: $("#alarmTitle").value.trim(),
          alarmDuration: Number($("#alarmDuration").value),
          infoDuration: Number($("#infoDuration").value),
          returnDuration: Number($("#returnDuration").value),
          playSound: switchOn($("#sw-sound")),
          haWebhookUrl: $("#haWebhookUrl").value.trim()
        }
      };
    }
    return {};
  }

  function save(section, btn) {
    var hint = $('[data-savehint="' + section + '"]');
    btn.disabled = true;
    if (hint) hint.textContent = "Speichere …";
    api("/api/settings", { method: "POST", body: patchFor(section) }).then(function (settings) {
      SETTINGS = settings;
      btn.disabled = false;
      if (hint) hint.textContent = "Gespeichert – MagicMirror startet neu.";
      toast("Gespeichert");
    }).catch(function (err) {
      btn.disabled = false;
      if (hint) hint.textContent = "Fehler: " + err.message;
    });
  }

  // ---------------------------------------------------------------------
  // Steuerung: Alarm-Proxy & Kompliments
  // ---------------------------------------------------------------------
  function wireSteuerung() {
    $("#alarm-home").addEventListener("click", function () {
      api("/api/proxy/alarm/home", { method: "POST" }).then(function () { toast("Zuhause ausgelöst"); refreshStatus(); }).catch(function (err) { toast(err.message); });
    });
    $("#alarm-clear").addEventListener("click", function () {
      api("/api/proxy/alarm/clear", { method: "POST" }).then(function () { toast("Einsatz beendet"); refreshStatus(); }).catch(function (err) { toast(err.message); });
    });
    $("#alarm-test").addEventListener("click", function () {
      if (!confirm("Löst einen echten Testalarm auf dem Spiegel aus (Ton, Vollbild-Overlay). Fortfahren?")) return;
      api("/api/proxy/alarm/test", { method: "POST" }).then(function () { toast("Testalarm ausgelöst"); refreshStatus(); }).catch(function (err) { toast(err.message); });
    });
    $("#compliments-toggle").addEventListener("click", function () {
      api("/api/proxy/compliments/toggle", { method: "POST" }).then(function () { refreshStatus(); }).catch(function (err) { toast(err.message); });
    });
    $("#pi-reboot").addEventListener("click", function () {
      if (!confirm("Der Mini-PC startet jetzt neu, die Anzeige ist für ca. 1-2 Minuten nicht erreichbar. Fortfahren?")) return;
      toast("Neustart wird ausgelöst …");
      api("/api/system/reboot", { method: "POST" }).catch(function () {});
    });
  }

  // ---------------------------------------------------------------------
  // Steuerung der Module: Platzhalter-Liste + rein visuelle Vorschau
  // ---------------------------------------------------------------------
  var MODULE_LIST = [
    { need: "hasAlarm", label: "🚒 Alarmierung" },
    { need: "hasCal", label: "📅 Kalender" },
    { need: null, label: "📰 Nachrichten" },
    { need: null, label: "🌤 Wetter" },
    { need: "hasRain", label: "🌧 Regenradar" },
    { need: null, label: "🕐 Uhr" }
  ];
  function renderModuleList() {
    var wrap = $("#module-list-extra");
    wrap.innerHTML = "";
    var flags = STATUS.edition.flags;
    MODULE_LIST.forEach(function (m) {
      if (m.need && !flags[m.need]) return;
      var row = document.createElement("div");
      row.className = "toggle";
      row.innerHTML = '<span class="tl2">' + m.label + '<small>bald verfügbar</small></span>' +
        '<button class="sw" aria-checked="false" aria-disabled="true" tabindex="-1"></button>';
      wrap.appendChild(row);
    });
  }

  function renderModulePreview() {
    var flags = STATUS.edition.flags;
    var fpOn = flags.hasFamily && SETTINGS && SETTINGS.familyPlan && SETTINGS.familyPlan.enabled;
    setPreviewCell("top_left", fpOn ? "🕐 Uhr / 🗓 Familienplan" : "🕐 Uhr");
    setPreviewCell("top_center", flags.hasFamily ? "💬 Kompliments" : "");
    var right = ["🌤 Wetter"];
    if (flags.hasRain) right.push("🌧 Regenradar");
    setPreviewCell("top_right", right.join(" / "));
    setPreviewCell("bottom_left", flags.hasCal ? "📅 Kalender" : "");
    setPreviewCell("bottom_right", "ℹ️ Status");
    $("#mp-bottombar").textContent = "📰 Nachrichten";
    var overlay = $("#mp-overlay");
    overlay.textContent = "🚒 Alarmierung (Vollbild bei Alarm)";
    overlay.hidden = !flags.hasAlarm;
  }
  function setPreviewCell(region, text) {
    var cell = $('.mp-cell[data-region="' + region + '"]');
    if (cell) cell.textContent = text;
  }

  function refreshStatus() {
    api("/api/status").then(function (status) {
      STATUS = status;
      var netTile = $("#tile-network");
      $("#net-state-text").textContent = status.network.online ? "Heimnetz" : "getrennt";
      $("#net-sub").textContent = status.network.ssid || "–";
      netTile.classList.toggle("warn", !status.network.online);
      $("#wlan-status-v").textContent = status.network.online ? "verbunden" : "getrennt";
      $("#wlan-ssid-v").textContent = status.network.ssid || "–";
    }).catch(function () {});

    if (STATUS.edition.flags.hasAlarm) {
      api("/api/proxy/alarm/health").then(function (data) {
        $("#alarm-state-text").textContent = "bereit";
        $("#alarm-sub").textContent = data.module || "MMM-aPagerAlarm";
      }).catch(function () {
        $("#alarm-state-text").textContent = "nicht erreichbar";
        $("#tile-alarm").classList.add("warn");
      });
    }

    api("/api/proxy/compliments/status").then(function (data) {
      $("#compliments-state").textContent = data.enabled === false ? "Aus" : "An";
    }).catch(function () {
      $("#compliments-state").textContent = "–";
    });
  }

  // ---------------------------------------------------------------------
  // Standort suchen (ersetzt die frühere Geocoding-Frage im install.sh-Assistenten)
  // ---------------------------------------------------------------------
  function wireStandortSearch() {
    $("#loc-search-btn").addEventListener("click", searchLocation);
    $("#loc-search").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); searchLocation(); } });
  }

  function searchLocation() {
    var query = $("#loc-search").value.trim();
    var results = $("#loc-results");
    if (!query) return;
    results.hidden = false;
    results.innerHTML = '<div class="save-hint">Suche läuft…</div>';
    api("/api/geocode?q=" + encodeURIComponent(query)).then(function (data) {
      var list = data.results || [];
      if (!list.length) {
        results.innerHTML = '<div class="save-hint">Nichts gefunden.</div>';
        return;
      }
      results.innerHTML = "";
      list.forEach(function (r) {
        var row = document.createElement("div");
        row.className = "wifi-item";
        row.innerHTML = '<span class="ssid">📍 ' + escapeHtml(r.name) + '</span>' +
          '<span class="sig">' + r.lat.toFixed(2) + ", " + r.lon.toFixed(2) + '</span>';
        row.addEventListener("click", function () {
          $("#loc-name").value = r.name;
          $("#loc-lat").value = r.lat;
          $("#loc-lon").value = r.lon;
          results.hidden = true;
          $("#loc-search").value = "";
        });
        results.appendChild(row);
      });
    }).catch(function (err) {
      results.innerHTML = '<div class="save-hint">' + escapeHtml(err.message) + "</div>";
    });
  }

  // ---------------------------------------------------------------------
  // WLAN ändern
  // ---------------------------------------------------------------------
  function wireWlan() {
    $("#wlan-change-btn").addEventListener("click", function () {
      if (!confirm("LUMIRA startet jetzt den Einrichtungs-Access-Point \"LUMIRA-Setup\" neu. Fortfahren?")) return;
      api("/api/setup-mode", { method: "POST" }).then(function () {
        toast("Setup-Modus aktiv – Seite lädt neu …");
        setTimeout(function () { location.reload(); }, 1500);
      }).catch(function (err) { toast(err.message); });
    });
  }

  // ---------------------------------------------------------------------
  // Sicherheit / PIN
  // ---------------------------------------------------------------------
  function wireSicherheit() {
    $("#pin-save").addEventListener("click", function () {
      var pin = $("#pin-new").value.trim();
      var hint = $("#pin-hint");
      api("/api/auth/set-pin", { method: "POST", body: { pin: pin } }).then(function () {
        hint.textContent = "PIN gespeichert.";
        $("#pin-new").value = "";
        $("#pin-remove").hidden = false;
      }).catch(function (err) { hint.textContent = "Fehler: " + err.message; });
    });
    $("#pin-remove").hidden = !(SETTINGS.portal && SETTINGS.portal.pinSet);
    $("#pin-remove").addEventListener("click", function () {
      if (!confirm("PIN wirklich entfernen? Das Portal ist danach ohne Anmeldung im Heimnetz erreichbar.")) return;
      var hint = $("#pin-remove-hint");
      api("/api/auth/remove-pin", { method: "POST" }).then(function () {
        hint.textContent = "PIN entfernt.";
        $("#pin-remove").hidden = true;
        SETTINGS.portal.pinSet = false;
      }).catch(function (err) { hint.textContent = "Fehler: " + err.message; });
    });
  }

  // ---------------------------------------------------------------------
  // Eigener Alarmton (Upload/Zurücksetzen)
  // ---------------------------------------------------------------------
  function wireAlarmSound() {
    $("#alarm-sound-upload").addEventListener("click", function () {
      var input = $("#alarm-sound-file");
      var file = input.files && input.files[0];
      var hint = $("#alarm-sound-hint");
      if (!file) { hint.textContent = "Bitte zuerst eine Datei auswählen."; return; }
      var form = new FormData();
      form.append("sound", file);
      hint.textContent = "Lade hoch …";
      fetch("/api/alarm/sound", { method: "POST", body: form, credentials: "same-origin" })
        .then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error(data.error || "Fehler"); return data; }); })
        .then(function (data) {
          SETTINGS.alarm.soundFile = data.soundFile;
          hint.textContent = "Eigener Ton: " + data.soundFile;
          $("#alarm-sound-reset").hidden = false;
          input.value = "";
          toast("Alarmton hochgeladen");
        }).catch(function (err) { hint.textContent = "Fehler: " + err.message; });
    });
    $("#alarm-sound-reset").addEventListener("click", function () {
      var hint = $("#alarm-sound-hint");
      fetch("/api/alarm/sound", { method: "DELETE", credentials: "same-origin" })
        .then(function (res) { if (!res.ok) throw new Error("Fehler beim Zurücksetzen"); return res.json(); })
        .then(function () {
          SETTINGS.alarm.soundFile = "";
          hint.textContent = "Standardton";
          $("#alarm-sound-reset").hidden = true;
          toast("Alarmton zurückgesetzt");
        }).catch(function (err) { hint.textContent = "Fehler: " + err.message; });
    });
  }

  // ---------------------------------------------------------------------
  // Sprüche (compliments.json) – Kategorien + Stimmung
  // ---------------------------------------------------------------------
  var SPRUCH_CATEGORIES = [
    { key: "morningMessages", label: "Morgens" },
    { key: "forenoonMessages", label: "Vormittags" },
    { key: "afternoonMessages", label: "Nachmittags" },
    { key: "eveningMessages", label: "Abends" },
    { key: "nightMessages", label: "Nachts" },
    { key: "familyMessages", label: "Herzlich" },
    { key: "motivationMessages", label: "Motivierend" },
    { key: "humorMessages", label: "Humorvoll" },
    { key: "afterDutyMessages", label: "Nach dem Einsatz", need: "hasAlarm" }
  ];

  function complimentsCat(key) {
    if (COMPLIMENTS && COMPLIMENTS.categories && Array.isArray(COMPLIMENTS.categories[key])) {
      return COMPLIMENTS.categories[key];
    }
    return [];
  }

  function renderSpruchCards() {
    var wrap = $("#spruch-cards");
    if (!wrap) return;
    var flags = STATUS.edition.flags;
    wrap.innerHTML = "";
    SPRUCH_CATEGORIES.forEach(function (cat) {
      if (cat.need && !flags[cat.need]) return;
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML = '<h2>' + cat.label + '</h2>' +
        '<p class="sub">Leer lassen = eingebaute Standardsprüche verwenden.</p>' +
        '<div class="bdays" data-cat="' + cat.key + '"></div>' +
        '<button type="button" class="btn-add" data-add="' + cat.key + '">+ Spruch hinzufügen</button>';
      wrap.appendChild(card);
      var list = $('[data-cat="' + cat.key + '"]', card);
      complimentsCat(cat.key).forEach(function (text) { list.appendChild(spruchRow(text)); });
      $('[data-add="' + cat.key + '"]', card).addEventListener("click", function () {
        list.appendChild(spruchRow(""));
      });
    });
  }

  function spruchRow(text) {
    var row = document.createElement("div");
    row.className = "calrow";
    row.innerHTML = '<input type="text" placeholder="Spruch (Zeilenumbruch mit \\n)">' +
      '<button type="button" class="btn-x" title="entfernen">✕</button>';
    $("input", row).value = text || "";
    $("button", row).addEventListener("click", function () { row.remove(); });
    return row;
  }

  function collectSpruchCategories() {
    var out = {};
    SPRUCH_CATEGORIES.forEach(function (cat) {
      var list = $('[data-cat="' + cat.key + '"]');
      if (!list) return;
      out[cat.key] = $all("input", list).map(function (input) { return input.value.trim(); })
        .filter(function (t) { return t; });
    });
    return out;
  }

  function wireSpruche() {
    $("#save-spruche").addEventListener("click", saveSpruche);
  }

  function saveSpruche() {
    var btn = $("#save-spruche");
    var hint = $("#spruche-hint");
    var moods = {
      herzlich: switchOn($("#mood-herzlich")),
      motivierend: switchOn($("#mood-motivierend")),
      humorvoll: switchOn($("#mood-humorvoll"))
    };
    if (!moods.herzlich && !moods.motivierend && !moods.humorvoll) {
      hint.textContent = "Mindestens eine Stimmung muss aktiv bleiben.";
      return;
    }
    btn.disabled = true;
    hint.textContent = "Speichere …";

    // Stimmung nur speichern (mit MagicMirror-Neustart), wenn sie sich geändert
    // hat – die Sprüche selbst brauchen keinen Neustart (Live-Reload).
    var prev = (SETTINGS.compliments && SETTINGS.compliments.moods) || {};
    var moodsChanged = (prev.herzlich !== false) !== moods.herzlich ||
      (prev.motivierend !== false) !== moods.motivierend ||
      (prev.humorvoll !== false) !== moods.humorvoll;

    var steps = [];
    if (moodsChanged) {
      steps.push(api("/api/settings", { method: "POST", body: { compliments: { moods: moods } } })
        .then(function (settings) { SETTINGS = settings; }));
    }
    steps.push(api("/api/compliments", { method: "POST", body: { categories: collectSpruchCategories() } })
      .then(function (data) { COMPLIMENTS = data; }));

    Promise.all(steps).then(function () {
      btn.disabled = false;
      hint.textContent = moodsChanged ? "Gespeichert – MagicMirror startet neu." : "Gespeichert.";
      toast("Sprüche gespeichert");
    }).catch(function (err) {
      btn.disabled = false;
      hint.textContent = "Fehler: " + err.message;
    });
  }

  boot();
})();
