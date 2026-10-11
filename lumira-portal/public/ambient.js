// LUMIRA Self-Service-Portal – Dauerschleife auf dem Spiegel (Spiegel →
// Bildschirm). Siehe lib/ambient.js und modules/MMM-Ambient.
// Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;     // { toast }
  var S = null;       // letzter Stand von GET /api/ambient
  var fireStops = [];
  var TIMERS = [[0, "Erst wenn ich es ausschalte"], [15, "nach 15 Minuten"], [30, "nach 30 Minuten"], [60, "nach 1 Stunde"],
    [120, "nach 2 Stunden"], [180, "nach 3 Stunden"]];

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

  function sizeText(n) {
    if (!n) return "";
    return n >= 1048576 ? (n / 1048576).toFixed(n >= 104857600 ? 0 : 1).replace(".", ",") + " MB" : Math.round(n / 1024) + " KB";
  }

  function timeText(iso) {
    var d = new Date(iso);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  function current() {
    return (S.media || []).filter(function (m) { return m.id === S.mediaId; })[0] || { name: "Lagerfeuer" };
  }

  // ---------------------------------------------------------------------
  // Anzeige
  // ---------------------------------------------------------------------
  function render() {
    if (!S) return;
    $("#amb-switch").setAttribute("aria-checked", S.enabled ? "true" : "false");
    $("#amb-status").textContent = S.enabled
      ? "läuft: " + current().name + " · " + (S.mode === "background" ? "Hintergrund" : "Vollbild") + (S.until ? " · aus um " + timeText(S.until) : "")
      : "aus";
    $("#amb-mode").value = S.mode;
    $("#amb-sound").setAttribute("aria-checked", S.sound ? "true" : "false");
    $("#amb-sound-row").hidden = current().type !== "video" && current().type !== "youtube";
    $("#amb-ytq-row").hidden = current().type !== "youtube";
    $("#amb-ytq").value = S.ytQuality || "480";
    renderGrid();
    if (ctx && ctx.onStatus) ctx.onStatus(S, current());
  }

  function renderGrid() {
    fireStops.forEach(function (stop) { stop(); });
    fireStops = [];
    var grid = $("#amb-grid");
    grid.replaceChildren();
    (S.media || []).forEach(function (m) {
      var tile = el("div", "amb-tile" + (m.id === S.mediaId ? " sel" : ""));
      var pick = el("button", "amb-pick");
      pick.type = "button";
      pick.setAttribute("aria-pressed", m.id === S.mediaId ? "true" : "false");
      pick.setAttribute("aria-label", m.name + " auswählen");
      var prev = el("span", "amb-prev");
      if (m.type === "builtin") {
        var c = el("canvas");
        prev.appendChild(c);
        if (window.LumiraFire) fireStops.push(window.LumiraFire.start(c, { width: 96, height: 60, fps: 18 }));
        prev.classList.add("is-fire");
      } else if (m.type === "youtube") {
        var thumb = el("img");
        thumb.alt = ""; thumb.loading = "lazy";
        thumb.src = "https://i.ytimg.com/vi/" + m.youtubeId + "/hqdefault.jpg";
        prev.appendChild(thumb);
        prev.appendChild(el("span", "amb-yt-badge", "▶"));
      } else if (m.type === "video") {
        var v = el("video");
        v.src = "/api/ambient/media/" + m.id + "/file";
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = "metadata";
        // Vorschau bewegt sich nur unter dem Mauszeiger bzw. wenn ausgewählt
        if (m.id === S.mediaId) v.autoplay = true;
        tile.addEventListener("mouseenter", function () { v.play().catch(function () {}); });
        tile.addEventListener("mouseleave", function () { if (m.id !== S.mediaId) v.pause(); });
        prev.appendChild(v);
      } else {
        var img = el("img");
        img.alt = ""; img.loading = "lazy";
        img.src = "/api/ambient/media/" + m.id + "/file";
        prev.appendChild(img);
      }
      pick.appendChild(prev);
      var meta = el("span", "amb-meta");
      meta.appendChild(el("b", null, m.name));
      meta.appendChild(el("span", null, m.type === "builtin" ? "eingebaut · gezeichnet"
        : m.type === "youtube" ? "YouTube · braucht Internet"
        : (m.type === "video" ? "Video" : "Bild") + (m.size ? " · " + sizeText(m.size) : "")));
      pick.appendChild(meta);
      pick.addEventListener("click", function () { if (m.id !== S.mediaId) send({ mediaId: m.id }); });
      tile.appendChild(pick);
      if (m.type !== "builtin") {
        var del = el("button", "amb-del", "✕");
        del.type = "button"; del.title = "Löschen"; del.setAttribute("aria-label", m.name + " löschen");
        del.addEventListener("click", function () {
          if (!confirm("„" + m.name + "“ löschen?" + (m.id === S.mediaId && S.enabled ? " Die Dauerschleife wird dabei ausgeschaltet." : ""))) return;
          api("/api/ambient/media/" + m.id, "DELETE").then(function (s) { S = s; render(); ctx.toast("Gelöscht"); }).catch(fail);
        });
        tile.appendChild(del);
      }
      grid.appendChild(tile);
    });
  }

  function fail(err) { ctx.toast(err.message); }

  function send(patch, okText) {
    return api("/api/ambient", "PUT", patch).then(function (s) {
      S = s; render();
      if (okText) ctx.toast(okText);
    }).catch(function (err) { fail(err); load(); });
  }

  function load() {
    return api("/api/ambient").then(function (s) { S = s; render(); }).catch(function () {});
  }

  // ---------------------------------------------------------------------
  // Hochladen mit Fortschritt (fetch kennt keinen Upload-Fortschritt)
  // ---------------------------------------------------------------------
  function upload(file) {
    var hint = $("#amb-upload");
    if (S && file.size > S.limits.maxBytes) { hint.textContent = "Die Datei ist zu groß (höchstens 300 MB)."; return; }
    var fd = new FormData();
    fd.append("name", file.name);
    fd.append("file", file);
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/ambient/media");
    xhr.withCredentials = true;
    var bar = $("#amb-progress");
    bar.hidden = false; bar.value = 0;
    $("#amb-file-btn").classList.add("disabled");
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      bar.value = e.loaded / e.total;
      hint.textContent = e.loaded >= e.total
        ? "Hochgeladen – wird für den Spiegel vorbereitet …"
        : "Lade hoch … " + Math.round(e.loaded / e.total * 100) + " % von " + sizeText(e.total);
    };
    xhr.onload = function () {
      bar.hidden = true;
      $("#amb-file-btn").classList.remove("disabled");
      var data = {};
      try { data = JSON.parse(xhr.responseText); } catch (e) { /* leer */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        hint.textContent = data.note || "";
        S = data; render();
        ctx.toast(data.converted ? "Hochgeladen – als Video umgewandelt, läuft flüssiger" : "Hochgeladen");
        if (data.added) send({ mediaId: data.added });
      } else {
        hint.textContent = data.error || "Hochladen fehlgeschlagen (" + xhr.status + ")";
      }
    };
    xhr.onerror = function () {
      bar.hidden = true;
      $("#amb-file-btn").classList.remove("disabled");
      hint.textContent = "Hochladen fehlgeschlagen – Verbindung unterbrochen.";
    };
    xhr.send(fd);
  }

  // Format des Spiegels aus dem Live-Bild (MMM-LumiraStatus) – hochkant oder quer
  function mirrorAspect() {
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 4000); });
    var shot = fetch("/api/mirror/screenshot", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) {
        if (!b) return null;
        return new Promise(function (resolve) {
          var u = URL.createObjectURL(b), i = new Image();
          i.onload = function () { URL.revokeObjectURL(u); resolve(i.naturalWidth / i.naturalHeight); };
          i.onerror = function () { URL.revokeObjectURL(u); resolve(null); };
          i.src = u;
        });
      }).catch(function () { return null; });
    return Promise.race([shot, timeout]);
  }

  function cropThenUpload(file) {
    var hint = $("#amb-upload");
    hint.textContent = "Format des Spiegels wird ermittelt …";
    mirrorAspect().then(function (a) {
      hint.textContent = "";
      var portrait = a ? a < 1 : false;
      var aspects = [
        { label: "Hochkant 9:16", value: 9 / 16 },
        { label: "Quer 16:9", value: 16 / 9 },
        { label: "Original", value: "original" }
      ];
      // Passt das Live-Bild genau zu keinem Standard, sein eigenes Format anbieten
      if (a && Math.abs(a - 9 / 16) > 0.02 && Math.abs(a - 16 / 9) > 0.02) aspects.unshift({ label: "Wie der Spiegel", value: a });
      var start = a ? aspects[0].value : (portrait ? 9 / 16 : 16 / 9);
      return window.LumiraCrop.open({ file: file, aspects: aspects, aspect: start, out: { maxSide: 1920 }, quality: 0.9, title: "Hintergrundbild zuschneiden" });
    }).then(function (blob) {
      if (!blob) return; // abgebrochen
      var name = String(file.name || "Bild").replace(/\.[a-z0-9]{2,5}$/i, "") + ".jpg";
      upload(new File([blob], name, { type: "image/jpeg" }));
    }).catch(function (err) { hint.textContent = err.message; });
  }

  window.LumiraAmbient = {
    init: function (context) {
      ctx = context;
      var timer = $("#amb-timer");
      TIMERS.forEach(function (t) { var o = el("option", null, t[1]); o.value = t[0]; timer.appendChild(o); });
      $("#amb-switch").addEventListener("click", function () {
        var on = !(S && S.enabled);
        send({ enabled: on, mode: $("#amb-mode").value, minutes: on ? Number(timer.value) : 0 }, on ? "Dauerschleife läuft" : "Dauerschleife aus");
      });
      $("#amb-mode").addEventListener("change", function () { send({ mode: $("#amb-mode").value }); });
      timer.addEventListener("change", function () {
        // Nur bei laufender Schleife sofort neu stellen, sonst gilt es beim Einschalten
        if (S && S.enabled) send({ minutes: Number(timer.value) });
      });
      $("#amb-sound").addEventListener("click", function () { send({ sound: !(S && S.sound) }); });
      $("#amb-ytq").addEventListener("change", function () { send({ ytQuality: $("#amb-ytq").value }, "Qualität geändert"); });
      // YouTube-Link hinzufügen
      $("#amb-yt-btn").addEventListener("click", function () {
        var f = $("#amb-yt-form");
        f.hidden = !f.hidden;
        if (!f.hidden) $("#amb-yt-url").focus();
      });
      $("#amb-yt-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var url = $("#amb-yt-url").value.trim();
        if (!url) return;
        var btn = $("#amb-yt-add");
        btn.disabled = true;
        api("/api/ambient/youtube", "POST", { url: url }).then(function (s) {
          S = s; render();
          $("#amb-yt-url").value = "";
          $("#amb-yt-form").hidden = true;
          ctx.toast("YouTube-Video hinzugefügt");
          if (s.added) send({ mediaId: s.added });
        }).catch(fail).then(function () { btn.disabled = false; });
      });
      $("#amb-file").addEventListener("change", function () {
        var f = this.files && this.files[0];
        this.value = "";
        if (!f) return;
        // Standbilder vorher zuschneiden; Videos und GIFs (Animation) direkt
        if (/^image\/(jpeg|png|webp)$/.test(f.type) && window.LumiraCrop) cropThenUpload(f);
        else upload(f);
      });
      load();
      // Stand gelegentlich auffrischen (Timer abgelaufen, anderes Gerät)
      setInterval(load, 60 * 1000);
    },
    reload: load,
    // Für die Startseite: schnell an/aus
    setEnabled: function (on) { return send({ enabled: on, minutes: on ? Number($("#amb-timer").value) : 0 }); }
  };
})();
