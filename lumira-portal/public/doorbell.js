// LUMIRA Self-Service-Portal – Türklingel (Spiegel → Klingel).
// Siehe lib/doorbell.js, lib/ring.js und modules/MMM-Doorbell.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;     // { toast, setModule(on) → Promise, currentPage() }
  var S = null;       // letzter Stand von GET /api/doorbell
  var hls = null;
  var previewKey = "";
  var pollTimer = null;
  var tickTimer = null;
  var busy = false;

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function api(path, method, body) {
    var init = { method: method || "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
        return data;
      });
    });
  }

  function fail(err) { ctx.toast(err.message || String(err)); }

  function sw(id, on) { $(id).setAttribute("aria-checked", on ? "true" : "false"); }
  function isOn(id) { return $(id).getAttribute("aria-checked") === "true"; }

  // ---------------------------------------------------------------------
  // Anzeige
  // ---------------------------------------------------------------------
  var RING_TEXT = {
    off: ["", "Türklingel ist ausgeschaltet"],
    "needs-login": ["warn", "Nicht mit Ring verbunden"],
    connecting: ["warn", "Verbinde mit Ring …"],
    connected: ["ok", "Mit Ring verbunden"],
    error: ["err", "Verbindungsproblem"]
  };

  function render() {
    if (!S) return;
    var c = S.config;
    var page = $('.page[data-page="klingel"]');
    page.classList.toggle("is-off", !S.enabled);
    sw("#db-on", S.enabled);
    var r = S.ring || {};
    $("#db-on-sub").textContent = !S.enabled ? "aus – der Spiegel reagiert nicht aufs Klingeln"
      : r.status === "connected" ? "an – wartet aufs Klingeln" + (r.lastDing ? " · zuletzt geklingelt " + timeText(r.lastDing.at) : "")
      : "an – Ring noch nicht verbunden (Test geht trotzdem)";

    // Ring-Verbindung
    var t = RING_TEXT[r.status] || RING_TEXT.error;
    $("#db-ring-dot").className = "dot" + (t[0] ? " " + t[0] : "");
    var txt = $("#db-ring-text");
    txt.textContent = t[1] + (r.account && r.status === "connected" ? " (" + r.account + ")" : "");
    if (r.message) { txt.appendChild(document.createElement("br")); txt.appendChild(el("small", null, r.message)); }
    var needLogin = S.enabled && !r.loggedIn;
    $("#db-login").hidden = !needLogin || !!r.awaitingCode;
    $("#db-code").hidden = !S.enabled || !r.awaitingCode;
    $("#db-code-prompt").textContent = r.prompt || "";
    $("#db-connected").hidden = !S.enabled || !r.loggedIn;
    $("#db-reconnect").hidden = r.status === "connected";
    renderDevices();
    $("#db-power").value = c.power;

    // Meldung
    sw("#db-notify", c.notify.enabled);
    if (document.activeElement !== $("#db-text")) $("#db-text").value = c.notify.text;
    $("#db-notify-sec").value = String(c.notify.seconds);
    if ($("#db-notify-sec").value !== String(c.notify.seconds)) addOption($("#db-notify-sec"), c.notify.seconds, c.notify.seconds + " Sekunden");
    sw("#db-glow", c.notify.glow);

    // Ton
    sw("#db-sound", c.sound.enabled);
    $("#db-sound-src").value = c.sound.source;
    $("#db-volume").value = c.sound.volume;
    $("#db-volume-val").textContent = c.sound.volume + " %";
    $("#db-sound-del").hidden = !c.sound.file;
    $("#db-sound-info").textContent = c.sound.file
      ? "Eigener Ton: " + (c.sound.name || "hochgeladen") + ". MP3, WAV oder OGG bis 5 MB – liegt auf dem Spiegel, Abspielen ohne Internet."
      : "MP3, WAV oder OGG bis 5 MB. Der Ton liegt auf dem Spiegel – zum Abspielen braucht es kein Internet.";
    var customOpt = $('#db-sound-src option[value="custom"]');
    customOpt.disabled = !c.sound.file;

    // Video
    sw("#db-video", c.video.enabled);
    $("#db-size").value = c.video.size;
    var preset = ["30", "60", "120", "300"].indexOf(String(c.video.seconds)) !== -1;
    if (!$("#db-dur-custom-row").hidden && document.activeElement === $("#db-dur-custom")) {
      // gerade am Tippen – nicht überschreiben
    } else {
      $("#db-dur").value = preset ? String(c.video.seconds) : "custom";
      $("#db-dur-custom-row").hidden = preset;
      $("#db-dur-custom").value = c.video.seconds;
    }
    sw("#db-autoclose", c.video.autoClose);
    $("#db-autoclose-sub").textContent = c.video.autoClose ? "nach der Anzeigedauer" : "aus: bleibt bis „Jetzt schließen“ (höchstens 10 Minuten)";
    sw("#db-countdown", c.video.countdown);
    $("#db-countdown").setAttribute("aria-disabled", c.video.autoClose ? "false" : "true");

    renderEvent();
  }

  function addOption(select, value, label) {
    var o = el("option", null, label);
    o.value = String(value);
    select.appendChild(o);
    select.value = String(value);
  }

  function timeText(iso) {
    var d = new Date(iso);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  function renderDevices() {
    var wrap = $("#db-devices");
    wrap.innerHTML = "";
    var list = (S && S.devices) || [];
    if (!list.length) {
      if (S.ring && S.ring.status === "connected") wrap.appendChild(el("p", "save-hint", "Keine Ring-Türklingel im Konto gefunden."));
      return;
    }
    list.forEach(function (d) {
      var row = el("div", "db-device");
      var ico = el("span", "db-ico");
      ico.appendChild(faIcon(d.power === "battery" ? "fa-battery-three-quarters" : "fa-plug"));
      row.appendChild(ico);
      var tl = el("span", "tl2", d.name);
      var info = [d.model];
      if (d.power === "battery") info.push("Akku" + (d.batteryLevel !== null && d.batteryLevel !== undefined ? " " + d.batteryLevel + " %" : ""));
      else if (d.power === "wired") info.push("Kabel");
      if (d.offline) info.push("offline");
      tl.appendChild(el("small", null, info.filter(Boolean).join(" · ")));
      row.appendChild(tl);
      if (list.length > 1) {
        var b = el("button", "sw");
        b.type = "button";
        b.setAttribute("role", "switch");
        b.setAttribute("aria-label", d.name + " löst aus");
        b.setAttribute("aria-checked", d.active ? "true" : "false");
        b.title = "Diese Klingel löst auf dem Spiegel aus";
        b.addEventListener("click", function () { toggleCamera(d.id); });
        row.appendChild(b);
      }
      wrap.appendChild(row);
    });
  }

  function faIcon(name) {
    var i = el("i", "fa-solid " + name);
    i.setAttribute("aria-hidden", "true");
    return i;
  }

  function toggleCamera(id) {
    var all = S.devices.map(function (d) { return d.id; });
    var cur = S.config.cameras.length ? S.config.cameras.slice() : all.slice();
    var i = cur.indexOf(id);
    if (i === -1) cur.push(id); else cur.splice(i, 1);
    if (!cur.length) { ctx.toast("Mindestens eine Klingel muss auslösen"); return; }
    send({ cameras: cur.length === all.length ? [] : cur });
  }

  // Laufendes Klingeln: Restzeit, „Jetzt schließen“, Vorschau mit Live-Video
  function renderEvent() {
    var ev = S && S.event;
    $("#db-event").hidden = !ev;
    $("#db-close").hidden = !ev;
    if (!ev) { stopPreview(); return; }
    $("#db-event-title").textContent = (ev.source === "test" ? "Test-Klingeln" : "Es klingelt") + " – " + ((ev.camera && ev.camera.name) || "Haustür");
    var v = ev.video || {};
    var msg = v.status === "starting" ? "Verbinde mit der Klingel …"
      : v.status === "live" ? "Live-Video läuft auf dem Spiegel"
      : v.status === "demo" ? "Testbild auf dem Spiegel – Ring ist nicht verbunden"
      : v.status === "off" ? "Nur Meldung/Ton – Video ist ausgeschaltet"
      : "Kein Video: " + (v.message || "nicht verfügbar");
    $("#db-event-msg").textContent = msg;
    updateLeft();
    renderPreview(ev);
  }

  function updateLeft() {
    var ev = S && S.event;
    if (!ev) return;
    var left = Math.max(0, Math.ceil((Date.parse(ev.until) - Date.now()) / 1000));
    $("#db-event-left").textContent = left > 90 ? "noch " + Math.ceil(left / 60) + " min" : "noch " + left + " s";
  }

  function renderPreview(ev) {
    var key = ev.id + "|" + (ev.live || "") + "|" + (ev.live ? "" : (ev.snapshotUrl || "")) + "|" + (ev.video && ev.video.status);
    if (key === previewKey) return;
    previewKey = key;
    stopPreview(true);
    var box = $("#db-preview");
    box.innerHTML = "";
    if (ev.live && window.Hls && window.Hls.isSupported()) {
      var video = el("video");
      video.muted = true; video.autoplay = true; video.playsInline = true;
      video.setAttribute("playsinline", "");
      box.appendChild(video);
      hls = new window.Hls({ liveSyncDurationCount: 2, maxBufferLength: 10, backBufferLength: 0 });
      hls.loadSource(ev.live);
      hls.attachMedia(video);
      video.play().catch(function () {});
    } else if (ev.live && document.createElement("video").canPlayType("application/vnd.apple.mpegurl")) {
      var v2 = el("video"); // Safari/iPhone spielt HLS selbst
      v2.muted = true; v2.autoplay = true; v2.playsInline = true;
      v2.setAttribute("playsinline", "");
      v2.src = ev.live;
      box.appendChild(v2);
    } else if (ev.snapshotUrl) {
      var img = el("img");
      img.alt = "Letztes Bild der Klingel";
      img.src = ev.snapshotUrl;
      box.appendChild(img);
    } else if (ev.video && ev.video.status === "starting") {
      box.appendChild(el("div", "db-note", "Verbinde mit der Klingel …"));
    }
  }

  function stopPreview(keepKey) {
    if (hls) { try { hls.destroy(); } catch (e) { /* weg */ } hls = null; }
    if (!keepKey) { previewKey = ""; var b = $("#db-preview"); if (b) b.innerHTML = ""; }
  }

  // ---------------------------------------------------------------------
  // Laden / Speichern
  // ---------------------------------------------------------------------
  function load() {
    return api("/api/doorbell").then(function (s) { S = s; render(); schedule(); }).catch(function () { schedule(); });
  }

  // Während eines Klingelns oder auf der Klingel-Seite oft nachsehen, sonst selten
  function schedule() {
    clearTimeout(pollTimer);
    var visible = !document.hidden && ctx.currentPage() === "klingel";
    var fast = (S && S.event) || (visible && S && S.ring && ["connecting"].indexOf(S.ring.status) !== -1);
    pollTimer = setTimeout(load, fast ? 1500 : visible ? 5000 : 30000);
  }

  function send(patch, msg) {
    return api("/api/doorbell/config", "PUT", patch).then(function (s) {
      S = s; render();
      if (msg) ctx.toast(msg);
    }).catch(function (err) { fail(err); render(); });
  }

  function setEnabled(on) {
    if (busy) return;
    busy = true;
    sw("#db-on", on);
    ctx.setModule(on).then(function () {
      ctx.toast(on ? "Türklingel an – MagicMirror startet einmal neu" : "Türklingel aus");
      return load();
    }).catch(fail).then(function () { busy = false; render(); });
  }

  function sendDuration() {
    var v = $("#db-dur").value;
    if (v === "custom") {
      $("#db-dur-custom-row").hidden = false;
      $("#db-dur-custom").focus();
      return;
    }
    $("#db-dur-custom-row").hidden = true;
    send({ video: { seconds: Number(v) } });
  }

  function playPreview() {
    var c = S && S.config;
    if (!c) return;
    var vol = c.sound.volume / 100;
    if (c.sound.source === "custom" && c.sound.file) {
      var a = new Audio("/api/doorbell/sound/file?t=" + Date.now());
      a.volume = vol;
      a.play().catch(function (err) { fail(err); });
    } else if (window.LumiraGong) {
      window.LumiraGong.play(vol);
    }
  }

  function uploadSound(file) {
    if (file.size > 5 * 1024 * 1024) { ctx.toast("Ton zu groß (höchstens 5 MB)"); return; }
    var fd = new FormData();
    fd.append("sound", file, file.name);
    fetch("/api/doorbell/sound", { method: "POST", body: fd, credentials: "same-origin" }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
        return data;
      });
    }).then(function (s) { S = s; render(); ctx.toast("Eigener Ton gespeichert"); }).catch(fail);
  }

  // ---------------------------------------------------------------------
  // Ring-Anmeldung
  // ---------------------------------------------------------------------
  function login(e) {
    e.preventDefault();
    var btn = $("#db-login-btn");
    btn.disabled = true;
    btn.textContent = "Melde an …";
    api("/api/ring/login", "POST", { email: $("#db-email").value, password: $("#db-pass").value }).then(function (r) {
      $("#db-pass").value = "";
      if (r.needsCode) {
        ctx.toast("Ring hat einen Code geschickt");
        setTimeout(function () { $("#db-code-in").focus(); }, 50);
      } else {
        ctx.toast("Mit Ring verbunden");
      }
      return load();
    }).catch(fail).then(function () { btn.disabled = false; btn.textContent = "Bei Ring anmelden"; });
  }

  function confirmCode(e) {
    e.preventDefault();
    var btn = $("#db-code-btn");
    btn.disabled = true;
    api("/api/ring/code", "POST", { code: $("#db-code-in").value }).then(function () {
      $("#db-code-in").value = "";
      $("#db-email").value = "";
      ctx.toast("Mit Ring verbunden");
      return load();
    }).catch(fail).then(function () { btn.disabled = false; });
  }

  window.LumiraDoorbell = {
    init: function (context) {
      ctx = context;
      $("#db-on").addEventListener("click", function () { setEnabled(!(S && S.enabled)); });
      $("#db-test").addEventListener("click", function () {
        var btn = this;
        btn.disabled = true;
        api("/api/doorbell/test", "POST").then(function (s) {
          S = s; render(); schedule();
          ctx.toast("Klingeln auf dem Spiegel ausgelöst");
        }).catch(fail).then(function () { btn.disabled = false; });
      });
      $("#db-close").addEventListener("click", function () {
        api("/api/doorbell/close", "POST").then(function (s) { S = s; render(); ctx.toast("Geschlossen"); }).catch(fail);
      });
      $("#db-login").addEventListener("submit", login);
      $("#db-code").addEventListener("submit", confirmCode);
      $("#db-code-cancel").addEventListener("click", function () {
        api("/api/ring/cancel", "POST").then(load).catch(fail);
      });
      $("#db-logout").addEventListener("click", function () {
        if (!confirm("Vom Ring-Konto abmelden? Der Spiegel reagiert dann nicht mehr aufs Klingeln, bis du dich neu anmeldest.")) return;
        api("/api/ring/logout", "POST").then(function (s) { S = s; render(); ctx.toast("Von Ring abgemeldet"); }).catch(fail);
      });
      $("#db-reconnect").addEventListener("click", function () {
        var btn = this;
        btn.disabled = true;
        api("/api/ring/reconnect", "POST").then(function (s) { S = s; render(); }).catch(fail).then(function () { btn.disabled = false; });
      });
      $("#db-power").addEventListener("change", function () { send({ power: this.value }); });

      $("#db-notify").addEventListener("click", function () { send({ notify: { enabled: !isOn("#db-notify") } }); });
      $("#db-glow").addEventListener("click", function () { send({ notify: { glow: !isOn("#db-glow") } }); });
      $("#db-text").addEventListener("change", function () { send({ notify: { text: this.value } }, "Text gespeichert"); });
      $("#db-notify-sec").addEventListener("change", function () { send({ notify: { seconds: Number(this.value) } }); });

      $("#db-sound").addEventListener("click", function () { send({ sound: { enabled: !isOn("#db-sound") } }); });
      $("#db-sound-src").addEventListener("change", function () { send({ sound: { source: this.value } }); });
      $("#db-volume").addEventListener("input", function () { $("#db-volume-val").textContent = this.value + " %"; });
      $("#db-volume").addEventListener("change", function () { send({ sound: { volume: Number(this.value) } }); });
      $("#db-sound-play").addEventListener("click", playPreview);
      $("#db-sound-file").addEventListener("change", function () {
        var f = this.files && this.files[0];
        this.value = "";
        if (f) uploadSound(f);
      });
      $("#db-sound-del").addEventListener("click", function () {
        api("/api/doorbell/sound", "DELETE").then(function (s) { S = s; render(); ctx.toast("Eigener Ton gelöscht – wieder Ding-Dong"); }).catch(fail);
      });

      $("#db-video").addEventListener("click", function () { send({ video: { enabled: !isOn("#db-video") } }); });
      $("#db-size").addEventListener("change", function () { send({ video: { size: this.value } }); });
      $("#db-dur").addEventListener("change", sendDuration);
      $("#db-dur-custom").addEventListener("change", function () {
        var n = Math.round(Number(this.value));
        if (!(n >= 10 && n <= 600)) { ctx.toast("Eigene Zeit: 10 bis 600 Sekunden"); return; }
        send({ video: { seconds: n } }, "Anzeigedauer gespeichert");
      });
      $("#db-autoclose").addEventListener("click", function () { send({ video: { autoClose: !isOn("#db-autoclose") } }); });
      $("#db-countdown").addEventListener("click", function () {
        if (this.getAttribute("aria-disabled") === "true") return;
        send({ video: { countdown: !isOn("#db-countdown") } });
      });

      document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
      tickTimer = setInterval(updateLeft, 1000);
      load();
    },
    reload: function () { if (ctx) return load(); }
  };
})();
