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
        row.innerHTML = '<span class="ssid">' + escapeHtml(n.ssid) + (n.secure ? " · gesichert" : "") + '</span>' +
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
    var remember = $("#login-remember").checked;
    api("/api/auth/login", { method: "POST", body: { pin: pin, remember: remember } }).then(function () {
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
      wireAppPage();
      wireStandortSearch();
      wireAlarmSound();
      wireSpruche();
      $("#addBday").addEventListener("click", function () {
        var first = FP_MEMBERS[0];
        $("#bdays").appendChild(bdayRow(first ? { memberId: first.id, name: first.name, date: "" } : { name: "", date: "" }));
      });
      $("#addAnniversary").addEventListener("click", function () {
        if ($all("#anniversaries .term-row").length >= 10) return;
        var used = collectAnniversaryRows().map(function (a) { return a.type; });
        $("#anniversaries").appendChild(annRow({ type: used.indexOf("wedding") === -1 ? "wedding" : "together", date: "" }));
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
          onPlanChange: function (plan) { setFamilyMembers(plan.members || []); renderStartFamily(plan); renderMemberChip(plan.members || []); }
        });
      }
      if (window.LumiraUpdates) {
        window.LumiraUpdates.init({ toast: toast, goPage: goPage, onStatus: renderUpdateTile });
      }
      if (window.LumiraAmbient) {
        window.LumiraAmbient.init({ toast: toast, onStatus: renderAmbientStart });
        $("#start-amb-sw").addEventListener("click", function () {
          window.LumiraAmbient.setEnabled($("#start-amb-sw").getAttribute("aria-checked") !== "true");
        });
      }
      if (window.LumiraDoorbell) {
        window.LumiraDoorbell.init({
          toast: toast,
          currentPage: function () { return currentPage; },
          // Schalter „Türklingel“: wie Spiegel → Module (MagicMirror startet neu)
          setModule: function (on) {
            var mods = Object.assign({}, (SETTINGS && SETTINGS.modules) || {}, { doorbell: !!on });
            return api("/api/settings", { method: "POST", body: { modules: mods } }).then(function (settings) {
              SETTINGS = settings;
              applyModuleState();
            });
          }
        });
      }
      wireTheme();
      wireLogout();
      $("#reload-btn").addEventListener("click", function () {
        this.classList.add("is-spinning");
        location.reload();
      });
      $("#member-chip").addEventListener("click", function () {
        goPage("familienplan");
        if (window.LumiraFamilyPlan && window.LumiraFamilyPlan.showTab) window.LumiraFamilyPlan.showTab("mitglieder");
      });
      renderGreeting();
      renderStartNext();
      loadWeather();
      applyModuleState();
      renderModulePreview();
      wireMirrorLive();
      refreshStatus();
      setInterval(refreshStatus, 5000);
      setInterval(renderGreeting, 60 * 1000);
    });
  }

  function applyEdition() {
    var flags = STATUS.edition.flags;
    $("#lbl-personname").textContent = STATUS.edition.personLabel;
    // Alles mit data-need (Kacheln, Karten, Links) nur in passenden Editionen
    $all("[data-need]").forEach(function (el) {
      if (!flags[el.getAttribute("data-need")]) el.hidden = true;
    });
    $("#card-alarm-actions").hidden = !flags.hasAlarm;
    $("#rain-row").style.display = flags.hasRain ? "" : "none";
    $("#info-edition").textContent = STATUS.edition.name;
    $("#info-hostname").textContent = STATUS.hostname;
    $("#info-portal").textContent = (STATUS.portalUrl || "").replace(/^https?:\/\//, "");
    $("#info-portal-host").textContent = (STATUS.portalUrl || "").replace(/^https?:\/\//, "").replace(/:\d+$/, "");
    renderIpInfo();
  }

  // IPv4-Adresse(n) unter Info, plus Portal-Adresse per IP
  function renderIpInfo() {
    var list = (STATUS.network && STATUS.network.ipv4) || [];
    var port = ((STATUS.portalUrl || "").match(/:(\d+)$/) || [])[1] || "8092";
    $("#info-ipv4").textContent = list.length ? list.map(function (a) { return a.address + " (" + a.iface + ")"; }).join(", ") : "keine Verbindung";
    $("#info-portal-ip").textContent = list.length ? list[0].address + ":" + port : "–";
  }

  function populateForm() {
    var s = SETTINGS;
    renderBdays(s.family.birthdays || []);
    renderCountdowns(s.family.countdowns || []);
    renderAnniversaries(anniversariesOf(s.family));

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

  // ---------------------------------------------------------------------
  // Eigener Kalender für Datumsfelder („TT.MM.“ bzw. „TT.MM.JJJJ“). Das Feld
  // bleibt tippbar; der Kalender öffnet per Klick aufs Symbol, per Klick ins
  // Feld oder mit Pfeil runter. Pfeiltasten wandern durch die Tage,
  // Bild auf/ab blättert Monate, Enter wählt, Esc schließt.
  // ---------------------------------------------------------------------
  var MONTHS_DP = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var DP_OPEN = null;

  function dpPad(n) { return (n < 10 ? "0" : "") + n; }
  function dpParse(s, withYear) {
    var m = /^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/.exec(String(s || "").trim());
    if (!m) return null;
    var d = Number(m[1]), mo = Number(m[2]) - 1, y = m[3] ? Number(m[3]) : null;
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    return { d: d, m: mo, y: withYear ? y : null };
  }
  function dpDaysIn(y, m) {
    // Ohne Jahr hat der Februar 29 Tage (Geburtstag am 29.02.)
    return new Date(y == null ? 2024 : y, m + 1, 0).getDate();
  }
  function dpClose(focusInput) {
    if (!DP_OPEN) return;
    var o = DP_OPEN; DP_OPEN = null;
    o.wrap.classList.remove("open");
    o.btn.setAttribute("aria-expanded", "false");
    if (focusInput) o.input.focus();
  }
  document.addEventListener("click", function (e) {
    if (DP_OPEN && !DP_OPEN.wrap.contains(e.target)) dpClose(false);
  });

  function datePicker(input, opts) {
    var withYear = !!(opts && opts.withYear);
    var wrap = document.createElement("div");
    wrap.className = "dp-wrap";
    if (input.style.maxWidth) { wrap.style.maxWidth = input.style.maxWidth; input.style.maxWidth = ""; }
    if (input.parentNode) input.parentNode.replaceChild(wrap, input);
    wrap.appendChild(input);
    input.setAttribute("autocomplete", "off");

    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "dp-btn"; btn.tabIndex = -1;
    btn.setAttribute("aria-label", "Kalender öffnen");
    btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
    btn.appendChild(svgIcon("calendar"));
    wrap.appendChild(btn);

    var pop = document.createElement("div");
    pop.className = "dp-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Datum wählen");
    wrap.appendChild(pop);

    var today = new Date();
    var view = { y: today.getFullYear(), m: today.getMonth(), mode: "days" };
    var focusDay = 1;
    var self = { wrap: wrap, btn: btn, input: input };

    function selected() { return dpParse(input.value, withYear); }

    function headBtn(cls, icon, label, fn) {
      var b = document.createElement("button");
      b.type = "button"; b.className = cls; b.setAttribute("aria-label", label);
      if (icon) b.appendChild(svgIcon(icon));
      b.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
      return b;
    }

    function render() {
      pop.innerHTML = "";
      var head = document.createElement("div"); head.className = "dp-head";
      if (view.mode === "years") {
        var start = Math.floor(view.y / 12) * 12;
        head.appendChild(headBtn("dp-nav", "chev-l", "Frühere Jahre", function () { view.y -= 12; render(); }));
        var t = document.createElement("span"); t.className = "dp-title"; t.textContent = start + " – " + (start + 11);
        head.appendChild(t);
        head.appendChild(headBtn("dp-nav", "chev", "Spätere Jahre", function () { view.y += 12; render(); }));
        pop.appendChild(head);
        var yg = document.createElement("div"); yg.className = "dp-years";
        var sel = selected();
        for (var y = start; y < start + 12; y++) {
          (function (yy) {
            var b = document.createElement("button"); b.type = "button"; b.className = "dp-year"; b.textContent = yy;
            if (sel && sel.y === yy) b.classList.add("sel");
            if (yy === today.getFullYear()) b.classList.add("today");
            b.addEventListener("click", function (e) { e.stopPropagation(); view.y = yy; view.mode = "days"; render(); focusGrid(); });
            yg.appendChild(b);
          })(y);
        }
        pop.appendChild(yg);
        return;
      }
      head.appendChild(headBtn("dp-nav", "chev-l", "Vorheriger Monat", function () { shiftMonth(-1); }));
      var title;
      if (withYear) {
        title = headBtn("dp-title dp-title-btn", null, "Jahr wählen", function () { view.mode = "years"; render(); });
        title.textContent = MONTHS_DP[view.m] + " " + view.y;
      } else {
        title = document.createElement("span"); title.className = "dp-title"; title.textContent = MONTHS_DP[view.m];
      }
      head.appendChild(title);
      head.appendChild(headBtn("dp-nav", "chev", "Nächster Monat", function () { shiftMonth(1); }));
      pop.appendChild(head);

      var grid = document.createElement("div"); grid.className = "dp-grid"; grid.setAttribute("role", "grid");
      ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(function (w) {
        var h = document.createElement("span"); h.className = "dp-wd"; h.textContent = w; grid.appendChild(h);
      });
      // Wochentage nach dem angezeigten (bzw. ohne Jahr: dem aktuellen) Jahr
      var first = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
      for (var i = 0; i < first; i++) grid.appendChild(document.createElement("span"));
      var n = dpDaysIn(withYear ? view.y : null, view.m);
      if (focusDay > n) focusDay = n;
      var sel2 = selected();
      for (var d = 1; d <= n; d++) {
        (function (dd) {
          var b = document.createElement("button"); b.type = "button"; b.className = "dp-day"; b.textContent = dd;
          b.dataset.day = dd;
          b.tabIndex = dd === focusDay ? 0 : -1;
          var isSel = sel2 && sel2.d === dd && sel2.m === view.m && (!withYear || sel2.y === view.y);
          if (isSel) { b.classList.add("sel"); b.setAttribute("aria-selected", "true"); }
          if (dd === today.getDate() && view.m === today.getMonth() && (!withYear || view.y === today.getFullYear())) b.classList.add("today");
          b.setAttribute("aria-label", dd + ". " + MONTHS_DP[view.m] + (withYear ? " " + view.y : ""));
          b.addEventListener("click", function (e) { e.stopPropagation(); pick(dd); });
          grid.appendChild(b);
        })(d);
      }
      grid.addEventListener("keydown", onGridKey);
      pop.appendChild(grid);
    }

    function shiftMonth(delta) {
      view.m += delta;
      if (view.m < 0) { view.m = 11; view.y--; }
      if (view.m > 11) { view.m = 0; view.y++; }
      render();
    }

    function focusGrid() {
      var b = pop.querySelector('.dp-day[data-day="' + focusDay + '"]');
      if (b) b.focus();
    }

    function onGridKey(e) {
      var n = dpDaysIn(withYear ? view.y : null, view.m);
      var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
      if (e.key === "Escape") { e.preventDefault(); dpClose(true); return; }
      if (e.key === "PageDown" || e.key === "PageUp") { e.preventDefault(); shiftMonth(e.key === "PageDown" ? 1 : -1); focusGrid(); return; }
      if (!step) return;
      e.preventDefault();
      var next = focusDay + step;
      if (next < 1) { shiftMonth(-1); focusDay = dpDaysIn(withYear ? view.y : null, view.m) + next; render(); }
      else if (next > n) { focusDay = next - n; shiftMonth(1); }
      else { focusDay = next; render(); }
      focusGrid();
    }

    function pick(d) {
      input.value = dpPad(d) + "." + dpPad(view.m + 1) + "." + (withYear ? view.y : "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      dpClose(true);
    }

    function open() {
      if (DP_OPEN && DP_OPEN !== self) dpClose(false);
      var s = selected();
      if (s) { view.m = s.m; focusDay = s.d; if (withYear && s.y) view.y = s.y; else if (!withYear) view.y = today.getFullYear(); }
      else { view.y = today.getFullYear(); view.m = today.getMonth(); focusDay = today.getDate(); }
      view.mode = "days";
      render();
      DP_OPEN = self;
      wrap.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      // Ausweichen, wenn links/unten kein Platz ist
      pop.classList.remove("to-right", "to-top");
      pop.style.right = "";
      var r = pop.getBoundingClientRect();
      if (r.left < 8) pop.classList.add("to-right");
      else if (r.right > document.documentElement.clientWidth - 8) pop.style.right = (r.right - document.documentElement.clientWidth + 8) + "px";
      if (r.bottom > window.innerHeight - 8 && wrap.getBoundingClientRect().top > r.height + 16) pop.classList.add("to-top");
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (DP_OPEN === self) dpClose(true); else { open(); focusGrid(); }
    });
    input.addEventListener("click", function () { if (DP_OPEN !== self) open(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (DP_OPEN !== self) open(); focusGrid(); }
      else if (e.key === "Escape" || e.key === "Tab") dpClose(false);
    });
    // Beim Tippen den Kalender mitführen
    input.addEventListener("input", function () {
      if (DP_OPEN !== self) return;
      var s = selected();
      if (s) { view.m = s.m; focusDay = s.d; if (withYear && s.y) view.y = s.y; render(); }
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    return wrap;
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
      // Avatar im eigenen Auswahlfeld (select.js)
      o.dataset.initial = (m.name || "?").charAt(0).toUpperCase();
      if (m.color) o.dataset.color = m.color;
      var src = memberAvatarSrc(m);
      if (src) o.dataset.img = src;
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
    var dateBox = datePicker(date, { withYear: false });
    sel.addEventListener("change", function () {
      row.dataset.memberId = sel.value === OTHER ? "" : sel.value;
      name.hidden = sel.value !== OTHER;
      if (!name.hidden) name.focus();
    });
    del.addEventListener("click", function () { row.remove(); });
    var who = document.createElement("div"); who.className = "term-who";
    who.appendChild(sel); who.appendChild(name);
    row.appendChild(who); row.appendChild(dateBox); row.appendChild(del);
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

  // Gemeinsame Jahrestage (Hochzeitstag, Kennenlerntag …), wie in
  // lib/family-dates.js. Ältere Einstellungen kennen nur weddingDate.
  var ANN_TYPES = [
    ["wedding", "Hochzeitstag", "ring"],
    ["together", "Jahrestag (zusammen seit)", "heart"],
    ["engaged", "Verlobungstag", "gem"],
    ["met", "Kennenlerntag", "user-group"],
    ["moved", "Einzugstag", "house"],
    ["other", "Anderer Anlass …", "star"]
  ];
  var ANN_LABEL = { wedding: "Hochzeitstag", together: "Jahrestag", engaged: "Verlobungstag", met: "Kennenlerntag", moved: "Einzugstag" };

  function anniversariesOf(fam) {
    fam = fam || {};
    if (fam.anniversaries && fam.anniversaries.length) return fam.anniversaries;
    return fam.weddingDate ? [{ type: "wedding", date: fam.weddingDate }] : [];
  }

  function renderAnniversaries(list) {
    var wrap = $("#anniversaries");
    wrap.innerHTML = "";
    list.forEach(function (a) { wrap.appendChild(annRow({ type: a.type, label: a.label, date: fullToDe(a.date) })); });
  }

  function annRow(a) {
    var row = document.createElement("div");
    row.className = "term-row ann";
    var sel = document.createElement("select");
    sel.setAttribute("aria-label", "Anlass");
    ANN_TYPES.forEach(function (t) {
      var o = document.createElement("option"); o.value = t[0]; o.textContent = t[1];
      o.dataset.icon = t[2];
      if (t[0] === (a.type || "wedding")) o.selected = true;
      sel.appendChild(o);
    });
    var name = document.createElement("input");
    name.type = "text"; name.placeholder = "z. B. Hauskauf"; name.maxLength = 40; name.className = "term-name";
    name.value = a.type === "other" ? (a.label || "") : "";
    name.hidden = a.type !== "other";
    var date = document.createElement("input");
    date.type = "text"; date.className = "mono-in"; date.placeholder = "TT.MM.JJJJ"; date.inputMode = "numeric"; date.value = a.date || "";
    date.setAttribute("aria-label", "Datum");
    var del = document.createElement("button"); del.type = "button"; del.className = "btn-x"; del.title = "entfernen"; del.textContent = "✕";
    sel.addEventListener("change", function () {
      name.hidden = sel.value !== "other";
      if (!name.hidden) name.focus();
    });
    del.addEventListener("click", function () { row.remove(); });
    var who = document.createElement("div"); who.className = "term-who";
    who.appendChild(sel); who.appendChild(name);
    row.appendChild(who); row.appendChild(datePicker(date, { withYear: true })); row.appendChild(del);
    return row;
  }

  function collectAnniversaryRows() {
    return $all("#anniversaries .term-row").map(function (row) {
      var type = $("select", row).value, inputs = $all("input", row);
      var out = { type: type, date: inputs[1].value.trim() };
      if (type === "other") out.label = inputs[0].value.trim();
      return out;
    });
  }
  function collectAnniversaries() {
    return collectAnniversaryRows().filter(function (a) { return a.date || a.label; });
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
    row.appendChild(label); row.appendChild(datePicker(date, { withYear: false })); row.appendChild(del);
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
  // Fünf Bereiche (concept/design-system.md 5.1), je mit ihren Seiten.
  // Desktop: Icon-Leiste links, Handy: Tab-Leiste unten; Bereiche mit
  // mehreren Seiten zeigen oben Reiter. Die Adresse (#seite) merkt sich die
  // Seite, damit Zurück-Taste und Lesezeichen funktionieren.
  var AREAS = [
    { id: "start", label: "Start", icon: "home", pages: [["start", "Übersicht"]] },
    { id: "familie", label: "Familie", icon: "users", need: "hasFamily", pages: [["familienplan", "Familienplan"], ["familie", "Termine"], ["spruche", "Sprüche"]] },
    { id: "spiegel", label: "Spiegel", icon: "monitor", pages: [["module", "Module"], ["bildschirm", "Bildschirm"], ["klingel", "Klingel"], ["standort", "Standort & Wetter"], ["kalender", "Kalender", "hasCal"], ["news", "Nachrichten"]] },
    { id: "alarm", label: "Alarm", icon: "flame", need: "hasAlarm", pages: [["alarm", "Alarmierung"]] },
    { id: "mehr", label: "Mehr", icon: "more", pages: [["info", "Info & Updates"], ["app", "Als App"], ["wlan", "WLAN"], ["sicherheit", "Sicherheit"]] }
  ];
  var currentPage = "";

  function visibleAreas() {
    var flags = STATUS.edition.flags;
    return AREAS.filter(function (a) { return !a.need || flags[a.need]; }).map(function (a) {
      return { id: a.id, label: a.label, icon: a.icon, pages: a.pages.filter(function (p) { return !p[2] || flags[p[2]]; }) };
    });
  }

  function areaOf(page) {
    return visibleAreas().filter(function (a) { return a.pages.some(function (p) { return p[0] === page; }); })[0] || null;
  }

  function svgIcon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "ic");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }

  function goPage(name) {
    var area = areaOf(name);
    if (!area) { name = "start"; area = areaOf("start"); }
    currentPage = name;
    if (name === "klingel" && window.LumiraDoorbell) window.LumiraDoorbell.reload();
    $all(".page").forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-page") === name); });
    $all("[data-area-btn]").forEach(function (b) {
      var on = b.getAttribute("data-area-btn") === area.id;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    // Reiter des Bereichs
    var sub = $("#subnav");
    sub.innerHTML = "";
    sub.hidden = area.pages.length < 2;
    area.pages.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", p[0] === name ? "true" : "false");
      b.textContent = p[1];
      b.addEventListener("click", function () { goPage(p[0]); });
      sub.appendChild(b);
    });
    // Kopfzeile
    if (name === "start") {
      renderGreeting();
    } else {
      $("#area-eyebrow").textContent = area.label;
      $("#area-title").textContent = area.pages.filter(function (p) { return p[0] === name; })[0][1];
      $("#area-sub").textContent = "";
    }
    if (location.hash !== "#" + name) {
      try { history.replaceState(null, "", "#" + name); } catch (e) { location.hash = name; }
    }
    window.scrollTo(0, 0);
    mirrorKick();
  }

  function wireNav() {
    ["rail", "tabbar"].forEach(function (kind) {
      var host = $('[data-areas="' + kind + '"]');
      visibleAreas().forEach(function (a) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = kind === "rail" ? "rail-btn" : "tab-btn";
        b.setAttribute("data-area-btn", a.id);
        b.setAttribute("aria-label", a.label);
        b.appendChild(svgIcon(a.icon));
        var lbl = document.createElement("span");
        lbl.className = "lbl";
        lbl.textContent = a.label;
        b.appendChild(lbl);
        if (a.id === "mehr") {
          var badge = document.createElement("span");
          badge.className = "nav-badge area-badge";
          badge.hidden = true;
          b.appendChild(badge);
        }
        b.addEventListener("click", function () { goPage(a.pages[0][0]); });
        host.appendChild(b);
      });
    });
    // Links innerhalb der Seiten (#seite) und Zurück-Taste
    window.addEventListener("hashchange", function () {
      var target = location.hash.replace(/^#/, "");
      if (target && target !== currentPage) goPage(target);
    });
    $("#upd-bell").addEventListener("click", function () { goPage("info"); });
    goPage(location.hash.replace(/^#/, "") || "start");
  }

  // Hell / Dunkel / Auto (System), gemerkt im Browser
  function wireTheme() {
    var stored = "auto";
    try { stored = localStorage.getItem("lumira-theme") || "auto"; } catch (e) {}
    function apply(mode) {
      if (mode === "light" || mode === "dark") document.documentElement.setAttribute("data-theme", mode);
      else document.documentElement.removeAttribute("data-theme");
      $all("[data-theme-set]").forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-theme-set") === mode ? "true" : "false");
      });
      try { localStorage.setItem("lumira-theme", mode); } catch (e) {}
    }
    $all("[data-theme-set]").forEach(function (b) {
      b.addEventListener("click", function () { apply(b.getAttribute("data-theme-set")); });
    });
    apply(stored);
  }

  function wireLogout() {
    var btn = $("#logout-btn");
    btn.hidden = !(SETTINGS.portal && SETTINGS.portal.pinSet);
    btn.addEventListener("click", function () {
      api("/api/auth/logout", { method: "POST" }).then(function () { location.reload(); }).catch(function () { location.reload(); });
    });
  }

  // ---------------------------------------------------------------------
  // Speichern
  // ---------------------------------------------------------------------
  function wireSaves() {
    $("#sw-alarm-on").addEventListener("click", function () {
      // Umschalten übernimmt setSwitch, hier nur der Hinweis
      var hint = $('[data-savehint="alarm"]');
      if (hint) hint.textContent = "Zum Übernehmen unten speichern.";
    });
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
      return { family: { birthdays: collectBdays(), anniversaries: collectAnniversaries(), countdowns: collectCountdowns() } };
    }
    if (section === "standort") {
      return {
        location: { name: $("#loc-name").value.trim(), lat: Number($("#loc-lat").value), lon: Number($("#loc-lon").value) },
        rainRadar: { enabled: switchOn($("#sw-rain")) }
      };
    }
    if (section === "module") {
      var mods = Object.assign({}, (SETTINGS && SETTINGS.modules) || {});
      var patch = {};
      $all("#module-list-extra [data-module]").forEach(function (sw) {
        var m = MODULE_LIST.filter(function (x) { return x.key === sw.getAttribute("data-module"); })[0];
        if (!m) return;
        if (m.where) patch[m.where] = { enabled: switchOn(sw) }; else mods[m.key] = switchOn(sw);
      });
      patch.modules = mods;
      return patch;
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
        modules: Object.assign({}, (SETTINGS && SETTINGS.modules) || {}, { alarm: switchOn($("#sw-alarm-on")) }),
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
      applyModuleState();
      if (window.LumiraDoorbell) window.LumiraDoorbell.reload();
      renderStartNext();
      renderGreeting();
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
  // Spiegel → Module: was auf den Spiegel kommt (lib/generate-config.js).
  // where: "modules" = settings.modules[key], sonst eigenes enabled-Feld
  var MODULE_LIST = [
    { key: "clock", label: "Uhr", desc: "oben links" },
    { key: "weather", label: "Wetter", desc: "aktuell und Vorhersage" },
    { key: "rainRadar", where: "rainRadar", need: "hasRain", label: "Regenradar", desc: "Regen in den nächsten 2 Stunden" },
    { key: "calendar", need: "hasCal", label: "Kalender", desc: "Termine aus euren Kalendern" },
    { key: "news", label: "Nachrichten", desc: "Ticker am unteren Rand" },
    { key: "familyPlan", where: "familyPlan", need: "hasFamily", label: "Familienplan", desc: "Wochendienste" },
    { key: "compliments", need: "hasFamily", label: "Familienbotschaften", desc: "Sprüche, Geburtstage, Hinweise" },
    { key: "alarm", need: "hasAlarm", label: "Alarmierung", desc: "aPager – aus: kein Alarm auf dem Spiegel" },
    { key: "doorbell", label: "Türklingel", desc: "Ring – Meldung und Live-Video beim Klingeln" },
    { key: "statusHint", label: "Portal-Hinweis", desc: "kleine Zeile mit der Portal-Adresse" }
  ];

  function moduleOn(m) {
    if (!SETTINGS) return true;
    if (m.where) return !!(SETTINGS[m.where] && SETTINGS[m.where].enabled);
    return !(SETTINGS.modules && SETTINGS.modules[m.key] === false);
  }

  function alarmEnabled() {
    return !!STATUS.edition.flags.hasAlarm && !(SETTINGS && SETTINGS.modules && SETTINGS.modules.alarm === false);
  }

  function renderModuleList() {
    var wrap = $("#module-list-extra");
    wrap.innerHTML = "";
    var flags = STATUS.edition.flags;
    MODULE_LIST.forEach(function (m) {
      if (m.need && !flags[m.need]) return;
      var row = document.createElement("div");
      row.className = "toggle";
      var tl = document.createElement("span"); tl.className = "tl2"; tl.textContent = m.label;
      var small = document.createElement("small"); small.textContent = m.desc; tl.appendChild(small);
      var sw = document.createElement("button"); sw.type = "button"; sw.className = "sw";
      sw.setAttribute("role", "switch"); sw.setAttribute("aria-label", m.label);
      sw.setAttribute("data-module", m.key);
      setSwitch(sw, moduleOn(m)); // setSwitch schaltet beim Klick selbst um
      row.appendChild(tl); row.appendChild(sw);
      wrap.appendChild(row);
    });
  }

  // Alles, was am Modul-Stand hängt, nach dem Laden bzw. Speichern auffrischen
  function applyModuleState() {
    var on = alarmEnabled();
    var flags = STATUS.edition.flags;
    if (flags.hasAlarm) {
      $("#tile-alarm").hidden = !on;
      $("#card-alarm-actions").hidden = !on;
    }
    setSwitch($("#sw-alarm-on"), on);
    if (SETTINGS && SETTINGS.rainRadar) setSwitch($("#sw-rain"), !!SETTINGS.rainRadar.enabled);
    renderModuleList();
    renderModulePreview();
  }

  // ---------------------------------------------------------------------
  // Spiegel live: alle 5 s ein Bild vom Spiegel (MMM-LumiraStatus), aber nur
  // solange Start offen und der Tab sichtbar ist – sonst ruht der Pi.
  // ---------------------------------------------------------------------
  var MIRROR = { view: "live", timer: null, url: null, at: 0, busy: false, failing: false, error: "", wired: false };
  var MIRROR_EVERY_MS = 5000;
  var MIRROR_RETRY_MS = 15000;

  function wireMirrorLive() {
    try {
      var v = localStorage.getItem("lumira-mirror-view");
      if (v === "live" || v === "layout") MIRROR.view = v;
    } catch (e) {}
    $all("#mirror-view [data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        MIRROR.view = b.getAttribute("data-view");
        try { localStorage.setItem("lumira-mirror-view", MIRROR.view); } catch (e) {}
        applyMirrorView();
        mirrorKick();
      });
    });
    document.addEventListener("visibilitychange", mirrorKick);
    setInterval(renderMirrorAge, 1000);
    MIRROR.wired = true;
    applyMirrorView();
    mirrorKick();
  }

  function mirrorActive() {
    return MIRROR.view === "live" && currentPage === "start" && !document.hidden;
  }

  function mirrorKick() {
    if (!MIRROR.wired) return;
    clearTimeout(MIRROR.timer);
    if (mirrorActive()) mirrorFetch();
  }

  function applyMirrorView() {
    var live = MIRROR.view === "live";
    $all("#mirror-view [data-view]").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-view") === MIRROR.view ? "true" : "false");
    });
    var showImg = live && !!MIRROR.url;
    $("#mp-live").hidden = !showImg;
    $("#mp-layout").hidden = showImg;
    var note = $("#mp-note");
    note.hidden = !live || showImg;
    note.textContent = MIRROR.failing ? MIRROR.error + " Hier der Aufbau:" : "Live-Bild wird geladen …";
    renderMirrorAge();
  }

  function mirrorFetch() {
    if (MIRROR.busy) return;
    MIRROR.busy = true;
    fetch("/api/mirror/screenshot", { credentials: "same-origin", cache: "no-store" }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          var err = new Error(res.status === 503 ? "Der Spiegel liefert gerade kein Bild."
            : res.status === 401 ? "Bitte neu anmelden."
            : "Der Spiegel ist nicht erreichbar – aus oder startet gerade.");
          err.detail = d.error || ("HTTP " + res.status);
          throw err;
        });
      }
      return res.blob().then(function (blob) {
        var old = MIRROR.url;
        MIRROR.url = URL.createObjectURL(blob);
        $("#mirror-img").src = MIRROR.url;
        if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 1000);
        // Empfangszeit statt Aufnahmezeit: die Uhr des Pi kann ohne RTC abweichen
        MIRROR.at = Date.now();
        MIRROR.failing = false;
        MIRROR.error = "";
      });
    }).catch(function (err) {
      MIRROR.failing = true;
      MIRROR.error = err.detail ? err.message : "Der Spiegel ist nicht erreichbar – aus oder startet gerade.";
      $("#mp-note").title = err.detail || err.message;
    }).then(function () {
      MIRROR.busy = false;
      applyMirrorView();
      clearTimeout(MIRROR.timer);
      if (mirrorActive()) MIRROR.timer = setTimeout(mirrorFetch, MIRROR.failing ? MIRROR_RETRY_MS : MIRROR_EVERY_MS);
    });
  }

  function renderMirrorAge() {
    if (!MIRROR.url) return;
    var s = Math.max(0, Math.round((Date.now() - MIRROR.at) / 1000));
    var age = s <= 2 ? "gerade eben" : s < 60 ? "vor " + s + " s" : "vor " + Math.round(s / 60) + " min";
    var fresh = !MIRROR.failing && s < 15;
    $("#mirror-age").textContent = MIRROR.failing ? "Verbindung unterbrochen · Stand " + age
      : mirrorActive() ? "Live · " + age : "Pausiert · Stand " + age;
    $("#mirror-dot").className = "dot" + (fresh ? " live" : "");
  }

  // Startseite, Karte Spiegel: Schnellschalter für die Dauerschleife
  function renderAmbientStart(s, media) {
    $("#start-amb-sw").setAttribute("aria-checked", s.enabled ? "true" : "false");
    $("#start-amb-sub").textContent = s.enabled ? media.name + (s.mode === "background" ? " · Hintergrund" : " · Vollbild") : "aus · " + media.name;
  }

  function renderModulePreview() {
    var flags = STATUS.edition.flags;
    function mod(key) { return moduleOn(MODULE_LIST.filter(function (x) { return x.key === key; })[0]); }
    var fpOn = flags.hasFamily && mod("familyPlan");
    var left = [];
    if (mod("clock")) left.push("Uhr");
    if (fpOn) left.push("Familienplan");
    setPreviewCell("top_left", left.join(" · "));
    var compOn = flags.hasFamily && mod("compliments");
    setPreviewCell("top_center", compOn ? "Sprüche" : "");
    var right = [];
    if (mod("weather")) right.push("Wetter");
    var rainOn = flags.hasRain && mod("rainRadar");
    if (rainOn) right.push("Regenradar");
    setPreviewCell("top_right", right.join(" · "));
    var calOn = flags.hasCal && mod("calendar");
    setPreviewCell("bottom_left", calOn ? "Kalender" : "");
    setPreviewCell("bottom_right", mod("statusHint") ? "Status" : "");
    var newsOn = mod("news");
    $("#mp-bottombar").textContent = newsOn ? "Nachrichten" : "";
    $("#mp-bottombar").hidden = !newsOn;
    var overlay = $("#mp-overlay");
    overlay.textContent = "Alarmierung – Vollbild bei Alarm";
    overlay.hidden = !alarmEnabled();
    var visible = left.length + right.length + (compOn ? 1 : 0) + (calOn ? 1 : 0) + (newsOn ? 1 : 0) + (mod("statusHint") ? 1 : 0);
    $("#mirror-sub").textContent = visible + " Module sichtbar";
  }
  function setPreviewCell(region, text) {
    var cell = $('.mp-cell[data-region="' + region + '"]');
    if (cell) cell.textContent = text;
  }

  function setTile(id, state) {
    var t = $(id);
    if (!t) return;
    t.classList.remove("warn", "err", "off");
    if (state) t.classList.add(state);
  }

  function refreshStatus() {
    api("/api/status").then(function (status) {
      STATUS = status;
      var ipv4 = (status.network.ipv4 || [])[0];
      $("#net-state-text").textContent = status.network.online ? "Heimnetz" : "getrennt";
      $("#net-sub").textContent = (status.network.ssid || "") + (ipv4 ? (status.network.ssid ? " · " : "") + ipv4.address : "") || "–";
      setTile("#tile-network", status.network.online ? "" : "warn");
      $("#wlan-status-v").textContent = status.network.online ? "verbunden" : "getrennt";
      $("#wlan-ssid-v").textContent = status.network.ssid || "–";
      renderIpInfo();
    }).catch(function () {});

    // Der Spiegel gilt als "läuft", wenn eines seiner Module antwortet
    // (Sprüche-Schalter bzw. Alarm-Webhook laufen im MagicMirror-Prozess).
    var flags = STATUS.edition.flags;
    var checks = [];
    if (alarmEnabled()) {
      checks.push(api("/api/proxy/alarm/health").then(function (data) {
        $("#alarm-state-text").textContent = "bereit";
        $("#alarm-sub").textContent = data.module || "MMM-aPagerAlarm";
        setTile("#tile-alarm", "");
        return true;
      }).catch(function () {
        $("#alarm-state-text").textContent = "nicht erreichbar";
        $("#alarm-sub").textContent = "Alarm-Modul antwortet nicht";
        setTile("#tile-alarm", "err");
        return false;
      }));
    }
    checks.push(api("/api/proxy/compliments/status").then(function (data) {
      $("#compliments-state").textContent = data.enabled === false ? "Aus" : "An";
      return true;
    }).catch(function () {
      $("#compliments-state").textContent = "–";
      return false;
    }));
    Promise.all(checks).then(function (results) {
      // Ein frisches Live-Bild ist auch ein Lebenszeichen des Spiegels
      var up = results.some(Boolean) || (!!MIRROR.url && !MIRROR.failing && Date.now() - MIRROR.at < 20000);
      $("#mirror-state-text").textContent = up ? "läuft" : "nicht erreichbar";
      setTile("#tile-mirror", up ? "" : "err");
    });
  }

  // ---------------------------------------------------------------------
  // Startseite: Begrüßung, Updates-Kachel, Familienplan, Als Nächstes, Wetter
  // ---------------------------------------------------------------------
  var WEATHER_NOW = null;
  var START_PLAN = null;
  var WEEKDAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var MONTHS_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  function renderGreeting() {
    if (currentPage !== "start") return;
    var now = new Date();
    var h = now.getHours();
    var hello = h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : h < 22 ? "Guten Abend" : "Gute Nacht";
    $("#area-eyebrow").textContent = "Start";
    $("#area-title").textContent = hello + (STATUS.edition.flags.hasFamily ? ", Familie" : "");
    var parts = [WEEKDAYS_LONG[now.getDay()] + ", " + now.getDate() + ". " + MONTHS_LONG[now.getMonth()]];
    if (SETTINGS && SETTINGS.location && SETTINGS.location.name) {
      parts.push(SETTINGS.location.name.split(",")[0] + (WEATHER_NOW !== null ? " " + Math.round(WEATHER_NOW) + "°" : ""));
    }
    $("#area-sub").textContent = parts.join(" · ");
  }

  function renderUpdateTile(s) {
    var n = (s && s.available) || 0;
    $("#upd-tile-text").textContent = n ? n + " verfügbar" : (s && s.checkedAt ? "aktuell" : "noch nicht geprüft");
    var names = (s && s.components || []).filter(function (c) { return c.updateAvailable; }).map(function (c) { return c.name; });
    $("#upd-tile-sub").textContent = names.length ? names.join(", ") : "MagicMirror² & Module";
    setTile("#tile-updates", n ? "warn" : (s && s.checkedAt ? "" : "off"));
    $all(".area-badge").forEach(function (b) { b.hidden = !n; b.textContent = String(n); });
  }

  function textOnColor(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#121214";
    var c = [1, 3, 5].map(function (i) { var v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.3 ? "#14161a" : "#ffffff";
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function memberAvatarSrc(m) {
    return m.avatar && m.avatar.type === "preset" ? "/avatars/" + m.avatar.value + ".jpg"
      : m.avatar && m.avatar.type === "upload" ? "/avatar-uploads/" + m.avatar.file + "?v=" + (m.avatar.v || 0) : null;
  }

  // Rundes Mitglieder-Bild (eigenes Avatar, Foto oder Anfangsbuchstabe)
  function memberAvatar(m) {
    var av = el("span", "mini-av", (m.name || "?").charAt(0).toUpperCase());
    av.style.background = m.color; av.style.color = textOnColor(m.color);
    var src = memberAvatarSrc(m);
    if (src) { var img = el("img"); img.alt = ""; img.src = src; img.onerror = function () { img.remove(); }; av.appendChild(img); }
    return av;
  }

  // Kopfzeile: Familienmitglieder statt Edition (die Editionen sind im
  // Hintergrund, siehe concept/produktvarianten.md)
  function renderMemberChip(members) {
    var stack = $("#member-stack");
    stack.replaceChildren();
    var list = (members || []).filter(function (m) { return !m.deleted; });
    list.slice(0, 4).forEach(function (m) {
      var av = memberAvatar(m);
      av.title = m.name;
      stack.appendChild(av);
    });
    if (list.length > 4) stack.appendChild(el("span", "mini-av more", "+" + (list.length - 4)));
    $("#member-label").textContent = !list.length ? "Familie anlegen" : list.length === 1 ? "1 Mitglied" : list.length + " Mitglieder";
    $("#member-chip").title = list.length ? list.map(function (m) { return m.name; }).join(", ") + " – verwalten" : "Familienmitglieder anlegen";
  }

  // [1,2,3,4,5] → "Mo–Fr" (wie im Familienplan)
  function startDaysText(days) {
    var short = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    var idx = [1, 2, 3, 4, 5, 6, 0].filter(function (n) { return days.indexOf(n) !== -1; }).map(function (n) { return (n + 6) % 7; });
    var runs = [];
    idx.forEach(function (i) { var l = runs[runs.length - 1]; if (l && i === l[1] + 1) l[1] = i; else runs.push([i, i]); });
    function nm(i) { return short[(i + 1) % 7]; }
    return runs.map(function (r) { return r[1] - r[0] >= 2 ? nm(r[0]) + "–" + nm(r[1]) : r[0] === r[1] ? nm(r[0]) : nm(r[0]) + ", " + nm(r[1]); }).join(", ");
  }

  function renderStartFamily(plan) {
    START_PLAN = plan;
    var wrap = $("#start-fp-rows");
    if (!wrap) return;
    wrap.innerHTML = "";
    var w = plan.currentWeek;
    $("#start-fp-week").textContent = w ? "KW " + w.kw : "";
    if (!w) {
      wrap.appendChild(el("p", "save-hint", plan.members && plan.members.length ? "Die erste Woche wird gleich angelegt." : "Noch keine Familie angelegt – unter Familie → Familienplan → Mitglieder geht es los."));
      renderStartNext();
      return;
    }
    var duties = {};
    (plan.allDuties || []).forEach(function (d) { duties[d.id] = d; });
    var order = (plan.allMembers || []).map(function (m) { return m.id; });
    Object.keys(w.assign).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }).forEach(function (id) {
      var m = (plan.allMembers || []).filter(function (x) { return x.id === id; })[0];
      if (!m) return;
      var row = el("div", "mini-row");
      row.appendChild(memberAvatar(m));
      var nm = el("span", "mini-name");
      nm.appendChild(el("b", null, m.name));
      nm.appendChild(el("span", null, m.role === "child" ? "Kind" : "Erwachsener"));
      row.appendChild(nm);
      var chips = el("span", "chips");
      w.assign[id].forEach(function (did) {
        var d = duties[did]; if (!d) return;
        var chip = el("span", "chip");
        var dot = el("i", "d"); dot.style.background = d.color;
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(d.name));
        // Feste Tage: heute fällig hervorheben, sonst die Tage dahinter
        var days = Array.isArray(d.days) ? d.days : [];
        if (days.length && days.length < 7) {
          var today = days.indexOf(new Date().getDay()) !== -1;
          chip.appendChild(el("span", "chip-days", today ? "heute" : startDaysText(days)));
          if (today) chip.classList.add("is-today");
        }
        chips.appendChild(chip);
      });
      if (!w.assign[id].length) chips.appendChild(el("span", "save-hint", "diese Woche frei"));
      row.appendChild(chips);
      wrap.appendChild(row);
    });
    renderStartNext();
  }

  // Nächste Termine aus „Wichtige Termine“ + Wochenwechsel des Familienplans
  function daysUntilMMDD(mmdd, today) {
    var p = /^(\d{2})-(\d{2})$/.exec(String(mmdd || ""));
    if (!p) return -1;
    var t = new Date(today.getFullYear(), Number(p[1]) - 1, Number(p[2]));
    if (t < today) t = new Date(today.getFullYear() + 1, Number(p[1]) - 1, Number(p[2]));
    return Math.round((t - today) / 864e5);
  }
  function whenText(days) {
    return days === 0 ? "heute" : days === 1 ? "morgen" : "in " + days + " Tagen";
  }

  function renderStartNext() {
    var list = $("#start-next-list");
    if (!list || !SETTINGS) return;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var items = [];
    var fam = SETTINGS.family || {};
    (fam.birthdays || []).forEach(function (b) {
      var d = daysUntilMMDD(b.date, today);
      if (d >= 0) items.push({ days: d, title: "Geburtstag " + b.name, icon: "cake" });
    });
    anniversariesOf(fam).forEach(function (a) {
      var ad = daysUntilMMDD(String(a.date).slice(5), today);
      var label = a.type === "other" ? a.label : ANN_LABEL[a.type];
      if (ad >= 0 && label) items.push({ days: ad, title: label, icon: "heart" });
    });
    (fam.countdowns || []).forEach(function (c) {
      var d = daysUntilMMDD(c.date, today);
      if (d >= 0) items.push({ days: d, title: c.label, icon: "hourglass", when: d === 0 ? "heute" : "noch " + d + (d === 1 ? " Tag" : " Tage") });
    });
    if (START_PLAN && START_PLAN.preview && START_PLAN.preview[0]) {
      var p = START_PLAN.preview[0].start.split("-");
      var start = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      var dd = Math.round((start - today) / 864e5);
      items.push({ days: dd, title: "Wochenwechsel Familienplan", icon: "refresh",
        when: WEEKDAYS_LONG[start.getDay()].slice(0, 2) + ", " + p[2] + "." + p[1] + "." });
    }
    items.sort(function (a, b) { return a.days - b.days; });
    list.innerHTML = "";
    if (!items.length) { list.appendChild(el("p", "save-hint", "Noch keine Termine eingetragen.")); return; }
    items.slice(0, 4).forEach(function (it) {
      var row = el("div", "next-row");
      var ic = el("span", "next-ic"); ic.appendChild(svgIcon(it.icon));
      row.appendChild(ic);
      row.appendChild(el("b", null, it.title));
      row.appendChild(el("span", null, it.when || whenText(it.days)));
      list.appendChild(row);
    });
  }

  // Wetter direkt vom Browser bei Open-Meteo (kostenlos, ohne Schlüssel) –
  // ohne Internet bleibt die Karte einfach ausgeblendet.
  function weatherIcon(code) {
    if (code === 0 || code === 1) return "sun";
    if (code === 2) return "cloudsun";
    if (code === 3) return "cloud";
    if (code === 45 || code === 48) return "fog";
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return "snow";
    if (code >= 95) return "storm";
    if (code >= 51) return "rain";
    return "cloud";
  }

  function loadWeather() {
    var loc = SETTINGS && SETTINGS.location;
    if (!loc || !isFinite(loc.lat) || !isFinite(loc.lon)) return;
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(loc.lat) + "&longitude=" + encodeURIComponent(loc.lon) +
      "&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&forecast_hours=6&timezone=auto";
    fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (d) {
      WEATHER_NOW = d.current && typeof d.current.temperature_2m === "number" ? d.current.temperature_2m : null;
      var row = $("#start-weather-row");
      row.innerHTML = "";
      var cells = [{ t: "Jetzt", code: d.current.weather_code, temp: d.current.temperature_2m, now: true }];
      (d.hourly.time || []).slice(1, 6).forEach(function (iso, i) {
        cells.push({ t: iso.slice(11, 13) + " Uhr", code: d.hourly.weather_code[i + 1], temp: d.hourly.temperature_2m[i + 1] });
      });
      cells.forEach(function (c) {
        var cell = el("div", "wx" + (c.now ? " now" : ""));
        cell.appendChild(el("span", null, c.t));
        cell.appendChild(svgIcon(weatherIcon(c.code)));
        cell.appendChild(el("b", null, Math.round(c.temp) + "°"));
        row.appendChild(cell);
      });
      $("#start-weather-place").textContent = (loc.name || "").split(",")[0];
      $("#start-weather").hidden = false;
      renderGreeting();
    }).catch(function () { /* kein Internet: Wetter-Karte bleibt aus */ });
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
        row.innerHTML = '<span class="ssid">' + escapeHtml(r.name) + '</span>' +
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
  // Als App (Startbildschirm), siehe Seite „Als App“
  // ---------------------------------------------------------------------
  // Chrome/Edge bieten das Installieren nur über HTTPS (oder localhost) an –
  // dann kommt dieses Ereignis und wir zeigen einen eigenen Knopf. Im
  // Heimnetz per http bleibt es aus, dafür gibt es die Anleitung.
  var installPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installPrompt = e;
    var b = document.getElementById("app-install");
    if (b) b.hidden = false;
  });

  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && (window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches));
  }

  function detectOs() {
    var ua = navigator.userAgent || "";
    // iPadOS meldet sich als Mac, hat aber Touch
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android/.test(ua)) return "android";
    return "desktop";
  }

  function showOsSteps(os) {
    $all("#app-os [data-os]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-os") === os ? "true" : "false"); });
    $all("[data-os-steps]").forEach(function (ol) { ol.hidden = ol.getAttribute("data-os-steps") !== os; });
  }

  function wireAppPage() {
    var os = detectOs();
    var standalone = isStandalone();
    var portalHost = (STATUS.portalUrl || "").replace(/^https?:\/\//, "");
    var ip = ((STATUS.network && STATUS.network.ipv4) || [])[0];
    var port = (portalHost.match(/:(\d+)$/) || [])[1] || "8092";

    $("#app-mode").textContent = standalone ? "LUMIRA läuft als App" : "LUMIRA läuft im Browser";
    $("#app-mode-sub").textContent = standalone
      ? "Alles erledigt – das Portal ist auf diesem Gerät als App abgelegt."
      : "Mit der Anleitung unten liegt LUMIRA in einer Minute auf deinem Startbildschirm.";
    $all("[data-app-host]").forEach(function (e) { e.textContent = portalHost || "lumira.local:8092"; });
    $all("[data-app-ip]").forEach(function (e) { e.textContent = ip ? ip.address + ":" + port : "siehe Info"; });
    $("#app-origin").textContent = location.host;

    showOsSteps(os);
    $all("#app-os [data-os]").forEach(function (b) {
      b.addEventListener("click", function () { showOsSteps(b.getAttribute("data-os")); });
    });

    var install = $("#app-install");
    install.hidden = !installPrompt || standalone;
    install.addEventListener("click", function () {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt.userChoice.then(function (r) {
        if (r && r.outcome === "accepted") { install.hidden = true; toast("LUMIRA wird installiert"); }
        installPrompt = null;
      });
    });

    // Hinweis auf der Startseite: nur auf Handy/Tablet im Browser, bis man ihn wegklickt
    var dismissed = false;
    try { dismissed = localStorage.getItem("lumira-app-hint") === "off"; } catch (e) {}
    $("#app-hint").hidden = standalone || dismissed || os === "desktop";
    $("#app-hint-close").addEventListener("click", function () {
      $("#app-hint").hidden = true;
      try { localStorage.setItem("lumira-app-hint", "off"); } catch (e) {}
    });
  }

  // ---------------------------------------------------------------------
  // Sicherheit / PIN
  // ---------------------------------------------------------------------
  function loadSessions() {
    var pinSet = !!(SETTINGS.portal && SETTINGS.portal.pinSet);
    $("#sessions-card").hidden = !pinSet;
    if (!pinSet) return;
    api("/api/auth/sessions").then(function (r) {
      $("#sessions-count").textContent = r.count === 1
        ? "Nur dieses Gerät ist angemeldet."
        : r.count + " Geräte bzw. Browser sind angemeldet (inklusive diesem).";
      $("#sessions-clear").disabled = r.count < 2;
    }).catch(function () { $("#sessions-card").hidden = true; });
  }

  function wireSicherheit() {
    $("#pin-save").addEventListener("click", function () {
      var pin = $("#pin-new").value.trim();
      var hint = $("#pin-hint");
      api("/api/auth/set-pin", { method: "POST", body: { pin: pin } }).then(function () {
        hint.textContent = "PIN gespeichert. Andere Geräte müssen sich neu anmelden.";
        $("#pin-new").value = "";
        $("#pin-remove").hidden = false;
        SETTINGS.portal = SETTINGS.portal || {};
        SETTINGS.portal.pinSet = true;
        loadSessions();
      }).catch(function (err) { hint.textContent = "Fehler: " + err.message; });
    });
    $("#pin-remove").hidden = !(SETTINGS.portal && SETTINGS.portal.pinSet);
    loadSessions();
    $("#sessions-clear").addEventListener("click", function () {
      if (!confirm("Alle anderen Geräte abmelden? Dort muss dann wieder der PIN eingegeben werden.")) return;
      api("/api/auth/logout-others", { method: "POST" }).then(function () {
        $("#sessions-hint").textContent = "Erledigt.";
        loadSessions();
      }).catch(function (err) { $("#sessions-hint").textContent = "Fehler: " + err.message; });
    });
    $("#pin-remove").addEventListener("click", function () {
      if (!confirm("PIN wirklich entfernen? Das Portal ist danach ohne Anmeldung im Heimnetz erreichbar.")) return;
      var hint = $("#pin-remove-hint");
      api("/api/auth/remove-pin", { method: "POST" }).then(function () {
        hint.textContent = "PIN entfernt.";
        $("#pin-remove").hidden = true;
        SETTINGS.portal.pinSet = false;
        loadSessions();
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
